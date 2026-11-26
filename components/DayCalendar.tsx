"use client";
// Календарь прибыли по дням: результат и число сделок в каждой клетке, итоги месяца, переход к сделкам дня.
import { useMemo, useState } from "react";
import { dayKey } from "@/lib/engine";
import { openDay } from "./CabinetTabs";

type Deal = { exec_ts: string; net_profit: number; is_close: boolean; position_id?: number | null; deal_id?: number | string };
const MON = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const cls = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

export default function DayCalendar({ deals, initial, dayTz, today }: { deals: Deal[]; initial: number; dayTz: string; today: string }) {
  const [unit, setUnit] = useState<"usd" | "pct">("usd");
  const [ym, setYm] = useState<[number, number]>([Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1]);
  // Сделка = позиция: все её закрытия за день (TP1, TP2, стоп — «сейфы») складываются в одну сделку дня закрытия
  const closed = useMemo(() => {
    const m = new Map<string, { day: string; pnl: number }>();
    for (const d of deals) {
      if (!d.is_close) continue;
      const day = dayKey(new Date(d.exec_ts), dayTz), k = `${day}|${d.position_id ?? "d" + (d.deal_id ?? d.exec_ts)}`;
      const c = m.get(k) || { day, pnl: 0 }; c.pnl += Number(d.net_profit || 0); m.set(k, c);
    }
    return [...m.values()];
  }, [deals, dayTz]);
  const byDay = useMemo(() => { const m = new Map<string, { pnl: number; n: number }>(); for (const d of closed) { const c = m.get(d.day) || { pnl: 0, n: 0 }; c.pnl += d.pnl; c.n++; m.set(d.day, c); } return m; }, [closed]);
  const fmt = (v: number, short = true) => unit === "pct" ? `${sgn(v)}${Math.abs(initial ? (v / initial) * 100 : 0).toFixed(2)}%` : `${sgn(v)}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: short ? 0 : 2, minimumFractionDigits: short ? 0 : 2 })}`;
  const [Y, M] = ym, key = (dt: Date) => dt.toISOString().slice(0, 10), mk = `${Y}-${String(M + 1).padStart(2, "0")}`;
  const first = new Date(Date.UTC(Y, M, 1)), lead = (first.getUTCDay() + 6) % 7, start = new Date(first.getTime() - lead * 864e5);
  const weeks = Math.ceil((lead + new Date(Date.UTC(Y, M + 1, 0)).getUTCDate()) / 7);
  const inMonth = closed.filter(d => d.day.startsWith(mk));
  const gain = inMonth.filter(d => d.pnl > 0).reduce((a, d) => a + d.pnl, 0), loss = inMonth.filter(d => d.pnl < 0).reduce((a, d) => a + d.pnl, 0);
  const nDays = new Set(inMonth.map(d => d.day)).size;
  const move = (k: number) => setYm(([y, m]) => { const t = m + k; return t < 0 ? [y - 1, 11] : t > 11 ? [y + 1, 0] : [y, t]; });
  return (
    <section className="panel">
      <div className="cal-top"><h2>Прибыль по дням</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="tfs" role="group" aria-label="Единицы">{(["usd", "pct"] as const).map(u => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "usd" ? "$" : "%"}</button>)}</span>
          <div className="cal-nav"><button type="button" onClick={() => move(-1)} aria-label="Предыдущий месяц">‹</button><b>{MON[M]} {Y}</b><button type="button" onClick={() => move(1)} aria-label="Следующий месяц">›</button></div>
        </div></div>
      <div className="cal-sum">
        {([["Доход", gain], ["Убыток", loss], ["Чистая прибыль", gain + loss], ["В среднем за день", nDays ? (gain + loss) / nDays : 0]] as [string, number][]).map(([k, v]) => (
          <div key={k}><div className="k">{k}</div><div className={`v ${cls(v)}`}>{fmt(v)}</div></div>))}
      </div>
      <div className="cal">
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(w => <div key={w} className="wd">{w}</div>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const dt = new Date(start.getTime() + i * 864e5), k = key(dt), c = byDay.get(k), wk = i % 7 > 4;
          const cn = `c${dt.getUTCMonth() !== M ? " out" : ""}${c ? (c.pnl >= 0 ? " win has" : " loss has") : wk ? " wk" : ""}${k === today ? " today" : ""}`;
          if (!c) return <div key={k} className={cn}><span className="n">{dt.getUTCDate()}</span></div>;
          return (
            <button key={k} type="button" className={cn} onClick={() => openDay(k)} title={`${k.slice(8)}.${k.slice(5, 7)}: ${fmt(c.pnl, false)}, сделок: ${c.n}. Нажмите, чтобы открыть сделки дня`}>
              <span className="n">{dt.getUTCDate()}</span><span className="p">{fmt(c.pnl)}</span><span className="t">{c.n} сд.</span>
            </button>);
        })}
      </div>
      <p className="fine" style={{ margin: "10px 0 0" }}>Нажмите на день — откроются сделки этого дня. Дни считаются по торговому дню пропа ({dayTz}).</p>
    </section>
  );
}
