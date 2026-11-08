import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Уведомления админа. Доступ ограничен правилами базы: читать и отмечать может только админ.
export async function GET() {
  const sb = userClient();
  const [{ data, error }, { count }] = await Promise.all([
    sb.from("notifications").select("id,kind,text,link,created_at,read_at").order("id", { ascending: false }).limit(30),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (error) return NextResponse.json({ items: [], unread: 0 });
  return NextResponse.json({ items: data || [], unread: count || 0 }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sb = userClient();
  let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.map(Number).filter(Boolean));
  else if (!body.all) return NextResponse.json({ ok: false }, { status: 400 });
  await q;
  return NextResponse.json({ ok: true });
}
