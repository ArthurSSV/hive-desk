// Картинка «Топ-5» в стиле «Картинки для публикации»: лидер крупно и рейтинг пяти лучших.
export type TopData = {
  file: string;
  caption: string;          // «Топ-5 дня» / «Топ-5 недели»
  date: string;             // «18.11.2026» / «16.11–18.11.2026»
  lead: string;             // «ЛИДЕР ДНЯ»
  rows: { name: string; team: string | null; pct: number; pnl: number; trades: number }[];
  footLeft: string;         // «Челлендж группы с 09.11»
  footRight: string;        // «в плюсе 9 из 21 трейдера»
};

const C = { bg: "#050505", card: "#0C0B09", line: "#2A251B", fg: "#F3EEE3", muted: "#8E8778", soft: "#CFC8B8", gold: "#E8B54A", gold2: "#F7D27C", dim: "#8A6A28", green: "#2FD07A", track: "#1B1914" };
const SANS = '"Manrope", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const LOGO = ["M12 1.5c3.3 0 5.6 2.6 5.6 5.7 0 1.3-.4 2.4-1 3.4 2.6 1.6 4.4 4.6 4.4 8.3 0 5-4 7.6-9 7.6s-9-2.6-9-7.6c0-3.7 1.8-6.7 4.4-8.3-.6-1-1-2.1-1-3.4 0-3.1 2.3-5.7 5.6-5.7z", "M7.6 18.6c1.2 1.6 2.8 2.4 4.4 2.4s3.2-.8 4.4-2.4"];
const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "сделка" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "сделки" : "сделок");
const money = (v: number) => "+$" + Math.round(v).toLocaleString("en-US");

export async function drawTop(d: TopData, opt: { story?: boolean; usd?: boolean } = {}): Promise<HTMLCanvasElement> {
  await Promise.all([`800 28px ${SANS}`, `700 20px ${SANS}`, `600 18px ${SANS}`, `700 40px ${MONO}`, `600 18px ${MONO}`].map(f => document.fonts.load(f, "Топ 0123+−%$")));
  const st = !!opt.story, U = !!opt.usd, W = 1080, H = st ? 1920 : 1080;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!; x.textBaseline = "alphabetic";
  const rr = (a: number, b: number, w: number, h: number, r: number) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  const txt = (s: string, px: number, py: number, font: string, color: string, align: CanvasTextAlign = "left", sp = 0) => {
    x.font = font; x.fillStyle = color; x.textAlign = align;
    if (!sp) { x.fillText(s, px, py); return x.measureText(s).width; }
    const w = [...s].reduce((a, c) => a + x.measureText(c).width + sp, -sp); let cx = align === "right" ? px - w : align === "center" ? px - w / 2 : px;
    x.textAlign = "left"; for (const c of s) { x.fillText(c, cx, py); cx += x.measureText(c).width + sp; } return w;
  };
  const fit = (s: string, maxW: number, size: number, weight: number, font: string) => { let f = size; x.font = `${weight} ${f}px ${font}`; while (x.measureText(s).width > maxW && f > 12) { f -= 2; x.font = `${weight} ${f}px ${font}`; } return f; };
  const sub = (r: TopData["rows"][number]) => [r.team, `${r.trades} ${word(r.trades)}`].filter(Boolean).join(" · ");

  // фон и рамка — как у сводки
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(160, -60, 0, 160, -60, st ? 900 : 720); g.addColorStop(0, "rgba(232,181,74,.24)"); g.addColorStop(1, "rgba(232,181,74,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W, H + 100, 0, W, H + 100, 640); g.addColorStop(0, "rgba(232,140,40,.13)"); g.addColorStop(1, "rgba(232,140,40,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const gb = x.createLinearGradient(28, 28, W - 28, H - 28);
  gb.addColorStop(0, "rgba(232,181,74,.75)"); gb.addColorStop(.35, "rgba(232,181,74,.08)"); gb.addColorStop(.65, "rgba(232,181,74,.08)"); gb.addColorStop(1, "rgba(232,181,74,.6)");
  rr(29, 29, W - 58, H - 58, 28); x.strokeStyle = gb; x.lineWidth = 2; x.stroke();
  const T = st ? 120 : 0;

  // шапка
  x.save(); x.translate(80, 74 + T); x.scale(44 / 24, 44 / 24); x.strokeStyle = C.gold; x.lineWidth = 1.6; x.lineCap = "round";
  x.stroke(new Path2D(LOGO[0])); x.stroke(new Path2D(LOGO[1])); x.beginPath(); x.arc(12, 7.4, 2.6, 0, Math.PI * 2); x.fillStyle = C.gold; x.fill(); x.restore();
  txt("МАТРЁШКА — ЧЕЛЛЕНДЖ", 140, 111 + T, `800 28px ${SANS}`, C.fg, "left", 2.2);
  txt(d.caption, W - 80, 88 + T, `700 22px ${SANS}`, C.muted, "right");
  txt(d.date, W - 80, 126 + T, `700 ${d.date.length > 12 ? 26 : 30}px ${MONO}`, C.gold2, "right");

  // пять матрёшек-вкладышей — пять мест
  const mcx = st ? 850 : 860, mbase = st ? T + 560 : 440, ms = st ? 250 : 220;
  for (let i = 0; i < 5; i++) {
    const s = ms * Math.pow(0.8, i), k = s / 24;
    x.save(); x.translate(mcx - 12 * k, mbase - 26.6 * k); x.scale(k, k); x.strokeStyle = `rgba(232,181,74,${0.55 - 0.1 * i})`; x.lineWidth = (i === 0 ? 2.4 : 1.8) / k; x.stroke(new Path2D(LOGO[0])); x.restore();
  }

  const R = d.rows, lead = R[0];
  const ly = st ? T + 250 : 214;
  txt(d.lead, 80, ly, `800 22px ${SANS}`, C.gold, "left", 3);
  if (!lead) { txt("Никто не закрыл период в плюсе", 80, ly + 80, `700 40px ${SANS}`, C.soft); return cv; }
  const nf = fit(lead.name, 600, st ? 76 : 64, 800, SANS); txt(lead.name, 80, ly + (st ? 92 : 78), `800 ${nf}px ${SANS}`, C.fg);
  txt(sub(lead), 80, ly + (st ? 136 : 116), `600 22px ${SANS}`, C.muted);
  const pf = fit(`+${lead.pct.toFixed(2)}%`, 660, st ? 168 : 140, 700, MONO);
  txt(`+${lead.pct.toFixed(2)}%`, 74, ly + (st ? 136 : 116) + pf * 0.98, `700 ${pf}px ${MONO}`, C.green);
  if (U) txt(money(lead.pnl), 80, ly + (st ? 136 : 116) + pf * 0.98 + 48, `700 30px ${MONO}`, C.soft);

  // рейтинг
  const y0 = st ? T + (U ? 700 : 660) : (U ? 566 : 548);
  const rowH = st ? 170 : U ? 78 : 82, max = Math.max(lead.pct, 1e-9), bx = 340, bw = W - 80 - bx - 180;
  txt("РЕЙТИНГ", 80, y0 - 24, `800 18px ${SANS}`, C.dim, "left", 3);
  x.strokeStyle = C.line; x.lineWidth = 1.5; x.beginPath(); x.moveTo(80, y0 - 8); x.lineTo(W - 80, y0 - 8); x.stroke();
  R.forEach((r, i) => {
    const y = y0 + i * rowH + (st ? 60 : 44);
    if (i === 0) { rr(64, y - (st ? 62 : 46), W - 128, st ? 96 : 70, 16); x.fillStyle = "rgba(232,181,74,.07)"; x.fill(); x.strokeStyle = "rgba(232,181,74,.35)"; x.lineWidth = 1.5; x.stroke(); }
    txt(String(i + 1).padStart(2, "0"), 88, y, `700 ${st ? 34 : 28}px ${MONO}`, i === 0 ? C.gold2 : C.dim);
    const f = fit(r.name, bx - 170, st ? 34 : 28, 800, SANS); txt(r.name, 150, y - (st ? 8 : 6), `800 ${f}px ${SANS}`, C.fg);
    txt(sub(r), 150, y + (st ? 26 : 20), `600 ${st ? 20 : 16}px ${SANS}`, C.muted);
    const by = y - (st ? 14 : 12), bh = st ? 14 : 12;
    rr(bx, by, bw, bh, bh / 2); x.fillStyle = C.track; x.fill();
    const w = Math.max(bh, (bw * r.pct) / max), gg = x.createLinearGradient(bx, 0, bx + w, 0);
    gg.addColorStop(0, i === 0 ? C.gold : C.dim); gg.addColorStop(1, i === 0 ? C.gold2 : C.gold);
    rr(bx, by, w, bh, bh / 2); x.fillStyle = gg; x.fill();
    txt(`+${r.pct.toFixed(2)}%`, W - 80, y + (U ? -6 : 0), `700 ${st ? 38 : 30}px ${MONO}`, C.green, "right");
    if (U) txt(money(r.pnl), W - 80, y + (st ? 28 : 22), `600 ${st ? 20 : 16}px ${MONO}`, C.muted, "right");
  });

  // подвал
  const fy = H - (st ? 150 : 78);
  x.strokeStyle = C.line; x.lineWidth = 1.5; x.beginPath(); x.moveTo(80, fy - 34); x.lineTo(W - 80, fy - 34); x.stroke();
  txt(d.footLeft, 80, fy, `600 20px ${SANS}`, C.muted);
  txt(d.footRight, W - 80, fy, `600 20px ${SANS}`, C.muted, "right");
  return cv;
}
