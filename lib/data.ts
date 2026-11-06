import type { SupabaseClient } from "@supabase/supabase-js";
import { summarize } from "./engine";
import { normalizeRules, zoneOf } from "./rules";

export type Account = {
  id: number; user_id: string; ctid_trader_account_id: number; trader_login: number | null; broker_name: string | null;
  is_live: boolean; phase: number; initial_balance: number | null; balance: number | null; status: string; active: boolean;
  last_synced_at: string | null; sync_error: string | null; created_at: string;
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
  const act = accs.filter(a => a.active);
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
        sb.from("deals").select("deal_id,position_id,symbol,side,lots,price,entry_price,exec_ts,is_close,net_profit").eq("account_id", acc.id).order("exec_ts", { ascending: false }).limit(1000),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const jmap = new Map((journal || []).map((j: any) => [j.day, j]));
  const merged = (days || []).map((d: any) => ({ ...d, level: zoneOf(d.total_pct, acc!.phase, rules), traded: d.trades > 0 || Number(d.pnl) !== 0, mood: jmap.get(d.day)?.mood ?? null }));
  return { profile, accounts: (accounts || []) as Account[], acc, days: merged, deals: (deals || []) as any[], journal: journal || [], chain: chain || [], rules, m: summarize(merged, rules.profitDayPct) };
}

export async function groupBundle(sb: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const [{ data: profiles }, { data: accounts }, { data: days }, { data: journal }, rules] = await Promise.all([
    sb.from("profiles").select("*").eq("role", "trader").order("created_at"),
    sb.from("ctrader_accounts").select("*"),
    fetchAll(() => sb.from("daily_stats").select("account_id,user_id,day,pnl,pnl_pct,total_pct,trades,level,flags,breach").gte("day", since).order("day").order("account_id")).then(data => ({ data })),
    sb.from("journal").select("user_id,day,mood").gte("day", since),
    rulesOf(sb),
  ]);
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
  return { traders, temp: [...temp.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-22), rules };
}

/** Сводка по всем текущим счетам группы: итоги по дням и вклад каждого трейдера за выбранный день. */
export async function summaryBundle(sb: SupabaseClient, wantDay?: string) {
  const [{ data: profiles }, { data: accounts }, rules] = await Promise.all([
    sb.from("profiles").select("id,name,email").eq("role", "trader").order("created_at"),
    sb.from("ctrader_accounts").select("*"),
    rulesOf(sb),
  ]);
  const byUser = new Map<string, Account[]>();
  for (const a of (accounts || []) as Account[]) { if (!byUser.has(a.user_id)) byUser.set(a.user_id, []); byUser.get(a.user_id)!.push(a); }
  const members = (profiles || []).map((p: any) => ({ p, acc: currentAccount(byUser.get(p.id) || []) })).filter(m => m.acc && m.acc.initial_balance) as { p: any; acc: Account }[];
  const ids = members.map(m => m.acc.id);
  const rows = ids.length
    ? await fetchAll<any>(() => sb.from("daily_stats").select("account_id,day,pnl,pnl_pct,total_pct,trades,breach").in("account_id", ids).order("day").order("account_id"))
    : [];
  const capital = members.reduce((a, m) => a + Number(m.acc.initial_balance), 0);
  const balance = members.reduce((a, m) => a + Number(m.acc.balance ?? m.acc.initial_balance), 0);
  const accById = new Map(members.map(m => [m.acc.id, m]));

  type DayAgg = { day: string; pnl: number; trades: number; plus: number; minus: number; flat: number; zones: Record<string, number>; cum: number; cumPct: number; pct: number };
  const map = new Map<string, DayAgg>();
  const byAccDay = new Map<string, any>();
  for (const r of rows) {
    const m = accById.get(r.account_id); if (!m) continue;
    byAccDay.set(r.account_id + "|" + r.day, r);
    if (!map.has(r.day)) map.set(r.day, { day: r.day, pnl: 0, trades: 0, plus: 0, minus: 0, flat: 0, zones: { green: 0, work: 0, yellow: 0, red: 0 }, cum: 0, cumPct: 0, pct: 0 });
    const d = map.get(r.day)!;
    const pnl = Number(r.pnl);
    d.pnl += pnl; d.trades += r.trades;
    if (pnl > 0) d.plus++; else if (pnl < 0) d.minus++; else d.flat++;
    d.zones[zoneOf(r.total_pct, m.acc.phase, rules)]++;
  }
  const days = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  let cum = 0;
  for (const d of days) { cum += d.pnl; d.cum = cum; d.cumPct = capital ? (cum / capital) * 100 : 0; d.pct = capital ? (d.pnl / capital) * 100 : 0; }
  const day = wantDay && map.has(wantDay) ? wantDay : days[days.length - 1]?.day || null;
  const idx = day ? days.findIndex(d => d.day === day) : -1;

  const traders = members.map(({ p, acc }) => {
    const r = day ? byAccDay.get(acc.id + "|" + day) : null;
    return {
      id: p.id, name: p.name, phase: acc.phase, status: acc.status, size: Number(acc.initial_balance),
      pnl: r ? Number(r.pnl) : null, pnlPct: r ? Number(r.pnl_pct) : null, total: r ? Number(r.total_pct) : null,
      trades: r ? r.trades : 0, zone: acc.status === "failed" && (!r || r.breach) ? "failed" : r ? zoneOf(r.total_pct, acc.phase, rules) : "none",
    };
  }).sort((a, b) => (b.pnl ?? -1e12) - (a.pnl ?? -1e12));
  const phases = { p1: 0, p2: 0, funded: 0, failed: 0 };
  for (const { acc } of members) { if (acc.status === "failed") phases.failed++; else if (acc.phase === 1) phases.p1++; else if (acc.phase === 2) phases.p2++; else phases.funded++; }

  return {
    rules, capital, balance, count: members.length, days, day, sel: idx >= 0 ? days[idx] : null,
    prev: idx > 0 ? days[idx - 1].day : null, next: idx >= 0 && idx < days.length - 1 ? days[idx + 1].day : null,
    traders, phases,
  };
}
