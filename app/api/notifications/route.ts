import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Уведомления админа. Доступ ограничен правилами базы: читать и отмечать может только админ.
export async function GET() {
  const sb = userClient();
  // Прочитанные показываем ещё сутки, потом они уходят из списка
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data, error }, { count }] = await Promise.all([
    sb.from("notifications").select("id,kind,text,link,created_at,read_at").or(`read_at.is.null,read_at.gt.${dayAgo}`).order("id", { ascending: false }).limit(30),
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

// Убрать уведомления: выбранные или все прочитанные
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sb = userClient();
  if (Array.isArray(body.ids) && body.ids.length) await sb.from("notifications").delete().in("id", body.ids.map(Number).filter(Boolean));
  else if (body.read) await sb.from("notifications").delete().not("read_at", "is", null);
  else return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true });
}
