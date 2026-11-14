"use client";
// Свечной график позиции: свечи cTrader, линия входа и все закрытия позиции (TP1, TP2, SL) с подписями.

export type Bars = { symbol: string | null; period: string; bars: number[][] };
export type Exit = { ms: number; price: number | null; label: string; win: boolean; hot?: boolean };

const fmtT = (min: number) => new Date(min * 60000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const px = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v > 100 ? 2 : 5 });

export default function TradeChart({ data, openMs, entry, side, exits }: { data: Bars; openMs: number | null; entry: number | null; side: string; exits: Exit[] }) {
  const b = data.bars;
  if (!b.length) return <p className="fine">cTrader не вернул свечи за этот период.</p>;
  const ex = exits.filter(e => e.price != null) as (Exit & { price: number })[];
  const many = ex.length > 1;
  const W = 640, H = 270, pl = 8, pr = many ? 98 : 66, pt = 12, pb = 24;
  const prices = [...ex.map(e => e.price), ...(entry != null ? [entry] : [])];
  let lo = Math.min(...b.map(x => x[3]), ...prices), hi = Math.max(...b.map(x => x[2]), ...prices);
  const padY = (hi - lo) * 0.08 || hi * 0.001; lo -= padY; hi += padY;
  const n = b.length, bw = (W - pl - pr) / n;
  const x = (i: number) => pl + i * bw + bw / 2;
  const y = (v: number) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
  const idxAt = (ms: number) => { const m = ms / 60000; let best = 0; for (let i = 0; i < n; i++) if (b[i][0] <= m) best = i; return best; };
  const oi = openMs != null ? idxAt(openMs) : null, lastMs = Math.max(...exits.map(e => e.ms)), ci = idxAt(lastMs);
  const labels = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const tEvery = Math.max(1, Math.ceil(n / 5));
  const total = ex.length === 1 ? ex[0].win : null;
  // Подписи цен на правой шкале не должны налезать друг на друга и на цену входа
  const used: number[] = entry != null ? [y(entry)] : [];
  const tags = ex.map(e => { let ly = y(e.price); const dir = entry != null && ly < y(entry) ? -1 : 1; while (used.some(u => Math.abs(u - ly) < 17)) ly += 17 * dir; used.push(ly); return ly; });
  // Подписи на самих свечах: если точки рядом, вторую подпись не рисуем — она есть на шкале справа
  const drawn: [number, number][] = [];
  const onChart = ex.map(e => { const cx = x(idxAt(e.ms)), cy = y(e.price); if (drawn.some(([a, b]) => Math.abs(a - cx) < 26 && Math.abs(b - cy) < 20)) return false; drawn.push([cx, cy]); return true; });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График ${data.symbol || ""} ${data.period}`}>
      {labels.map((v, i) => <g key={i}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={0.6} /><text x={W - pr + 6} y={y(v) + 3}>{px(v)}</text></g>)}
      {oi != null && <rect x={x(oi)} y={pt} width={Math.max(1, x(ci) - x(oi))} height={H - pt - pb} fill={total == null ? "var(--gold)" : total ? "var(--green)" : "var(--red)"} opacity={total == null ? 0.05 : 0.07} />}
      {b.map(([, o, h, l, c], i) => {
        const col = c >= o ? "var(--green)" : "var(--red)";
        return <g key={i}><line x1={x(i)} x2={x(i)} y1={y(h)} y2={y(l)} stroke={col} strokeWidth={1} />
          <rect x={x(i) - Math.max(0.6, bw * 0.32)} y={y(Math.max(o, c))} width={Math.max(1.2, bw * 0.64)} height={Math.max(1, Math.abs(y(o) - y(c)))} fill={col} /></g>;
      })}
      {entry != null && <><line x1={pl} x2={W - pr} y1={y(entry)} y2={y(entry)} stroke="var(--gold)" strokeDasharray="5 4" /><rect x={W - pr + 2} y={y(entry) - 8} width={pr - 4} height={16} rx={3} fill="var(--gold)" /><text x={W - pr + 6} y={y(entry) + 4} style={{ fill: "var(--accent-ink)", fontWeight: 700 }}>{px(entry)}</text></>}
      {oi != null && entry != null && <path d={side === "buy" ? `M${x(oi)} ${y(entry) + 4}l-6 10h12z` : `M${x(oi)} ${y(entry) - 4}l-6 -10h12z`} fill={side === "buy" ? "var(--green)" : "var(--red)"} stroke="var(--surface)" />}
      {ex.map((e, k) => {
        const col = e.win ? "var(--green)" : "var(--red)", cx = x(idxAt(e.ms)), cy = y(e.price);
        return <g key={k}>
          <line x1={many ? cx : pl} x2={W - pr} y1={cy} y2={cy} stroke={col} strokeDasharray="2 3" opacity={e.hot || !many ? 1 : 0.6} />
          <circle cx={cx} cy={cy} r={e.hot && many ? 6 : 4.5} fill="var(--surface)" stroke={col} strokeWidth={2} />
          {many && <>
            {onChart[k] && <text x={cx} y={cy + (entry != null && e.price < entry ? 17 : -10)} textAnchor="middle" style={{ fill: col, fontWeight: 700, fontSize: 11 }}>{e.label}</text>}
            <rect x={W - pr + 2} y={tags[k] - 8} width={pr - 4} height={16} rx={3} fill={col} />
            <text x={W - pr + 6} y={tags[k] + 4} style={{ fill: "#0b0906", fontWeight: 700 }}>{e.label} {px(e.price)}</text></>}
        </g>;
      })}
      {b.map((bar, i) => (i % tEvery === 0 ? <text key={"t" + i} x={x(i)} y={H - 6} textAnchor={i ? "middle" : "start"}>{fmtT(bar[0]).slice(-5)}</text> : null))}
    </svg>
  );
}
