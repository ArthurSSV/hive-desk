"use client";
// Свечной график сделки: свечи cTrader, линии входа/выхода, отметки открытия и закрытия.

export type Bars = { symbol: string | null; period: string; bars: number[][] };

const fmtT = (min: number) => new Date(min * 60000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const px = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v > 100 ? 2 : 5 });

export default function TradeChart({ data, openMs, closeMs, entry, exit, side }: { data: Bars; openMs: number | null; closeMs: number; entry: number | null; exit: number | null; side: string }) {
  const b = data.bars;
  if (!b.length) return <p className="fine">cTrader не вернул свечи за этот период.</p>;
  const W = 600, H = 260, pl = 8, pr = 64, pt = 12, pb = 24;
  const lows = b.map(x => x[3]), highs = b.map(x => x[2]);
  let lo = Math.min(...lows, entry ?? Infinity, exit ?? Infinity), hi = Math.max(...highs, entry ?? -Infinity, exit ?? -Infinity);
  const padY = (hi - lo) * 0.08 || hi * 0.001; lo -= padY; hi += padY;
  const n = b.length, bw = (W - pl - pr) / n;
  const x = (i: number) => pl + i * bw + bw / 2;
  const y = (v: number) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
  const idxAt = (ms: number) => { const m = ms / 60000; let best = 0; for (let i = 0; i < n; i++) if (b[i][0] <= m) best = i; return best; };
  const oi = openMs != null ? idxAt(openMs) : null, ci = idxAt(closeMs);
  const ticks = 4, labels = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);
  const tEvery = Math.max(1, Math.ceil(n / 5));
  const win = side === "buy" ? (exit ?? 0) >= (entry ?? 0) : (exit ?? 0) <= (entry ?? 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График ${data.symbol || ""} ${data.period}`}>
      {labels.map((v, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={0.6} /><text x={W - pr + 6} y={y(v) + 3}>{px(v)}</text></g>)}
      {oi != null && <rect x={x(oi)} y={pt} width={Math.max(1, x(ci) - x(oi))} height={H - pt - pb} fill={win ? "var(--green)" : "var(--red)"} opacity={0.07} />}
      {b.map(([, o, h, l, c], i) => {
        const up = c >= o, col = up ? "var(--green)" : "var(--red)";
        return <g key={i}><line x1={x(i)} x2={x(i)} y1={y(h)} y2={y(l)} stroke={col} strokeWidth={1} />
          <rect x={x(i) - Math.max(0.6, bw * 0.32)} y={y(Math.max(o, c))} width={Math.max(1.2, bw * 0.64)} height={Math.max(1, Math.abs(y(o) - y(c)))} fill={col} /></g>;
      })}
      {entry != null && <><line x1={pl} x2={W - pr} y1={y(entry)} y2={y(entry)} stroke="var(--gold)" strokeDasharray="5 4" /><rect x={W - pr + 2} y={y(entry) - 8} width={pr - 4} height={16} rx={3} fill="var(--gold)" /><text x={W - pr + 6} y={y(entry) + 4} style={{ fill: "var(--accent-ink)", fontWeight: 700 }}>{px(entry)}</text></>}
      {exit != null && <line x1={pl} x2={W - pr} y1={y(exit)} y2={y(exit)} stroke={win ? "var(--green)" : "var(--red)"} strokeDasharray="2 3" />}
      {oi != null && entry != null && <path d={side === "buy" ? `M${x(oi)} ${y(entry) + 4}l-6 10h12z` : `M${x(oi)} ${y(entry) - 4}l-6 -10h12z`} fill={side === "buy" ? "var(--green)" : "var(--red)"} stroke="var(--surface)" />}
      {exit != null && <circle cx={x(ci)} cy={y(exit)} r={4.5} fill="var(--surface)" stroke={win ? "var(--green)" : "var(--red)"} strokeWidth={2} />}
      {b.map((bar, i) => (i % tEvery === 0 ? <text key={"t" + i} x={x(i)} y={H - 6} textAnchor="middle">{fmtT(bar[0]).slice(-5)}</text> : null))}
    </svg>
  );
}
