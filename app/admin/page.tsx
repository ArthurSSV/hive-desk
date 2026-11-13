import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/supabase";
import { groupBundle } from "@/lib/data";
import { TempChart, PhaseTag } from "@/components/ui";
import AdminTable, { type Row } from "@/components/AdminTable";
import CopyReport from "@/components/CopyReport";
import { LEVEL_LABEL } from "@/lib/rules";
import { viewerTz } from "@/lib/tz";

export const dynamic = "force-dynamic";

const plural = (n: number) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? "трейдер" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "трейдера" : "трейдеров"}`; };

export default async function Admin() {
  const { sb } = await requireAdmin();
  const site = `https://${headers().get("host")}`;
  const { data: st } = await sb.from("settings").select("invite_code").eq("id", 1).single();
  const invite = (st as any)?.invite_code as string | null;
  const { data: reqs } = await sb.from("ctrader_accounts").select("user_id,trader_login,ctid_trader_account_id").not("delete_requested_at", "is", null).eq("removed", false);
  const regLink = `${site}/register${invite ? `?code=${encodeURIComponent(invite)}` : ""}`;
  const { traders: T, teams, temp, rules: R } = await groupBundle(sb);
  const nameOf = new Map(T.map(t => [t.p.id, t.p.name]));
  const teamName = new Map(teams.map(t => [t.id, t.name]));
  const withAcc = T.filter(t => t.acc);
  const c = (f: (t: (typeof T)[number]) => boolean) => T.filter(f).length;
  const p1 = c(t => t.acc?.phase === 1 && t.acc.status !== "failed"), p2 = c(t => t.acc?.phase === 2 && t.acc.status !== "failed");
  const funded = c(t => t.acc?.phase === 3 && t.acc.status !== "failed"), failed = c(t => t.acc?.status === "failed"), noAcc = c(t => !t.acc);
  const live = withAcc.filter(t => t.acc!.status !== "failed");
  const red = live.filter(t => t.level === "red").length, yel = live.filter(t => t.level === "yellow").length, near = live.filter(t => t.level === "green").length;
  const avgDD = live.length ? live.reduce((a, t) => a + t.m.curDD, 0) / live.length : 0;
  const fresh = T.filter(t => t.fresh).length;
  const W: Record<string, number> = { red: 3, yellow: 2 };
  const urgent = (t: (typeof T)[number]) => t.flags.some(f => f.lv === "red");
  const alerts = live.filter(t => t.level === "red" || t.level === "yellow" || urgent(t)).sort((a, b) => (W[b.level] || 0) - (W[a.level] || 0) || Number(urgent(b)) - Number(urgent(a)) || a.m.total - b.m.total);
  const lastSync = withAcc.map(t => t.acc!.last_synced_at).filter(Boolean).sort().pop();
  const dist: [number, string, string][] = [[p1, "var(--muted)", "Фаза 1"], [p2, "var(--hive)", "Фаза 2"], [funded, "var(--green)", "Funded"], [failed, "var(--red)", "Труп"], [noAcc, "var(--line)", "Без счёта"]];

  const rows: Row[] = T.map(t => ({
    id: t.p.id, name: t.p.name, email: t.p.email, isAdmin: t.p.role === "admin", unconfirmed: !!t.acc && !t.acc.balance_locked, team: t.p.team_id ? teamName.get(t.p.team_id) ?? null : null, fresh: t.fresh, level: t.level, phase: t.acc?.phase ?? null, status: t.acc?.status ?? null,
    size: t.acc?.initial_balance ?? null, total: t.m.total, today: t.m.today, maxDD: t.m.maxDD, days: t.m.profitDays, trades: t.m.todayTrades,
    avgTrades: t.m.avgTrades, mood: t.m.mood, flags: t.flags.map(f => f.t).join(" · "), target: t.acc?.phase === 1 ? R.p1 : t.acc?.phase === 2 ? R.p2 : null,
  }));

  if (!T.length) return (
    <div className="head"><div><h1>Группа пуста</h1><p className="sub">Трейдеры появятся здесь автоматически, как только зарегистрируются по ссылке <span className="mono">{regLink}</span> и подключат cTrader.</p></div></div>
  );

  return (
    <>
      <div className="head"><div>
        <div className="titlerow"><h1>Группа челленджа</h1><span className="count">{plural(T.length)}{fresh ? <small>+{fresh} сегодня</small> : null}</span></div>
        <p className="sub">Classic 2-step · {lastSync ? `данные cTrader на ${new Date(lastSync).toLocaleString("ru-RU", { timeZone: viewerTz(), day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : "ждём первую синхронизацию"} · ссылка для регистрации: <span className="mono">{regLink}</span></p>
      </div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <CopyReport text={regLink} label="Скопировать ссылку для регистрации" ghost />
        {!invite && <span className="fine" style={{ color: "var(--amber)" }}>Код приглашения не задан — зарегистрироваться может любой. Задайте его в «Правилах».</span>}
        {(reqs || []).map(r => <Link key={r.ctid_trader_account_id} href={`/admin/trader/${r.user_id}`} className="fine" style={{ color: "var(--red)" }}>⚠ {nameOf.get(r.user_id) || "Трейдер"} просит удалить счёт #{r.trader_login || r.ctid_trader_account_id}</Link>)}
        {T.some(t => t.acc && !t.acc.balance_locked) && <span className="fine" style={{ color: "var(--amber)" }}>⚠ Ждут подтверждения баланса: {T.filter(t => t.acc && !t.acc.balance_locked).map(t => t.p.name).join(", ")}</span>}
      </div>
      <section className="strip" aria-label="Сводка">
        <div><div className="k">Фаза 1</div><div className="v">{p1}</div></div>
        <div><div className="k">Фаза 2</div><div className="v">{p2}</div></div>
        <div><div className="k">Funded</div><div className="v">{funded}</div></div>
        <div><div className="k">Труп</div><div className="v">{failed} <small>{withAcc.length ? Math.round((failed / withAcc.length) * 100) : 0}%</small></div></div>
        <div><div className="k">Буксир</div><div className="v red">{red}</div><div className="fine">предупр. {yel} · у цели {near}</div></div>
        <div><div className="k">Средняя просадка</div><div className="v">{avgDD.toFixed(1)}<small>%</small></div></div>
      </section>
      <div className="grid2">
        <section className="panel"><div className="ph"><h2>Температура группы</h2><span className="fine">счета по светофору, последние торговые дни</span></div>
          <TempChart rows={temp} />
          <div style={{ marginTop: 14 }}><div className="dist">{dist.map(([n, col], i) => <span key={i} style={{ width: `${(n / T.length) * 100}%`, background: col }} />)}</div>
            <div className="legend">{dist.filter(([n]) => n).map(([n, col, l]) => <span key={l}><i style={{ background: col }} />{l} — {n}</span>)}</div></div>
        </section>
        <section className="panel"><div className="ph"><h2>Требуют внимания</h2><span className="fine">{alerts.length}</span></div>
          <div className="alerts">{alerts.map(t => (
            <Link key={t.p.id} href={`/admin/trader/${t.p.id}`} className={`alert ${t.level === "red" || (t.level !== "yellow" && urgent(t)) ? "red" : "yellow"}`} style={{ textDecoration: "none" }}>
              <div><b>{t.p.name}</b> <PhaseTag phase={t.acc!.phase} status={t.acc!.status} /><div className="why">{LEVEL_LABEL[t.level]} · результат {t.m.total > 0 ? "+" : ""}{t.m.total.toFixed(2)}%{t.flags.length ? " · " + t.flags.map(f => f.t).join(" · ") : ""}</div></div>
            </Link>))}
            {!alerts.length && <p className="fine">Сегодня всё спокойно.</p>}</div>
        </section>
      </div>
      <AdminTable teams={teams.map(t => t.name)} rows={rows} max={R.max} redDD={R.redDD} minDays={R.minDays} />
    </>
  );
}
