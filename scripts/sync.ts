// Запуск: npm run sync  (GitHub Actions каждые 15 минут)
import { createClient } from "@supabase/supabase-js";
import { syncAll } from "../lib/sync";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const t0 = Date.now();
syncAll(sb, { log: s => console.log(s) })
  .then(r => { console.log(`done: ${r.ok} ok, ${r.failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
