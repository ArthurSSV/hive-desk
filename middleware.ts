import { createServerClient } from "@supabase/ssr";
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
  const isPublic = p === "/" || p.startsWith("/login") || p.startsWith("/register") || p.startsWith("/auth");
  if (!user && !isPublic) {
    const u = req.nextUrl.clone(); u.pathname = "/login"; return NextResponse.redirect(u);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|api/cron).*)"] };
