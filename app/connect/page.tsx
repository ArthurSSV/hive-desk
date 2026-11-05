import { requireUser } from "@/lib/supabase";
import { activateAccount } from "../actions";
import { PHASE_LABEL } from "@/lib/rules";
import { usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Connect({ searchParams }: { searchParams: { error?: string } }) {
  const { sb, profile } = await requireUser();
  const { data: accounts } = await sb.from("ctrader_accounts").select("*").eq("user_id", profile.id).order("created_at");
  return (
    <div className="auth" style={{ maxWidth: 640 }}>
      <div><h1>Подключение счёта</h1><p className="sub">Доступ только на чтение: мы видим баланс и сделки, но не можем торговать.</p></div>
      {searchParams.error && <div className="w l-red notice">{searchParams.error}</div>}
      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <div className="ph"><h2>cTrader</h2></div>
        <a className="btn" href="/api/ctrader/connect">{accounts?.length ? "Обновить доступ cTrader" : "Войти через cTrader ID"}</a>
        {accounts?.length ? <>
          <p className="fine" style={{ margin: 0 }}>Выберите счёт челленджа, который нужно отслеживать. Начальный баланс — размер счёта, например 50000. Если оставить пустым, он посчитается по истории сделок.</p>
          {accounts.map((a: any) => (
            <div className="acc" key={a.id}>
              <div style={{ minWidth: 0 }}>
                <b>#{a.trader_login || a.ctid_trader_account_id}</b> <span className="fine">{a.broker_name || ""} · {a.is_live ? "live" : "demo"}{a.balance != null ? ` · баланс ${usd(a.balance)}` : ""}</span>
                {a.active && <div className="ok">Отслеживается · {PHASE_LABEL[a.phase]}</div>}
              </div>
              <form action={activateAccount}>
                <input type="hidden" name="id" value={a.id} />
                <label className="field" htmlFor={`ph-${a.id}`}>Этап
                  <select id={`ph-${a.id}`} name="phase" defaultValue={a.phase}><option value="1">Фаза 1</option><option value="2">Фаза 2</option><option value="3">Funded</option></select></label>
                <label className="field" htmlFor={`in-${a.id}`}>Начальный баланс, $
                  <input id={`in-${a.id}`} name="initial" type="number" min="100" step="1" defaultValue={a.initial_balance ?? ""} placeholder="50000" /></label>
                <button className="btn" type="submit">{a.active ? "Сохранить" : "Отслеживать"}</button>
              </form>
            </div>
          ))}
        </> : null}
      </section>
      {accounts?.some((a: any) => a.active) && <a className="btn ghost" href="/dashboard">Перейти в кабинет</a>}
    </div>
  );
}
