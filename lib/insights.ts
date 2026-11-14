// Показатели дисциплины и риска трейдера для «Сводки»: по закрытым позициям, стопам и дневнику.
import type { Rules } from "./rules";

export type IDeal = { account_id: number; position_id: number | null; exec_ts: string; is_close: boolean; net_profit: number; side?: string; lots?: number | null; volume?: number | null; price?: number | null; entry_price?: number | null; conv?: number | null };
export type IMeta = { account_id: number; position_id: number; sl: number | null; exits?: { sl?: number | null }[] | null };
export type Pos = { id: number; open: number; close: number; pnl: number; lots: number; risk: number | null; R: number | null; win: boolean };

/** Закрытые позиции счёта с риском (% от начального баланса) и результатом в R. */
export function positionsOf(deals: IDeal[], meta: IMeta[], initial: number): Pos[] {
  const m = new Map(meta.map(x => [Number(x.position_id), x]));
  const map = new Map<number, { open: number | null; close: number; pnl: number; lots: number; vol: number; entry: number | null; buy: boolean; conv: number | null }>();
  for (const d of deals) {
    if (d.position_id == null) continue;
    const p = map.get(d.position_id) || { open: null, close: 0, pnl: 0, lots: 0, vol: 0, entry: null, buy: true, conv: null }, ms = Date.parse(d.exec_ts);
    if (d.is_close) { p.pnl += Number(d.net_profit || 0); p.close = Math.max(p.close, ms); if (d.conv != null) p.conv = Number(d.conv); if (d.entry_price != null) p.entry = Number(d.entry_price); }
    else { if (p.open == null || ms < p.open) p.open = ms; p.lots += Number(d.lots || 0); p.vol += Number(d.volume || 0); p.buy = d.side === "buy"; if (p.entry == null && d.price != null) p.entry = Number(d.price); }
    map.set(d.position_id, p);
  }
  const out: Pos[] = [];
  for (const [id, p] of map) {
    if (!p.close || p.open == null) continue;
    const mm = m.get(id);
    let sl = mm?.sl != null ? Number(mm.sl) : null;
    if (sl == null && mm?.exits) { const c = mm.exits.map(e => e.sl).find(v => v != null); if (c != null && p.entry != null && (p.buy ? c < p.entry : c > p.entry)) sl = Number(c); }
    const riskUsd = sl != null && p.entry != null && p.vol && p.conv ? Math.abs(p.entry - sl) * (p.vol / 100) * p.conv : null;
    out.push({ id, open: p.open, close: p.close, pnl: p.pnl, lots: p.lots, risk: mm ? (riskUsd && initial ? (riskUsd / initial) * 100 : 0) : null, R: riskUsd ? p.pnl / riskUsd : null, win: p.pnl > 0 });
  }
  return out.sort((a, b) => a.close - b.close);
}

export type Insight = ReturnType<typeof insightOf>;

/**
 * Дисциплина трейдера за период и его текущее состояние.
 * risk: null — по счёту ещё нет данных о стопах (миграция или старые сделки).
 */
export function insightOf(o: { period: Pos[]; recent: Pos[]; journal: { day: string; plan: boolean | null }[]; tradedDays: string[]; idleDays: number; dd: number; dayLoss: number; rules: Rules }) {
  const P = o.period, R = o.rules;
  const withMeta = P.filter(p => p.risk != null);
  const withSL = withMeta.filter(p => (p.risk ?? 0) > 0);
  const noSL = withMeta.length - withSL.length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const risk = avg(withSL.map(p => p.risk!));
  // Разброс риска — коэффициент вариации: 0 — одинаковый риск в каждой сделке
  const cv = risk && withSL.length >= 3 ? Math.sqrt(avg(withSL.map(p => (p.risk! - risk) ** 2))!) / risk : null;
  const Rs = withSL.map(p => p.R).filter((v): v is number => v != null);
  // Лот после стопа
  let up = 0, after = 0;
  for (let i = 1; i < P.length; i++) if (P[i - 1].pnl < 0 && P[i - 1].lots && P[i].lots) { after++; if (P[i].lots > P[i - 1].lots * 1.2) up++; }
  // Текущая серия стопов — по последним сделкам, независимо от периода
  let streak = 0; for (let i = o.recent.length - 1; i >= 0 && o.recent[i].pnl < 0; i--) streak++;
  const planned = o.journal.filter(j => j.plan != null), jDays = new Set(o.journal.map(j => j.day));
  const journalPct = o.tradedDays.length ? Math.round((o.tradedDays.filter(d => jDays.has(d)).length / o.tradedDays.length) * 100) : null;
  const planPct = planned.length ? Math.round((planned.filter(j => j.plan).length / planned.length) * 100) : null;
  const slPct = withMeta.length ? Math.round((withSL.length / withMeta.length) * 100) : null;
  const lotUpPct = after ? Math.round((up / after) * 100) : null;
  // Балл дисциплины 0–100: стоп 30 · стабильный риск 20 · лот после стопа 20 · по плану 15 · дневник 15.
  // Части без данных не штрафуют: их вес делится между остальными.
  const parts: [number | null, number][] = [
    [slPct, 30], [cv == null ? null : Math.max(0, 100 - Math.min(100, cv * 100)), 20], [lotUpPct == null ? null : 100 - lotUpPct, 20], [planPct, 15], [journalPct, 15],
  ];
  const known = parts.filter(([v]) => v != null), wsum = known.reduce((a, [, w]) => a + w, 0);
  const score = wsum ? Math.round(known.reduce((a, [v, w]) => a + (v as number) * w, 0) / wsum) : null;
  // Риск-радар
  const why: { lv: "r" | "a"; t: string }[] = [];
  if (o.dd >= R.redDD) why.push({ lv: "r", t: `просадка ${o.dd.toFixed(1)}% из ${R.max}%` });
  if (o.dayLoss >= R.redDaily) why.push({ lv: "r", t: `убыток за день ${o.dayLoss.toFixed(1)}%` });
  if (streak >= 3) why.push({ lv: "r", t: `${streak} ${streak < 5 ? "стопа" : "стопов"} подряд` });
  if (lotUpPct != null && after >= 3 && lotUpPct >= 40) why.push({ lv: "a", t: `после стопа увеличивает лот (${lotUpPct}%)` });
  if (noSL >= 2) why.push({ lv: "a", t: `${noSL} ${noSL < 5 ? "сделки" : "сделок"} без стопа` });
  if (cv != null && cv > 0.5) why.push({ lv: "a", t: "риск скачет от сделки к сделке" });
  if (o.idleDays >= 3) why.push({ lv: "a", t: `не торгует ${o.idleDays} торг. дн.` });
  if (journalPct != null && o.tradedDays.length >= 3 && journalPct < 40) why.push({ lv: "a", t: `дневник ${journalPct}% дней` });
  return {
    n: P.length, wins: P.filter(p => p.win).length, risk, cv, slPct, noSL, metaN: withMeta.length, avgR: avg(Rs), lotUpPct, planPct, journalPct, score, streak,
    why, urgent: why.some(w => w.lv === "r"),
  };
}
