import { requireAdmin } from "@/lib/supabase";
import { assignTeams, createTeam, deleteTeam, updateTeam } from "@/app/actions";
import ConfirmDelete from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = { created: "Команда создана", saved: "Изменения сохранены", deleted: "Команда удалена, её участники теперь без команды", assigned: "Состав команд сохранён" };

export default async function Teams({ searchParams }: { searchParams: { ok?: string; e?: string } }) {
  const { sb } = await requireAdmin();
  const [{ data: teams, error }, { data: people }] = await Promise.all([
    sb.from("teams").select("id,name,curator").order("name"),
    sb.from("profiles").select("id,name,email,team_id,role").or("role.eq.trader,is_trader.eq.true").order("name"),
  ]);
  if (error) return (
    <div className="head"><div><h1>Команды</h1><p className="sub">Таблица команд ещё не создана. Выполните миграцию <span className="mono">supabase/migrations/004_teams.sql</span> в Supabase → SQL Editor и обновите страницу.</p></div></div>
  );
  const T = teams || [], P = people || [];
  const count = (id: number | null) => P.filter(p => (p.team_id ?? null) === id).length;
  return (
    <>
      <div className="head"><div><h1>Команды</h1><p className="sub">Команды кураторов для сводки и сравнения. Один трейдер — одна команда.</p></div></div>
      {searchParams.ok && <div className="w l-green notice">{OK[searchParams.ok] || "Готово"}</div>}
      {searchParams.e && <div className="w l-red notice">Укажите название команды.</div>}

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Состав команд</h2><span className="fine">{P.length} трейдеров · без команды {count(null)}</span></div>
          {T.length ? (
            <form action={assignTeams} style={{ display: "grid", gap: 14 }}>
              <div className="tablewrap"><table style={{ minWidth: 0 }}>
                <thead><tr><th>Трейдер</th><th>Команда</th></tr></thead>
                <tbody>{P.map(p => (
                  <tr key={p.id} style={{ cursor: "default" }}>
                    <td className="who"><b>{p.name || "Без имени"}</b><span>{p.email}</span></td>
                    <td><select className="sel" name={`t_${p.id}`} id={`t_${p.id}`} defaultValue={p.team_id ?? ""} aria-label={`Команда для ${p.name}`}>
                      <option value="">— без команды —</option>
                      {T.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select></td>
                  </tr>))}
                  {!P.length && <tr><td colSpan={2} className="fine">Трейдеров пока нет.</td></tr>}</tbody>
              </table></div>
              <button className="btn" type="submit">Сохранить состав</button>
            </form>
          ) : <p className="fine">Сначала создайте хотя бы одну команду справа.</p>}
        </section>

        <div style={{ display: "grid", gap: 20, alignContent: "start", minWidth: 0 }}>
          <section className="panel">
            <div className="ph"><h2>Новая команда</h2></div>
            <form action={createTeam} style={{ display: "grid", gap: 12 }}>
              <label className="field" htmlFor="nt-name">Название<input id="nt-name" name="name" placeholder="Команда Андрея" required maxLength={60} /></label>
              <label className="field" htmlFor="nt-cur">Куратор<input id="nt-cur" name="curator" placeholder="Андрей К." maxLength={60} /></label>
              <button className="btn" type="submit">Создать</button>
            </form>
          </section>
          {T.map(t => (
            <section className="panel" key={t.id}>
              <div className="ph"><h2>{t.name}</h2><span className="count">{count(t.id)} чел.</span></div>
              <form action={updateTeam} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="id" value={t.id} />
                <label className="field" htmlFor={`tn-${t.id}`}>Название<input id={`tn-${t.id}`} name="name" defaultValue={t.name} required maxLength={60} /></label>
                <label className="field" htmlFor={`tc-${t.id}`}>Куратор<input id={`tc-${t.id}`} name="curator" defaultValue={t.curator || ""} maxLength={60} /></label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn ghost" type="submit">Сохранить</button><ConfirmDelete id={t.id} name={t.name} action={deleteTeam} /></div>
              </form>
            </section>))}
        </div>
      </div>
    </>
  );
}
