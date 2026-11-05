import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { userClient } from "@/lib/supabase";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Hive Desk", description: "Отчётность группы по проп-челленджу" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sb = userClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = user ? await sb.from("profiles").select("role,name").eq("id", user.id).single() : { data: null };
  const admin = profile?.role === "admin";
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" />
      </head>
      <body>
        <header className="top"><div className="wrap">
          <Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 1.5 23 7.25v11.5L13 24.5 3 18.75V7.25z" fill="var(--accent)" /><path d="M13 7.5 18 10.4v5.2L13 18.5 8 15.6v-5.2z" fill="var(--surface)" /></svg>
            Hive Desk
          </Link>
          {user && (
            <nav className="tabs" aria-label="Разделы">
              {admin && <Link href="/admin">Группа</Link>}
              {admin && <Link href="/admin/rules">Правила</Link>}
              {!admin && <Link href="/dashboard">Мой кабинет</Link>}
              <form action={signOut}><button className="signout" type="submit">Выйти</button></form>
            </nav>
          )}
        </div></header>
        <div className="wrap"><main>{children}</main></div>
      </body>
    </html>
  );
}
