"use client";
// Коллаж недели: итог периода крупно и карточка на каждый торговый день. Рисуется на canvas в браузере.
import { useState } from "react";

export type CollageData = {
  file: string; date: string; caption: string; heroLabel: string;
  pnl: number; pct: number; cum: number; cumPct: number; capital: number;
  days: { dow: string; date: string; pnl: number; pct: number; plus: number; minus: number; trades: number; best: string | null; bestPct: number | null }[];
  trades: number; plus: number; minus: number; tradingDays: number; accounts: number; failed: number;
  zones: { green: number; work: number; yellow: number; red: number }; best: string | null;
};
type Fmt = "post" | "story";

const C = { bg: "#050505", card: "#0C0B09", line: "#2A251B", line2: "#3B3324", fg: "#F3EEE3", muted: "#8E8778", soft: "#CFC8B8", gold: "#E8B54A", gold2: "#F7D27C", dim: "#8A6A28", green: "#2FD07A", red: "#F0565A", amber: "#F0A93A" };
const SANS = '"Manrope", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const LOGO = ["M12 1.5c3.3 0 5.6 2.6 5.6 5.7 0 1.3-.4 2.4-1 3.4 2.6 1.6 4.4 4.6 4.4 8.3 0 5-4 7.6-9 7.6s-9-2.6-9-7.6c0-3.7 1.8-6.7 4.4-8.3-.6-1-1-2.1-1-3.4 0-3.1 2.3-5.7 5.6-5.7z", "M7.6 18.6c1.2 1.6 2.8 2.4 4.4 2.4s3.2-.8 4.4-2.4"];
const pc = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%";
const usd = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US");
const col = (v: number) => (v > 0 ? C.green : v < 0 ? C.red : C.soft);

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function T(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", sp = 0) {
  c.font = font; c.fillStyle = color; c.textAlign = align; try { (c as any).letterSpacing = sp + "px"; } catch {} c.fillText(s, x, y); try { (c as any).letterSpacing = "0px"; } catch {} return c.measureText(s).width;
}
function fit(c: CanvasRenderingContext2D, s: string, font: string, size: number, max: number, min: number) { let f = size; c.font = font.replace("#", String(f)); while (c.measureText(s).width > max && f > min) { f -= 2; c.font = font.replace("#", String(f)); } return font.replace("#", String(f)); }

export async function drawCollage(d: CollageData, fmt: Fmt): Promise<HTMLCanvasElement> {
  await Promise.all([`800 28px ${SANS}`, `600 19px ${SANS}`, `700 40px ${MONO}`, `500 18px ${MONO}`].map(f => document.fonts.load(f, "Неделя 0123+−%$")));
  const W = 1080, H = fmt === "post" ? 1350 : 1920, st = fmt === "story", cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!; c.textBaseline = "alphabetic";
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
  let g: CanvasGradient = c.createRadialGradient(160, 80, 0, 160, 80, 700); g.addColorStop(0, "rgba(232,181,74,.20)"); g.addColorStop(1, "rgba(232,181,74,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
  rr(c, 28, 28, W - 56, H - 56, 30); c.fillStyle = "rgba(12,11,9,.55)"; c.fill();
  g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "rgba(232,181,74,.85)"); g.addColorStop(.4, "rgba(232,181,74,.18)"); g.addColorStop(.7, "rgba(232,181,74,.18)"); g.addColorStop(1, "rgba(232,181,74,.75)");
  c.strokeStyle = g; c.lineWidth = 2; c.stroke();
  const L = 80, R = W - 80;
  // шапка
  c.save(); c.translate(L, 72); c.scale(1.75, 1.75); c.strokeStyle = C.gold; c.lineWidth = 1.6; c.lineCap = "round";
  c.stroke(new Path2D(LOGO[0])); c.stroke(new Path2D(LOGO[1])); c.fillStyle = C.gold; c.beginPath(); c.arc(12, 7.4, 2.6, 0, 7); c.fill(); c.restore();
  T(c, "МАТРЁШКА — ЧЕЛЛЕНДЖ", L + 58, 113, `800 28px ${SANS}`, C.fg, "left", 1);
  T(c, d.caption, R, 92, fit(c, d.caption, `600 #px ${SANS}`, 20, 380, 14), C.muted, "right");
  T(c, d.date, R, 126, fit(c, d.date, `700 #px ${MONO}`, 30, 420, 20), C.gold2, "right");
  // главный блок: итог периода, ниже — итог с начала
  let y = st ? 270 : 210;
  T(c, d.heroLabel.toUpperCase(), L, y, `800 22px ${SANS}`, C.gold, "left", 3);
  const hf = fit(c, pc(d.pct), `700 #px ${MONO}`, st ? 150 : 132, 560, 90);
  const hw = T(c, pc(d.pct), L - 6, y + (st ? 148 : 128), hf, col(d.pct)), sx = L + hw + 30, room = R - sx;
  T(c, usd(d.pnl), sx, y + 74, fit(c, usd(d.pnl), `700 #px ${MONO}`, 44, room, 26), C.fg);
  const s1 = `от капитала $${Math.round(d.capital).toLocaleString("en-US")}`, s2 = `с начала челленджа ${pc(d.cumPct)} · ${usd(d.cum)}`;
  T(c, s1, sx, y + 110, fit(c, s1, `600 #px ${SANS}`, 19, room, 13), C.muted);
  T(c, s2, sx, y + 138, fit(c, s2, `600 #px ${SANS}`, 19, room, 13), C.soft);
  // накопленный результат по дням периода
  y += st ? 260 : 190;
  const ch = st ? 200 : 90, pts = [0]; let cum = 0; for (const x of d.days) { cum += x.pnl; pts.push(cum); }
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), px = (i: number) => L + (i * (R - L)) / (pts.length - 1), py = (v: number) => y + ((hi - v) * ch) / (hi - lo || 1);
  c.setLineDash([5, 6]); c.strokeStyle = C.line2; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, py(0)); c.lineTo(R, py(0)); c.stroke(); c.setLineDash([]);
  g = c.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, cum >= 0 ? "rgba(47,208,122,.20)" : "rgba(232,181,74,0)"); g.addColorStop(1, cum >= 0 ? "rgba(47,208,122,0)" : "rgba(240,86,90,.22)");
  c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)))); c.lineTo(R, py(0)); c.lineTo(L, py(0)); c.closePath(); c.fillStyle = g; c.fill();
  c.beginPath(); pts.forEach((v, i) => (i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)))); c.strokeStyle = C.gold; c.lineWidth = 4; c.lineJoin = "round"; c.stroke();
  pts.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), i === pts.length - 1 ? 9 : 6, 0, 7); c.fillStyle = i === pts.length - 1 ? C.gold2 : C.bg; c.fill(); c.strokeStyle = C.gold; c.lineWidth = 3; c.stroke(); });
  T(c, "0%", R, py(0) - 10, `500 17px ${MONO}`, C.muted, "right");
  // карточки дней
  y += ch + (st ? 90 : 44);
  const n = d.days.length, gap = n > 5 ? 10 : 14, cw = (R - L - gap * (n - 1)) / n, cardH = st ? 620 : 420;
  d.days.forEach((x, i) => {
    const cx0 = L + i * (cw + gap), up = x.pnl >= 0;
    rr(c, cx0, y, cw, cardH, 18); c.fillStyle = up ? "rgba(47,208,122,.10)" : "rgba(240,86,90,.10)"; c.fill();
    c.strokeStyle = up ? "rgba(47,208,122,.45)" : "rgba(240,86,90,.45)"; c.lineWidth = 2; c.stroke();
    const cx = cx0 + cw / 2; let yy = y + 44;
    T(c, x.dow, cx, yy, `800 26px ${SANS}`, C.fg, "center"); yy += 30;
    T(c, x.date, cx, yy, `500 19px ${MONO}`, C.muted, "center"); yy += st ? 110 : 62;
    T(c, pc(x.pct), cx, yy, fit(c, pc(x.pct), `700 #px ${MONO}`, 40, cw - 34, 20), col(x.pct), "center"); yy += 38;
    T(c, usd(x.pnl), cx, yy, fit(c, usd(x.pnl), `700 #px ${MONO}`, 24, cw - 24, 14), C.soft, "center"); yy += st ? 100 : 50;
    c.font = `700 24px ${MONO}`; const a = String(x.plus), sl = " / ", b = String(x.minus);
    const wa = c.measureText(a).width, ws = c.measureText(sl).width, wb = c.measureText(b).width, s0 = cx - (wa + ws + wb) / 2;
    T(c, a, s0, yy, `700 24px ${MONO}`, C.green); T(c, sl, s0 + wa, yy, `700 24px ${MONO}`, C.fg); T(c, b, s0 + wa + ws, yy, `700 24px ${MONO}`, C.red); yy += 26;
    T(c, "плюс / минус", cx, yy, fit(c, "плюс / минус", `600 #px ${SANS}`, 15, cw - 12, 11), C.muted, "center"); yy += st ? 70 : 34;
    T(c, `${x.trades} сд.`, cx, yy, `500 17px ${MONO}`, C.soft, "center"); yy += st ? 90 : 52;
    if (x.best) {
      T(c, "лучший", cx, yy, `600 15px ${SANS}`, C.muted, "center"); yy += 28;
      T(c, x.best, cx, yy, fit(c, x.best, `700 #px ${MONO}`, 18, cw - 16, 11), C.fg, "center"); yy += 26;
      T(c, pc(x.bestPct || 0), cx, yy, `700 18px ${MONO}`, C.green, "center");
    }
  });
  // итоги и зоны
  y += cardH + (st ? 90 : 40);
  const tw = (R - L - 32) / 3, th = 112;
  const tiles: [string, string, string][] = [["Сделок", String(d.trades), `${d.tradingDays} торг. дн.`], ["Плюс / минус", "", "трейдеров за период"], ["Счетов", String(d.accounts), `Failed · ${d.failed}`]];
  tiles.forEach(([k, v, f], i) => {
    const x = L + i * (tw + 16); rr(c, x, y, tw, th, 16); c.fillStyle = C.card; c.fill(); c.strokeStyle = C.line2; c.lineWidth = 1.5; c.stroke();
    T(c, k, x + 22, y + 36, `700 19px ${SANS}`, C.gold);
    if (!v) { const wa = T(c, String(d.plus), x + 22, y + 80, `700 36px ${MONO}`, C.green); const ws = T(c, " / ", x + 22 + wa, y + 80, `700 36px ${MONO}`, C.fg); T(c, String(d.minus), x + 22 + wa + ws, y + 80, `700 36px ${MONO}`, C.red); }
    else T(c, v, x + 22, y + 80, `700 36px ${MONO}`, C.fg);
    T(c, f, x + 22, y + 102, `600 16px ${SANS}`, C.muted);
  });
  y += th + 34;
  const Z = d.zones, zt = Z.green + Z.work + Z.yellow + Z.red || 1;
  let zx = L; for (const [v, cc] of [[Z.green, C.green], [Z.work, C.dim], [Z.yellow, C.amber], [Z.red, C.red]] as [number, string][]) { if (!v) continue; const w = ((R - L) * v) / zt; rr(c, zx, y, Math.max(6, w - 4), 12, 6); c.fillStyle = cc; c.fill(); zx += w; }
  y += 44;
  const segW = (R - L) / 4;
  ([["Цель близко", Z.green, C.green], ["В работе", Z.work, C.dim], ["Предупреждение", Z.yellow, C.amber], ["Буксир", Z.red, C.red]] as [string, number, string][]).forEach(([l, v, cc], i) => {
    const x = L + i * segW; c.beginPath(); c.arc(x + 8, y - 7, 7, 0, 7); c.fillStyle = cc; c.fill();
    const w = T(c, String(v), x + 24, y, `700 24px ${MONO}`, C.fg); T(c, l, x + 32 + w, y, fit(c, l, `600 #px ${SANS}`, 19, segW - 44 - w, 13), C.soft);
  });
  if (d.best) {
    y += 40; c.strokeStyle = C.line; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); y += 46;
    const w1 = T(c, "Лучший результат: ", L, y, `600 19px ${SANS}`, C.muted); T(c, d.best, L + w1, y, fit(c, d.best, `700 #px ${MONO}`, 20, R - L - w1, 13), C.green);
  }
  return cv;
}

export default function WeekCollage({ data }: { data: CollageData }) {
  const [fmt, setFmt] = useState<Fmt>("post"), [url, setUrl] = useState<string | null>(null), [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  async function build(f: Fmt) {
    setBusy(true); setMsg("");
    try {
      const cv = await drawCollage(data, f), b = await new Promise<Blob | null>(r => cv.toBlob(r, "image/png"));
      if (!b) throw new Error();
      if (url) URL.revokeObjectURL(url);
      setFmt(f); setBlob(b); setUrl(URL.createObjectURL(b));
    } catch { setMsg("Не удалось собрать коллаж. Обновите страницу и попробуйте ещё раз."); }
    setBusy(false);
  }
  function close() { if (url) URL.revokeObjectURL(url); setUrl(null); setBlob(null); setMsg(""); }
  async function copy() {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]); setMsg("Коллаж скопирован — вставьте его в чат"); }
    catch { setMsg("Браузер не разрешил копирование. Нажмите «Скачать PNG»."); }
  }
  return (
    <>
      <button className="btn ghost" type="button" onClick={() => build(fmt)} disabled={busy}>{busy && !url ? "Собираю…" : "Коллаж недели"}</button>
      {msg && !url && <span className="err">{msg}</span>}
      {url && (
        <div role="dialog" aria-modal="true" aria-label="Коллаж недели" onClick={e => e.target === e.currentTarget && close()}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.72)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" }}>
          <div className="panel" style={{ width: "min(520px, 100%)", display: "grid", gap: 14 }}>
            <div className="ph" style={{ margin: 0 }}><h2>Коллаж недели</h2><button type="button" className="signout" style={{ margin: 0 }} onClick={close}>Закрыть</button></div>
            <span className="tfs" role="group" aria-label="Формат" style={{ justifySelf: "start" }}>
              {([["post", "Пост 1080×1350"], ["story", "Сторис 1080×1920"]] as [Fmt, string][]).map(([f, l]) => <button key={f} type="button" aria-pressed={fmt === f} disabled={busy} onClick={() => build(f)}>{l}</button>)}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Коллаж недели" style={{ width: "100%", maxHeight: "62vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <a className="btn" href={url} download={`${data.file}-${fmt}.png`}>Скачать PNG</a>
              <button className="btn ghost" type="button" onClick={copy}>Скопировать</button>
              {msg && <span className="fine">{msg}</span>}
            </div>
            <p className="fine" style={{ margin: 0 }}>Пост — для ленты Telegram и Instagram, сторис — для историй. Карточка на каждый торговый день периода.</p>
          </div>
        </div>)}
    </>
  );
}
