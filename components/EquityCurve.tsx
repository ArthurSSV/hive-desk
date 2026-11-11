"use client";
// Кривая результата по закрытым сделкам (как у FundedHive): точка после каждой сделки,
// зелёный выше старта и красный ниже, переключатели «% / $» и масштаба, цель и лимит видны всегда.
import { useEffect, useId, useMemo, useState } from "react";

type Deal = { exec_ts: string; symbol: string | null; net_profit: number; is_close: boolean };
type Props = {
  deals: Deal[]; initial: number; totalPct: number; target: number | null; max: number; tz: string;
  stats: { winRate: number; tradingDays: number; best: number; worst: number };
};

const W = 680, H = 330, PR = 12, PT = 28, PB = 44;
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const money = (v: number, d = 2) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const nice = (span: number) => { const raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

export default function EquityCurve({ deals, initial: init, totalPct, target, max, tz, stats }: Props) {
  const [unit, setUnit] = useState<"pct" | "usd">("pct"), [scale, setScale] = useState<"auto" | "full">("auto"), [hi, setHi] = useState<number | null>(null);
  useEffect(() => { try { const u = localStorage.getItem("eq-unit"), s = localStorage.getItem("eq-scale"); if (u === "usd") setUnit("usd"); if (s === "full") setScale("full"); } catch { /* без памяти */ } }, []);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* без памяти */ } };

  const pts = useMemo(() => {
    const closed = deals.filter(d => d.is_close).sort((a, b) => a.exec_ts.localeCompare(b.exec_ts));
    const day = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit" });
    const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    // Если история длиннее загруженной — начинаем не с нуля, а с накопленного до неё результата
    let bal = (totalPct / 100) * init - closed.reduce((a, d) => a + Number(d.net_profit || 0), 0);
    if (Math.abs(bal) < 0.005) bal = 0;
    const out: { pct: number; bal: number; date: string; when?: string; sym?: string | null; pnl?: number }[] = [{ pct: (bal / init) * 100, bal: init + bal, date: closed[0] ? day.format(new Date(closed[0].exec_ts)) : "" }];
    for (const d of closed) { bal += Number(d.net_profit || 0); const t = new Date(d.exec_ts); out.push({ pct: (bal / init) * 100, bal: init + bal, date: day.format(t), when: time.format(t), sym: d.symbol, pnl: Number(d.net_profit || 0) }); }
    return out;
  }, [deals, init, totalPct, tz]);

  const fmt = (pct: number, d = 2) => unit === "pct" ? `${sgn(pct)}${Math.abs(pct).toFixed(d)}%` : `${sgn(pct)}${money((pct * init) / 100, d === 0 ? 0 : 2)}`;
  const abs = (pct: number) => fmt(pct).replace(/^[+−]/, "");
  const tabs = <T extends string>(cur: T, set: (v: T) => void, key: string, opts: [T, string][], label: string) => (
    <span className="tfs" role="group" aria-label={label}>{opts.map(([v, l]) => <button key={v} type="button" aria-pressed={cur === v} onClick={() => { set(v); save(key, v); setHi(null); }}>{l}</button>)}</span>);

  const n = pts.length, cur = pts[n - 1].pct, limit = -max;
  const dMin = Math.min(...pts.map(p => p.pct)), dMax = Math.max(...pts.map(p => p.pct));
  // «До цели» — весь диапазон; «Сделки» — под результат, цель и лимит попадают в шкалу, когда трейдер рядом
  const showT = target != null && (scale === "full" || dMax >= target * 0.6), showL = scale === "full" || dMin <= limit * 0.6;
  let lo = Math.min(dMin, 0, showL ? limit : 0), top = Math.max(dMax, 0, showT ? target! : 0);
  const pad = (top - lo) * 0.12 || 0.1; lo -= pad; top += pad;
  const pl = unit === "usd" ? 62 : 50;
  const x = (i: number) => (n > 1 ? pl + (i * (W - pl - PR)) / (n - 1) : pl), y = (v: number) => PT + ((top - v) * (H - PT - PB)) / (top - lo), y0 = y(0);
  const step = nice(top - lo), grid: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= top + 1e-9; v += step) grid.push(Math.abs(v) < 1e-9 ? 0 : v);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join("");
  const area = `${path}L${x(n - 1)} ${y0}L${x(0)} ${y0}Z`;
  const dates: { i: number; t: string }[] = []; { let prev = "", lastX = -99; pts.forEach((p, i) => { if (p.date && p.date !== prev && x(i) - lastX > 46) { dates.push({ i, t: p.date }); lastX = x(i); } prev = p.date; }); }
  const move = (cx: number, r: DOMRect) => { const px = ((cx - r.left) * W) / r.width; setHi(Math.max(0, Math.min(n - 1, Math.round(((px - pl) / (W - pl - PR)) * (n - 1))))); };
  const h = hi != null && hi < n ? pts[hi] : null;

  return (
    <>
      <div className="ph"><h2>Кривая результата</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {tabs(unit, setUnit, "eq-unit", [["pct", "%"], ["usd", "$"]], "Единицы")}
          {tabs(scale, setScale, "eq-scale", [["auto", "Сделки"], ["full", "До цели"]], "Масштаб")}
        </div></div>
      {n < 2 ? <p className="fine">Кривая появится после первой закрытой сделки.</p> : (
        <div style={{ position: "relative" }}>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Кривая результата по закрытым сделкам"
            onMouseMove={e => move(e.clientX, e.currentTarget.getBoundingClientRect())} onMouseLeave={() => setHi(null)}
            onTouchStart={e => move(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())} onTouchMove={e => move(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}>
            <defs>
              <clipPath id={`up${uid}`}><rect x={0} y={0} width={W} height={Math.max(0, y0)} /></clipPath>
              <clipPath id={`dn${uid}`}><rect x={0} y={y0} width={W} height={Math.max(0, H - y0)} /></clipPath>
            </defs>
            {grid.map(v => <g key={v}><line x1={pl} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1.2 : 0.6} />
              <text x={pl - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? (unit === "pct" ? "0%" : "$0") : unit === "usd" ? fmt(v, 0) : fmt(v, step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}</text></g>)}
            {([[`up${uid}`, "var(--green)"], [`dn${uid}`, "var(--red)"]] as const).map(([clip, col]) => <g key={clip} clipPath={`url(#${clip})`}>
              <path d={area} fill={col} opacity={0.1} /><path d={path} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></g>)}
            {target != null && (showT
              ? <><line x1={pl} x2={W - PR} y1={y(target)} y2={y(target)} stroke="var(--green)" strokeDasharray="6 5" /><text x={W - PR} y={y(target) - 6} textAnchor="end" style={{ fill: "var(--green)" }}>цель {fmt(target, 0)} · {cur >= target ? "достигнута" : `осталось ${abs(target - cur)}`}</text></>
              : <text x={W - PR} y={15} textAnchor="end" style={{ fill: "var(--green)" }}>▲ цель {fmt(target, 0)} · осталось {abs(target - cur)}</text>)}
            {showL
              ? <><line x1={pl} x2={W - PR} y1={y(limit)} y2={y(limit)} stroke="var(--red)" strokeDasharray="6 5" /><text x={W - PR} y={y(limit) + 14} textAnchor="end" style={{ fill: "var(--red)" }}>лимит {fmt(limit, 0)} · запас {abs(Math.max(0, cur - limit))}</text></>
              : <text x={W - PR} y={H - 6} textAnchor="end" style={{ fill: "var(--red)" }}>▼ лимит {fmt(limit, 0)} · запас {abs(cur - limit)}</text>}
            {dates.map(({ i, t }) => <text key={i} x={x(i)} y={H - PB + 18} textAnchor={!i ? "start" : x(i) > W - PR - 20 ? "end" : "middle"}>{t}</text>)}
            {n <= 80 && pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.pct)} r={2.2} fill={p.pct >= 0 ? "var(--green)" : "var(--red)"} />)}
            <circle cx={x(n - 1)} cy={y(cur)} r={4} fill={cur >= 0 ? "var(--green)" : "var(--red)"} />
            {h && <circle cx={x(hi!)} cy={y(h.pct)} r={5} fill="var(--surface)" stroke={h.pct >= 0 ? "var(--green)" : "var(--red)"} strokeWidth={2} />}
          </svg>
          {h && (
            <div className="eqtip" style={{ left: `${Math.max(16, Math.min(84, (x(hi!) / W) * 100))}%`, top: `${(y(h.pct) / H) * 100}%`, transform: `translate(-50%, ${y(h.pct) < 110 ? "14px" : "calc(-100% - 12px)"})` }}>
              {h.pnl == null ? <><b>Старт</b><span className="mono">{money(h.bal)}</span></> : <>
                <b>{h.when} · {h.sym || "—"}</b>
                <span className={`mono ${h.pnl >= 0 ? "pos" : "neg"}`}>сделка {sgn(h.pnl)}{unit === "usd" ? money(h.pnl) : `${Math.abs((h.pnl / init) * 100).toFixed(2)}%`}</span><br />
                <span className="mono">баланс {money(h.bal)} · {sgn(h.pct)}{Math.abs(h.pct).toFixed(2)}%</span></>}
            </div>)}
        </div>)}
      <div className="stats" style={{ marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))" }}>
        <div><div className="k">Баланс</div><div className="v" style={{ fontSize: 15, lineHeight: "27px" }}>{money(pts[n - 1].bal)}</div></div>
        <div><div className="k">Winrate дней</div><div className="v">{stats.winRate}%</div></div>
        <div><div className="k">Торговых дней</div><div className="v">{stats.tradingDays}</div></div>
        <div><div className="k">Лучший день</div><div className="v pos">{fmt(stats.best)}</div></div>
        <div><div className="k">Худший день</div><div className="v neg">{fmt(stats.worst)}</div></div>
      </div>
    </>
  );
}
