"use client";

/** Кнопка в шапке: тёмная ↔ светлая тема. Выбор хранится в cookie, чтобы сервер сразу отдавал нужную тему. */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement, next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button className="themebtn" type="button" onClick={toggle} aria-label="Сменить тему: тёмная или светлая" title="Сменить тему">
      <svg className="moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      <svg className="sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400" /></svg>
    </button>
  );
}
