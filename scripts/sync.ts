// Запуск: npm run sync  (GitHub Actions каждые 15 минут)
import { createClient } from "@supabase/supabase-js";
import { syncAll } from "../lib/sync";
import { supabaseUrl, serviceKey } from "../lib/env";

const sb = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });
const t0 = Date.now();
syncAll(sb, { log: s => console.log(s) })
  .then(r => { console.log(`done: ${r.ok} ok, ${r.failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
