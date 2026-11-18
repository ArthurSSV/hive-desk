// Синхронизация cTrader вне Vercel: GitHub Actions (задачу запускает cron-job.org через API GitHub).
// SYNC_FULL=1 — полная синхронизация (ручной запуск); иначе лёгкий режим, как у крона на Vercel.
import { createClient } from "@supabase/supabase-js";
import { syncAll, weekendSkip } from "../lib/sync";
import { supabaseUrl, serviceKey } from "../lib/env";

const full = process.env.SYNC_FULL === "1" || process.env.SYNC_FULL === "true";
const userId = (process.env.SYNC_USER || "").trim() || undefined; // запуск по кнопке «Обновить» — только этот трейдер
if (!full && !userId && weekendSkip()) { console.log("skipped: weekend"); process.exit(0); }

const sb = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });
const t0 = Date.now();
syncAll(sb, { userId, log: s => console.log(s), concurrency: 4, light: !full && !userId })
  .then(r => { console.log(`done: ${r.ok} ok, ${r.failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s${full ? " (full)" : ""}`); process.exit(r.failed && !r.ok ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
