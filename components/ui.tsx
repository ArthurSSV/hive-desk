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
  if (status === "failed") return <span className="st failed">Труп</span>;
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
      {days.map((d, i) => ((i % every === 0 && days.length - 1 - i >= every / 2) || i === days.length - 1) ? <text key={"x" + i} x={x(i)} y={H - 6} textAnchor="middle">{fmtD(d.day)}</text> : null)}
    </svg>
  );
}

export function TempChart({ rows }: { rows: { day: string; red: number; yellow: number; work: number; green: number }[] }) {
  if (!rows.length) return <p className="fine">Данные появятся после первой синхронизации.</p>;
  const W = 640, H = 170, pl = 28, pr = 8, pt = 8, pb = 22, n = rows.length;
  const max = Math.max(5, ...rows.map(c => c.red + c.yellow + c.work + c.green));
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
            {(["green", "work", "yellow", "red"] as const).map(k => {
              if (!c[k]) return null; const y1 = y(acc + c[k]), y0 = y(acc); acc += c[k];
              return <rect key={k} x={x0} y={y1} width={w} height={y0 - y1} fill={k === "green" ? "var(--green)" : k === "work" ? "var(--gold-dim)" : k === "yellow" ? "var(--amber)" : "var(--red)"} opacity={k === "work" ? 0.55 : 0.9}><title>{`${fmtD(c.day)}: ${LEVEL_LABEL[k]} — ${c[k]}`}</title></rect>;
            })}
            {((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) && <text x={x0 + w / 2} y={H - 6} textAnchor="middle">{fmtD(c.day)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const ICONS: Record<string, JSX.Element> = {
  days: <path d="M4 7h16v13H4zM4 11h16M9 3v5M15 3v5M8 15h3" />,
  daily: <path d="M4 5h16v14H4zM7 15l3-3 3 2 4-5" />,
  max: <path d="M5 20V10M10 20V6M15 20v-7M20 20V4" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12l7-7" /></>,
};

export function Gauge({ k, v, sub, pct, col, note, icon }: { k: string; v: string; sub?: string; pct: number; col: string; note: React.ReactNode; icon: keyof typeof ICONS }) {
  return (
    <div className="panel gauge">
      <div className="gicon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[icon]}</svg></div>
      <div className="k">{k}</div>
      <div className="line"><span>{v}</span>{sub && <small>{sub}</small>}</div>
      <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: col }} /></div>
      <div className="note">{note}</div>
    </div>
  );
}

/** Общая кривая группы: накопленный результат, % от общего капитала (сверху) и итог дня, $ (снизу). */
export function GroupChart({ rows, from, to }: { rows: { day: string; pnl: number; cumPct: number }[]; from?: string | null; to?: string | null }) {
  if (!rows.length) return <p className="fine">Данные появятся после первой синхронизации.</p>;
  const W = 680, H = 300, pl = 54, pr = 14, top = 12, mid = 178, gap = 18, bot = H - 22;
  const n = rows.length, step = (W - pl - pr) / n;
  const cx = (i: number) => pl + i * step + step / 2;
  const vals = rows.map(r => r.cumPct);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = Math.max((hi - lo) * 0.15, 0.2); lo -= pad; hi += pad;
  const y = (v: number) => top + ((hi - v) * (mid - top)) / (hi - lo);
  const tick = niceStep((hi - lo) / 4);
  const ticks: number[] = []; for (let t = Math.ceil(lo / tick) * tick; t <= hi + 1e-9; t += tick) ticks.push(+t.toFixed(4));
  const bmax = Math.max(1, ...rows.map(r => Math.abs(r.pnl)));
  const b0 = mid + gap + (bot - mid - gap) / 2, bh = (bot - mid - gap) / 2;
  const by = (v: number) => b0 - (v / bmax) * bh;
  const line = rows.map((r, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${y(r.cumPct).toFixed(1)}`).join("");
  const area = `${line}L${cx(n - 1)} ${y(0)}L${cx(0)} ${y(0)}Z`;
  const every = Math.ceil(n / 7);
  const si = from ? rows.findIndex(r => r.day >= from) : -1;
  const ei = to ? rows.map(r => r.day <= to).lastIndexOf(true) : -1;
  const inSel = (i: number) => si >= 0 && i >= si && i <= ei;
  const last = rows[n - 1];
  const usdS = (v: number) => (v < 0 ? "−$" : "+$") + Math.abs(Math.round(v)).toLocaleString("en-US");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Общий результат группы по дням">
      {si >= 0 && ei >= si && <rect x={pl + si * step} y={top} width={(ei - si + 1) * step} height={bot - top} fill="var(--gold)" opacity={0.08} />}
      {ticks.map(t => <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1.2 : 0.6} /><text x={pl - 6} y={y(t) + 3} textAnchor="end">{t > 0 ? "+" : ""}{t.toFixed(tick < 0.1 ? 2 : tick < 1 ? 1 : 0)}%</text></g>)}
      <path d={area} fill="var(--gold)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={cx(n - 1)} cy={y(last.cumPct)} r={4} fill="var(--gold)" stroke="var(--surface)" strokeWidth={2} />
      <text x={Math.min(cx(n - 1), W - pr - 4)} y={y(last.cumPct) - 9} textAnchor="end" style={{ fill: "var(--gold2)", fontWeight: 600 }}>{last.cumPct > 0 ? "+" : ""}{last.cumPct.toFixed(2)}%</text>
      <line x1={pl} x2={W - pr} y1={b0} y2={b0} stroke="var(--line2)" />
      <text x={pl - 6} y={b0 - bh + 4} textAnchor="end">{usdS(bmax)}</text>
      <text x={pl - 6} y={b0 + bh} textAnchor="end">{usdS(-bmax)}</text>
      {rows.map((r, i) => {
        const h = Math.abs(by(r.pnl) - b0);
        return <rect key={r.day} x={cx(i) - step * 0.32} y={r.pnl >= 0 ? b0 - h : b0} width={step * 0.64} height={Math.max(h, r.pnl ? 1 : 0)} fill={r.pnl >= 0 ? "var(--green)" : "var(--red)"} opacity={si < 0 || inSel(i) ? 0.95 : 0.4}><title>{`${fmtD(r.day)}: ${usdS(r.pnl)}`}</title></rect>;
      })}
      {rows.map((r, i) => ((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) ? <text key={"x" + r.day} x={cx(i)} y={H - 6} textAnchor="middle">{fmtD(r.day)}</text> : null)}
    </svg>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
