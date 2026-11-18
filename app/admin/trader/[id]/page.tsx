import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase";
import { traderBundle } from "@/lib/data";
import TraderView from "@/components/TraderView";
import ConfirmRemove from "@/components/ConfirmRemove";
import SyncButton from "@/components/SyncButton";
import { adminAccountAction, confirmAccount, sendPasswordReset, syncUser } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";
import { PHASE_LABEL } from "@/lib/rules";
import { usd } from "@/components/ui";
import { viewerTz } from "@/lib/tz";

export const dynamic = "force-dynamic";

export default async function TraderCard({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const { sb } = await requireAdmin();
  const b = await traderBundle(sb, params.id, { archive: true });
  if (!b.profile) notFound();
  return (
    <>
      <div className="head"><Link href="/admin" className="fine">← Вся группа</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><SyncButton action={syncUser} user={params.id} label="Синхронизировать сейчас" />
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
          <form action={adminAccountAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <input type="hidden" name="id" value={b.acc.id} /><input type="hidden" name="user" value={params.id} />
            {b.acc.manual_failed
              ? <><span className="pill l-failed"><span className="dot" />Отмечен Failed вручную</span><button className="btn ghost" type="submit" name="act" value="unfail">Снять отметку</button></>
              : <ConfirmButton name="act" value="fail" label="Отметить Failed" question="Проп закрыл этот счёт? Статус станет Failed." yes="Да, отметить" />}
            <span className="fine">Для случаев, когда проп закрыл счёт по причине, которую не видно по цифрам. Отметку можно снять.</span>
          </form>
          <p className="fine" style={{ marginTop: 10 }}>{b.acc.balance != null ? <>Текущий баланс в cTrader: <b className="mono" style={{ color: "var(--gold2)" }}>{usd(b.acc.balance)}</b> · </> : null}Сверьте с Account Size в кабинете FundedHive. После подтверждения трейдер не может изменить этап и баланс.</p>
        </section>)}
      {searchParams.e === "migrate" && <div className="w l-red notice">Сначала выполните в Supabase SQL из файла supabase/migrations/011_manual_failed.sql.</div>}
      {["fail", "unfail"].includes(searchParams.ok || "") && <div className="w l-green notice">{searchParams.ok === "fail" ? "Счёт отмечен как Failed." : "Ручная отметка Failed снята."}</div>}
      {searchParams.e === "migrate14" && <div className="w l-red notice">Сначала выполните в Supabase SQL из файла supabase/migrations/014_archive.sql.</div>}
      {["archive", "unarchive"].includes(searchParams.ok || "") && <div className="w l-green notice">{searchParams.ok === "archive" ? "Счёт перенесён в архив. Его история остаётся в прошлых днях «Сводки»." : "Счёт возвращён из архива и снова отслеживается."}</div>}
      {b.acc && (b.acc as any).archived && <div className="w l-yellow notice">Счёт #{b.acc.trader_login || b.acc.ctid_trader_account_id} в архиве: не синхронизируется и не показывается в «Группе». Ниже — его история.</div>}
      {["remove", "reject"].includes(searchParams.ok || "") && <div className="w l-green notice">{searchParams.ok === "remove" ? "Счёт удалён вместе с историей." : "Запрос на удаление отклонён."}</div>}
      {b.accounts.some(a => !a.removed) && (
        <section className="panel">
          <div className="ph"><h2>Счета трейдера</h2><span className="fine">{b.accounts.filter(a => !a.removed).length} подключено</span></div>
          <div style={{ display: "grid", gap: 10 }}>{b.accounts.filter(a => !a.removed).map(a => (
            <div className="acc" key={a.id}>
              <div style={{ minWidth: 0 }}>
                <b>#{a.trader_login || a.ctid_trader_account_id}</b> <span className="fine">{a.broker_name || ""} · {a.is_live ? "live" : "demo"}{a.balance != null ? ` · баланс ${usd(a.balance)}` : ""}</span>
                <div className="fine">{(a as any).archived ? <span style={{ color: "var(--amber)" }}>В архиве · {PHASE_LABEL[a.phase]}{a.status === "failed" ? " · Failed" : ""}</span> : a.active ? <span className="ok">Отслеживается · {PHASE_LABEL[a.phase]}</span> : "Не отслеживается"}</div>
                {a.delete_requested_at && <div className="fine" style={{ color: "var(--amber)" }}>⚠ Трейдер просит удалить счёт · {new Date(a.delete_requested_at).toLocaleString("ru-RU", { timeZone: viewerTz(), day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>}
              </div>
              <form action={adminAccountAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="user" value={params.id} />
                {(a as any).archived
                  ? <button className="btn ghost" type="submit" name="act" value="unarchive">Вернуть из архива</button>
                  : <ConfirmButton name="act" value="archive" label="В архив" question="Перенести счёт в архив? Синхронизация остановится, история сохранится." yes="Да, в архив" />}
                <ConfirmButton name="act" value="remove" label={a.delete_requested_at ? "Подтвердить удаление" : "Удалить"} question="Удалить счёт и всю его историю сделок?" />
                {a.delete_requested_at && <button className="btn ghost" type="submit" name="act" value="reject">Отклонить</button>}
              </form>
            </div>))}</div>
          <p className="fine" style={{ marginTop: 10 }}>Выбывший счёт отправляйте в архив: он уйдёт из «Группы», а его результаты останутся в прошлых днях «Сводки». Удаление — только для ошибочно подключённых счетов: удалённый счёт пропадает вместе с историей. Если трейдер снова подключит его через cTrader, он появится как новый и будет ждать подтверждения баланса.</p>
        </section>)}
      <TraderView b={b} mode="admin" />
      <section className="panel"><div className="ph"><h2>Участие в группе</h2></div><ConfirmRemove id={params.id} name={b.profile.name} /></section>
    </>
  );
}
