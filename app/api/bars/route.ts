import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

// Свечи по позиции для графика сделки. Права проверяет RLS: свои сделки или админ.
export async function GET(req: NextRequest) {
  const acc = Number(req.nextUrl.searchParams.get("acc")), pos = Number(req.nextUrl.searchParams.get("pos"));
  if (!acc || !pos) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { data, error } = await userClient().from("position_bars").select("symbol,period,bars").eq("account_id", acc).eq("position_id", pos).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
}
