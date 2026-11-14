"use client";
// Аналитика счёта по закрытым позициям: дни недели, час входа, торговые сессии, время в сделке.
import { useMemo, useState } from "react";

type Deal = { position_id: number | null; exec_ts: string; net_profit: number; is_close: boolean; side?: string; lots?: number | null; volume?: number | null; price?: number | null; entry_price?: number | null; conv?: number | null };
type Meta = { position_id: number; sl: number | null; tp: number | null; close_reason: string | null; exits?: { ts: number; price: number | null; kind: string }[] | null };
// Группы планового RR; группы риска подбираются под трейдера автоматически
const MIN_N = 5; // меньше — «мало данных»
/** Границы групп риска по распределению сделок трейдера: 3 группы примерно поровну, шаг 0.05%. */
function riskBuckets(xs: number[]): [string, number][] {
  const s = [...xs].sort((a, b) => a - b), r = (v: number) => Math.max(0.05, Math.round(v * 20) / 20);
  if (s.length < 6) return [["все сделки", Infinity]];
  const a = r(s[Math.floor(s.length / 3)]), b = r(s[Math.floor((s.length * 2) / 3)]);
  const f = (v: number) => `${v.toFixed(2).replace(/0$/, "")}%`;
  if (a >= b) return [[`до ${f(a)}`, a], [`больше ${f(a)}`, Infinity]];
  return [[`до ${f(a)}`, a], [`${f(a)}–${f(b)}`, b], [`больше ${f(b)}`, Infinity]];
}
const PART: Record<string, string> = { tp: "По тейку", sl: "По стопу", be: "Стоп в плюсе / б/у", stopout: "Стоп-аут", manual: "Вручную" };
const RRG: [string, number][] = [["1:1", 1.25], ["1:1.5", 1.75], ["1:2–2.5", 2.75], ["1:3+", Infinity]];
type Row = { k: string; n: number; w: number; pnl: number; ord: number };
const WD = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const WDI: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// Сессии заданы в UTC; в подписи часы пересчитываются в пояс того, кто смотрит
const SESS: [string, number, number][] = [["Азия", 1, 8], ["Лондон", 8, 14], ["Лондон + Нью-Йорк", 14, 17], ["Нью-Йорк", 17, 22]];
const DUR: [string, number][] = [["до 5 мин", 5], ["5–15 мин", 15], ["15–60 мин", 60], ["1–4 часа", 240], ["дольше 4 часов", Infinity]];
const cls = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const p2 = (n: number) => String(n).padStart(2, "0");

export default function Analytics({ deals, initial, tz, meta = [] }: { deals: Deal[]; initial: number; tz: string; meta?: Meta[] }) {
  const [unit, setUnit] = useState<"usd" | "pct">("usd");
  const fmt = (v: number, short = false) => unit === "pct" ? `${sgn(v)}${Math.abs(initial ? (v / initial) * 100 : 0).toFixed(2)}%` : `${sgn(v)}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: short ? 0 : 2, minimumFractionDigits: short ? 0 : 2 })}`;
  const A = useMemo(() => {
    // Одна сделка = одна позиция: вход — первая открывающая сделка, результат — сумма всех частей
    type P = { id: number; open: number | null; close: number; pnl: number; lots: number; vol: number; entry: number | null; buy: boolean; conv: number | null; parts: { ms: number; pnl: number }[] };
    const pos = new Map<number, P>();
    for (const d of deals) {
      if (d.position_id == null) continue;
      const p = pos.get(d.position_id) || { id: d.position_id, open: null, close: 0, pnl: 0, lots: 0, vol: 0, entry: null, buy: true, conv: null, parts: [] }, ms = Date.parse(d.exec_ts);
      if (d.is_close) { p.parts.push({ ms, pnl: Number(d.net_profit || 0) }); p.pnl += Number(d.net_profit || 0); p.close = Math.max(p.close, ms); if (d.conv != null) p.conv = Number(d.conv); if (d.entry_price != null) p.entry = Number(d.entry_price); }
      else { if (p.open == null || ms < p.open) p.open = ms; p.lots += Number(d.lots || 0); p.vol += Number(d.volume || 0); p.buy = d.side === "buy"; if (p.entry == null && d.price != null) p.entry = Number(d.price); }
      pos.set(d.position_id, p);
    }
    const trades = ([...pos.values()].filter(p => p.close && p.open != null) as (P & { open: number })[]).sort((a, b) => a.close - b.close);
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23", weekday: "short" });
    const local = (ms: number) => { const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { h: Number(parts.hour) % 24, wd: WDI[parts.weekday] ?? 0 }; };
    const shift = trades.length ? (local(trades[0].open).h - new Date(trades[0].open).getUTCHours() + 24) % 24 : 0;
    const sessName = (utcH: number) => { const s = SESS.find(([, a, b]) => utcH >= a && utcH < b); return s ? `${s[0]} ${p2((s[1] + shift) % 24)}–${p2((s[2] + shift) % 24)}` : `Вне сессий ${p2((22 + shift) % 24)}–${p2((1 + shift) % 24)}`; };
    const group = (keyOf: (t: (typeof trades)[number]) => [string, number]) => {
      const m = new Map<string, Row>();
      for (const t of trades) { const [k, ord] = keyOf(t); const g = m.get(k) || { k, n: 0, w: 0, pnl: 0, ord }; g.n++; if (t.pnl > 0) g.w++; g.pnl += t.pnl; m.set(k, g); }
      return [...m.values()];
    };
    const byOrd = (a: Row, b: Row) => a.ord - b.ord, byPnl = (a: Row, b: Row) => b.pnl - a.pnl;
    // ---- Серии: по позициям в порядке закрытия
    const seq = trades.map(t => t.pnl > 0);
    let maxW = 0, maxL = 0, run = 0, prev: boolean | null = null;
    for (const w of seq) { run = w === prev ? run + 1 : 1; prev = w; if (w) maxW = Math.max(maxW, run); else maxL = Math.max(maxL, run); }
    const base = seq.length ? seq.filter(Boolean).length / seq.length : 0;
    const after = [0, 1, 2, 3].map(n => { let w = 0, t = 0;
      for (let i = Math.max(1, n); i < seq.length; i++) {
        const ok = n === 0 ? seq[i - 1] : seq.slice(i - n, i).every(x => !x) && (i - n === 0 || seq[i - n - 1]);
        if (ok) { t++; if (seq[i]) w++; } }
      return { n, t, wr: t ? w / t : 0 }; });
    let up = 0, same = 0, down = 0;
    for (let i = 1; i < trades.length; i++) if (trades[i - 1].pnl < 0 && trades[i - 1].lots && trades[i].lots) { const a = trades[i - 1].lots, b = trades[i].lots; if (b > a * 1.2) up++; else if (b < a * 0.8) down++; else same++; }
    // ---- Стоп и RR: риск = |вход − стоп| × объём × курс, в % от начального баланса
    const mm = new Map(meta.map(m => [Number(m.position_id), m]));
    const withMeta = trades.filter(t => mm.has(t.id));
    const rr = withMeta.map(t => {
      const m = mm.get(t.id)!, sl = m.sl != null ? Number(m.sl) : null, tp = m.tp != null ? Number(m.tp) : null;
      const dist = sl != null && t.entry != null ? Math.abs(t.entry - sl) : null;
      const riskUsd = dist && t.vol && t.conv ? dist * (t.vol / 100) * t.conv : null;
      const risk = riskUsd && initial ? (riskUsd / initial) * 100 : null;
      // Выходы: каждая часть позиции — по тейку, стопом в минус, стопом в плюсе (б/у), стоп-аутом или вручную.
      // Части сопоставляем с закрывающими ордерами по порядку; без данных о выходах — по причине закрытия и знаку результата.
      const parts = [...t.parts].sort((a, b) => a.ms - b.ms), ex = (m.exits || []).slice().sort((a, b) => a.ts - b.ts);
      const kinds = parts.map((p, i) => {
        const k = ex.length === parts.length ? ex[i].kind : m.close_reason === "stopout" ? "stopout" : m.close_reason === "sltp" ? "sl" : m.close_reason === "manual" ? "manual" : null;
        return k === "sl" && p.pnl >= 0 ? "be" : k;
      });
      // Плановый RR — по первому тейку (при частичных тейках)
      const firstTp = ex.find(e => e.kind === "tp" && e.price != null)?.price ?? tp;
      const plan = dist && firstTp != null && t.entry != null ? Math.abs(Number(firstTp) - t.entry) / dist : null;
      return { t, risk, plan, R: riskUsd ? t.pnl / riskUsd : null, parts: parts.map((p, i) => ({ pnl: p.pnl, kind: kinds[i] })) };
    });
    return {
      seq, maxW, maxL, cur: run, curW: prev, base, after, lot: { up, same, down }, rr, metaN: withMeta.length,
      n: trades.length, wins: trades.filter(t => t.pnl > 0).length,
      cards: [
        ["По дням недели", group(t => { const w = local(t.open).wd; return [WD[w], (w + 6) % 7]; }).sort(byOrd)],
        ["По часу входа", group(t => { const h = local(t.open).h; return [`${p2(h)}:00`, h]; }).sort(byOrd)],
        ["По торговым сессиям", group(t => [sessName(new Date(t.open).getUTCHours()), 0]).sort(byPnl)],
        ["Время в сделке", group(t => { const m = (t.close - t.open) / 60000, i = DUR.findIndex(([, lim]) => m < lim); return [DUR[i][0], i]; }).sort(byPnl)],
      ] as [string, Row[]][],
    };
  }, [deals, tz, meta, initial]);

  const bar = (k: string, sub: string, val: string, valCls: string, w: number, col: string, n = MIN_N) => {
    const few = n < MIN_N; // мало данных — строка серая, чтобы не выглядела выводом
    return (<div className={`r${few ? " few" : ""}`} key={k} title={few ? "Мало данных: меньше 5 сделок, вывод ненадёжный" : undefined}>
      <div className="l"><div><b>{k}</b> <span>{sub}{few ? " · мало данных" : ""}</span></div><em className={few ? "" : valCls}>{val}</em></div>
      <div className="b"><i style={{ width: `${Math.max(2, Math.min(100, w))}%`, background: few ? "var(--muted)" : `var(--${col})` }} /></div></div>);
  };
  const Rs = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  const withSL = A.rr.filter(x => x.risk != null), noSL = A.rr.filter(x => x.risk == null);
  const grp = (list: typeof A.rr, keyOf: (x: (typeof A.rr)[number]) => string | null, order: string[]) => {
    const m = new Map<string, { k: string; n: number; w: number; pnl: number; R: number; nR: number }>();
    for (const x of list) { const k = keyOf(x); if (!k) continue; const g = m.get(k) || { k, n: 0, w: 0, pnl: 0, R: 0, nR: 0 }; g.n++; if (x.t.pnl > 0) g.w++; g.pnl += x.t.pnl; if (x.R != null) { g.R += x.R; g.nR++; } m.set(k, g); }
    return order.map(k => m.get(k)).filter(Boolean) as { k: string; n: number; w: number; pnl: number; R: number; nR: number }[];
  };
  const rows = (gs: ReturnType<typeof grp>) => gs.map(g => bar(g.k, `· ${g.n} сд${g.nR ? ` · ${Rs(g.R / g.nR)}` : ""}`, `${Math.round((g.w / g.n) * 100)}%`, g.pnl >= 0 ? "pos" : "neg", (g.w / g.n) * 100, g.pnl >= 0 ? "green" : "red", g.n));
  const RISK = riskBuckets(withSL.map(x => x.risk!));
  const allParts = A.rr.flatMap(x => x.parts).filter(p => p.kind), partsN = allParts.length || 1;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgRisk = avg(withSL.map(x => x.risk!)), avgPlan = avg(A.rr.filter(x => x.plan != null).map(x => x.plan!)), avgR = avg(A.rr.filter(x => x.R != null).map(x => x.R!));
  const lt = A.lot.up + A.lot.same + A.lot.down || 1;
  const seriesBlock = A.n >= 3 && (
    <section className="panel"><div className="ph"><h2>Серии</h2><span className="fine">по позициям, в порядке закрытия</span></div>
      <div className="streaks">
        <div><div className="k">Текущая серия</div><div className={`v ${A.curW ? "pos" : "neg"}`}>{A.cur} {A.curW ? "в плюс" : "в минус"}</div><div className="s">последние сделки подряд</div></div>
        <div><div className="k">Лучшая серия</div><div className="v pos">{A.maxW} в плюс</div><div className="s">подряд за фазу</div></div>
        <div><div className="k">Худшая серия</div><div className="v neg">{A.maxL} в минус</div><div className="s">подряд за фазу</div></div>
        <div><div className="k">Винрейт всех сделок</div><div className="v">{Math.round(A.base * 100)}%</div><div className="s">{A.n} позиций</div></div>
      </div>
      <div className="an an3" style={{ marginTop: 14 }}>
        <div><h3>Последние сделки подряд</h3><div className="beads">{A.seq.slice(-40).map((w, i) => <i key={i} className={w ? "w" : "l"} title={w ? "плюс" : "минус"} />)}</div>
          <p className="fine" style={{ margin: "8px 0 0" }}>Зелёный — плюс, красный — минус. Новые справа.</p></div>
        <div><h3>Сделка после серии стопов</h3>{A.after.map(r => bar(r.n === 0 ? "После плюса" : `После ${r.n} ${r.n === 1 ? "стопа" : "стопов"} подряд`, `· ${r.t} сд`, r.t ? `${Math.round(r.wr * 100)}%` : "—", r.t ? (r.wr >= A.base ? "pos" : "neg") : "", r.wr * 100, r.wr >= A.base ? "green" : "red", r.t))}
          <p className="fine" style={{ margin: "8px 0 0" }}>Средний винрейт {Math.round(A.base * 100)}%. Красным — ниже среднего: после такой серии лучше остановиться.</p></div>
        <div><h3>Лот после стопа</h3>{([["Увеличил", A.lot.up, "red"], ["Тот же", A.lot.same, "green"], ["Уменьшил", A.lot.down, "green"]] as [string, number, string][]).map(([k, v, c]) => bar(k, `· ${v} раз`, `${Math.round((v / lt) * 100)}%`, c === "red" && v ? "neg" : "", (v / lt) * 100, c, A.lot.up + A.lot.same + A.lot.down))}
          <p className="fine" style={{ margin: "8px 0 0" }}>«Увеличил» — следующая сделка после стопа с лотом больше на 20%+. Частый признак отыгрыша.</p></div>
      </div>
    </section>);
  const stopBlock = (
    <section className="panel"><div className="ph"><h2>Стоп и RR</h2>{A.metaN > 0 && <span className="fine">по {A.metaN} из {A.n} позиций, где cTrader отдал данные ордеров</span>}</div>
      {A.metaN === 0 ? <p className="fine" style={{ margin: 0 }}>Данных о стопах и тейках пока нет. Они подтянутся из cTrader при следующих синхронизациях. Если блок остаётся пустым, значит cTrader не отдаёт стопы для этого счёта.</p> : <>
        <div className="streaks">
          <div><div className="k">Средний риск</div><div className="v">{avgRisk != null ? `${avgRisk.toFixed(2)}%` : "—"}</div><div className="s">на сделку, % счёта</div></div>
          <div><div className="k">Плановый RR</div><div className="v">{avgPlan != null ? `1:${avgPlan.toFixed(1)}` : "—"}</div><div className="s">в среднем по тейкам</div></div>
          <div><div className="k">Средний результат</div><div className={`v ${avgR != null ? (avgR >= 0 ? "pos" : "neg") : ""}`}>{avgR != null ? Rs(avgR) : "—"}</div><div className="s">в стопах на сделку</div></div>
          <div><div className="k">Без стопа</div><div className={`v ${noSL.length ? "neg" : "pos"}`}>{Math.round((noSL.length / A.metaN) * 100)}%</div><div className="s">{noSL.length} из {A.metaN} сделок</div></div>
        </div>
        <div className="an an3" style={{ marginTop: 14 }}>
          <div><h3>Винрейт по риску на сделку</h3>{rows(grp(withSL, x => RISK.find(([, lim]) => x.risk! <= lim)![0], RISK.map(r => r[0])))}
            {noSL.length > 0 && bar("Без стопа", `· ${noSL.length} сд`, `${Math.round((noSL.filter(x => x.t.pnl > 0).length / noSL.length) * 100)}%`, "neg", (noSL.filter(x => x.t.pnl > 0).length / noSL.length) * 100, "red", noSL.length)}</div>
          <div><h3>Винрейт по плановому RR</h3>{rows(grp(A.rr.filter(x => x.plan != null), x => RRG.find(([, lim]) => x.plan! < lim)![0], RRG.map(r => r[0])))}
            {!A.rr.some(x => x.plan != null) && <p className="fine">Тейки не выставлялись.</p>}</div>
          <div><h3>Как закрывались</h3>{["tp", "be", "sl", "stopout", "manual"].map(k => { const l = allParts.filter(p => p.kind === k); if (!l.length) return null; const pn = l.reduce((a, p) => a + p.pnl, 0);
            return bar(PART[k], `· ${l.length} ${l.length === 1 ? "закрытие" : l.length < 5 ? "закрытия" : "закрытий"}`, fmt(pn), cls(pn), (l.length / partsN) * 100, k === "tp" || k === "be" ? "green" : k === "manual" ? "gold" : "red", l.length); })}
            <p className="fine" style={{ margin: "8px 0 0" }}>Каждая часть позиции считается отдельно: TP1 и SL одной позиции — два закрытия. «Стоп в плюсе / б/у» — сработал стоп, перенесённый в безубыток или в прибыль. Справа — сколько принесли или забрали.</p></div>
        </div>
        <p className="fine" style={{ margin: "12px 0 0" }}>Риск — расстояние от входа до первоначального стопа × объём, в % от начального баланса. RR — расстояние до тейка к расстоянию до стопа. Результат в R — во сколько стопов обошлась или принесла сделка. Если стоп переносили, считается первый.</p>
      </>}
    </section>);
  const hours = [...A.cards[1][1]].sort((a, b) => b.pnl - a.pnl), durs = A.cards[3][1];
  return (<>
    <section className="panel">
      <div className="ph"><h2>Аналитика счёта</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className="fine">по закрытым позициям текущей фазы · время в вашем часовом поясе</span>
          <span className="tfs" role="group" aria-label="Единицы">{(["usd", "pct"] as const).map(u => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "usd" ? "$" : "%"}</button>)}</span></div></div>
      {!A.n ? <p className="fine">Аналитика появится после первых закрытых сделок.</p> : <>
        <div className="an-note">
          <span>Сделок: <b>{A.n}</b> · в плюс <b>{Math.round((A.wins / A.n) * 100)}%</b></span>
          {hours.length > 1 && <><span>Лучший час входа: <b>{hours[0].k}</b> <span className={cls(hours[0].pnl)}>{fmt(hours[0].pnl, true)}</span></span>
            <span>Худший час: <b>{hours[hours.length - 1].k}</b> <span className={cls(hours[hours.length - 1].pnl)}>{fmt(hours[hours.length - 1].pnl, true)}</span></span></>}
          {durs.length > 1 && durs[0].pnl > 0 && <span>Лучше всего сделки: <b>{durs[0].k}</b></span>}
        </div>
        <div className="an">{A.cards.map(([title, rows]) => { const mx = Math.max(...rows.map(r => Math.abs(r.pnl)), 1); return (
          <div key={title}><h3>{title}</h3>{rows.map(r => (
            bar(r.k, `· ${r.n} сд · ${Math.round((r.w / r.n) * 100)}%`, fmt(r.pnl), cls(r.pnl), (Math.abs(r.pnl) / mx) * 100, r.pnl >= 0 ? "green" : "red", r.n)))}</div>); })}</div>
        <p className="fine" style={{ margin: "12px 0 0" }}>«сд» — число позиций (позиция, закрытая частями, считается одной), процент — доля прибыльных. Серые строки — меньше 5 сделок, выводы по ним ненадёжны.</p>
      </>}
    </section>
    {seriesBlock}
    {stopBlock}
  </>);
}
