"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, anonKey } from "@/lib/env";

export default function Reset() {
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr("");
    const f = new FormData(e.currentTarget), p = String(f.get("password")), p2 = String(f.get("password2"));
    if (p.length < 8) return setErr("Пароль должен быть не короче 8 символов.");
    if (p !== p2) return setErr("Пароли не совпадают.");
    setBusy(true);
    const { error } = await createBrowserClient(supabaseUrl(), anonKey()).auth.updateUser({ password: p });
    setBusy(false);
    if (error) return setErr(/different from the old|same/i.test(error.message) ? "Новый пароль должен отличаться от старого." : /session|jwt|auth/i.test(error.message) ? "Ссылка устарела. Запросите новую на странице входа." : error.message);
    setDone(true);
    setTimeout(() => { location.href = "/"; }, 1200);
  }
  return (
    <div className="auth">
      <div><h1>Новый пароль</h1><p className="sub">Придумайте пароль — не короче 8 символов.</p></div>
      <form className="panel" onSubmit={submit} style={{ display: "grid", gap: 14 }} noValidate>
        <label className="field" htmlFor="password">Новый пароль<input id="password" name="password" type="password" autoComplete="new-password" required /></label>
        <label className="field" htmlFor="password2">Повторите пароль<input id="password2" name="password2" type="password" autoComplete="new-password" required /></label>
        <div className="err" role="alert">{err}</div>
        {done && <div className="notice">Пароль сохранён. Открываем кабинет…</div>}
        <button className="btn" type="submit" disabled={busy || done}>{busy ? "Сохраняем…" : "Сохранить пароль"}</button>
      </form>
    </div>
  );
}
