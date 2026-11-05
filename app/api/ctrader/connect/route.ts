import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { userClient } from "@/lib/supabase";
import { authorizeUrl } from "@/lib/ctrader";

export async function GET(req: Request) {
  const { data: { user } } = await userClient().auth.getUser();
  const base = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(`${base}/login`);
  const state = crypto.randomUUID();
  cookies().set("ct_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authorizeUrl(`${base}/api/ctrader/callback`, state));
}
