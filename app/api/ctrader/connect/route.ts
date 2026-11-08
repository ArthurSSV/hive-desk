import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";
import { authorizeUrl } from "@/lib/ctrader";

// Начало подключения cTrader: метка в cookie доказывает, что подключение начал сам трейдер на нашем сайте.
export async function GET(req: Request) {
  const { data: { user } } = await userClient().auth.getUser();
  const base = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(`${base}/login`);
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(`${base}/api/ctrader/callback`, state));
  res.cookies.set("ct_state", `${state}.${user.id}`, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 900, path: "/" });
  return res;
}
