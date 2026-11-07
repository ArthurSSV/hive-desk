"use client";
import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, anonKey } from "@/lib/env";

const sb = () => createBrowserClient(supabaseUrl(), anonKey());

export default function AuthForm({ mode, notice, code }: { mode: "login" | "register"; notice?: string; code?: string }) {
  const reg = mode === "register";
  const [err, setErr] = useState(""), [info, setInfo] = useState(notice || ""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(""); setInfo("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim(), password = String(f.get("password"));
    if (reg && !String(f.get("name")).trim()) return setErr("Укажите имя, чтобы админ узнал вас в списке.");
    if (password.length < 8) return setErr("Пароль должен быть не короче 8 символов.");
    setBusy(true);
    const c = sb();
    if (reg) {
      const { data, error } = await c.auth.signUp({ email, password, options: { data: { name: String(f.get("name")).trim(), invite: String(f.get("invite") || "").trim() }, emailRedirectTo: `${location.origin}/auth/callback` } });
      setBusy(false);
      if (error) return setErr(/database error saving new user|INVALID_INVITE/i.test(error.message) ? "Неверный код приглашения. Возьмите ссылку для регистрации у админа группы." : error.message);
      if (!data.session) return setInfo("Мы отправили письмо для подтверждения. Откройте ссылку из письма, затем войдите.");
      location.href = "/connect";
    } else {
      const { error } = await c.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setErr(error.message === "Invalid login credentials" ? "Неверный email или пароль." : error.message);
      location.href = "/";
    }
  }

  return (
    <div className="auth">
      <div><h1>{reg ? "Регистрация в группе" : "Вход в кабинет"}</h1>
        <p className="sub">{reg ? "После регистрации подключите cTrader — и вы появитесь в статистике группы." : "Войдите, чтобы открыть свой кабинет."}</p></div>
      <form className="panel" onSubmit={submit} style={{ display: "grid", gap: 14 }} noValidate>
        {reg && <label className="field" htmlFor="invite">Код приглашения<input id="invite" name="invite" defaultValue={code || ""} placeholder="Из ссылки админа" autoComplete="off" /></label>}
        {reg && <label className="field" htmlFor="name">Имя и первая буква фамилии<input id="name" name="name" placeholder="Например, Мирослав Д." autoComplete="name" /></label>}
        <label className="field" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required /></label>
        <label className="field" htmlFor="password">Пароль<input id="password" name="password" type="password" autoComplete={reg ? "new-password" : "current-password"} required /></label>
        <div className="err" role="alert">{err}</div>
        {info && <div className="notice">{info}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Подождите…" : reg ? "Создать аккаунт" : "Войти"}</button>
      </form>
      <p className="fine" style={{ textAlign: "center" }}>{reg ? <>Уже есть аккаунт? <Link href="/login">Войти</Link></> : <>Впервые здесь? <Link href="/register">Зарегистрироваться</Link></>}</p>
    </div>
  );
}
