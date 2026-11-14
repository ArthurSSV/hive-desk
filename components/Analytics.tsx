"use client";
// Аналитика счёта по закрытым позициям: дни недели, час входа, торговые сессии, время в сделке.
import { useMemo, useState } from "react";

type Deal = { position_id: number | null; exec_ts: string; net_profit: number; is_close: boolean };
type Row = { k: string; n: number; w: number; pnl: number; ord: number };
const WD = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const WDI: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// Сессии заданы в UTC; в подписи часы пересчитываются в пояс того, кто смотрит
const SESS: [string, number, number][] = [["Азия", 1, 8], ["Лондон", 8, 14], ["Лондон + Нью-Йорк", 14, 17], ["Нью-Йорк", 17, 22]];
const DUR: [string, number][] = [["до 5 мин", 5], ["5–15 мин", 15], ["15–60 мин", 60], ["1–4 часа", 240], ["дольше 4 часов", Infinity]];
const cls = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const p2 = (n: number) => String(n).padStart(2, "0");

export default function Analytics({ deals, initial, tz }: { deals: Deal[]; initial: number; tz: string }) {
  const [unit, setUnit] = useState<"usd" | "pct">("usd");
  const fmt = (v: number, short = false) => unit === "pct" ? `${sgn(v)}${Math.abs(initial ? (v / initial) * 100 : 0).toFixed(2)}%` : `${sgn(v)}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: short ? 0 : 2, minimumFractionDigits: short ? 0 : 2 })}`;
  const A = useMemo(() => {
    // Одна сделка = одна позиция: вход — первая открывающая сделка, результат — сумма всех частей
    const pos = new Map<number, { open: number | null; close: number; pnl: number }>();
    for (const d of deals) {
      if (d.position_id == null) continue;
      const p = pos.get(d.position_id) || { open: null, close: 0, pnl: 0 }, ms = Date.parse(d.exec_ts);
      if (d.is_close) { p.pnl += Number(d.net_profit || 0); p.close = Math.max(p.close, ms); } else if (p.open == null || ms < p.open) p.open = ms;
      pos.set(d.position_id, p);
    }
    const trades = [...pos.values()].filter(p => p.close && p.open != null) as { open: number; close: number; pnl: number }[];
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23", weekday: "short" });
    const local = (ms: number) => { const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { h: Number(parts.hour) % 24, wd: WDI[parts.weekday] ?? 0 }; };
    const shift = trades.length ? (local(trades[0].open).h - new Date(trades[0].open).getUTCHours() + 24) % 24 : 0;
    const sessName = (utcH: number) => { const s = SESS.find(([, a, b]) => utcH >= a && utcH < b); return s ? `${s[0]} ${p2((s[1] + shift) % 24)}–${p2((s[2] + shift) % 24)}` : `Вне сессий ${p2((22 + shift) % 24)}–${p2((1 + shift) % 24)}`; };
    const group = (keyOf: (t: (typeof trades)[number]) => [string, number]) => {
      const m = new Map<string, Row>();
      for (const t of trades) { const [k, ord] = keyOf(t); const g = m.get(k) || { k, n: 0, w: 0, pnl: 0, ord }; g.n++; if (t.pnl > 0) g.w++; g.pnl += t.pnl; m.set(k, g); }
      return [...m.values()];
    };
    const byOrd = (a: Row, b: Row) => a.ord - b.ord, byPnl = (a: Row, b: Row) => b.pnl - a.pnl;
    return {
      n: trades.length, wins: trades.filter(t => t.pnl > 0).length,
      cards: [
        ["По дням недели", group(t => { const w = local(t.open).wd; return [WD[w], (w + 6) % 7]; }).sort(byOrd)],
        ["По часу входа", group(t => { const h = local(t.open).h; return [`${p2(h)}:00`, h]; }).sort(byOrd)],
        ["По торговым сессиям", group(t => [sessName(new Date(t.open).getUTCHours()), 0]).sort(byPnl)],
        ["Время в сделке", group(t => { const m = (t.close - t.open) / 60000, i = DUR.findIndex(([, lim]) => m < lim); return [DUR[i][0], i]; }).sort(byPnl)],
      ] as [string, Row[]][],
    };
  }, [deals, tz]);

  const hours = [...A.cards[1][1]].sort((a, b) => b.pnl - a.pnl), durs = A.cards[3][1];
  return (
    <section className="panel">
      <div className="ph"><h2>Аналитика счёта</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span className="fine">по закрытым позициям текущей фазы · время в вашем часовом поясе</span>
          <span className="tfs" role="group" aria-label="Единицы">{(["usd", "pct"] as const).map(u => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "usd" ? "$" : "%"}</button>)}</span></div></div>
      {!A.n ? <p className="fine">Аналитика появится после первых закрытых сделок.</p> : <>
        <div className="an-note">
          <span>Сделок: <b>{A.n}</b> · в плюс <b>{Math.round((A.wins / A.n) * 100)}%</b></span>
          {hours.length > 1 && <><span>Лучший час входа: <b>{hours[0].k}</b> <span className={cls(hours[0].pnl)}>{fmt(hours[0].pnl, true)}</span></span>
            <span>Худший час: <b>{hours[hours.length - 1].k}</b> <span className={cls(hours[hours.length - 1].pnl)}>{fmt(hours[hours.length - 1].pnl, true)}</span></span></>}
          {durs.length > 1 && durs[0].pnl > 0 && <span>Лучше всего сделки: <b>{durs[0].k}</b></span>}
        </div>
        <div className="an">{A.cards.map(([title, rows]) => { const mx = Math.max(...rows.map(r => Math.abs(r.pnl)), 1); return (
          <div key={title}><h3>{title}</h3>{rows.map(r => (
            <div className="r" key={r.k}>
              <div className="l"><div><b>{r.k}</b> <span>· {r.n} сд · {Math.round((r.w / r.n) * 100)}%</span></div><em className={cls(r.pnl)}>{fmt(r.pnl)}</em></div>
              <div className="b"><i style={{ width: `${Math.max(2, (Math.abs(r.pnl) / mx) * 100)}%`, background: r.pnl >= 0 ? "var(--green)" : "var(--red)" }} /></div>
            </div>))}</div>); })}</div>
        <p className="fine" style={{ margin: "12px 0 0" }}>«сд» — число позиций (позиция, закрытая частями, считается одной), процент — доля прибыльных.</p>
      </>}
    </section>
  );
}
