"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser, serviceClient, userClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, anonKey, appUrl } from "@/lib/env";
import { dayKey, journalDays } from "@/lib/engine";
import { syncAll, loadRules, recompute } from "@/lib/sync";
import { normalizeRules } from "@/lib/rules";

export async function signOut() {
  await userClient().auth.signOut();
  redirect("/login");
}

export async function saveJournal(fd: FormData) {
  const { sb, profile } = await requireUser();
  const rules = await loadRules(sb);
  const today = dayKey(new Date(), rules.tz);
  const open = journalDays(today);
  const day = String(fd.get("day") || open[open.length - 1]);
  // Заполнять и править можно сегодня и три предыдущих торговых дня (выходные не считаются)
  if (!open.includes(day)) redirect("/dashboard?je=window#journal");
  const mood = Number(fd.get("mood")) || null;
  const plan = fd.get("plan") === "1" ? true : fd.get("plan") === "0" ? false : null;
  const note = String(fd.get("note") || "").slice(0, 2000);
  await sb.from("journal").upsert({ user_id: profile.id, day, mood, plan, note, updated_at: new Date().toISOString() });
  // Флаги «нет отчёта» и «не по плану» зависят от дневника — пересчитываем сразу, не дожидаясь синхронизации
  try {
    const svc = serviceClient();
    const { data: accs } = await svc.from("ctrader_accounts").select("*").eq("user_id", profile.id).eq("active", true).eq("removed", false);
    for (const a of accs || []) if (a.initial_balance != null) await recompute(svc, a, rules, Number(a.initial_balance));
  } catch { /* пересчитает ближайшая синхронизация */ }
  revalidatePath("/dashboard"); revalidatePath(`/admin/trader/${profile.id}`); revalidatePath("/admin");
  redirect(`/dashboard?jd=${day}&js=1#journal`);
}

export async function activateAccount(fd: FormData) {
  const { sb, profile } = await requireUser();
  const id = Number(fd.get("id"));
  const phase = Number(fd.get("phase"));
  const initial = fd.get("initial") ? Number(fd.get("initial")) : null;
  const { data: acc } = await sb.from("ctrader_accounts").select("*").eq("id", id).eq("user_id", profile.id).single();
  if (!acc || acc.removed || acc.archived) redirect("/connect");
  // У подтверждённого счёта поля этапа и баланса заблокированы и в форме не приходят
  if (!acc.balance_locked && (![1, 2, 3].includes(phase) || (initial != null && !(initial >= 100 && initial <= 10_000_000)))) redirect("/connect?error=" + encodeURIComponent("Проверьте этап и начальный баланс"));
  // Одновременно отслеживается один счёт — остальные выключаем (только реально включённые и не удалённые)
  await serviceClient().from("ctrader_accounts").update({ active: false }).eq("user_id", profile.id).eq("active", true).neq("id", id);
  // Подтверждённые админом этап и баланс трейдер не меняет (это же проверяет база)
  const { error } = await sb.from("ctrader_accounts").update(acc.balance_locked ? { active: true } : { active: true, phase, initial_balance: initial }).eq("id", id).eq("user_id", profile.id);
  if (error) redirect("/connect?error=" + encodeURIComponent(error.message));
  try { await syncAll(serviceClient(), { userId: profile.id }); } catch { /* воркер повторит */ }
  redirect("/dashboard");
}

export async function syncMe() {
  const { sb, profile } = await requireUser();
  // Не чаще раза в минуту, чтобы не упираться в лимиты cTrader
  const { data: accs } = await sb.from("ctrader_accounts").select("last_synced_at").eq("user_id", profile.id).eq("active", true);
  const last = Math.max(0, ...(accs || []).map(a => (a.last_synced_at ? Date.parse(a.last_synced_at) : 0)));
  if (Date.now() - last < 60_000) { revalidatePath("/dashboard"); return; }
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
  for (const k of ["p1", "p2", "daily", "max", "minDays", "profitDayPct", "redDaily", "redDD"]) { const v = Number(fd.get(k)); if (v > 0) next[k] = v; }
  for (const k of ["zoneGreen1", "zoneGreen2", "zoneGreenF"]) { const v = fd.get(k); if (v !== null && v !== "" && Number.isFinite(Number(v))) next[k] = Number(v); }
  // Пороги убытка храним отрицательными, даже если ввели «2» вместо «−2»
  for (const k of ["zoneYellow", "zoneRed"]) { const v = fd.get(k); if (v !== null && v !== "" && Number.isFinite(Number(v))) next[k] = -Math.abs(Number(v)); }
  if (next.zoneRed > next.zoneYellow) [next.zoneRed, next.zoneYellow] = [next.zoneYellow, next.zoneRed];
  revalidatePath("/admin"); revalidatePath("/dashboard");
  const tz = String(fd.get("tz") || "").trim(); if (tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); next.tz = tz; } catch {} }
  if (fd.has("groupStart")) { const gs = String(fd.get("groupStart") || "").trim(); next.groupStart = /^\d{4}-\d{2}-\d{2}$/.test(gs) ? gs : null; }
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

// ---------- Команды кураторов ----------
export async function createTeam(fd: FormData) {
  const { sb } = await requireAdmin();
  const name = String(fd.get("name") || "").trim().slice(0, 60);
  if (!name) redirect("/admin/teams?e=name");
  await sb.from("teams").insert({ name, curator: String(fd.get("curator") || "").trim().slice(0, 60) || null });
  revalidatePath("/admin/teams"); redirect("/admin/teams?ok=created");
}

export async function updateTeam(fd: FormData) {
  const { sb } = await requireAdmin();
  const id = Number(fd.get("id")), name = String(fd.get("name") || "").trim().slice(0, 60);
  if (!id || !name) redirect("/admin/teams?e=name");
  await sb.from("teams").update({ name, curator: String(fd.get("curator") || "").trim().slice(0, 60) || null }).eq("id", id);
  revalidatePath("/admin/teams"); redirect("/admin/teams?ok=saved");
}

export async function deleteTeam(fd: FormData) {
  const { sb } = await requireAdmin();
  await sb.from("teams").delete().eq("id", Number(fd.get("id"))); // участники становятся «без команды»
  revalidatePath("/admin/teams"); redirect("/admin/teams?ok=deleted");
}

export async function assignTeams(fd: FormData) {
  const { sb } = await requireAdmin();
  const groups = new Map<string, string[]>();
  for (const [k, v] of fd.entries()) if (k.startsWith("t_")) { const t = String(v); if (!groups.has(t)) groups.set(t, []); groups.get(t)!.push(k.slice(2)); }
  for (const [t, users] of groups) await sb.from("profiles").update({ team_id: t ? Number(t) : null }).in("id", users);
  revalidatePath("/admin/teams"); revalidatePath("/admin"); revalidatePath("/admin/summary");
  redirect("/admin/teams?ok=assigned");
}

// ---------- Админ: подтверждение счёта и код приглашения ----------
export async function confirmAccount(fd: FormData) {
  const { sb } = await requireAdmin();
  const id = Number(fd.get("id")), user = String(fd.get("user")), phase = Number(fd.get("phase")), initial = Number(fd.get("initial"));
  if (![1, 2, 3].includes(phase) || !(initial >= 100)) redirect(`/admin/trader/${user}?e=account`);
  await sb.from("ctrader_accounts").update({ phase, initial_balance: initial, balance_locked: fd.get("lock") !== "0" }).eq("id", id);
  try { await syncAll(serviceClient(), { userId: user }); } catch { /* повторит крон */ }
  revalidatePath(`/admin/trader/${user}`); revalidatePath("/admin");
  redirect(`/admin/trader/${user}?ok=account`);
}

export async function saveInvite(fd: FormData) {
  const { sb } = await requireAdmin();
  let code = String(fd.get("invite") || "").trim();
  if (fd.get("gen")) code = Array.from(crypto.getRandomValues(new Uint8Array(5)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  await sb.from("settings").update({ invite_code: code.slice(0, 40) || null }).eq("id", 1);
  revalidatePath("/admin/rules"); revalidatePath("/admin");
  redirect("/admin/rules?saved=invite");
}

// ---------- Удаление счёта: трейдер просит, админ подтверждает ----------
export async function requestRemoval(fd: FormData) {
  const { sb, profile } = await requireUser();
  const cancel = fd.get("cancel") === "1";
  await sb.from("ctrader_accounts").update({ delete_requested_at: cancel ? null : new Date().toISOString() }).eq("id", Number(fd.get("id"))).eq("user_id", profile.id);
  revalidatePath("/connect");
  redirect(`/connect?ok=${cancel ? "cancel" : "requested"}`);
}

export async function adminAccountAction(fd: FormData) {
  await requireAdmin();
  const sb = serviceClient();
  const id = Number(fd.get("id")), user = String(fd.get("user")), act = String(fd.get("act"));
  if (act === "remove") {
    // Счёт удаляется целиком вместе с историей; при новом подключении cTrader он появится снова как новый
    await sb.from("ctrader_accounts").delete().eq("id", id);
  } else if (act === "archive" || act === "unarchive") {
    // Архив: счёт перестаёт синхронизироваться и уходит из «Группы», история остаётся (колонка — миграция 014)
    const on = act === "archive";
    const { error } = await sb.from("ctrader_accounts").update(on ? { archived: true, archived_at: new Date().toISOString(), active: false } : { archived: false, archived_at: null, active: true }).eq("id", id);
    if (error) redirect(`/admin/trader/${user}?e=migrate14`);
    revalidatePath("/admin/summary");
  } else if (act === "reject") {
    await sb.from("ctrader_accounts").update({ delete_requested_at: null }).eq("id", id);
  } else if (act === "fail" || act === "unfail") {
    // Ручная отметка Failed: колонка появляется после миграции 011
    const { error } = await sb.from("ctrader_accounts").update({ manual_failed: act === "fail" }).eq("id", id);
    if (error) redirect(`/admin/trader/${user}?e=migrate`);
    try {
      const rules = await loadRules(sb);
      const { data: a } = await sb.from("ctrader_accounts").select("*").eq("id", id).single();
      if (a?.initial_balance != null) await recompute(sb, a, rules, Number(a.initial_balance));
    } catch { /* пересчитает ближайшая синхронизация */ }
  }
  revalidatePath(`/admin/trader/${user}`); revalidatePath("/admin");
  redirect(`/admin/trader/${user}?ok=${act}`);
}

// ---------- Админ, который тоже торгует ----------
export async function setSelfTrader(fd: FormData) {
  const { sb, profile } = await requireAdmin();
  const on = fd.get("on") === "1";
  await sb.from("profiles").update({ is_trader: on }).eq("id", profile.id);
  revalidatePath("/", "layout");
  redirect(on ? "/connect" : "/admin/rules?saved=self");
}

// ---------- Админ: ссылка для сброса пароля ----------
export async function sendPasswordReset(fd: FormData) {
  await requireAdmin();
  const user = String(fd.get("user"));
  const { data: p } = await serviceClient().from("profiles").select("email").eq("id", user).single();
  if (!p?.email) redirect(`/admin/trader/${user}?e=reset`);
  // Отдельный клиент без cookies, чтобы не трогать сессию админа
  const anon = createClient(supabaseUrl(), anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const site = appUrl() || "https://hive-desk-nu.vercel.app";
  const { error } = await anon.auth.resetPasswordForEmail(p!.email, { redirectTo: `${site}/auth/confirm?next=/reset` });
  redirect(`/admin/trader/${user}?${error ? "e=reset" : "ok=reset"}`);
}
