// Минимальный клиент cTrader Open API (JSON поверх WebSocket, порт 5036).
// Только чтение: аккаунты, баланс, история сделок.

export const PT = {
  HEARTBEAT: 51,
  ERROR: 50,
  APP_AUTH_REQ: 2100, APP_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102, ACCOUNT_AUTH_RES: 2103,
  TRADER_REQ: 2121, TRADER_RES: 2122,
  DEAL_LIST_REQ: 2133, DEAL_LIST_RES: 2134,
  OA_ERROR: 2142,
  ACCOUNTS_BY_TOKEN_REQ: 2149, ACCOUNTS_BY_TOKEN_RES: 2150,
} as const;

const AUTH_URL = process.env.CTRADER_AUTH_URL || "https://connect.spotware.com/apps/auth";
const TOKEN_URL = process.env.CTRADER_TOKEN_URL || "https://connect.spotware.com/apps/token";

export function authorizeUrl(redirectUri: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.CTRADER_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "accounts");
  u.searchParams.set("state", state);
  return u.toString();
}

export type TokenSet = { accessToken: string; refreshToken: string; expiresIn: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const u = new URL(TOKEN_URL);
  for (const [k, v] of Object.entries({ ...params, client_id: process.env.CTRADER_CLIENT_ID!, client_secret: process.env.CTRADER_CLIENT_SECRET! })) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { Accept: "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.accessToken) throw new Error(`cTrader token error: ${j.description || j.errorCode || res.status}`);
  return { accessToken: j.accessToken, refreshToken: j.refreshToken, expiresIn: Number(j.expiresIn || 2628000) };
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
export const refreshToken = (refresh: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });

type Msg = { clientMsgId?: string; payloadType: number; payload?: any };

export class CTraderConnection {
  private ws!: WebSocket;
  private seq = 0;
  private pending = new Map<string, { resolve: (m: Msg) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private hb?: ReturnType<typeof setInterval>;

  constructor(private live: boolean) {}

  async open() {
    const host = this.live ? "live.ctraderapi.com" : "demo.ctraderapi.com";
    this.ws = new WebSocket(`wss://${host}:5036`);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`cTrader: нет соединения с ${host}`)), 15000);
      this.ws.onopen = () => { clearTimeout(t); resolve(); };
      this.ws.onerror = () => { clearTimeout(t); reject(new Error(`cTrader: ошибка соединения с ${host}`)); };
    });
    this.ws.onmessage = ev => {
      let m: Msg;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)); } catch { return; }
      if (!m.clientMsgId) return;
      const p = this.pending.get(m.clientMsgId);
      if (!p) return;
      this.pending.delete(m.clientMsgId);
      clearTimeout(p.timer);
      if (m.payloadType === PT.OA_ERROR || m.payloadType === PT.ERROR) p.reject(new Error(`cTrader ${m.payload?.errorCode}: ${m.payload?.description || ""}`));
      else p.resolve(m);
    };
    this.ws.onclose = () => { for (const p of this.pending.values()) p.reject(new Error("cTrader: соединение закрыто")); this.pending.clear(); };
    this.hb = setInterval(() => { try { this.ws.send(JSON.stringify({ payloadType: PT.HEARTBEAT, payload: {} })); } catch {} }, 10000);
    return this;
  }

  close() { if (this.hb) clearInterval(this.hb); try { this.ws.close(); } catch {} }

  request(payloadType: number, payload: any, expect: number): Promise<any> {
    const clientMsgId = `m${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(clientMsgId); reject(new Error(`cTrader: таймаут запроса ${payloadType}`)); }, 20000);
      this.pending.set(clientMsgId, {
        resolve: m => (m.payloadType === expect ? resolve(m.payload) : reject(new Error(`cTrader: неожиданный ответ ${m.payloadType}`))),
        reject, timer,
      });
      this.ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
    });
  }

  appAuth() {
    return this.request(PT.APP_AUTH_REQ, { clientId: process.env.CTRADER_CLIENT_ID, clientSecret: process.env.CTRADER_CLIENT_SECRET }, PT.APP_AUTH_RES);
  }
  async accounts(accessToken: string): Promise<{ ctidTraderAccountId: number; isLive: boolean; traderLogin?: number; brokerTitleShort?: string }[]> {
    const r = await this.request(PT.ACCOUNTS_BY_TOKEN_REQ, { accessToken }, PT.ACCOUNTS_BY_TOKEN_RES);
    return r.ctidTraderAccount || [];
  }
  accountAuth(ctid: number, accessToken: string) {
    return this.request(PT.ACCOUNT_AUTH_REQ, { ctidTraderAccountId: ctid, accessToken }, PT.ACCOUNT_AUTH_RES);
  }
  async trader(ctid: number): Promise<{ balance: number; moneyDigits?: number; brokerName?: string; traderLogin?: number }> {
    const r = await this.request(PT.TRADER_REQ, { ctidTraderAccountId: ctid }, PT.TRADER_RES);
    return r.trader;
  }
  /** История сделок; cTrader отдаёт максимум неделю за запрос, поэтому идём окнами. */
  async deals(ctid: number, fromMs: number, toMs: number): Promise<any[]> {
    const WEEK = 7 * 24 * 3600 * 1000;
    const out: any[] = [];
    for (let a = fromMs; a < toMs; a += WEEK) {
      const b = Math.min(a + WEEK, toMs);
      const r = await this.limited(() => this.request(PT.DEAL_LIST_REQ, { ctidTraderAccountId: ctid, fromTimestamp: a, toTimestamp: b, maxRows: 5000 }, PT.DEAL_LIST_RES));
      out.push(...(r.deal || []));
    }
    return out;
  }

  /** Исторические запросы cTrader ограничены ~5 в секунду: держим паузу и повторяем при лимите. */
  private lastHist = 0;
  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastHist + 400 - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastHist = Date.now();
      try { return await fn(); }
      catch (e: any) {
        if (attempt < 4 && /BLOCKED_PAYLOAD_TYPE|rate limit/i.test(e.message)) { await sleep(1500 * (attempt + 1)); continue; }
        throw e;
      }
    }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const money = (v: any, md: number) => (Number(v || 0) / Math.pow(10, md));

/** Приводит сделку cTrader к строке таблицы deals. */
export function mapDeal(d: any, traderMoneyDigits: number) {
  const md = d.moneyDigits ?? traderMoneyDigits ?? 2;
  const cp = d.closePositionDetail;
  const isClose = !!cp;
  const cmd = cp?.moneyDigits ?? md;
  const net = isClose ? money(cp.grossProfit, cmd) + money(cp.swap, cmd) + money(cp.commission, cmd) : money(d.commission, md);
  return {
    deal_id: Number(d.dealId),
    position_id: d.positionId != null ? Number(d.positionId) : null,
    symbol_id: d.symbolId != null ? Number(d.symbolId) : null,
    side: d.tradeSide === 1 || d.tradeSide === "BUY" ? "buy" : "sell",
    volume: d.volume != null ? Number(d.volume) : null,
    exec_ts: new Date(Number(d.executionTimestamp || d.createTimestamp)).toISOString(),
    is_close: isClose,
    net_profit: Math.round(net * 100) / 100,
    balance_after: isClose && cp.balance != null ? money(cp.balance, cmd) : null,
    status: d.dealStatus,
  };
}
