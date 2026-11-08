// Движок метрик: сделки cTrader + дневник → дневная статистика, статус фазы и флаги светофора.
// Чистые функции, без обращения к базе — используется воркером и тестом.
import { zoneOf, type Rules, type Zone } from "./rules";

export type DealRow = { exec_ts: string; is_close: boolean; net_profit: number; volume: number | null; lots?: number | null };
export type JournalRow = { day: string; mood: number | null; plan: boolean | null };
export type Flag = { lv: "red" | "yellow"; t: string };
export type Level = Zone;

export type DayStat = {
  day: string;
  traded: boolean;
  pnl: number;
  pnl_pct: number;
  total_pct: number;
  end_balance: number;
  trades: number;
  max_lot: number;
  mood: number | null;
  plan: boolean | null;
  checkin: boolean;
  day_loss_pct: number; // худший убыток за день с учётом плавающего, % от баланса на начало дня (как у FundedHive)
  dd_pct: number;       // макс. просадка от начального баланса с учётом плавающего, %
  tracked: boolean; // день после подключения к Hive Desk — только для них ждём отчёт
  breach: "daily" | "max" | null;
  level: Level;
  flags: Flag[];
};

export type EngineResult = { days: DayStat[]; status: "active" | "passed" | "failed"; statusDay: string | null };

// cTrader volume хранится в сотых долях единицы; для FX 1 лот = 100 000 единиц
export const volumeToLots = (v: number | null) => (v ? v / 100 / 100000 : 0);

export function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Все будни от start до end включительно (YYYY-MM-DD). */
export function weekdays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const e = new Date(end + "T12:00:00Z");
  while (d <= e) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeAccount(opts: {
  phase: number;
  initialBalance: number;
  deals: DealRow[];
  journal: JournalRow[];
  rules: Rules;
  startDay: string;
  today: string;
  /** Минимальное эквити ($) внутри каждого дня с учётом открытых позиций. */
  minEquity?: Map<string, number>;
}): EngineResult {
  const { phase, initialBalance: init, rules: R, today } = opts;
  const byDay = new Map<string, DealRow[]>();
  for (const d of opts.deals) {
    const k = dayKey(new Date(d.exec_ts), R.tz);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(d);
  }
  const jmap = new Map(opts.journal.map(j => [j.day, j]));
  const firstDeal = [...byDay.keys()].sort()[0];
  const start = firstDeal && firstDeal < opts.startDay ? firstDeal : opts.startDay;
  const calendar = Array.from(new Set([...weekdays(start, today), ...[...byDay.keys()].filter(k => k <= today)])).sort();

  const days: DayStat[] = [];
  let bal = init;
  let status: EngineResult["status"] = "active";
  let statusDay: string | null = null;
  let profitDays = 0;
  let ddMax = 0;
  const target = phase === 1 ? R.p1 : phase === 2 ? R.p2 : null;

  for (const day of calendar) {
    const list = byDay.get(day) || [];
    const pnl = list.reduce((a, d) => a + Number(d.net_profit || 0), 0);
    const opens = list.filter(d => !d.is_close);
    const traded = list.length > 0;

    const dayStart = bal;
    bal += pnl;
    const low = Math.min(dayStart, bal, opts.minEquity?.get(day) ?? Infinity);
    ddMax = Math.max(ddMax, ((init - low) / init) * 100);
    const j = jmap.get(day);
    const s: DayStat = {
      day, traded,
      pnl: r2(pnl),
      pnl_pct: r2((pnl / init) * 100),
      total_pct: r2(((bal - init) / init) * 100),
      end_balance: r2(bal),
      trades: opens.length,
      max_lot: r2(Math.max(0, ...opens.map(d => (d.lots != null ? Number(d.lots) : volumeToLots(d.volume))))),
      mood: j?.mood ?? null,
      plan: j?.plan ?? null,
      checkin: !!j,
      day_loss_pct: r2(dayStart > 0 ? Math.max(0, ((dayStart - low) / dayStart) * 100) : 0),
      dd_pct: r2(ddMax),
      tracked: day >= opts.startDay,
      breach: null, level: "green", flags: [],
    };
    if (s.day_loss_pct >= R.daily) s.breach = "daily";
    else if (s.dd_pct >= R.max) s.breach = "max";
    if (isProfitDay(s.total_pct - s.pnl_pct, s.total_pct, R.profitDayPct)) profitDays++;
    days.push(s);
    const f = flagsAt(days, days.length - 1, R);
    s.flags = f.flags; s.level = zoneOf(s.total_pct, phase, R);
    if (s.breach) { status = "failed"; statusDay = day; break; }
    if (target !== null && s.total_pct >= target && profitDays >= R.minDays) { status = "passed"; statusDay = day; break; }
  }
  return { days, status, statusDay };
}

export function flagsAt(days: DayStat[], j: number, R: Rules): { level: Level; flags: Flag[] } {
  const d = days[j];
  const f: Flag[] = [];
  const prevTraded = days.slice(Math.max(0, j - 10), j).filter(x => x.traded);
  const avg = prevTraded.length ? prevTraded.reduce((a, x) => a + x.trades, 0) / prevTraded.length : 0;
  if (d.breach) f.push({ lv: "red", t: d.breach === "daily" ? "Нарушен дневной лимит" : "Нарушен общий лимит" });
  if (!d.breach && d.day_loss_pct >= R.redDaily) f.push({ lv: "red", t: `Дневной убыток ${d.day_loss_pct.toFixed(1)}%` });
  if (!d.breach && d.dd_pct >= R.redDD) f.push({ lv: "red", t: `Просадка ${d.dd_pct.toFixed(1)}% из ${R.max}%` });
  if (d.traded && avg > 0 && d.trades >= avg * 2 && d.trades >= 4) f.push({ lv: "red", t: `Овертрейдинг: ${d.trades} сделок при норме ${avg.toFixed(0)}` });
  const p = days[j - 1];
  if (d.plan === false && p && p.plan === false) f.push({ lv: "red", t: "2 дня подряд не по плану" });
  let streak = 0;
  for (let k = j; k >= 0 && streak < 10; k--) { const x = days[k]; if (!x.traded) continue; if (x.pnl < 0) streak++; else break; }
  if (streak >= 3) f.push({ lv: "yellow", t: `${streak} убыточных дня подряд` });
  if (d.mood && d.mood <= 2) f.push({ lv: "yellow", t: `Настроение ${d.mood}/5` });
  if (d.tracked && p?.tracked && !d.checkin && !p.checkin) f.push({ lv: "yellow", t: "Нет отчёта 2 дня" });
  const pt = days.slice(0, j).reverse().find(x => x.traded);
  if (d.traded && pt && pt.pnl < 0 && pt.max_lot > 0 && d.max_lot >= pt.max_lot * 1.5) f.push({ lv: "yellow", t: `Лот ×${(d.max_lot / pt.max_lot).toFixed(1)} после убытка` });
  const level: Level = f.some(x => x.lv === "red") ? "red" : f.length ? "yellow" : "green";
  return { level, flags: f };
}

/** Сводные показатели для экранов. */
/** Прибыльный день: прирост выше стартового баланса фазы не меньше порога.
 *  Отыгрыш минуса не засчитывается: с −0.5% до +0.5% — это только +0.5% над стартом. */
export function isProfitDay(startPct: number, endPct: number, threshold: number) {
  return endPct - Math.max(startPct, 0) >= threshold - 1e-9;
}

export function summarize(days: (Pick<DayStat, "traded" | "pnl_pct" | "total_pct" | "trades" | "mood"> & { day?: string; pnl?: number | null; end_balance?: number | null; day_loss_pct?: number | null; dd_pct?: number | null })[], profitDayPct = 0.5, opts: { today?: string; initial?: number } = {}) {
  const last = days[days.length - 1];
  // Дневной лимит — как у FundedHive: % от баланса на начало торгового дня.
  // Если сегодня ещё нет строки (выходные, день без сделок) — день начался с последнего баланса.
  const isToday = !!last && (!opts.today || last.day === opts.today);
  const lastEnd = last?.end_balance != null ? Number(last.end_balance) : null;
  const dayStart = last && lastEnd != null ? (isToday ? lastEnd - Number(last.pnl || 0) : lastEnd) : opts.initial ?? 0;
  const todayPnl = isToday && last?.pnl != null ? Number(last.pnl) : 0;
  const worstRow = days.reduce<(typeof days)[number] | null>((w, d) => (Number(d.day_loss_pct || 0) > Number(w?.day_loss_pct || 0) ? d : w), null);
  const traded = days.filter(d => d.traded);
  const prev = days.slice(-11, -1).filter(d => d.traded);
  return {
    total: last ? Number(last.total_pct) : 0,
    today: last ? Number(last.pnl_pct) : 0,
    todayTrades: last ? last.trades : 0,
    avgTrades: prev.length ? prev.reduce((a, d) => a + d.trades, 0) / prev.length : 0,
    maxDD: Math.max(-Math.min(0, ...days.map(d => Number(d.total_pct))), ...days.map(d => Number(d.dd_pct || 0))),
    // Текущий убыток дня, % от баланса на начало дня: если день уже отбит в плюс — 0, как у пропа
    todayLoss: dayStart > 0 ? Math.max(0, (-todayPnl / dayStart) * 100) : 0,
    // Худшая точка дня с учётом плавающего убытка (для справки и риск-флагов)
    todayWorst: isToday && dayStart > 0 ? Math.max(Number(last!.day_loss_pct || 0), (-todayPnl / dayStart) * 100, 0) : 0,
    todayPnlPct: dayStart > 0 ? (todayPnl / dayStart) * 100 : 0,
    dayStart,
    balanceNow: dayStart + todayPnl,
    worstDayLoss: worstRow ? Number(worstRow.day_loss_pct || 0) : 0,
    worstDayLossAt: worstRow?.day ?? null,
    curDD: last ? Math.max(0, -Number(last.total_pct)) : 0,
    tradingDays: traded.length,
    profitDays: traded.filter(d => isProfitDay(Number(d.total_pct) - Number(d.pnl_pct), Number(d.total_pct), profitDayPct)).length,
    winDays: traded.filter(d => Number(d.pnl_pct) > 0).length,
    lossDays: traded.filter(d => Number(d.pnl_pct) < 0).length,
    winRate: traded.length ? Math.round((traded.filter(d => Number(d.pnl_pct) > 0).length / traded.length) * 100) : 0,
    best: traded.length ? Math.max(...traded.map(d => Number(d.pnl_pct))) : 0,
    worst: traded.length ? Math.min(...traded.map(d => Number(d.pnl_pct))) : 0,
    mood: [...days].reverse().find(d => d.mood)?.mood ?? null,
  };
}

/** Смещение часового пояса tz относительно UTC в момент ms, миллисекунды. */
function tzOffset(ms: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Момент начала следующего торгового дня (сброс дневного лимита) в часовом поясе tz. */
export function nextDayStart(tz: string, now = new Date()): Date {
  const [y, m, d] = dayKey(now, tz).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d + 1);
  let t = guess - tzOffset(guess, tz);
  const off2 = tzOffset(t, tz); if (guess - off2 !== t) t = guess - off2;
  return new Date(t);
}
