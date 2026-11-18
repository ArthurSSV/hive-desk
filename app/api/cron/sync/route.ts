import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serviceClient } from "@/lib/supabase";
import { syncAll, weekendSkip } from "@/lib/sync";

// Вызывается внешним планировщиком (cron-job.org) раз в 5–15 минут.
// За один вызов обновляются счета, которые дольше всех ждали, пока хватает времени.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const t0 = Date.now(), lines: string[] = [];
  // Выходные (пт 21:00 — вс 21:00 UTC): рынок закрыт, синхронизируем раз в час — первым запуском часа
  if (weekendSkip() && req.nextUrl.searchParams.get("force") !== "1") return NextResponse.json({ skipped: "weekend" });
  try {
    // light: без изменений на счёте свечи, ордера и пересчёт истории пропускаются (экономия CPU Vercel)
    const r = await syncAll(serviceClient(), { budgetMs: 20_000, concurrency: 4, light: true, log: s => lines.push(s) });
    return NextResponse.json({ ...r, ms: Date.now() - t0, log: lines.slice(-50) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e), log: lines }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
