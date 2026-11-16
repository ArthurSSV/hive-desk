"use client";
// Загрузка PDF для трейдеров: файл уходит из браузера прямо в закрытое хранилище Supabase
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { guideUploadUrl, guideSaveFile } from "@/app/actions";

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " МБ";

export default function GuideUpload({ url, anon, bucket, current }: { url: string; anon: string; bucket: string; current: { name: string | null; size: number | null; at: string | null } }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const router = useRouter();
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const r = await guideUploadUrl(f.name, f.size);
      if ("error" in r) throw new Error(r.error);
      const { error } = await createClient(url, anon, { auth: { persistSession: false } }).storage.from(bucket).uploadToSignedUrl(r.path, r.token, f, { contentType: "application/pdf" });
      if (error) throw new Error(error.message);
      const s = await guideSaveFile(r.path, f.name, f.size);
      if ("error" in s) throw new Error(String(s.error));
      setMsg({ ok: true, t: "Файл загружен. Трейдеры уже видят новую версию." });
      router.refresh();
    } catch (e: any) { setMsg({ ok: false, t: e.message || "Не удалось загрузить" }); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="gfile">
        <span className="gpdf" aria-hidden="true">PDF</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {current.name ? <><b style={{ overflowWrap: "anywhere" }}>{current.name}</b><div className="fine">{current.size ? mb(current.size) : ""}{current.at ? ` · загружен ${new Date(current.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</div></>
            : <><b>Файл не загружен</b><div className="fine">Пока файла нет, кнопка в шапке не показывается.</div></>}
        </div>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files?.[0])} />
        <button type="button" className="btn ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Загружаю…" : current.name ? "Заменить" : "Загрузить PDF"}</button>
      </div>
      {msg && <div className={`fine ${msg.ok ? "pos" : "neg"}`}>{msg.t}</div>}
    </div>
  );
}
