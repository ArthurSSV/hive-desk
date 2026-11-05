import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

// Подтверждение email из письма Supabase
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await userClient().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
