import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase";
import { traderBundle } from "@/lib/data";
import TraderView from "@/components/TraderView";
import ConfirmRemove from "@/components/ConfirmRemove";
import { adminAccountAction, confirmAccount, sendPasswordReset, syncUser } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";
import { PHASE_LABEL } from "@/lib/rules";
import { usd } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TraderCard({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const { sb } = await requireAdmin();
  const b = await traderBundle(sb, params.id);
  if (!b.profile) notFound();
  return (
    <>
      <div className="head"><Link href="/admin" className="fine">← Вся группа</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><form action={syncUser}><input type="hidden" name="user" value={params.id} /><button className="btn ghost" type="submit">Синхронизировать сейчас</button></form>
        <form action={sendPasswordReset}><input type="hidden" name="user" value={params.id} /><button className="btn ghost" type="submit" title={`Письмо уйдёт на ${b.profile.email}`}>Отправить ссылку для сброса пароля</button></form></div></div>
      {searchParams.ok === "reset" && <div className="w l-green notice">Письмо со ссылкой для нового пароля отправлено на {b.profile.email}. Ссылка действует 1 час.</div>}
      {searchParams.e === "reset" && <div className="w l-red notice">Не удалось отправить письмо. Возможно, лимит писем: подождите минуту и попробуйте снова.</div>}
      {searchParams.ok === "account" && <div className="w l-green notice">Счёт подтверждён, статистика пересчитана.</div>}
      {searchParams.e === "account" && <div className="w l-red notice">Укажите этап и начальный баланс не меньше $100.</div>}
      {b.acc && (
        <section className="panel">
          <div className="ph"><h2>Счёт челленджа</h2>{b.acc.balance_locked ? <span className="pill l-green"><span className="dot" />Подтверждён</span> : <span className="pill l-yellow"><span className="dot" />Ждёт подтверждения</span>}</div>
          <form action={confirmAccount} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <input type="hidden" name="id" value={b.acc.id} /><input type="hidden" name="user" value={params.id} />
            <label className="field" htmlFor="ca-phase">Этап<select id="ca-phase" name="phase" defaultValue={b.acc.phase}><option value="1">Фаза 1</option><option value="2">Фаза 2</option><option value="3">Funded</option></select></label>
            <label className="field" htmlFor="ca-init">Начальный баланс, $<input id="ca-init" name="initial" type="number" min="100" step="1" defaultValue={b.acc.initial_balance ?? ""} required /></label>
            <button className="btn" type="submit">{b.acc.balance_locked ? "Сохранить" : "Подтвердить"}</button>
            {b.acc.balance_locked && <button className="btn ghost" type="submit" name="lock" value="0">Разрешить трейдеру менять</button>}
          </form>
          <p className="fine" style={{ marginTop: 10 }}>{b.acc.balance != null ? <>Текущий баланс в cTrader: <b className="mono" style={{ color: "var(--gold2)" }}>{usd(b.acc.balance)}</b> · </> : null}Сверьте с Account Size в кабинете FundedHive. После подтверждения трейдер не может изменить этап и баланс.</p>
        </section>)}
      {["remove", "reject"].includes(searchParams.ok || "") && <div className="w l-green notice">{searchParams.ok === "remove" ? "Счёт удалён вместе с историей." : "Запрос на удаление отклонён."}</div>}
      {b.accounts.some(a => !a.removed) && (
        <section className="panel">
          <div className="ph"><h2>Счета трейдера</h2><span className="fine">{b.accounts.filter(a => !a.removed).length} подключено</span></div>
          <div style={{ display: "grid", gap: 10 }}>{b.accounts.filter(a => !a.removed).map(a => (
            <div className="acc" key={a.id}>
              <div style={{ minWidth: 0 }}>
                <b>#{a.trader_login || a.ctid_trader_account_id}</b> <span className="fine">{a.broker_name || ""} · {a.is_live ? "live" : "demo"}{a.balance != null ? ` · баланс ${usd(a.balance)}` : ""}</span>
                <div className="fine">{a.active ? <span className="ok">Отслеживается · {PHASE_LABEL[a.phase]}</span> : "Не отслеживается"}</div>
                {a.delete_requested_at && <div className="fine" style={{ color: "var(--amber)" }}>⚠ Трейдер просит удалить счёт · {new Date(a.delete_requested_at).toLocaleString("ru-RU", { timeZone: "Europe/Kiev", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
              <form action={adminAccountAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="user" value={params.id} />
                <ConfirmButton name="act" value="remove" label={a.delete_requested_at ? "Подтвердить удаление" : "Удалить"} question="Удалить счёт и всю его историю сделок?" />
                {a.delete_requested_at && <button className="btn ghost" type="submit" name="act" value="reject">Отклонить</button>}
              </form>
            </div>))}</div>
          <p className="fine" style={{ marginTop: 10 }}>Удалённый счёт пропадает вместе с историей. Если трейдер снова подключит его через cTrader, он появится как новый и будет ждать подтверждения баланса.</p>
        </section>)}
      <TraderView b={b} mode="admin" />
      <section className="panel"><div className="ph"><h2>Участие в группе</h2></div><ConfirmRemove id={params.id} name={b.profile.name} /></section>
    </>
  );
}
