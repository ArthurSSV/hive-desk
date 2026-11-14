import Link from "next/link";
import { dayKey, nextDayStart, isLateEntry, journalDays } from "@/lib/engine";
import type { traderBundle } from "@/lib/data";
import { saveJournal, syncMe } from "@/app/actions";
import { Gauge, PhaseTag, Pill, cls, fmtD, sg, usd } from "./ui";
import DealsHistory from "./DealsHistory";
import EquityCurve from "./EquityCurve";
import { ACCESS_LABEL } from "@/lib/access";
import { viewerTz, tzLabel } from "@/lib/tz";

type B = Awaited<ReturnType<typeof traderBundle>>;

const usd2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TraderView({ b, mode, journalDay, journalSaved, journalError }: { b: B; mode: "self" | "admin"; journalDay?: string; journalSaved?: boolean; journalError?: boolean }) {
  const { acc, days, m, rules: R, profile, journal, chain } = b;
  const self = mode === "self";
  if (!acc) return (
    <div className="panel" style={{ display: "grid", gap: 12 }}>
      <h1>{self ? "Подключите счёт cTrader" : `${profile?.name || "Трейдер"}: счёт не подключён`}</h1>
      <p className="sub">{self ? "Без подключения мы не видим сделки и не можем считать прогресс." : "Трейдер зарегистрировался, но ещё не выбрал счёт для отслеживания."}</p>
      {self && <Link className="btn" href="/connect">Подключить cTrader</Link>}
    </div>
  );
  const init = Number(acc.initial_balance || 0);
  const target = acc.phase === 1 ? R.p1 : acc.phase === 2 ? R.p2 : null;
  const failed = acc.status === "failed";
  const last: any = days[days.length - 1];
  const level = failed ? "failed" : last?.level || "work";
  const leftDaily = R.daily - m.todayLoss, leftMax = R.max - m.maxDD;
  // Дневной лимит как у FundedHive: от баланса на начало дня
  const minBal = m.dayStart * (1 - R.daily / 100), remaining = Math.max(0, m.balanceNow - minBal);
  const floor = init * (1 - R.max / 100), lowEq = m.lowestEq ?? init;
  const shortDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const lowAt = m.lowestEq != null && m.lowestEq < init ? (m.lowestEqAt ? shortDay(m.lowestEqAt) : null) : acc.created_at ? "старт " + shortDay(String(acc.created_at).slice(0, 10)) : null;
  const access = acc.access_rights || "full";
  const vtz = viewerTz(), resetAt = nextDayStart(R.tz);
  const reset = resetAt.toLocaleString("ru-RU", { timeZone: vtz, hour: "2-digit", minute: "2-digit" }) + " " + tzLabel(vtz, resetAt);
  const worstAt = m.worstDayLossAt ? new Date(m.worstDayLossAt + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
  const warns: { lv: string; t: string }[] = [];
  if (failed) warns.push({ lv: "failed", t: acc.manual_failed ? "Счёт закрыт пропом (отмечено админом)." : access !== "full" ? "Счёт закрыт: проп отключил торговлю в cTrader." : "Счёт закрыт по нарушению лимита." });
  else if (acc.status === "passed") warns.push({ lv: "green", t: "Цель фазы выполнена. Когда получите новый счёт, подключите его на странице подключения." });
  else {
    if (leftDaily <= 2) warns.push({ lv: "red", t: `До дневного лимита осталось ${leftDaily.toFixed(1)}%. Лучше закончить день.` });
    if (leftMax <= 4) warns.push({ lv: "red", t: `До общего лимита осталось ${leftMax.toFixed(1)}%. Снизьте объём.` });
    for (const f of (last?.flags || []) as any[]) if (!/лимит|Просадка|Дневной/.test(f.t)) warns.push(f);
  }
  const today = dayKey(new Date(), R.tz);
  const notesById = new Map(journal.map((j: any) => [j.day, j]));
  // Дневник можно заполнить за сегодня и три предыдущих торговых дня; в выходные открыт последний торговый
  const jDays = journalDays(today);
  const jDay = journalDay && jDays.includes(journalDay) ? journalDay : jDays[jDays.length - 1];
  const jt: any = notesById.get(jDay);
  const late = (j: any) => isLateEntry(j.day, j.updated_at, R.tz);
  const lateNote = (j: any) => `заполнено ${fmtD(dayKey(new Date(j.updated_at), R.tz))}`;

  return (
    <>
      <div className="head">
        <div><div className="titlerow"><h1>{profile?.name}</h1><Pill level={level} /><PhaseTag phase={acc.phase} status={acc.status} /></div>
          <p className="sub">Счёт #{acc.trader_login || acc.ctid_trader_account_id} · {acc.broker_name || "cTrader"} · баланс {usd(acc.balance)} · старт фазы {usd(acc.initial_balance)}{access !== "full" ? <> · <span style={{ color: failed ? "var(--red)" : "var(--amber)" }}>cTrader: {ACCESS_LABEL[access]}</span></> : !self && acc.access_rights ? " · cTrader: торговля разрешена" : null}{self ? " · эти данные видите только вы и админ" : ` · ${profile?.email}`}</p></div>
        <form action={syncMe}><span className="fine">{acc.last_synced_at ? `Обновлено ${new Date(acc.last_synced_at).toLocaleString("ru-RU", { timeZone: vtz, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : "Ещё не синхронизирован"} </span>{self && <button className="btn ghost" type="submit">Обновить</button>}</form>
      </div>
      {acc.sync_error && <div className="w l-yellow notice">Последняя синхронизация не удалась: {acc.sync_error}</div>}
      {warns.length > 0 && <div className="warn">{warns.map((w, i) => <div key={i} className={`w l-${w.lv}`}>{w.t}</div>)}</div>}

      <div className="gauges">
        <Gauge icon="days" k="Прибыльные дни" v={`${m.profitDays} дн.`} sub={`Цель: ${R.minDays} дн.`} pct={(m.profitDays / R.minDays) * 100} col="var(--gold)" note={<><span className="pos">▲ {m.winDays} в плюс</span> · <span className="neg">▼ {m.lossDays} в минус</span> · из {m.tradingDays} торговых<br />В зачёт — прирост от +{R.profitDayPct}% выше стартового баланса</>} />
        <Gauge icon="daily" k="Дневной убыток" v={failed ? "—" : `${m.todayLoss.toFixed(2)}%`} sub={`Допуск: ${R.daily}%`} pct={(m.todayLoss / R.daily) * 100} col={m.todayLoss >= R.redDaily ? "var(--red)" : "var(--gold)"} note={failed ? "Счёт закрыт" : <>
          Итог дня <span className={cls(m.todayPnlPct)}>{sg(m.todayPnlPct)}%</span>{m.todayWorst > 0 ? <> · худшая точка <span className="neg">−{m.todayWorst.toFixed(2)}%</span></> : null}<br />
          Мин. баланс <span className="mono">{usd2(minBal)}</span> · осталось <span className="mono">{usd2(remaining)}</span><br />
          {worstAt ? <>Худший день {m.worstDayLoss.toFixed(2)}% · {worstAt} · </> : null}сброс в {reset}</>} />
        <Gauge icon="max" k="Общая просадка" v={`${m.maxDD.toFixed(2)}%`} sub={`Допуск: ${R.max}%`} pct={(m.maxDD / R.max) * 100} col={m.maxDD >= R.redDD ? "var(--red)" : "var(--gold)"} note={<>
          Мин. эквити <span className="mono">{usd2(lowEq)}</span>{lowAt ? <> · {lowAt}</> : null}<br />
          Граница <span className="mono">{usd2(floor)}</span> · запас <span className="mono">{usd2(Math.max(0, m.balanceNow - floor))}</span><br />
          <span title="Считаем по минутным свечам cTrader — может быть на 0.01–0.05% выше, чем у FundedHive">С учётом открытых позиций, не сбрасывается</span></>} />
        {target != null
          ? <Gauge icon="target" k="Цель прибыли" v={`${sg(m.total)}%`} sub={`Цель: ${target}%`} pct={(m.total / target) * 100} col="var(--green)" note={m.total >= target ? "Цель достигнута" : `Осталось ${(target - m.total).toFixed(2)}% · ${usd((init * (target - m.total)) / 100)}`} />
          : <Gauge icon="target" k="Funded-счёт" v={`${sg(m.total)}%`} pct={100} col="var(--green)" note="Прибыль с начала funded" />}
      </div>

      <div className="grid2">
        <section className="panel">
          <EquityCurve deals={b.deals} initial={init} totalPct={m.total} target={target} max={R.max} tz={vtz} stats={{ winRate: m.winRate, tradingDays: m.tradingDays, best: m.best, worst: m.worst }} />
        </section>
        <div style={{ display: "grid", gap: 20, alignContent: "start", minWidth: 0 }}>
          {self ? (
            <section className="panel" id="journal"><div className="ph"><h2>Дневник за {fmtD(jDay)}</h2>{jDay !== today && <span className="fine">задним числом</span>}</div>
              <nav className="jdays" aria-label="День дневника">{jDays.map(d => { const has = notesById.has(d); return (
                <Link key={d} href={`/dashboard?jd=${d}#journal`} scroll={false} aria-current={d === jDay ? "true" : undefined} title={has ? "Заполнен" : "Не заполнен"}>
                  <i className={has ? "on" : ""} />{d === today ? "Сегодня" : fmtD(d)}</Link>); })}</nav>
              {journalError && <div className="w l-red" style={{ marginBottom: 10 }}>Этот день закрыт: дневник можно заполнить за сегодня и три предыдущих торговых дня.</div>}
              <form className="journal" action={saveJournal} key={jDay}>
                <input type="hidden" name="day" value={jDay} />
                <div><div className="fine" style={{ marginBottom: 6 }}>Состояние</div>
                  <div className="moods">{[1, 2, 3, 4, 5].map(v => <span key={v} style={{ flex: 1, display: "flex" }}><input type="radio" name="mood" id={`m${v}`} value={v} defaultChecked={jt?.mood === v} /><label htmlFor={`m${v}`} style={{ flex: 1 }}>{v}</label></span>)}</div></div>
                <div><div className="fine" style={{ marginBottom: 6 }}>Торговал по плану?</div>
                  <div className="seg"><label><input type="radio" name="plan" value="1" defaultChecked={jt?.plan === true} />Да</label><label><input type="radio" name="plan" value="0" defaultChecked={jt?.plan === false} />Нет</label></div></div>
                <textarea name="note" id="note" placeholder="Что сработало, что нет (необязательно)" defaultValue={jt?.note || ""} />
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="btn" type="submit">Сохранить</button>{jt && <span className="saved">{journalSaved ? "Сохранено" : "Заполнен"}{late(jt) ? ` · ${lateNote(jt)}` : ""}</span>}</div>
                <p className="fine" style={{ margin: 0 }}>Заполнить или поправить можно за сегодня и три предыдущих торговых дня. Выходные не считаются.</p>
              </form></section>
          ) : (
            <section className="panel"><div className="ph"><h2>Дневник</h2></div>
              <div className="events">{journal.slice(0, 8).map((j: any) => <div key={j.day}><span>{fmtD(j.day)} · настр. {j.mood ?? "—"} · {j.plan == null ? "—" : j.plan ? "по плану" : <span className="neg">не по плану</span>}{late(j) ? <> · <span style={{ color: "var(--amber)" }}>{lateNote(j)}</span></> : null}{j.note ? <><br /><span className="fine">{j.note}</span></> : null}</span></div>)}
                {!journal.length && <p className="fine">Записей пока нет.</p>}</div></section>
          )}
          <section className="panel"><div className="ph"><h2>Подключения</h2>{self && <Link href="/connect" className="fine">изменить</Link>}</div>
            <div className="conn"><div className="row"><div><b>cTrader</b><span>Счёт #{acc.trader_login || acc.ctid_trader_account_id} · только чтение</span></div><span className="ok">Подключён</span></div></div>
            {chain.length > 0 && <div className="events" style={{ marginTop: 12 }}>{chain.map((e: any) => <div key={e.tx_hash}><span>{e.kind === "pay" ? "Оплата челленджа" : "Выплата USDC"}</span><span className="mono">{fmtD(e.ts.slice(0, 10))} · {usd(e.amount)}</span></div>)}</div>}
          </section>
        </div>
      </div>

      <DealsHistory deals={b.deals} login={acc.trader_login || acc.ctid_trader_account_id} initial={init} accountId={acc.id} tz={vtz} />

      <section className="panel"><div className="ph"><h2>История по дням</h2></div>
        <div className="tablewrap"><table className="daytbl"><thead><tr><th>Дата</th><th className="n">P&amp;L дня</th><th className="n">Итог фазы</th><th className="n">Сделки</th><th className="n">Макс. лот</th><th className="n">Настр.</th><th>План</th><th>Светофор</th></tr></thead>
          <tbody>{[...days].reverse().slice(0, 20).map((d: any) => { const j: any = notesById.get(d.day); return (
            <tr key={d.day} style={{ cursor: "default" }}>
              <td className="mono">{fmtD(d.day)}</td>
              <td className={`n ${cls(d.pnl_pct)}`}>{d.trades || Number(d.pnl) ? `${sg(Number(d.pnl_pct))}%` : "—"}</td>
              <td className={`n ${cls(d.total_pct)}`}>{sg(Number(d.total_pct))}%</td>
              <td className="n">{d.trades || "—"}</td>
              <td className="n">{Number(d.max_lot) ? Number(d.max_lot).toFixed(2) : "—"}</td>
              <td className="n">{j?.mood ?? "—"}</td>
              <td>{!j ? (self && jDays.includes(d.day) ? <Link href={`/dashboard?jd=${d.day}#journal`} className="fine">заполнить</Link> : <span className="fine">нет отчёта</span>) : <>{j.plan == null ? "—" : j.plan ? "да" : <span className="neg">нет</span>}{late(j) ? <span className="fine" style={{ color: "var(--amber)" }} title={lateNote(j)}> · позже</span> : null}</>}</td>
              <td>{d.breach ? <Pill level="failed" /> : <Pill level={d.level} />}</td>
            </tr>); })}
            {!days.length && <tr><td colSpan={8} className="fine">Данных пока нет.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}
