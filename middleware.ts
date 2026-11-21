import { createServerClient } from "@supabase/ssr";
import { siteOrigin } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, anonKey } from "@/lib/env";

// Обновляет сессию Supabase и закрывает приватные страницы для гостей
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(supabaseUrl(), anonKey(), {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;
  const isPublic = p === "/" || p.startsWith("/login") || p.startsWith("/register") || p.startsWith("/forgot") || p.startsWith("/auth");
  if (!user && !isPublic) {
    // Абсолютный адрес из заголовков прокси: на Render req.nextUrl указывает на localhost
    return NextResponse.redirect(new URL("/login", siteOrigin(req)));
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|api/cron).*)"] };
