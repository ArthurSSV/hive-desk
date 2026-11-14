"use client";
// Вкладки кабинета трейдера. Все панели отрисованы сервером, вкладка только скрывает лишние —
// так формы и таблицы не теряют состояние при переключении.
import { useEffect, useState } from "react";

export type Tab = { id: string; label: string; count?: number; dot?: boolean; dotTitle?: string; node: React.ReactNode };

/** Открыть вкладку из любого места страницы (календарь, «Все сделки»). */
export const openTab = (id: string) => window.dispatchEvent(new CustomEvent("cab:tab", { detail: id }));
/** Показать на вкладке «Сделки» только сделки одного торгового дня (null — снять фильтр). */
export const openDay = (day: string | null) => { window.dispatchEvent(new CustomEvent("cab:day", { detail: day })); openTab("deals"); };

export default function CabinetTabs({ tabs, initial, force }: { tabs: Tab[]; initial: string; force?: boolean }) {
  const [cur, setCur] = useState(initial);
  const pick = (id: string, scroll = false) => { setCur(id); try { localStorage.setItem("cab-tab", id); } catch { /* без памяти */ } if (scroll) document.getElementById("cabtabs")?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  useEffect(() => {
    // Запоминаем последнюю вкладку, если сервер не просил открыть конкретную (например, после сохранения дневника)
    if (!force) { try { const v = localStorage.getItem("cab-tab"); if (v && tabs.some(t => t.id === v)) setCur(v); } catch { /* без памяти */ } }
    const on = (e: Event) => { const id = (e as CustomEvent).detail; if (tabs.some(t => t.id === id)) pick(id, true); };
    addEventListener("cab:tab", on); return () => removeEventListener("cab:tab", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="ctabs" id="cabtabs" role="tablist" aria-label="Разделы кабинета">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={cur === t.id} aria-controls={`panel-${t.id}`} onClick={() => pick(t.id)}>
            {t.label}{t.count != null && <span className="cnt">{t.count}</span>}{t.dot && <span className="need" title={t.dotTitle} />}
          </button>))}
      </div>
      {tabs.map(t => <div key={t.id} className="cpanel" role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={cur !== t.id}>{t.node}</div>)}
    </>
  );
}

/** Ссылка-кнопка, открывающая вкладку. */
export function TabLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <button type="button" className="linkbtn" onClick={() => (to === "deals" ? openDay(null) : openTab(to))}>{children}</button>;
}
