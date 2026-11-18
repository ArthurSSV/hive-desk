"use client";
// Кнопка синхронизации: запускает задачу в GitHub Actions и через минуту сама обновляет страницу
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Res = "queued" | "done" | "wait";

export default function SyncButton({ action, user, label = "Обновить" }: { action: (fd: FormData) => Promise<Res>; user?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(0), [note, setNote] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => { if (left === 1) { router.refresh(); setNote("Готово — данные обновлены"); } setLeft(left - 1); }, 1000);
    return () => clearTimeout(t);
  }, [left, router]);
  const run = () => start(async () => {
    const fd = new FormData(); if (user) fd.set("user", user);
    const r = await action(fd);
    if (r === "queued") { setNote(""); setLeft(75); }
    else if (r === "wait") setNote("Только что обновлялось — попробуйте через минуту");
    else { router.refresh(); setNote("Готово"); }
  });
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn ghost" type="button" onClick={run} disabled={pending || left > 0}>
        {pending ? "Запускаю…" : left > 0 ? `Обновляется… ${left} с` : label}
      </button>
      {note && left <= 0 && <span className="fine">{note}</span>}
    </span>
  );
}
