"use client";
// Выгрузка страницы в PDF через печать браузера: светлый лист для печати или тёмный, как на сайте.
import { useEffect, useRef, useState } from "react";

export default function PrintPdf({ label = "PDF" }: { label?: string }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  function go(mode: "light" | "dark") {
    setOpen(false);
    const root = document.documentElement, theme = root.dataset.theme;
    const stamp = document.getElementById("printstamp");
    if (stamp) stamp.textContent = "выгружено " + new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    root.dataset.print = mode;
    if (mode === "dark") root.dataset.theme = "dark";
    const done = () => { delete root.dataset.print; if (theme) root.dataset.theme = theme; else delete root.dataset.theme; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    // Даём браузеру перерисовать страницу в цветах печати
    setTimeout(() => window.print(), 50);
  }
  return (
    <div ref={box} style={{ position: "relative" }} className="noprint">
      <button className="btn ghost" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && (
        <div role="menu" className="pmenu">
          <button role="menuitem" type="button" onClick={() => go("light")}><b>Светлый</b><span>для печати и чтения</span></button>
          <button role="menuitem" type="button" onClick={() => go("dark")}><b>Тёмный</b><span>как на сайте</span></button>
          <p className="fine">Откроется окно печати — выберите «Сохранить как PDF».</p>
        </div>)}
    </div>
  );
}
