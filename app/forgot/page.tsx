"use client";
import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, anonKey } from "@/lib/env";

export default function Forgot() {
  const [err, setErr] = useState(""), [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr("");
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Укажите email, с которым вы регистрировались.");
    setBusy(true);
    const { error } = await createBrowserClient(supabaseUrl(), anonKey()).auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/confirm?next=/reset` });
    setBusy(false);
    if (error && /rate|too many|security purposes/i.test(error.message)) return setErr("Письмо уже отправлено недавно. Подождите минуту и попробуйте снова.");
    setSent(true); // одинаковый ответ, даже если такого email нет
  }
  return (
    <div className="auth">
      <div><h1>Восстановление пароля</h1><p className="sub">Укажите email — пришлём ссылку для нового пароля.</p></div>
      {sent ? (
        <div className="panel"><div className="notice">Если этот email зарегистрирован, письмо уже в пути. Откройте ссылку из письма — она действует 1 час. Не видите письмо — проверьте «Спам».</div></div>
      ) : (
        <form className="panel" onSubmit={submit} style={{ display: "grid", gap: 14 }} noValidate>
          <label className="field" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required /></label>
          <div className="err" role="alert">{err}</div>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Отправляем…" : "Отправить ссылку"}</button>
        </form>
      )}
      <p className="fine" style={{ textAlign: "center" }}><Link href="/login">← Вернуться ко входу</Link></p>
    </div>
  );
}
