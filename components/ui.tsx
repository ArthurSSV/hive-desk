import { LEVEL_LABEL, PHASE_LABEL } from "@/lib/rules";

export type Day = { day: string; pnl: number; pnl_pct: number; total_pct: number; trades: number; max_lot: number; level: string; flags: { lv: string; t: string }[]; breach: string | null };

export const sg = (v: number, d = 2) => (v > 0 ? "+" : "") + Number(v).toFixed(d);
export const cls = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
export const usd = (v: number | null | undefined) => (v == null ? "—" : "$" + Math.round(Number(v)).toLocaleString("en-US"));
export const fmtD = (iso: string) => iso.slice(8, 10) + "." + iso.slice(5, 7);

export function Pill({ level }: { level: string }) {
  return <span className={`pill l-${level}`}><span className="dot" />{LEVEL_LABEL[level] || level}</span>;
}

export function PhaseTag({ phase, status }: { phase: number; status: string }) {
  if (status === "failed") return <span className="st failed">Failed</span>;
  const c = phase === 3 ? "funded" : phase === 2 ? "p2" : "p1";
  return <span className={`st ${c}`}>{PHASE_LABEL[phase]}{status === "passed" ? " ✓" : ""}</span>;
}

export function EquityChart({ days, target, max, h = 220 }: { days: Day[]; target: number | null; max: number; h?: number }) {
  if (!days.length) return <p className="fine">Сделок пока нет. График появится после первой синхронизации.</p>;
  const W = 640, H = h, pl = 40, pr = 12, pt = 12, pb = 24;
  const vals = days.map(d => Number(d.total_pct));
  const lo = Math.min(-max - 1, ...vals), hi = Math.max((target || 4) + 1, ...vals);
  const x = (i: number) => pl + (days.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (days.length - 1));
  const y = (v: number) => pt + ((hi - v) * (H - pt - pb)) / (hi - lo);
  const step = hi - lo > 16 ? 4 : 2;
  const grid: number[] = []; for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) grid.push(g);
  const path = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(Number(d.total_pct)).toFixed(1)}`).join("");
  const area = `${path}L${x(days.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const every = Math.ceil(days.length / 6);
  const L = days[days.length - 1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Кривая результата фазы, %">
      {grid.map(g => (
        <g key={g}><line x1={pl} x2={W - pr} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={g === 0 ? 1.2 : 0.6} />
          <text x={pl - 6} y={y(g) + 3} textAnchor="end">{g > 0 ? "+" : ""}{g}%</text></g>
      ))}
      <path d={area} fill="var(--hive)" opacity={0.1} />
      <line x1={pl} x2={W - pr} y1={y(-max)} y2={y(-max)} stroke="var(--red)" strokeDasharray="5 4" />
      <text x={W - pr} y={y(-max) - 4} textAnchor="end" style={{ fill: "var(--red)" }}>лимит −{max}%</text>
      {target != null && <>
        <line x1={pl} x2={W - pr} y1={y(target)} y2={y(target)} stroke="var(--green)" strokeDasharray="5 4" />
        <text x={W - pr} y={y(target) - 4} textAnchor="end" style={{ fill: "var(--green)" }}>цель +{target}%</text></>}
      <path d={path} fill="none" stroke="var(--hive)" strokeWidth={2} strokeLinejoin="round" />
      {days.map((d, i) => d.breach ? <circle key={i} cx={x(i)} cy={y(Number(d.total_pct))} r={5} fill="none" stroke="var(--red)" strokeWidth={2} /> : null)}
      <circle cx={x(days.length - 1)} cy={y(Number(L.total_pct))} r={4} fill={L.breach ? "var(--red)" : "var(--hive)"} stroke="var(--surface)" strokeWidth={2} />
      {days.map((d, i) => (i % every === 0 || i === days.length - 1) ? <text key={"x" + i} x={x(i)} y={H - 6} textAnchor="middle">{fmtD(d.day)}</text> : null)}
    </svg>
  );
}

export function TempChart({ rows }: { rows: { day: string; red: number; yellow: number; green: number }[] }) {
  if (!rows.length) return <p className="fine">Данные появятся после первой синхронизации.</p>;
  const W = 640, H = 170, pl = 28, pr = 8, pt = 8, pb = 22, n = rows.length;
  const max = Math.max(5, ...rows.map(c => c.red + c.yellow + c.green));
  const st = max > 20 ? 10 : 5, top = Math.ceil(max / st) * st, bw = (W - pl - pr) / n;
  const y = (v: number) => pt + ((top - v) * (H - pt - pb)) / top;
  const ticks: number[] = []; for (let v = 0; v <= top; v += st) ticks.push(v);
  const every = Math.ceil(n / 7);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Светофор группы по дням">
      {ticks.map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={0.6} /><text x={pl - 5} y={y(v) + 3} textAnchor="end">{v}</text></g>)}
      {rows.map((c, i) => {
        const x0 = pl + i * bw + bw * 0.18, w = bw * 0.64; let acc = 0;
        return (
          <g key={c.day}>
            {(["green", "yellow", "red"] as const).map(k => {
              if (!c[k]) return null; const y1 = y(acc + c[k]), y0 = y(acc); acc += c[k];
              return <rect key={k} x={x0} y={y1} width={w} height={y0 - y1} fill={k === "green" ? "var(--green)" : k === "yellow" ? "var(--amber)" : "var(--red)"} opacity={k === "green" ? 0.35 : 0.9}><title>{`${fmtD(c.day)}: ${LEVEL_LABEL[k]} — ${c[k]}`}</title></rect>;
            })}
            {(i % every === 0 || i === n - 1) && <text x={x0 + w / 2} y={H - 6} textAnchor="middle">{fmtD(c.day)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Gauge({ k, v, sub, pct, col, note }: { k: string; v: string; sub?: string; pct: number; col: string; note: string }) {
  return (
    <div className="panel gauge">
      <div className="k">{k}</div>
      <div className="v">{v}{sub && <> <small>{sub}</small></>}</div>
      <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: col }} /></div>
      <div className="note">{note}</div>
    </div>
  );
}
