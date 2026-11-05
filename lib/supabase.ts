import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
  return createClient(URL(), process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export type Profile = { id: string; name: string; email: string; role: "trader" | "admin"; wallet: string | null; created_at: string };

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
