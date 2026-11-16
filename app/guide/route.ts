import { NextResponse } from "next/server";
import { serviceClient, userClient } from "@/lib/supabase";
import { normalizeRules, GUIDE_BUCKET } from "@/lib/rules";

export const dynamic = "force-dynamic";

/** Материал для трейдеров: только для вошедших, по короткой подписанной ссылке на закрытое хранилище. */
export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const { data: { user } } = await userClient().auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);
  const svc = serviceClient();
  const { data } = await svc.from("settings").select("rules").eq("id", 1).single();
  const g = normalizeRules(data?.rules).guide;
  if (!g?.file) return new NextResponse("Файл пока не загружен", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const { data: s, error } = await svc.storage.from(GUIDE_BUCKET).createSignedUrl(g.file, 300);
  if (error || !s) return new NextResponse("Не удалось открыть файл", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(s.signedUrl);
}
