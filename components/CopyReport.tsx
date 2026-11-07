"use client";
import { useState } from "react";

/** Кнопка «Скопировать отчёт» — текст для Telegram-чата группы. */
export default function CopyReport({ text, label = "Скопировать отчёт", ghost = false }: { text: string; label?: string; ghost?: boolean }) {
  const [state, setState] = useState<"" | "ok" | "manual">("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("ok"); setTimeout(() => setState(""), 2000); }
    catch { setState("manual"); }
  }
  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
      <button className={ghost ? "btn ghost" : "btn"} type="button" onClick={copy}>{state === "ok" ? "Скопировано" : label}</button>
      {state === "manual" && <textarea readOnly value={text} rows={10} style={{ width: "min(420px, 90vw)" }} onFocus={e => e.currentTarget.select()} autoFocus />}
    </div>
  );
}
