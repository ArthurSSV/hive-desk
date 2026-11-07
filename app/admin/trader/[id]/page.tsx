import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase";
import { traderBundle } from "@/lib/data";
import TraderView from "@/components/TraderView";
import ConfirmRemove from "@/components/ConfirmRemove";
import { confirmAccount, syncUser } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TraderCard({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const { sb } = await requireAdmin();
  const b = await traderBundle(sb, params.id);
  if (!b.profile) notFound();
  return (
    <>
      <div className="head"><Link href="/admin" className="fine">← Вся группа</Link>
        <form action={syncUser}><input type="hidden" name="user" value={params.id} /><button className="btn ghost" type="submit">Синхронизировать сейчас</button></form></div>
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
          <p className="fine" style={{ marginTop: 10 }}>Сверьте с Account Size в кабинете FundedHive. После подтверждения трейдер не может изменить этап и баланс.</p>
        </section>)}
      <TraderView b={b} mode="admin" />
      <section className="panel"><div className="ph"><h2>Участие в группе</h2></div><ConfirmRemove id={params.id} name={b.profile.name} /></section>
    </>
  );
}
