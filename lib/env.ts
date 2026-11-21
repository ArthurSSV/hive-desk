// Приводит адрес Supabase к виду https://<ref>.supabase.co, даже если вставлен
// адрес с /rest/v1, со слешем в конце или ссылка на проект из панели Supabase.
export function supabaseUrl(raw = process.env.NEXT_PUBLIC_SUPABASE_URL || ""): string {
  let s = raw.trim().replace(/^["']|["']$/g, "");
  const dash = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;
  try { const u = new URL(s); return `${u.protocol}//${u.host}`; } catch { return s.replace(/\/+$/, ""); }
}

export const anonKey = () => (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
export const serviceKey = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");

/** Адрес сайта для ссылок и возврата из cTrader: NEXT_PUBLIC_APP_URL, иначе — из заголовков прокси
 *  (на Render/своём сервере req.url внутри контейнера может быть http://localhost:PORT). */
export function siteOrigin(req: Request): string {
  const env = appUrl(); if (env) return env;
  const h = req.headers, host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
