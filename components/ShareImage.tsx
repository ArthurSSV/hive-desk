"use client";
// Картинка-сводка 1080×1080 для публикации: рисуется на canvas в браузере, без сервера.
import { useState } from "react";

export type CardData = {
  file: string;                    // имя файла без .png
  caption: string;                 // «Сводка группы» / «Сводка за неделю»
  heroLabel?: string;              // «ИТОГ ГРУППЫ» / «ИТОГ КОМАНДЫ»
  date: string;                    // «06.11.2026» / «02.11–08.11.2026»
  heroPct: number; heroUsd: number; capital: number;
  curve: { day: string; v: number }[];
  tiles: { k: string; v: string; f: string; tone?: "pos" | "neg" | "" ; parts?: { t: string; tone: "pos" | "neg" | "" }[] }[];
  zones: { green: number; work: number; yellow: number; red: number };
  best: string | null;             // «Arthur S2 +0.31%»
  phases: { p2: number; funded: number; failed: number };
};

const C = { bg: "#050505", card: "#0C0B09", line: "#2A251B", line2: "#3B3324", fg: "#F3EEE3", muted: "#8E8778", soft: "#CFC8B8", gold: "#E8B54A", gold2: "#F7D27C", dim: "#8A6A28", green: "#2FD07A", red: "#F0565A", amber: "#F0A93A" };
const SANS = '"Manrope", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const LOGO = ["M12 1.5c3.3 0 5.6 2.6 5.6 5.7 0 1.3-.4 2.4-1 3.4 2.6 1.6 4.4 4.6 4.4 8.3 0 5-4 7.6-9 7.6s-9-2.6-9-7.6c0-3.7 1.8-6.7 4.4-8.3-.6-1-1-2.1-1-3.4 0-3.1 2.3-5.7 5.6-5.7z", "M7.6 18.6c1.2 1.6 2.8 2.4 4.4 2.4s3.2-.8 4.4-2.4"];
const sg = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%";
const usd = (v: number, signed = true) => (signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US");

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", spacing = 0) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align;
  try { (ctx as any).letterSpacing = spacing + "px"; } catch {}
  ctx.fillText(s, x, y);
  try { (ctx as any).letterSpacing = "0px"; } catch {}
  return ctx.measureText(s).width;
}

export async function drawCard(d: CardData): Promise<HTMLCanvasElement> {
  await Promise.all([`800 28px ${SANS}`, `700 20px ${SANS}`, `600 18px ${SANS}`, `700 40px ${MONO}`, `500 18px ${MONO}`].map(f => document.fonts.load(f, "Сводка 0123+−%$")));
  const W = 1080, cv = document.createElement("canvas"); cv.width = W; cv.height = W;
  const ctx = cv.getContext("2d")!; ctx.textBaseline = "alphabetic";

  // фон и золотая рамка
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, W);
  const g1 = ctx.createRadialGradient(160, -60, 0, 160, -60, 720); g1.addColorStop(0, "rgba(232,181,74,.24)"); g1.addColorStop(1, "rgba(232,181,74,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, W);
  const g2 = ctx.createRadialGradient(W, W + 100, 0, W, W + 100, 640); g2.addColorStop(0, "rgba(232,140,40,.13)"); g2.addColorStop(1, "rgba(232,140,40,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, W);
  const gb = ctx.createLinearGradient(28, 28, W - 28, W - 28);
  gb.addColorStop(0, "rgba(232,181,74,.75)"); gb.addColorStop(.35, "rgba(232,181,74,.08)"); gb.addColorStop(.65, "rgba(232,181,74,.08)"); gb.addColorStop(1, "rgba(232,181,74,.6)");
  rr(ctx, 29, 29, W - 58, W - 58, 28); ctx.strokeStyle = gb; ctx.lineWidth = 2; ctx.stroke();

  // шапка
  ctx.save(); ctx.translate(80, 74); ctx.scale(44 / 24, 44 / 24); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6; ctx.lineCap = "round";
  ctx.stroke(new Path2D(LOGO[0])); ctx.stroke(new Path2D(LOGO[1])); ctx.beginPath(); ctx.arc(12, 7.4, 2.6, 0, Math.PI * 2); ctx.fillStyle = C.gold; ctx.fill(); ctx.restore();
  txt(ctx, "МАТРЁШКА — ЧЕЛЛЕНДЖ", 140, 111, `800 28px ${SANS}`, C.fg, "left", 2.2);
  let cs = 22; ctx.font = `700 ${cs}px ${SANS}`; while (ctx.measureText(d.caption).width > 380 && cs > 15) { cs--; ctx.font = `700 ${cs}px ${SANS}`; }
  txt(ctx, d.caption, W - 80, 88, `700 ${cs}px ${SANS}`, C.muted, "right");
  txt(ctx, d.date, W - 80, 126, `700 30px ${MONO}`, C.gold2, "right");

  // главный показатель
  txt(ctx, (d.heroLabel || "Итог группы").toUpperCase(), 80, 214, `800 22px ${SANS}`, C.gold, "left", 3);
  const heroCol = d.heroPct > 0 ? C.green : d.heroPct < 0 ? C.red : C.fg;
  let fs = 150; ctx.font = `700 ${fs}px ${MONO}`;
  while (ctx.measureText(sg(d.heroPct)).width > 560 && fs > 90) { fs -= 6; ctx.font = `700 ${fs}px ${MONO}`; }
  const hw = txt(ctx, sg(d.heroPct), 76, 360, `700 ${fs}px ${MONO}`, heroCol, "left", -3);
  txt(ctx, usd(d.heroUsd), 76 + hw + 24, 358, `700 44px ${MONO}`, C.fg);
  txt(ctx, `от капитала ${usd(d.capital, false)}`, 76 + hw + 24, 398, `600 20px ${SANS}`, C.muted);

  // кривая группы
  const cx0 = 90, cx1 = 990, cy0 = 452, cy1 = 642, pts = d.curve;
  if (pts.length > 1) {
    const vals = pts.map(p => p.v); let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const pad = Math.max((hi - lo) * 0.12, 0.05); lo -= pad; hi += pad;
    const X = (i: number) => cx0 + (i * (cx1 - cx0)) / (pts.length - 1), Y = (v: number) => cy0 + ((hi - v) * (cy1 - cy0)) / (hi - lo);
    ctx.setLineDash([4, 6]); ctx.strokeStyle = C.line2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx0, Y(0)); ctx.lineTo(cx1, Y(0)); ctx.stroke(); ctx.setLineDash([]);
    txt(ctx, "0%", cx1, Y(0) - 8, `500 18px ${MONO}`, C.muted, "right");
    const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.v)) : ctx.moveTo(X(i), Y(p.v)))); };
    path(); ctx.lineTo(X(pts.length - 1), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
    const ga = ctx.createLinearGradient(0, cy0, 0, cy1); ga.addColorStop(0, "rgba(232,181,74,.35)"); ga.addColorStop(1, "rgba(232,181,74,0)"); ctx.fillStyle = ga; ctx.fill();
    path(); ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    const L = pts.length - 1; ctx.beginPath(); ctx.arc(X(L), Y(pts[L].v), 9, 0, Math.PI * 2); ctx.fillStyle = C.gold2; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.card; ctx.stroke();
    const idx = [...new Set([0, Math.round(L / 3), Math.round((2 * L) / 3), L])];
    idx.forEach(i => txt(ctx, pts[i].day, X(i), 676, `500 18px ${MONO}`, C.muted, i === 0 ? "left" : i === L ? "right" : "center"));
  }

  // плитки
  const tw = (920 - 3 * 16) / 4;
  d.tiles.slice(0, 4).forEach((t, i) => {
    const x = 80 + i * (tw + 16), y = 704;
    rr(ctx, x, y, tw, 146, 18); ctx.fillStyle = C.card; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
    txt(ctx, t.k, x + 22, y + 40, `800 18px ${SANS}`, C.gold);
    if (t.parts) { let px = x + 22; t.parts.forEach(p => { px += txt(ctx, p.t, px, y + 90, `700 38px ${MONO}`, p.tone === "pos" ? C.green : p.tone === "neg" ? C.red : C.fg); }); }
    else txt(ctx, t.v, x + 22, y + 90, `700 38px ${MONO}`, t.tone === "pos" ? C.green : t.tone === "neg" ? C.red : C.fg);
    txt(ctx, t.f, x + 22, y + 122, `600 17px ${SANS}`, C.muted);
  });

  // зоны
  const Z: [keyof CardData["zones"], string, string][] = [["green", "Цель близко", C.green], ["work", "В работе", C.dim], ["yellow", "Предупреждение", C.amber], ["red", "Буксир", C.red]];
  const tot = Z.reduce((a, [k]) => a + d.zones[k], 0);
  rr(ctx, 80, 876, 920, 14, 7); ctx.fillStyle = "#1B1914"; ctx.fill();
  if (tot) { ctx.save(); rr(ctx, 80, 876, 920, 14, 7); ctx.clip(); let zx = 80; Z.forEach(([k, , c]) => { const w = (d.zones[k] / tot) * 920; if (w) { ctx.fillStyle = c; ctx.fillRect(zx, 876, w - (zx + w < 999 ? 3 : 0), 14); zx += w; } }); ctx.restore(); }
  const lw = 920 / 4;
  Z.forEach(([k, label, c], i) => {
    const align: CanvasTextAlign = i === 0 ? "left" : i === 3 ? "right" : "center";
    ctx.font = `700 24px ${MONO}`; const nw = ctx.measureText(String(d.zones[k])).width; ctx.font = `600 19px ${SANS}`; const lbw = ctx.measureText(label).width;
    const full = 14 + 10 + nw + 10 + lbw;
    const sx = align === "left" ? 80 : align === "right" ? 1000 - full : 80 + i * lw + (lw - full) / 2 + (i === 1 ? -20 : 20);
    ctx.beginPath(); ctx.arc(sx + 7, 921, 7, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    txt(ctx, String(d.zones[k]), sx + 24, 929, `700 24px ${MONO}`, "#FFFFFF");
    txt(ctx, label, sx + 24 + nw + 10, 928, `600 19px ${SANS}`, C.soft);
  });

  // подвал
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(80, 974); ctx.lineTo(1000, 974); ctx.stroke();
  if (d.best) { const w = txt(ctx, "Лучший результат: ", 80, 1020, `600 19px ${SANS}`, C.muted); txt(ctx, d.best, 80 + w, 1020, `700 19px ${MONO}`, C.green); }
  const tail = [["Фаза 2", d.phases.p2], ["Funded", d.phases.funded], ["Failed", d.phases.failed]] as const;
  let fx = 1000;
  [...tail].reverse().forEach(([l, n], i) => {
    fx -= txt(ctx, String(n), fx, 1020, `700 19px ${SANS}`, C.fg, "right") + 8;
    fx -= txt(ctx, l + " ·", fx, 1020, `600 19px ${SANS}`, C.muted, "right") + (i < 2 ? 22 : 0);
  });
  return cv;
}

export default function ShareImage({ data }: { data: CardData }) {
  const [url, setUrl] = useState<string | null>(null), [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  async function open() {
    setBusy(true); setMsg("");
    try {
      const cv = await drawCard(data);
      const b = await new Promise<Blob | null>(r => cv.toBlob(r, "image/png"));
      if (!b) throw new Error();
      setBlob(b); setUrl(URL.createObjectURL(b));
    } catch { setMsg("Не удалось собрать картинку. Обновите страницу и попробуйте ещё раз."); }
    setBusy(false);
  }
  function close() { if (url) URL.revokeObjectURL(url); setUrl(null); setBlob(null); setMsg(""); }
  async function copy() {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]); setMsg("Картинка скопирована — вставьте её в чат"); }
    catch { setMsg("Браузер не разрешил копирование. Нажмите «Скачать PNG»."); }
  }
  return (
    <>
      <button className="btn ghost" type="button" onClick={open} disabled={busy}>{busy ? "Собираю…" : "Картинка для публикации"}</button>
      {msg && !url && <span className="err">{msg}</span>}
      {url && (
        <div role="dialog" aria-modal="true" aria-label="Картинка для публикации" onClick={e => e.target === e.currentTarget && close()}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.72)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="panel" style={{ width: "min(560px, 100%)", display: "grid", gap: 14 }}>
            <div className="ph" style={{ margin: 0 }}><h2>Картинка для публикации</h2><button type="button" className="signout" style={{ margin: 0 }} onClick={close}>Закрыть</button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Сводка группы" style={{ width: "100%", borderRadius: 10, display: "block" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <a className="btn" href={url} download={`${data.file}.png`}>Скачать PNG</a>
              <button className="btn ghost" type="button" onClick={copy}>Скопировать картинку</button>
              {msg && <span className="fine">{msg}</span>}
            </div>
            <p className="fine" style={{ margin: 0 }}>1080×1080 — подходит для Telegram и Instagram.</p>
          </div>
        </div>)}
    </>
  );
}
