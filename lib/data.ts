import type { SupabaseClient } from "@supabase/supabase-js";
import { summarize } from "./engine";
import { normalizeRules, zoneOf } from "./rules";

export type Account = {
  id: number; user_id: string; ctid_trader_account_id: number; trader_login: number | null; broker_name: string | null;
  is_live: boolean; phase: number; initial_balance: number | null; balance: number | null; status: string; active: boolean;
  last_synced_at: string | null; sync_error: string | null; created_at: string;
};

/** Текущий счёт трейдера: активный незавершённый, иначе последний подключённый. */
export function currentAccount(accs: Account[]): Account | null {
  const act = accs.filter(a => a.active);
  return act.find(a => a.status === "active") || act.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

export async function rulesOf(sb: SupabaseClient) {
  const { data } = await sb.from("settings").select("rules").eq("id", 1).single();
  return normalizeRules(data?.rules);
}

export async function traderBundle(sb: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: accounts }, { data: journal }, { data: chain }, rules] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).single(),
    sb.from("ctrader_accounts").select("*").eq("user_id", userId).order("created_at"),
    sb.from("journal").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(60),
    sb.from("chain_events").select("*").eq("user_id", userId).order("ts", { ascending: false }),
    rulesOf(sb),
  ]);
  const acc = currentAccount((accounts || []) as Account[]);
  const [{ data: days }, { data: deals }] = acc
    ? await Promise.all([
        sb.from("daily_stats").select("*").eq("account_id", acc.id).order("day"),
        sb.from("deals").select("deal_id,position_id,symbol,side,lots,price,entry_price,exec_ts,is_close,net_profit").eq("account_id", acc.id).order("exec_ts", { ascending: false }).limit(1000),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const jmap = new Map((journal || []).map((j: any) => [j.day, j]));
  const merged = (days || []).map((d: any) => ({ ...d, level: zoneOf(d.total_pct, acc!.phase, rules), traded: d.trades > 0 || Number(d.pnl) !== 0, mood: jmap.get(d.day)?.mood ?? null }));
  return { profile, accounts: (accounts || []) as Account[], acc, days: merged, deals: (deals || []) as any[], journal: journal || [], chain: chain || [], rules, m: summarize(merged, rules.profitDayPct) };
}

export async function groupBundle(sb: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const [{ data: profiles }, { data: accounts }, { data: days }, { data: journal }, rules] = await Promise.all([
    sb.from("profiles").select("*").eq("role", "trader").order("created_at"),
    sb.from("ctrader_accounts").select("*"),
    sb.from("daily_stats").select("account_id,user_id,day,pnl,pnl_pct,total_pct,trades,level,flags,breach").gte("day", since).order("day"),
    sb.from("journal").select("user_id,day,mood").gte("day", since),
    rulesOf(sb),
  ]);
  const accByUser = new Map<string, Account[]>();
  for (const a of (accounts || []) as Account[]) { if (!accByUser.has(a.user_id)) accByUser.set(a.user_id, []); accByUser.get(a.user_id)!.push(a); }
  const moods = new Map((journal || []).map((j: any) => [j.user_id + j.day, j.mood]));
  const phaseOf = new Map(((accounts || []) as Account[]).map(a => [a.id, a.phase]));
  const daysByAcc = new Map<number, any[]>();
  for (const d of days || []) { const r = { ...d, level: zoneOf(d.total_pct, phaseOf.get(d.account_id) ?? 1, rules), traded: d.trades > 0 || Number(d.pnl) !== 0, mood: moods.get(d.user_id + d.day) ?? null }; if (!daysByAcc.has(d.account_id)) daysByAcc.set(d.account_id, []); daysByAcc.get(d.account_id)!.push(r); }
  const todayIso = new Date().toISOString().slice(0, 10);
  const traders = (profiles || []).map((p: any) => {
    const acc = currentAccount(accByUser.get(p.id) || []);
    const ds = acc ? daysByAcc.get(acc.id) || [] : [];
    const last = ds[ds.length - 1];
    const level = !acc ? "none" : acc.status === "failed" ? "failed" : last?.level || "work";
    return { p, acc, days: ds, m: summarize(ds, rules.profitDayPct), level, flags: (last?.flags || []) as { lv: string; t: string }[], fresh: p.created_at.slice(0, 10) === todayIso };
  });
  // Температура группы: светофор по дням среди всех счетов
  const temp = new Map<string, { day: string; red: number; yellow: number; work: number; green: number }>();
  for (const t of traders) for (const d of t.days) {
    if (!temp.has(d.day)) temp.set(d.day, { day: d.day, red: 0, yellow: 0, work: 0, green: 0 });
    const r = temp.get(d.day)! as any; if (d.level in r) r[d.level]++;
  }
  return { traders, temp: [...temp.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-22), rules };
}
