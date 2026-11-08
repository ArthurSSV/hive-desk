import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { serviceClient, userClient } from "@/lib/supabase";
import { CTraderConnection, exchangeCode } from "@/lib/ctrader";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const base = new URL(req.url).origin;
  const fail = (msg: string) => NextResponse.redirect(`${base}/connect?error=${encodeURIComponent(msg)}`);
  const { data: { user } } = await userClient().auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = cookies().get("ct_state")?.value || "";
  cookies().delete("ct_state");
  const [savedState, savedUser] = [saved.slice(0, saved.indexOf(".")), saved.slice(saved.indexOf(".") + 1)];
  if (!code) return fail(req.nextUrl.searchParams.get("error_description") || "cTrader не вернул код доступа");
  // cTrader может не возвращать state — тогда защищает метка в cookie: её ставит только наш сайт и только этому пользователю
  if (!saved || savedUser !== user.id || (state && state !== savedState))
    return fail("Подключение не завершилось: начните его кнопкой ниже на этой странице и не закрывайте вкладку");

  try {
    const tok = await exchangeCode(code, `${base}/api/ctrader/callback`);
    const sb = serviceClient();
    await sb.from("ctrader_tokens").upsert({
      user_id: user.id, access_token: tok.accessToken, refresh_token: tok.refreshToken,
      expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(), updated_at: new Date().toISOString(),
    });

    // Список счетов под этим cTrader ID (запрос можно делать через любой сервер)
    const c = await new CTraderConnection(false).open();
    let list;
    try { await c.appAuth(); list = await c.accounts(tok.accessToken); } finally { c.close(); }
    if (!list.length) return fail("Под этим cTrader ID нет доступных счетов");

    for (const a of list) {
      const { data: existing } = await sb.from("ctrader_accounts").select("id,user_id").eq("ctid_trader_account_id", a.ctidTraderAccountId).maybeSingle();
      if (existing && existing.user_id !== user.id) continue; // счёт уже привязан к другому трейдеру
      if (existing) await sb.from("ctrader_accounts").update({ trader_login: a.traderLogin ?? null, broker_name: a.brokerTitleShort ?? null, is_live: !!a.isLive }).eq("id", existing.id);
      else await sb.from("ctrader_accounts").insert({
        user_id: user.id, ctid_trader_account_id: a.ctidTraderAccountId, trader_login: a.traderLogin ?? null,
        broker_name: a.brokerTitleShort ?? null, is_live: !!a.isLive, active: false,
      });
    }
    return NextResponse.redirect(`${base}/connect?step=choose`);
  } catch (e: any) {
    return fail(e.message || "Не удалось подключить cTrader");
  }
}
