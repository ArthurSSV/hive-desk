import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { userClient } from "@/lib/supabase";

// Ссылки из писем Supabase (подтверждение email, сброс пароля).
// token_hash работает на любом устройстве; code — только в браузере, где запросили письмо.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("next") || "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const sb = userClient();
  const token_hash = q.get("token_hash"), type = q.get("type") as EmailOtpType | null, code = q.get("code");
  let ok = false;
  if (token_hash && type) ok = !(await sb.auth.verifyOtp({ type, token_hash })).error;
  else if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  if (ok) return NextResponse.redirect(new URL(type === "recovery" ? "/reset" : next, req.url));
  return NextResponse.redirect(new URL(type === "recovery" || next === "/reset" ? "/login?e=link" : "/login?confirmed=1", req.url));
}
