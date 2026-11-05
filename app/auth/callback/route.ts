import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

// Ссылка из письма Supabase. Email к этому моменту уже подтверждён на стороне Supabase;
// сессию получится открыть только в том же браузере, где шла регистрация, — иначе просим войти.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await userClient().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.redirect(new URL("/login?confirmed=1", req.url));
}
