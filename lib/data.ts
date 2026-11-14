import type { SupabaseClient } from "@supabase/supabase-js";
import { summarize, dayKey } from "./engine";
import { normalizeRules, zoneOf } from "./rules";

export type Account = {
  id: number; user_id: string; ctid_trader_account_id: number; trader_login: number | null; broker_name: string | null;
  is_live: boolean; phase: number; initial_balance: number | null; balance: number | null; status: string; active: boolean;
  last_synced_at: string | null; sync_error: string | null; created_at: string; balance_locked?: boolean;
  removed?: boolean; delete_requested_at?: string | null; access_rights?: string | null; manual_failed?: boolean | null;
};

/** Supabase отдаёт не больше 1000 строк за запрос — забираем страницами. */
export async function fetchAll<T = any>(build: () => any, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) return out;
  }
}

/** Текущий счёт трейдера: активный незавершённый, иначе последний подключённый. */
export function currentAccount(accs: Account[]): Account | null {
  const act = accs.filter(a => a.active && !(a as any).removed);
  return act.find(a => a.status === "active") || act.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

export async function rulesOf(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("rules").eq("id", 1).single();
  return normalizeRules(data?.rules);
}

export async function traderBundle(sb: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: accounts }, { data: journal }, { data: chain }, rules] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).single(),
    sb.from("ctrader_accounts").select("*").eq("user_id", userId).order("created_at"),
    sb.from("journal").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(60),
    sb.from("chain_events").select("*").eq("user_id", userId).order("ts", { ascending: false }),
    rulesOf(sb),
  ]);
  const acc = currentAccount((accounts || []) as Account[]);
  const [{ data: days }, { data: deals }] = acc
    ? await Promise.all([
        sb.from("daily_stats").select("*").eq("account_id", acc.id).order("day"),
        sb.from("deals").select("deal_id,position_id,symbol,side,lots,volume,price,entry_price,conv,exec_ts,is_close,net_profit").eq("account_id", acc.id).order("exec_ts", { ascending: false }).limit(1000),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  // Стопы и тейки позиций (миграция 012); если таблицы нет — аналитика «Стоп и RR» просто не показывается
  let { data: meta, error: me } = acc ? await sb.from("position_meta").select("position_id,sl,tp,close_reason,exits").eq("account_id", acc.id) : { data: [] as any[], error: null };
  if (me && acc) ({ data: meta } = await sb.from("position_meta").select("position_id,sl,tp,close_reason").eq("account_id", acc.id));
  const jmap = new Map((journal || []).map((j: any) => [j.day, j]));
  const merged = (days || []).map((d: any) => ({ ...d, level: zoneOf(d.total_pct, acc!.phase, rules), traded: d.trades > 0 || Number(d.pnl) !== 0, mood: jmap.get(d.day)?.mood ?? null }));
  return { profile, accounts: (accounts || []) as Account[], acc, days: merged, deals: (deals || []) as any[], meta: (meta || []) as any[], journal: journal || [], chain: chain || [], rules, m: summarize(merged, rules.profitDayPct, { today: dayKey(new Date(), rules.tz), initial: Number(acc?.balance || acc?.initial_balance || 0) }) };
}

export async function groupBundle(sb: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const [{ data: profiles }, { data: accounts }, { data: days }, { data: journal }, rules] = await Promise.all([
    sb.from("profiles").select("*").or("role.eq.trader,is_trader.eq.true").order("created_at"),
    sb.from("ctrader_accounts").select("*"),
    fetchAll(() => sb.from("daily_stats").select("account_id,user_id,day,pnl,pnl_pct,total_pct,trades,level,flags,breach").gte("day", since).order("day").order("account_id")).then(data => ({ data })),
    sb.from("journal").select("user_id,day,mood").gte("day", since),
    rulesOf(sb),
  ]);
  const { data: teamRows } = await sb.from("teams").select("id,name,curator").order("name");
  const teams = (teamRows || []) as { id: number; name: string; curator: string | null }[];
  const accByUser = new Map<string, Account[]>();
  for (const a of (accounts || []) as Account[]) { if (!accByUser.has(a.user_id)) accByUser.set(a.user_id, []); accByUser.get(a.user_id)!.push(a); }
  const moods = new Map((journal || []).map((j: any) => [j.user_id + j.day, j.mood]));
  const phaseOf = new Map(((accounts || []) as Account[]).map(a => [a.id, a.phase]));
  const daysByAcc = new Map<number, any[]>();
  for (const d of days || []) { const r = { ...d, level: zoneOf(d.total_pct, phaseOf.get(d.account_id) ?? 1, rules), traded: d.trades > 0 || Number(d.pnl) !== 0, mood: moods.get(d.user_id + d.day) ?? null }; if (!daysByAcc.has(d.account_id)) daysByAcc.set(d.account_id, []); daysByAcc.get(d.account_id)!.push(r); }
  const todayIso = new Date().toISOString().slice(0, 10);
  const traders = (profiles || []).map((p: any) => {
    const acc = currentAccount(accByUser.get(p.id) || []);
    const ds = acc ? daysByAcc.get(acc.id) || [] : [];
    const last = ds[ds.length - 1];
    const level = !acc ? "none" : acc.status === "failed" ? "failed" : last?.level || "work";
    return { p, acc, days: ds, m: summarize(ds, rules.profitDayPct), level, flags: (last?.flags || []) as { lv: string; t: string }[], fresh: p.created_at.slice(0, 10) === todayIso };
  });
  // Температура группы: светофор по дням среди всех счетов
  const temp = new Map<string, { day: string; red: number; yellow: number; work: number; green: number }>();
  for (const t of traders) for (const d of t.days) {
    if (!temp.has(d.day)) temp.set(d.day, { day: d.day, red: 0, yellow: 0, work: 0, green: 0 });
    const r = temp.get(d.day)! as any; if (d.level in r) r[d.level]++;
  }
  return { traders, teams, temp: [...temp.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-22), rules };
}

export type Period = "day" | "week" | "month" | "all" | "range";
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const dd = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);
function addDays(d: string, n: number) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function weekStart(d: string) { const wd = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7; return addDays(d, -wd); }
export function periodKey(d: string, p: Period) { return p === "day" ? d : p === "week" ? weekStart(d) : p === "month" ? d.slice(0, 7) : p === "range" ? "range" : "all"; }
function periodLabel(key: string, p: Period, first: string, last: string) {
  if (p === "day") return { short: dd(key), long: new Date(key + "T12:00:00Z").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) };
  if (p === "week") return { short: `${dd(key)}–${dd(addDays(key, 6))}`, long: `Неделя ${dd(key)}–${dd(addDays(key, 6))}.${key.slice(0, 4)}` };
  if (p === "month") { const m = `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`; return { short: m, long: m }; }
  if (p === "range") return { short: `${dd(first)}–${dd(last)}`, long: `Период ${dd(first)}.${first.slice(0, 4)}–${dd(last)}.${last.slice(0, 4)}` };
  return { short: "Всё время", long: `С ${dd(first)}.${first.slice(0, 4)} по ${dd(last)}.${last.slice(0, 4)}` };
}

export type Team = { id: number; name: string; curator: string | null };
type Member = { p: any; acc: Account };

/** Сводка за день, неделю, месяц или всё время — по всей группе, по команде или по выбранным трейдерам. */
export async function summaryBundle(sb: SupabaseClient, opts: { day?: string; period?: string; scope?: string; pick?: string[]; from?: string; to?: string } = {}) {
  const isD = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let period: Period = (["day", "week", "month", "all", "range"] as const).includes(opts.period as Period) ? (opts.period as Period) : "day";
  if (period === "range" && !(isD(opts.from) && isD(opts.to))) period = "week";
  const [{ data: profiles }, { data: accounts }, { data: teamRows }, rules] = await Promise.all([
    sb.from("profiles").select("*").or("role.eq.trader,is_trader.eq.true").order("created_at"),
    sb.from("ctrader_accounts").select("*"),
    sb.from("teams").select("id,name,curator").order("name"),
    rulesOf(sb),
  ]);
  const teams = (teamRows || []) as Team[];
  const byUser = new Map<string, Account[]>();
  for (const a of (accounts || []) as Account[]) { if (!byUser.has(a.user_id)) byUser.set(a.user_id, []); byUser.get(a.user_id)!.push(a); }
  const everyone = (profiles || []).map((p: any) => ({ p, acc: currentAccount(byUser.get(p.id) || []) }));
  const allMembers = everyone.filter(m => m.acc && m.acc.initial_balance) as Member[];
  const ids = allMembers.map(m => m.acc.id);
  const rows = ids.length
    ? await fetchAll<any>(() => sb.from("daily_stats").select("account_id,day,pnl,pnl_pct,total_pct,trades,breach").in("account_id", ids).order("day").order("account_id"))
    : [];
  const rowsByAcc = new Map<number, any[]>();
  for (const r of rows) { if (!rowsByAcc.has(r.account_id)) rowsByAcc.set(r.account_id, []); rowsByAcc.get(r.account_id)!.push(r); }

  // Кого показываем
  const scopeRaw = opts.scope || "all";
  const pick = new Set(opts.pick || []);
  const teamOf = (m: Member) => m.p.team_id as number | null;
  let scope = { key: "all", name: "Вся группа", short: "Группа" };
  let members = allMembers;
  if (scopeRaw.startsWith("team-")) {
    const t = teams.find(x => "team-" + x.id === scopeRaw);
    if (t) { scope = { key: scopeRaw, name: t.name, short: t.name }; members = allMembers.filter(m => teamOf(m) === t.id); }
  } else if (scopeRaw === "none") {
    scope = { key: "none", name: "Без команды", short: "Без команды" }; members = allMembers.filter(m => !teamOf(m));
  } else if (scopeRaw === "pick" && pick.size) {
    members = allMembers.filter(m => pick.has(m.p.id));
    scope = { key: "pick", name: `Выборка · ${members.length} чел.`, short: "Выборка" };
  }

  // Календарь торговых дней — общий для всей группы, чтобы периоды совпадали при любом выборе
  const allDays = [...new Set(rows.map(r => r.day as string))].sort();
  const base = { period, rules, teams, scope, picker: allMembers.map(m => ({ id: m.p.id as string, name: m.p.name as string, team: teamOf(m) })), pick: [...pick] };
  if (!allDays.length) return { ...base, empty: true as const, count: members.length };
  const first = allDays[0], last = allDays[allDays.length - 1];
  // Свой период: торговые дни между «с» и «по» включительно
  if (period === "range") {
    let [f, t] = [opts.from!, opts.to!]; if (f > t) [f, t] = [t, f];
    const inR = allDays.filter(d => d >= f && d <= t);
    if (!inR.length) return { ...base, empty: false as const, ...agg0(), noDays: true as const, key: `${f}_${t}`, start: f, end: t, label: periodLabel("range", period, f, t), anchor: t, prev: null, next: null, compare: [], first, last, from: f, to: t };
    const start = inR[0], end = inR[inR.length - 1];
    const agg = (ms: Member[]) => aggregate(ms, rowsByAcc, rules, period, start, end);
    return { ...base, empty: false as const, ...agg(members), key: `${f}_${t}`, start, end, label: periodLabel("range", period, f, t), anchor: end, prev: null, next: null, compare: compareOf(agg), first, last, from: f, to: t };
  }
  function agg0() { return aggregate([], rowsByAcc, rules, period, first, first); }
  const keys = [...new Set(allDays.map(d => periodKey(d, period)))];
  const anchor = opts.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day) ? opts.day : allDays[allDays.length - 1];
  let key = periodKey(anchor, period);
  if (!keys.includes(key)) key = keys.filter(k => k <= key).pop() || keys[keys.length - 1];
  const ki = keys.indexOf(key);
  const inKey = allDays.filter(d => periodKey(d, period) === key);
  const start = inKey[0], end = inKey[inKey.length - 1];
  const lastDayOf = (k: string) => allDays.filter(d => periodKey(d, period) === k).pop()!;

  const agg = (ms: Member[]) => aggregate(ms, rowsByAcc, rules, period, start, end);
  const main = agg(members);

  const compare = compareOf(agg);

  // Сравнение команд за тот же период
  function compareOf(agg: (ms: Member[]) => ReturnType<typeof aggregate>) {
    const groups: { key: string; name: string; curator: string | null; ms: Member[] }[] = teams.map(t => ({ key: "team-" + t.id, name: t.name, curator: t.curator, ms: allMembers.filter(m => teamOf(m) === t.id) }));
    const loose = allMembers.filter(m => !teamOf(m));
    if (teams.length && loose.length) groups.push({ key: "none", name: "Без команды", curator: null, ms: loose });
    return groups.map(g => {
      const a = agg(g.ms);
      return { key: g.key, name: g.name, curator: g.curator, count: g.ms.length, capital: a.capital, pnl: a.sum.pnl, pct: a.sum.pct, cum: a.sum.cum, cumPct: a.sum.cumPct, plus: a.sum.plus, minus: a.sum.minus, zones: a.zones, phases: a.phases };
    }).sort((x, y) => y.pct - x.pct);
  }
  return {
    ...base, empty: false as const, ...main, first, last, from: start, to: end, noDays: false as const,
    key, start, end, label: periodLabel(key, period, start, end), anchor: end,
    prev: ki > 0 ? lastDayOf(keys[ki - 1]) : null, next: ki < keys.length - 1 ? lastDayOf(keys[ki + 1]) : null,
    compare,
  };
}

/** Итоги набора счетов за период [start, end]. */
function aggregate(members: Member[], rowsByAcc: Map<number, any[]>, rules: ReturnType<typeof normalizeRules>, period: Period, start: string, end: string) {
  const capital = members.reduce((a, m) => a + Number(m.acc.initial_balance), 0);
  const balance = members.reduce((a, m) => a + Number(m.acc.balance ?? m.acc.initial_balance), 0);
  type DayAgg = { day: string; pnl: number; trades: number; plus: number; minus: number; cum: number; cumPct: number; pct: number };
  const map = new Map<string, DayAgg>();
  for (const m of members) for (const r of rowsByAcc.get(m.acc.id) || []) {
    if (!map.has(r.day)) map.set(r.day, { day: r.day, pnl: 0, trades: 0, plus: 0, minus: 0, cum: 0, cumPct: 0, pct: 0 });
    const d = map.get(r.day)!, pnl = Number(r.pnl);
    d.pnl += pnl; d.trades += r.trades; if (pnl > 0) d.plus++; else if (pnl < 0) d.minus++;
  }
  const days = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  let cum = 0;
  for (const d of days) { cum += d.pnl; d.cum = cum; d.cumPct = capital ? (cum / capital) * 100 : 0; d.pct = capital ? (d.pnl / capital) * 100 : 0; }
  const inP = days.filter(d => d.day >= start && d.day <= end);
  const upTo = days.filter(d => d.day <= end);
  const endDay = upTo[upTo.length - 1];

  const traders = members.map(({ p, acc }) => {
    const all = rowsByAcc.get(acc.id) || [];
    const own = all.filter(r => r.day >= start && r.day <= end);
    const endRow = all.filter(r => r.day <= end).pop();
    const pnl = own.reduce((a, r) => a + Number(r.pnl), 0);
    const size = Number(acc.initial_balance);
    // Выбыл к концу периода: по нарушению лимита в наших расчётах или по сигналу cTrader (проп отключил торговлю)
    const failedBy = acc.status === "failed" && (all.some(r => r.breach && r.day <= end) || !(acc as any).status_day || String((acc as any).status_day) <= end);
    return {
      id: p.id as string, name: p.name as string, team: p.team_id as number | null, phase: acc.phase, failed: failedBy, size,
      pnl: own.length ? pnl : null, pnlPct: own.length ? (pnl / size) * 100 : null,
      total: endRow ? Number(endRow.total_pct) : null, trades: own.reduce((a, r) => a + r.trades, 0),
      plusDays: own.filter(r => Number(r.pnl) > 0).length, minusDays: own.filter(r => Number(r.pnl) < 0).length,
      zone: failedBy ? "failed" : endRow ? zoneOf(endRow.total_pct, acc.phase, rules) : "none",
    };
  }).sort((a, b) => (b.pnlPct ?? -1e12) - (a.pnlPct ?? -1e12));

  const pnl = inP.reduce((a, d) => a + d.pnl, 0);
  const zones = { green: 0, work: 0, yellow: 0, red: 0, failed: 0 } as Record<string, number>;
  for (const t of traders) if (t.zone in zones) zones[t.zone]++;
  const phases = { p1: 0, p2: 0, funded: 0, failed: 0 };
  for (const t of traders) { if (t.failed) phases.failed++; else if (t.phase === 1) phases.p1++; else if (t.phase === 2) phases.p2++; else phases.funded++; }
  const plus = traders.filter(t => (t.pnl ?? 0) > 0).length, minus = traders.filter(t => (t.pnl ?? 0) < 0).length;
  const sortedDays = [...inP].sort((a, b) => b.pnl - a.pnl);

  const endIdx = upTo.length - 1;
  let chart = period === "all" ? upTo : upTo.slice(Math.max(0, endIdx + 1 - Math.max(45, inP.length + 10)));
  const firstMove = chart.findIndex(d => d.pnl !== 0);
  if (firstMove > 1) chart = chart.slice(firstMove - 1);
  const table = period === "day" ? upTo.slice(Math.max(0, endIdx - 13)) : inP;

  return {
    capital, balance, count: members.length,
    sum: {
      pnl, pct: capital ? (pnl / capital) * 100 : 0, cum: endDay?.cum ?? 0, cumPct: endDay?.cumPct ?? 0, trades: inP.reduce((a, d) => a + d.trades, 0),
      plus, minus, flat: members.length - plus - minus, tradingDays: inP.length,
      bestDay: inP.length > 1 ? sortedDays[0] : null, worstDay: inP.length > 1 ? sortedDays[sortedDays.length - 1] : null,
    },
    zones, phases, traders, chart, table: [...table].reverse(),
  };
}
