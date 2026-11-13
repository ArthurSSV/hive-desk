import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { userClient } from "@/lib/supabase";
import { signOut } from "./actions";
import NotificationBell from "@/components/NotificationBell";
import TzCookie from "@/components/TzCookie";
import ThemeToggle from "@/components/ThemeToggle";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "Матрёшка — Челлендж", description: "Отчётность группы по проп-челленджу" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sb = userClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = user ? await sb.from("profiles").select("role,name,is_trader").eq("id", user.id).single() : { data: null };
  const admin = profile?.role === "admin";
  const theme = cookies().get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="ru" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap" />
      </head>
      <body>
        <TzCookie current={cookies().get("tz")?.value ?? null} />
        <header className="top"><div className="wrap">
          <Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
            <svg width="24" height="28" viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1.5c3.3 0 5.6 2.6 5.6 5.7 0 1.3-.4 2.4-1 3.4 2.6 1.6 4.4 4.6 4.4 8.3 0 5-4 7.6-9 7.6s-9-2.6-9-7.6c0-3.7 1.8-6.7 4.4-8.3-.6-1-1-2.1-1-3.4 0-3.1 2.3-5.7 5.6-5.7z" fill="none" stroke="var(--gold)" strokeWidth="1.6" /><circle cx="12" cy="7.4" r="2.6" fill="var(--gold)" /><path d="M7.6 18.6c1.2 1.6 2.8 2.4 4.4 2.4s3.2-.8 4.4-2.4" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" /></svg>
            Матрёшка — Челлендж
          </Link>
          {user && (
            <nav className="tabs" aria-label="Разделы">
              {admin && <Link href="/admin">Группа</Link>}
              {admin && <Link href="/admin/summary">Сводка</Link>}
              {admin && <Link href="/admin/teams">Команды</Link>}
              {admin && <Link href="/admin/rules">Правила</Link>}
              {(!admin || profile?.is_trader) && <Link href="/dashboard">Мой кабинет</Link>}
              {admin && <NotificationBell />}
              <ThemeToggle />
              <form action={signOut}><button className="signout" type="submit">Выйти</button></form>
            </nav>
          )}
          {!user && <span style={{ marginLeft: "auto" }}><ThemeToggle /></span>}
        </div></header>
        <div className="wrap"><main>{children}</main></div>
      </body>
    </html>
  );
}
