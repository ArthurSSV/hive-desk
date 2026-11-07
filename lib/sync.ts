// Синхронизация: cTrader → deals → daily_stats → статус счёта → Telegram.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CTraderConnection, mapDeal, refreshToken } from "./ctrader";
import { computeAccount, dayKey } from "./engine";
import { buildPositions, chartWindow, minEquityByDay, type RawDeal } from "./equity";
import { normalizeRules, PHASE_LABEL, type Rules } from "./rules";
import { sendTelegram } from "./telegram";

type Account = {
  id: number; user_id: string; ctid_trader_account_id: number; is_live: boolean; phase: number;
  initial_balance: number | null; status: string; created_at: string;
};

const HISTORY_DAYS = 120;

async function validToken(sb: SupabaseClient, userId: string): Promise<string> {
  const { data: t, error } = await sb.from("ctrader_tokens").select("*").eq("user_id", userId).single();
  if (error || !t) throw new Error("Нет токена cTrader: трейдеру нужно заново подключить счёт");
  if (new Date(t.expires_at).getTime() - Date.now() > 3 * 24 * 3600 * 1000) return t.access_token;
  const n = await refreshToken(t.refresh_token);
  await sb.from("ctrader_tokens").update({
    access_token: n.accessToken, refresh_token: n.refreshToken,
    expires_at: new Date(Date.now() + n.expiresIn * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return n.accessToken;
}

export async function loadRules(sb: SupabaseClient): Promise<Rules> {
  const { data } = await sb.from("settings").select("rules").eq("id", 1).single();
  return normalizeRules(data?.rules);
}

/** Тянет новые сделки одного счёта из cTrader. */
async function pullDeals(sb: SupabaseClient, acc: Account) {
  const token = await validToken(sb, acc.user_id);
  const c = await new CTraderConnection(acc.is_live).open();
  try {
    await c.appAuth();
    await c.accountAuth(acc.ctid_trader_account_id, token);
    const trader = await c.trader(acc.ctid_trader_account_id);
    const md = trader.moneyDigits ?? 2;
    const balance = Number(trader.balance) / Math.pow(10, md);

    const { data: last } = await sb.from("deals").select("exec_ts").eq("account_id", acc.id).order("exec_ts", { ascending: false }).limit(1);
    // Старые сделки без лота/символа перезагружаем целиком (один раз после обновления)
    const { count: missing } = await sb.from("deals").select("deal_id", { count: "exact", head: true }).eq("account_id", acc.id).or("lots.is.null,and(is_close.eq.true,conv.is.null),and(is_close.eq.false,net_profit.neq.0)");
    const from = last?.[0] && !missing ? new Date(last[0].exec_ts).getTime() - 3600_000 : Date.now() - HISTORY_DAYS * 86400_000;
    const raw = await c.deals(acc.ctid_trader_account_id, from, Date.now());
    const mapped = raw
      .map(d => mapDeal(d, md))
      .filter(d => d.status === undefined || d.status === 2 || d.status === 3 || d.status === "FILLED" || d.status === "PARTIALLY_FILLED");
    const ids = [...new Set(mapped.map(d => d.symbol_id).filter((x): x is number => x != null))];
    const names = ids.length ? await c.symbolNames(acc.ctid_trader_account_id).catch(() => new Map<number, string>()) : new Map<number, string>();
    const lotSz = ids.length ? await c.lotSizes(acc.ctid_trader_account_id, ids).catch(() => new Map<number, number>()) : new Map<number, number>();
    const rows = mapped.map(({ status, ...d }) => {
      const ls = d.symbol_id != null ? lotSz.get(d.symbol_id) : undefined;
      return {
        ...d, account_id: acc.id, user_id: acc.user_id,
        symbol: d.symbol_id != null ? names.get(d.symbol_id) ?? null : null,
        lots: d.volume != null && ls ? Math.round((d.volume / ls) * 100) / 100 : d.volume != null ? Math.round((d.volume / 100 / 100000) * 100) / 100 : null,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("deals").upsert(rows.slice(i, i + 500), { onConflict: "deal_id" });
      if (error) throw error;
    }
    await pullBars(sb, c, acc);
    // Если начальный баланс не задан — восстанавливаем его по текущему балансу и сумме всех сделок
    let initial = acc.initial_balance;
    if (initial == null) {
      const { data: all } = await sb.from("deals").select("net_profit").eq("account_id", acc.id);
      const sum = (all || []).reduce((a, d) => a + Number(d.net_profit), 0);
      initial = Math.round((balance - sum) * 100) / 100;
    }
    await sb.from("ctrader_accounts").update({ balance, initial_balance: initial, last_synced_at: new Date().toISOString(), sync_error: null }).eq("id", acc.id);
    return { initial };
  } finally { c.close(); }
}

const DEAL_COLS = "position_id,symbol_id,symbol,side,volume,exec_ts,is_close,price,entry_price,conv,net_profit,lots";

/** Догружает свечи для новых и ещё открытых позиций (для графика и эквити). */
async function pullBars(sb: SupabaseClient, c: CTraderConnection, acc: Account) {
  const { data: deals } = await sb.from("deals").select(DEAL_COLS).eq("account_id", acc.id).order("exec_ts");
  const positions = buildPositions((deals || []) as RawDeal[]);
  const { data: have } = await sb.from("position_bars").select("position_id,closed").eq("account_id", acc.id);
  const done = new Set((have || []).filter(h => h.closed).map(h => Number(h.position_id)));
  const sym = new Map((deals || []).map((d: any) => [Number(d.position_id), d.symbol]));
  for (const p of positions) {
    if (done.has(p.id)) continue;
    const w = chartWindow(p);
    const bars = await c.trendbars(acc.ctid_trader_account_id, p.symbolId, w.period, Math.floor(w.from), Math.floor(w.to));
    const { error } = await sb.from("position_bars").upsert({
      account_id: acc.id, position_id: p.id, user_id: acc.user_id, symbol: sym.get(p.id) ?? null,
      period: w.label, bars, closed: p.closeMs != null && w.to >= (p.closeMs ?? 0), updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

/** Пересчитывает дневную статистику и статус счёта по уже сохранённым сделкам. */
export async function recompute(sb: SupabaseClient, acc: Account, rules: Rules, initial: number) {
  const { data: deals } = await sb.from("deals").select(DEAL_COLS).eq("account_id", acc.id).order("exec_ts");
  const { data: journal } = await sb.from("journal").select("day,mood,plan").eq("user_id", acc.user_id);
  const { data: pb } = await sb.from("position_bars").select("position_id,bars").eq("account_id", acc.id);
  const today = dayKey(new Date(), rules.tz);
  const minEquity = minEquityByDay({
    initial, deals: (deals || []) as RawDeal[], positions: buildPositions((deals || []) as RawDeal[]),
    bars: new Map((pb || []).map((b: any) => [Number(b.position_id), b.bars as number[][]])), tz: rules.tz,
  });
  const res = computeAccount({
    phase: acc.phase, initialBalance: initial, deals: (deals || []) as any, journal: (journal || []) as any,
    rules, startDay: dayKey(new Date(acc.created_at), rules.tz), today, minEquity,
  });
  await sb.from("daily_stats").delete().eq("account_id", acc.id);
  const rows = res.days.map(d => ({
    account_id: acc.id, user_id: acc.user_id, day: d.day, pnl: d.pnl, pnl_pct: d.pnl_pct, total_pct: d.total_pct,
    end_balance: d.end_balance, trades: d.trades, max_lot: d.max_lot, level: d.level, flags: d.flags, breach: d.breach,
    day_loss_pct: d.day_loss_pct, dd_pct: d.dd_pct, min_equity: minEquity.get(d.day) ?? null,
  }));
  for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("daily_stats").insert(rows.slice(i, i + 500)); if (error) throw error; }
  await sb.from("ctrader_accounts").update({ status: res.status, status_day: res.statusDay }).eq("id", acc.id);
  return { res, today, wasStatus: acc.status };
}

async function notify(sb: SupabaseClient, acc: Account, out: Awaited<ReturnType<typeof recompute>>) {
  const last = out.res.days[out.res.days.length - 1];
  if (!last) return;
  const { data: p } = await sb.from("profiles").select("name").eq("id", acc.user_id).single();
  const who = `${p?.name || "Трейдер"} · ${PHASE_LABEL[acc.phase]}`;
  const events: { level: string; text: string }[] = [];
  if (out.res.status !== out.wasStatus && out.res.status !== "active")
    events.push({ level: out.res.status, text: out.res.status === "failed" ? `⛔ ${who}: счёт закрыт (${last.flags[0]?.t || "лимит"})` : `✅ ${who}: цель фазы выполнена` });
  const prev = out.res.days[out.res.days.length - 2];
  const ICON: Record<string, string> = { red: "🔴 Буксир", yellow: "🟡 Предупреждение", green: "🟢 Цель близко" };
  if (last.day === out.today && ICON[last.level] && last.level !== prev?.level)
    events.push({ level: "zone-" + last.level, text: `${ICON[last.level]} · ${who}\nРезультат фазы ${last.total_pct > 0 ? "+" : ""}${last.total_pct}%${last.flags.length ? "\n" + last.flags.map(f => "• " + f.t).join("\n") : ""}` });
  const redFlags = last.flags.filter(f => f.lv === "red");
  if (last.day === out.today && redFlags.length)
    events.push({ level: "flags", text: `⚠️ ${who}\n${redFlags.map(f => "• " + f.t).join("\n")}` });
  for (const e of events) {
    const { error } = await sb.from("alerts_sent").insert({ account_id: acc.id, day: last.day, level: e.level });
    if (!error) await sendTelegram(e.text); // уже отправленное за этот день — пропускаем
  }
}

/** Синхронизирует все активные счета (или счета одного трейдера). */
/** budgetMs — лимит времени: счета идут от давно не обновлявшихся, остальные подождут следующего запуска. */
export async function syncAll(sb: SupabaseClient, opts: { userId?: string; log?: (s: string) => void; budgetMs?: number; concurrency?: number } = {}) {
  const log = opts.log || (() => {});
  const t0 = Date.now();
  const rules = await loadRules(sb);
  let q = sb.from("ctrader_accounts").select("*").eq("active", true).order("last_synced_at", { ascending: true, nullsFirst: true });
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: accounts, error } = await q;
  if (error) throw error;
  let ok = 0, failed = 0, skipped = 0;
  const queue = [...((accounts || []) as Account[])];
  const one = async (acc: Account) => {
    try {
      let initial = acc.initial_balance;
      if (acc.status === "active" || initial == null) ({ initial } = await pullDeals(sb, acc));
      const out = await recompute(sb, acc, rules, Number(initial));
      await notify(sb, acc, out);
      const L = out.res.days[out.res.days.length - 1];
      ok++; log(`ok  ${acc.ctid_trader_account_id} ${out.res.status} ${out.res.days.length}d total=${L?.total_pct ?? 0}% dd=${L?.dd_pct ?? 0}% start=${initial}`);
    } catch (e: any) {
      failed++; log(`err ${acc.ctid_trader_account_id}: ${e.message}`);
      await sb.from("ctrader_accounts").update({ sync_error: String(e.message).slice(0, 300), last_synced_at: new Date().toISOString() }).eq("id", acc.id);
    }
  };
  // Несколько счетов параллельно: у каждого своё соединение с cTrader и свой лимит запросов
  const workers = Array.from({ length: Math.max(1, opts.concurrency || 1) }, async () => {
    for (let acc = queue.shift(); acc; acc = queue.shift()) {
      if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) { skipped++; continue; }
      await one(acc);
    }
  });
  await Promise.all(workers);
  if (!opts.budgetMs || Date.now() - t0 < opts.budgetMs) await syncChain(sb, log).catch(e => log("chain: " + e.message));
  return { ok, failed, skipped };
}

/** On-chain: USDC-переводы между кошельком трейдера и адресами FundedHive (необязательно). */
async function syncChain(sb: SupabaseClient, log: (s: string) => void) {
  const key = process.env.ETHERSCAN_API_KEY, firm = (process.env.FUNDEDHIVE_ADDRESSES || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (!key || !firm.length) return;
  const chain = process.env.CHAIN_ID || "1";
  const usdc = process.env.USDC_CONTRACT || "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const { data: people } = await sb.from("profiles").select("id,wallet").not("wallet", "is", null);
  for (const p of people || []) {
    const u = `https://api.etherscan.io/v2/api?chainid=${chain}&module=account&action=tokentx&contractaddress=${usdc}&address=${p.wallet}&sort=asc&apikey=${key}`;
    const j = await (await fetch(u)).json();
    if (!Array.isArray(j.result)) continue;
    const rows = j.result
      .filter((t: any) => firm.includes(t.from.toLowerCase()) || firm.includes(t.to.toLowerCase()))
      .map((t: any) => ({
        tx_hash: t.hash, user_id: p.id, kind: firm.includes(t.to.toLowerCase()) ? "pay" : "payout",
        amount: Number(t.value) / Math.pow(10, Number(t.tokenDecimal || 6)), ts: new Date(Number(t.timeStamp) * 1000).toISOString(),
      }));
    if (rows.length) await sb.from("chain_events").upsert(rows, { onConflict: "tx_hash" });
    await new Promise(r => setTimeout(r, 250)); // лимит Etherscan
  }
  log(`chain: ${people?.length || 0} кошельков`);
}
