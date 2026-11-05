// Эквити с учётом плавающего P&L: позиции из сделок + минутные свечи cTrader.
import { dayKey } from "./engine";

export type RawDeal = {
  position_id: number | null; symbol_id: number | null; side: string | null; volume: number | null;
  exec_ts: string; is_close: boolean; price: number | null; entry_price: number | null; conv: number | null; net_profit: number;
};

export type Position = {
  id: number; symbolId: number; dir: 1 | -1; entry: number; conv: number;
  openMs: number; closeMs: number | null; // null — позиция ещё открыта
  changes: { ms: number; dVol: number }[]; // изменение объёма (в сотых единицы)
};

export function buildPositions(deals: RawDeal[]): Position[] {
  const by = new Map<number, RawDeal[]>();
  for (const d of deals) if (d.position_id != null && d.symbol_id != null) { if (!by.has(d.position_id)) by.set(d.position_id, []); by.get(d.position_id)!.push(d); }
  const out: Position[] = [];
  for (const [id, list] of by) {
    list.sort((a, b) => a.exec_ts.localeCompare(b.exec_ts));
    const opens = list.filter(d => !d.is_close), closes = list.filter(d => d.is_close);
    if (!opens.length) continue; // открывающая сделка вне загруженной истории
    const o = opens[0];
    const openVol = opens.reduce((a, d) => a + Number(d.volume || 0), 0);
    const closedVol = closes.reduce((a, d) => a + Number(d.volume || 0), 0);
    const entry = Number(closes[0]?.entry_price ?? o.price ?? 0);
    const conv = Number(closes.find(c => c.conv)?.conv ?? 1) || 1;
    out.push({
      id, symbolId: Number(o.symbol_id), dir: o.side === "sell" ? -1 : 1, entry, conv,
      openMs: Date.parse(o.exec_ts),
      closeMs: closes.length && closedVol >= openVol ? Date.parse(closes[closes.length - 1].exec_ts) : null,
      changes: list.map(d => ({ ms: Date.parse(d.exec_ts), dVol: (d.is_close ? -1 : 1) * Number(d.volume || 0) })),
    });
  }
  return out;
}

/** Таймфрейм свечей под длительность сделки (cTrader: M1=1, M5=5, M15=7, H1=9). */
export function periodFor(ms: number): { period: number; label: string; min: number } {
  if (ms <= 8 * 3600_000) return { period: 1, label: "M1", min: 1 };
  if (ms <= 2 * 86400_000) return { period: 5, label: "M5", min: 5 };
  if (ms <= 7 * 86400_000) return { period: 7, label: "M15", min: 15 };
  return { period: 9, label: "H1", min: 60 };
}

/** Окно графика: сделка плюс поля по краям. */
export function chartWindow(p: Position, nowMs = Date.now()) {
  const end = p.closeMs ?? nowMs;
  const dur = Math.max(end - p.openMs, 60_000);
  const pf = periodFor(dur);
  const pad = Math.max(dur * 0.25, pf.min * 60_000 * 20);
  return { ...pf, from: p.openMs - pad, to: Math.min(end + pad, nowMs) };
}

/** Минимальное эквити за каждый день: баланс по закрытым сделкам + худший плавающий P&L открытых позиций. */
export function minEquityByDay(opts: { initial: number; deals: RawDeal[]; positions: Position[]; bars: Map<number, number[][]>; tz: string }) {
  const { initial, deals, positions, bars, tz } = opts;
  const float = new Map<number, number>(); // минута → плавающий P&L
  for (const p of positions) {
    const bs = bars.get(p.id); if (!bs) continue;
    const end = p.closeMs ?? Date.now();
    for (const [minute, , high, low] of bs) {
      const t0 = minute * 60_000;
      if (t0 + 60_000 <= p.openMs || t0 >= end) continue;
      const vol = p.changes.filter(c => c.ms <= Math.max(t0, p.openMs)).reduce((a, c) => a + c.dVol, 0);
      if (vol <= 0) continue;
      const worst = p.dir === 1 ? low : high;
      const pnl = p.dir * (worst - p.entry) * (vol / 100) * p.conv;
      float.set(minute, (float.get(minute) || 0) + pnl);
    }
  }
  const closes = deals.map(d => ({ ms: Date.parse(d.exec_ts), v: Number(d.net_profit || 0) })).sort((a, b) => a.ms - b.ms);
  const minutes = [...float.keys()].sort((a, b) => a - b);
  const out = new Map<string, number>();
  let i = 0, bal = initial;
  for (const m of minutes) {
    while (i < closes.length && closes[i].ms < m * 60_000) bal += closes[i++].v;
    const eq = bal + float.get(m)!;
    const day = dayKey(new Date(m * 60_000), tz);
    if (!out.has(day) || eq < out.get(day)!) out.set(day, eq);
  }
  return out;
}
