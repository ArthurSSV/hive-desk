"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Opt = { key: string; label: string };

/** Выбор участников сводки: вся группа, команда или ручная выборка. */
export default function ScopePicker({ options, current, people, teams, pick, base }: {
  options: Opt[]; current: string; people: { id: string; name: string; team: number | null }[];
  teams: { id: number; name: string }[]; pick: string[]; base: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(pick));
  const go = (scope: string, ids?: string[]) => router.push(`${base}&scope=${scope}${ids ? ids.map(i => `&u=${i}`).join("") : ""}`);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const groups = [...teams.map(t => ({ name: t.name, list: people.filter(p => p.team === t.id) })), { name: teams.length ? "Без команды" : "Трейдеры", list: people.filter(p => !p.team || !teams.some(t => t.id === p.team)) }].filter(g => g.list.length);
  return (
    <div style={{ position: "relative", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span className="fine" style={{ marginRight: 2 }}>Участники:</span>
      {options.map(o => <button key={o.key} type="button" className={`chip${current === o.key ? " on" : ""}`} onClick={() => go(o.key)}>{o.label}</button>)}
      <button type="button" className={`chip${current === "pick" ? " on" : ""}`} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {current === "pick" ? `Выборка · ${pick.length}` : "Выбрать вручную…"}
      </button>
      {open && (
        <div className="panel" role="dialog" aria-label="Выбор трейдеров" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 20, width: "min(420px, calc(100vw - 32px))", display: "grid", gap: 12, boxShadow: "0 18px 50px var(--shadow)" }}>
          <div className="ph" style={{ margin: 0 }}><h2>Выберите трейдеров</h2><span className="fine">{sel.size} выбрано</span></div>
          <div style={{ maxHeight: 340, overflowY: "auto", display: "grid", gap: 12 }}>
            {groups.map(g => (
              <div key={g.name} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: "var(--gold)", fontSize: 13 }}>{g.name}</b>
                  <button type="button" className="signout" style={{ margin: 0, padding: "2px 8px" }}
                    onClick={() => setSel(s => { const n = new Set(s); const all = g.list.every(p => n.has(p.id)); g.list.forEach(p => (all ? n.delete(p.id) : n.add(p.id))); return n; })}>
                    {g.list.every(p => sel.has(p.id)) ? "Снять всех" : "Выбрать всех"}</button>
                </div>
                {g.list.map(p => (
                  <label key={p.id} htmlFor={`pk-${p.id}`} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <input id={`pk-${p.id}`} type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: "var(--gold)" }} />{p.name || "Без имени"}
                  </label>))}
              </div>))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" disabled={!sel.size} onClick={() => { setOpen(false); go("pick", [...sel]); }}>Показать</button>
            <button className="btn ghost" type="button" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>)}
    </div>
  );
}
