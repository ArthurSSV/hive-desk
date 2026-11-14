"use client";
// Свой период для сводки: от какого числа до какого. Открывается кнопкой «Период…».
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const dd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const add = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export default function RangePicker({ from, to, min, max, active, base }: { from: string; to: string; min: string; max: string; active: boolean; base: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [a, setA] = useState(from), [b, setB] = useState(to), [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setA(from); setB(to); }, [from, to]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = (x: string, y: string) => {
    if (!x || !y) return setErr("Укажите обе даты");
    if (x > y) [x, y] = [y, x];
    setErr(""); setOpen(false);
    router.push(`${base}&period=range&from=${x}&to=${y}`);
  };
  // Быстрые варианты от последнего торгового дня
  const quick: [string, string, string][] = [
    ["7 дней", add(max, -6), max], ["14 дней", add(max, -13), max], ["30 дней", add(max, -29), max],
    ["С начала месяца", max.slice(0, 8) + "01", max],
  ];
  return (
    <div className="rp" ref={box}>
      <button type="button" className={`btn ghost${active ? " on" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(o => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        {active ? `${dd(from)}–${dd(to)}` : "Период…"}
      </button>
      {open && (
        <div className="rp-pop" role="dialog" aria-label="Свой период">
          <div className="rp-row">
            <label>С<input type="date" value={a} min={min} max={max} onChange={e => setA(e.target.value)} /></label>
            <label>По<input type="date" value={b} min={min} max={max} onChange={e => setB(e.target.value)} /></label>
          </div>
          <div className="rp-quick">{quick.map(([l, x, y]) => <button key={l} type="button" onClick={() => go(x < min ? min : x, y)}>{l}</button>)}</div>
          {err && <div className="err" role="alert">{err}</div>}
          <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn" onClick={() => go(a, b)}>Показать</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Отмена</button></div>
          <p className="fine" style={{ margin: 0 }}>Данные есть с {dd(min)}.{min.slice(0, 4)} по {dd(max)}.{max.slice(0, 4)}. Считаются торговые дни внутри периода.</p>
        </div>)}
    </div>
  );
}
