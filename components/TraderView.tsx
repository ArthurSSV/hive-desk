import Link from "next/link";
import { dayKey } from "@/lib/engine";
import type { traderBundle } from "@/lib/data";
import { saveJournal, syncMe } from "@/app/actions";
import { EquityChart, Gauge, PhaseTag, Pill, cls, fmtD, sg, usd, type Day } from "./ui";
import DealsHistory from "./DealsHistory";

type B = Awaited<ReturnType<typeof traderBundle>>;

export default function TraderView({ b, mode }: { b: B; mode: "self" | "admin" }) {
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
  const warns: { lv: string; t: string }[] = [];
  if (failed) warns.push({ lv: "failed", t: "Счёт закрыт по нарушению лимита." });
  else if (acc.status === "passed") warns.push({ lv: "green", t: "Цель фазы выполнена. Когда получите новый счёт, подключите его на странице подключения." });
  else {
    if (leftDaily <= 2) warns.push({ lv: "red", t: `До дневного лимита осталось ${leftDaily.toFixed(1)}%. Лучше закончить день.` });
    if (leftMax <= 4) warns.push({ lv: "red", t: `До общего лимита осталось ${leftMax.toFixed(1)}%. Снизьте объём.` });
    for (const f of (last?.flags || []) as any[]) if (!/лимит|Просадка|Дневной/.test(f.t)) warns.push(f);
  }
  const today = dayKey(new Date(), R.tz);
  const jt: any = journal.find((j: any) => j.day === today);
  const notesById = new Map(journal.map((j: any) => [j.day, j]));

  return (
    <>
      <div className="head">
        <div><div className="titlerow"><h1>{profile?.name}</h1><Pill level={level} /><PhaseTag phase={acc.phase} status={acc.status} /></div>
          <p className="sub">Счёт #{acc.trader_login || acc.ctid_trader_account_id} · {acc.broker_name || "cTrader"} · баланс {usd(acc.balance)} · старт фазы {usd(acc.initial_balance)}{self ? " · эти данные видите только вы и админ" : ` · ${profile?.email}`}</p></div>
        <form action={syncMe}><span className="fine">{acc.last_synced_at ? `Обновлено ${new Date(acc.last_synced_at).toLocaleString("ru-RU", { timeZone: "Europe/Kiev", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : "Ещё не синхронизирован"} </span>{self && <button className="btn ghost" type="submit">Обновить</button>}</form>
      </div>
      {acc.sync_error && <div className="w l-yellow notice">Последняя синхронизация не удалась: {acc.sync_error}</div>}
      {warns.length > 0 && <div className="warn">{warns.map((w, i) => <div key={i} className={`w l-${w.lv}`}>{w.t}</div>)}</div>}

      <div className="gauges">
        <Gauge icon="days" k="Прибыльные дни" v={`${m.profitDays} дн.`} sub={`Цель: ${R.minDays} дн.`} pct={(m.profitDays / R.minDays) * 100} col="var(--gold)" note={<><span className="pos">▲ {m.winDays} в плюс</span> · <span className="neg">▼ {m.lossDays} в минус</span> · из {m.tradingDays} торговых<br />В зачёт идут дни от +{R.profitDayPct}%</>} />
        <Gauge icon="daily" k="Дневной убыток" v={failed ? "—" : `${m.todayLoss.toFixed(2)}%`} sub={`Допуск: ${R.daily}%`} pct={(m.todayLoss / R.daily) * 100} col={m.todayLoss >= R.redDaily ? "var(--red)" : "var(--gold)"} note={failed ? "Счёт закрыт" : <>Итог дня <span className={cls(m.today)}>{sg(m.today)}%</span>{m.todayWorst > 0 ? <> · худшая точка <span className="neg">−{m.todayWorst.toFixed(2)}%</span></> : null}<br />Запас {leftDaily.toFixed(2)}% · {usd((init * leftDaily) / 100)}</>} />
        <Gauge icon="max" k="Общая просадка" v={`${m.maxDD.toFixed(2)}%`} sub={`Допуск: ${R.max}%`} pct={(m.maxDD / R.max) * 100} col={m.maxDD >= R.redDD ? "var(--red)" : "var(--red)"} note="С учётом плавающего убытка открытых позиций" />
        {target != null
          ? <Gauge icon="target" k="Цель прибыли" v={`${sg(m.total)}%`} sub={`Цель: ${target}%`} pct={(m.total / target) * 100} col="var(--green)" note={m.total >= target ? "Цель достигнута" : `Осталось ${(target - m.total).toFixed(2)}% · ${usd((init * (target - m.total)) / 100)}`} />
          : <Gauge icon="target" k="Funded-счёт" v={`${sg(m.total)}%`} pct={100} col="var(--green)" note="Прибыль с начала funded" />}
      </div>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Кривая результата</h2><span className="fine">% от начального баланса · по закрытым сделкам</span></div>
          <EquityChart days={days as Day[]} target={target} max={R.max} />
          <div className="stats" style={{ marginTop: 12 }}>
            <div><div className="k">Winrate дней</div><div className="v">{m.winRate}%</div></div>
            <div><div className="k">Лучший день</div><div className="v pos">{sg(m.best)}%</div></div>
            <div><div className="k">Худший день</div><div className="v neg">{sg(m.worst)}%</div></div>
          </div>
        </section>
        <div style={{ display: "grid", gap: 20, alignContent: "start", minWidth: 0 }}>
          {self ? (
            <section className="panel"><div className="ph"><h2>Дневник за {fmtD(today)}</h2></div>
              <form className="journal" action={saveJournal}>
                <input type="hidden" name="day" value={today} />
                <div><div className="fine" style={{ marginBottom: 6 }}>Состояние</div>
                  <div className="moods">{[1, 2, 3, 4, 5].map(v => <span key={v} style={{ flex: 1, display: "flex" }}><input type="radio" name="mood" id={`m${v}`} value={v} defaultChecked={jt?.mood === v} /><label htmlFor={`m${v}`} style={{ flex: 1 }}>{v}</label></span>)}</div></div>
                <div><div className="fine" style={{ marginBottom: 6 }}>Торговал по плану?</div>
                  <div className="seg"><label><input type="radio" name="plan" value="1" defaultChecked={jt?.plan === true} />Да</label><label><input type="radio" name="plan" value="0" defaultChecked={jt?.plan === false} />Нет</label></div></div>
                <textarea name="note" id="note" placeholder="Что сработало, что нет (необязательно)" defaultValue={jt?.note || ""} />
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="btn" type="submit">Сохранить</button>{jt && <span className="saved">Сохранено</span>}</div>
              </form></section>
          ) : (
            <section className="panel"><div className="ph"><h2>Дневник</h2></div>
              <div className="events">{journal.slice(0, 8).map((j: any) => <div key={j.day}><span>{fmtD(j.day)} · настр. {j.mood ?? "—"} · {j.plan == null ? "—" : j.plan ? "по плану" : <span className="neg">не по плану</span>}{j.note ? <><br /><span className="fine">{j.note}</span></> : null}</span></div>)}
                {!journal.length && <p className="fine">Записей пока нет.</p>}</div></section>
          )}
          <section className="panel"><div className="ph"><h2>Подключения</h2>{self && <Link href="/connect" className="fine">изменить</Link>}</div>
            <div className="conn"><div className="row"><div><b>cTrader</b><span>Счёт #{acc.trader_login || acc.ctid_trader_account_id} · только чтение</span></div><span className="ok">Подключён</span></div></div>
            {chain.length > 0 && <div className="events" style={{ marginTop: 12 }}>{chain.map((e: any) => <div key={e.tx_hash}><span>{e.kind === "pay" ? "Оплата челленджа" : "Выплата USDC"}</span><span className="mono">{fmtD(e.ts.slice(0, 10))} · {usd(e.amount)}</span></div>)}</div>}
          </section>
        </div>
      </div>

      <DealsHistory deals={b.deals} login={acc.trader_login || acc.ctid_trader_account_id} initial={init} accountId={acc.id} />

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
              <td>{!j ? <span className="fine">нет отчёта</span> : j.plan == null ? "—" : j.plan ? "да" : <span className="neg">нет</span>}</td>
              <td>{d.breach ? <Pill level="failed" /> : <Pill level={d.level} />}</td>
            </tr>); })}
            {!days.length && <tr><td colSpan={8} className="fine">Данных пока нет.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}
