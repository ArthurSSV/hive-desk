import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseUrl, anonKey, serviceKey } from "./env";

const URL = supabaseUrl;
const ANON = anonKey;

/** Клиент от имени вошедшего пользователя (действуют правила RLS). */
export function userClient() {
  const store = cookies();
  return createServerClient(URL(), ANON(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* вызов из Server Component */ }
      },
    },
  });
}

/** Серверный клиент с service role: только для API-роутов и воркера. */
export function serviceClient() {
  return createClient(URL(), serviceKey(), { auth: { persistSession: false } });
}

export type Profile = { id: string; name: string; email: string; role: "trader" | "admin"; wallet: string | null; created_at: string; is_trader?: boolean };

export async function requireUser(): Promise<{ sb: ReturnType<typeof userClient>; profile: Profile }> {
  const sb = userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login?e=profile");
  return { sb, profile: profile as Profile };
}

export async function requireAdmin() {
  const r = await requireUser();
  if (r.profile.role !== "admin") redirect("/dashboard");
  return r;
}
