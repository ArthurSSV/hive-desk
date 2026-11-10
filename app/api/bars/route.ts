import { NextResponse, type NextRequest } from "next/server";
import { serviceClient, userClient } from "@/lib/supabase";
import { openAccount } from "@/lib/sync";
import { buildPositions, chartWindow, barsInWindow, TF, type RawDeal } from "@/lib/equity";

export const maxDuration = 30;

// Свечи по позиции для графика сделки. Права проверяет RLS: свои сделки или админ.
// Без tf (или tf совпадает с сохранённым) — свечи из базы; другой таймфрейм — по запросу из cTrader.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const acc = Number(q.get("acc")), pos = Number(q.get("pos")), tf = q.get("tf") || "";
  if (!acc || !pos || (tf && !TF[tf])) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { data, error } = await userClient().from("position_bars").select("symbol,period,bars").eq("account_id", acc).eq("position_id", pos).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!tf || tf === data.period) return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=300" } });

  // Доступ подтверждён строкой выше (RLS). Дальше — сервисный клиент: токен cTrader трейдера.
  const sb = serviceClient();
  const [{ data: a }, { data: deals }] = await Promise.all([
    sb.from("ctrader_accounts").select("user_id,is_live,ctid_trader_account_id").eq("id", acc).single(),
    sb.from("deals").select("position_id,symbol_id,symbol,side,volume,exec_ts,is_close,price,entry_price,conv,net_profit").eq("account_id", acc).eq("position_id", pos),
  ]);
  const p = buildPositions((deals || []) as RawDeal[])[0];
  if (!a || !p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (barsInWindow(p.openMs, p.closeMs, tf) > 3000) return NextResponse.json({ error: "Сделка слишком длинная для этого таймфрейма" }, { status: 400 });
  const w = chartWindow(p, Date.now(), tf);
  let c;
  try {
    c = await openAccount(sb, a);
    const bars = await c.trendbars(a.ctid_trader_account_id, p.symbolId, w.period, Math.floor(w.from), Math.floor(w.to));
    const full = p.closeMs != null && w.to >= w.end + w.pad - 1;
    return NextResponse.json({ symbol: data.symbol, period: w.label, bars }, { headers: { "Cache-Control": `private, max-age=${full ? 86400 : 60}` } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "cTrader недоступен" }, { status: 502 });
  } finally { c?.close(); }
}
