// Синхронизация выполняется в GitHub Actions, а не на Vercel (лимит CPU бесплатного тарифа).
// Нужна переменная GITHUB_DISPATCH_TOKEN (fine-grained токен: репозиторий hive-desk, Actions: Read and write).
// Без неё — запасной путь: синхронизация прямо на Vercel, как раньше.
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAll } from "./sync";

const repo = () => (process.env.GITHUB_REPO || "ArthurSSV/hive-desk").trim();

export async function dispatchSync(opts: { userId?: string; full?: boolean } = {}): Promise<boolean> {
  const token = (process.env.GITHUB_DISPATCH_TOKEN || "").trim();
  if (!token) return false;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo()}/actions/workflows/sync.yml/dispatches`, {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "hive-desk" },
      body: JSON.stringify({ ref: "main", inputs: { full: opts.full === false ? "false" : "true", user: opts.userId || "" } }),
    });
    if (r.status !== 204) console.warn(`dispatch ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.status === 204;
  } catch (e: any) { console.warn("dispatch: " + (e?.message || e)); return false; }
}

/** Запросить синхронизацию трейдера: в GitHub (≈1 минута), иначе — сразу на Vercel. */
export async function requestSync(sb: SupabaseClient, userId: string): Promise<"queued" | "done"> {
  if (await dispatchSync({ userId, full: true })) return "queued";
  try { await syncAll(sb, { userId }); } catch { /* повторит крон */ }
  return "done";
}
