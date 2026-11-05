import Link from "next/link";
import { dayKey } from "@/lib/engine";
import type { traderBundle } from "@/lib/data";
import { saveJournal, syncMe } from "@/app/actions";
import { EquityChart, Gauge, PhaseTag, Pill, cls, fmtD, sg, usd, type Day } from "./ui";
import MetaMask from "./MetaMask";

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
  const level = failed ? "failed" : last?.level || "green";
  const leftDaily = R.daily + Math.min(0, m.today), leftMax = R.max - m.curDD;
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
        {target != null
          ? <Gauge k={`Цель фазы ${acc.phase}`} v={`${sg(m.total)}%`} sub={`из +${target}%`} pct={(m.total / target) * 100} col="var(--hive)" note={m.total >= target ? "Цель достигнута" : `Осталось ${(target - m.total).toFixed(2)}% · ${usd((init * (target - m.total)) / 100)}`} />
          : <Gauge k="Funded-счёт" v={`${sg(m.total)}%`} pct={100} col="var(--green)" note="Прибыль с начала funded" />}
        <Gauge k="Дневной лимит" v={failed ? "—" : `${sg(m.today)}%`} sub={`лимит −${R.daily}%`} pct={(Math.max(0, -m.today) / R.daily) * 100} col={-m.today >= R.redDaily ? "var(--red)" : "var(--amber)"} note={failed ? "—" : `Запас ${leftDaily.toFixed(1)}% · ${usd((init * leftDaily) / 100)}`} />
        <Gauge k="Общая просадка" v={`${m.curDD.toFixed(1)}%`} sub={`лимит −${R.max}%`} pct={(m.curDD / R.max) * 100} col={m.curDD >= R.redDD ? "var(--red)" : "var(--amber)"} note={`Макс. за фазу ${m.maxDD.toFixed(1)}%`} />
        <Gauge k="Торговые дни" v={String(m.tradingDays)} sub={target != null ? `мин. ${R.minDays}` : ""} pct={target != null ? (m.tradingDays / R.minDays) * 100 : 100} col="var(--hive)" note={m.tradingDays >= R.minDays ? "Минимум выполнен" : `Нужно ещё ${R.minDays - m.tradingDays}`} />
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
            <div style={{ marginTop: 10 }}>{self ? <MetaMask wallet={profile?.wallet ?? null} /> : <div className="conn"><div className="row"><div><b>MetaMask</b><span className="mono">{profile?.wallet || "не подключён"}</span></div></div></div>}</div>
            {chain.length > 0 && <div className="events" style={{ marginTop: 12 }}>{chain.map((e: any) => <div key={e.tx_hash}><span>{e.kind === "pay" ? "Оплата челленджа" : "Выплата USDC"}</span><span className="mono">{fmtD(e.ts.slice(0, 10))} · {usd(e.amount)}</span></div>)}</div>}
          </section>
        </div>
      </div>

      <section className="panel"><div className="ph"><h2>История по дням</h2></div>
        <div className="tablewrap"><table className="daytbl"><thead><tr><th>Дата</th><th className="n">P&amp;L дня</th><th className="n">Итог фазы</th><th className="n">Сделки</th><th className="n">Макс. лот</th><th className="n">Настр.</th><th>План</th><th>Светофор</th></tr></thead>
          <tbody>{[...days].reverse().slice(0, 20).map((d: any) => { const j: any = notesById.get(d.day); return (
            <tr key={d.day} style={{ cursor: "default" }}>
              <td className="mono">{fmtD(d.day)}</td>
              <td className={`n ${cls(d.pnl_pct)}`}>{d.trades || Number(d.pnl) ? `${sg(Number(d.pnl_pct))}%` : "—"}</td>
              <td className={`n ${cls(d.total_pct)}`}>{sg(Number(d.total_pct))}%</td>
              <td className="n">{d.trades || "—"}</td>
              <td className="n">{Number(d.max_lot) || "—"}</td>
              <td className="n">{j?.mood ?? "—"}</td>
              <td>{!j ? <span className="fine">нет отчёта</span> : j.plan == null ? "—" : j.plan ? "да" : <span className="neg">нет</span>}</td>
              <td>{d.breach ? <Pill level="failed" /> : <Pill level={d.level} />}</td>
            </tr>); })}
            {!days.length && <tr><td colSpan={8} className="fine">Данных пока нет.</td></tr>}</tbody></table></div>
      </section>
    </>
  );
}
