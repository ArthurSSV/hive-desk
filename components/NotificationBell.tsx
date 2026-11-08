"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type N = { id: number; kind: string; text: string; link: string | null; created_at: string; read_at: string | null };
const ICON: Record<string, string> = { signup: "👤", connect: "🔗", remove: "🗑", passed: "🏆", failed: "⛔" };
const TONE: Record<string, string> = { signup: "var(--gold)", connect: "var(--gold)", remove: "var(--red)", passed: "var(--green)", failed: "var(--red)" };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "только что"; if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Kiev" });
};

/** Колокольчик админа: список событий и всплывающие уведомления о новых. */
export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<N[]>([]), [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false), [toasts, setToasts] = useState<N[]>([]);
  const seen = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" }); if (!r.ok) return;
      const j: { items: N[]; unread: number } = await r.json();
      setItems(j.items); setUnread(j.unread);
      const top = j.items[0]?.id ?? 0;
      let last = seen.current;
      if (last === null) { try { last = Number(localStorage.getItem("mt-notif-seen")) || top; } catch { last = top; } }
      const fresh = j.items.filter(n => n.id > (last as number) && !n.read_at).reverse();
      if (fresh.length) {
        setToasts(t => [...t, ...fresh].slice(-4));
        fresh.forEach(n => setTimeout(() => setToasts(t => t.filter(x => x.id !== n.id)), 10000));
      }
      seen.current = Math.max(last as number, top);
      try { localStorage.setItem("mt-notif-seen", String(seen.current)); } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);

  async function go(n: N) {
    setOpen(false); setToasts(t => t.filter(x => x.id !== n.id));
    if (!n.read_at) { setUnread(u => Math.max(0, u - 1)); setItems(l => l.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))); fetch("/api/notifications", { method: "POST", body: JSON.stringify({ ids: [n.id] }) }).catch(() => {}); }
    if (n.link) router.push(n.link);
  }
  async function readAll() {
    setUnread(0); setItems(l => l.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    await fetch("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) }).catch(() => {});
  }

  return (
    <>
      <div style={{ position: "relative" }}>
        <button type="button" className="bell" onClick={() => setOpen(v => !v)} aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`} aria-expanded={open}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
        {open && (
          <div className="notif-pop" role="dialog" aria-label="Уведомления">
            <div className="ph" style={{ margin: 0, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <h2 style={{ fontSize: 15 }}>Уведомления</h2>
              {unread > 0 && <button type="button" className="signout" style={{ margin: 0, padding: "3px 8px" }} onClick={readAll}>Прочитать все</button>}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {items.map(n => (
                <button key={n.id} type="button" className={`notif${n.read_at ? "" : " new"}`} onClick={() => go(n)}>
                  <span className="ni" style={{ borderColor: TONE[n.kind] || "var(--gold)" }}>{ICON[n.kind] || "•"}</span>
                  <span style={{ minWidth: 0 }}><span className="nt">{n.text}</span><span className="fine">{ago(n.created_at)}</span></span>
                </button>))}
              {!items.length && <p className="fine" style={{ padding: 14, margin: 0 }}>Событий пока нет. Здесь появятся регистрации, подключения счетов и запросы на удаление.</p>}
            </div>
          </div>)}
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map(n => (
          <div key={n.id} className="toast" style={{ borderLeftColor: TONE[n.kind] || "var(--gold)" }}>
            <button type="button" className="toast-body" onClick={() => go(n)}>
              <span style={{ fontSize: 18 }}>{ICON[n.kind] || "•"}</span>
              <span style={{ minWidth: 0 }}><span className="nt">{n.text}</span><span className="fine">Нажмите, чтобы открыть</span></span>
            </button>
            <button type="button" className="toast-x" aria-label="Закрыть" onClick={() => setToasts(t => t.filter(x => x.id !== n.id))}>×</button>
          </div>))}
      </div>
    </>
  );
}
