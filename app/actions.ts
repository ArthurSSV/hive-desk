"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser, serviceClient, userClient } from "@/lib/supabase";
import { dayKey } from "@/lib/engine";
import { syncAll, loadRules } from "@/lib/sync";
import { normalizeRules } from "@/lib/rules";

export async function signOut() {
  await userClient().auth.signOut();
  redirect("/login");
}

export async function saveJournal(fd: FormData) {
  const { sb, profile } = await requireUser();
  const rules = await loadRules(sb);
  const day = (fd.get("day") as string) || dayKey(new Date(), rules.tz);
  const mood = Number(fd.get("mood")) || null;
  const plan = fd.get("plan") === "1" ? true : fd.get("plan") === "0" ? false : null;
  const note = String(fd.get("note") || "").slice(0, 2000);
  await sb.from("journal").upsert({ user_id: profile.id, day, mood, plan, note, updated_at: new Date().toISOString() });
  revalidatePath("/dashboard");
}

export async function saveWallet(wallet: string) {
  const { sb, profile } = await requireUser();
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { error: "Неверный адрес кошелька" };
  await sb.from("profiles").update({ wallet: wallet.toLowerCase() }).eq("id", profile.id);
  revalidatePath("/dashboard"); revalidatePath("/connect");
  return { ok: true };
}

export async function activateAccount(fd: FormData) {
  const { sb, profile } = await requireUser();
  const id = Number(fd.get("id"));
  const phase = Number(fd.get("phase"));
  const initial = fd.get("initial") ? Number(fd.get("initial")) : null;
  if (![1, 2, 3].includes(phase)) return;
  // Одновременно отслеживается один счёт — остальные выключаем
  await sb.from("ctrader_accounts").update({ active: false }).eq("user_id", profile.id).neq("id", id);
  await sb.from("ctrader_accounts").update({ active: true, phase, initial_balance: initial, status: "active", status_day: null }).eq("id", id).eq("user_id", profile.id);
  try { await syncAll(serviceClient(), { userId: profile.id }); } catch { /* воркер повторит */ }
  redirect("/dashboard");
}

export async function syncMe() {
  const { profile } = await requireUser();
  await syncAll(serviceClient(), { userId: profile.id });
  revalidatePath("/dashboard");
}

export async function syncUser(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("user"));
  await syncAll(serviceClient(), { userId: id });
  revalidatePath("/admin"); revalidatePath(`/admin/trader/${id}`);
}

export async function saveRules(fd: FormData) {
  const { sb } = await requireAdmin();
  const cur = await loadRules(sb);
  const next: any = { ...cur };
  for (const k of ["p1", "p2", "daily", "max", "minDays", "redDaily", "redDD"]) { const v = Number(fd.get(k)); if (v > 0) next[k] = v; }
  const tz = String(fd.get("tz") || "").trim(); if (tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); next.tz = tz; } catch {} }
  await sb.from("settings").update({ rules: normalizeRules(next) }).eq("id", 1);
  revalidatePath("/admin/rules");
  redirect("/admin/rules?saved=1");
}

export async function removeTrader(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("user"));
  await serviceClient().auth.admin.deleteUser(id); // профиль и данные удаляются каскадом
  revalidatePath("/admin");
  redirect("/admin");
}
