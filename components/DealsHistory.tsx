"use client";
import { useMemo, useState } from "react";

type D = { deal_id: number; position_id: number | null; symbol: string | null; side: string | null; lots: number | null; price: number | null; entry_price: number | null; exec_ts: string; is_close: boolean; net_profit: number };

const PAGE = 10;
const dt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Kiev", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const px = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 5 }));

/** История сделок: одна строка на закрытую позицию (или её часть). */
export default function DealsHistory({ deals, login, initial }: { deals: D[]; login: number; initial: number }) {
  const [page, setPage] = useState(0), [q, setQ] = useState("");
  const rows = useMemo(() => {
    const opens = new Map<number, D>();
    for (const d of deals) if (!d.is_close && d.position_id != null) { const o = opens.get(d.position_id); if (!o || o.exec_ts > d.exec_ts) opens.set(d.position_id, d); }
    return deals.filter(d => d.is_close).map(d => {
      const o = d.position_id != null ? opens.get(d.position_id) : undefined;
      const side = o?.side || (d.side === "buy" ? "sell" : "buy"); // закрывающая сделка идёт в обратную сторону
      return { d, o, side, pct: initial ? (Number(d.net_profit) / initial) * 100 : 0 };
    }).filter(r => !q || String(r.d.position_id).includes(q) || String(r.d.deal_id).includes(q) || (r.d.symbol || "").toLowerCase().includes(q.toLowerCase()));
  }, [deals, initial, q]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <section className="panel">
      <div className="ph"><h2>История сделок</h2>
        <div className="tools"><input id="dq" type="search" placeholder="Позиция, сделка или символ" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} aria-label="Поиск сделки" /></div></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Счёт</th><th>Позиция</th><th>Открыта</th><th>Символ</th><th>Сторона</th><th className="n">Лот</th><th className="n">Цена входа</th><th className="n">Цена выхода</th><th>Закрыта</th><th className="n">Прибыль</th><th className="n">Прибыль %</th></tr></thead>
        <tbody>{view.map(({ d, o, side, pct }) => (
          <tr key={d.deal_id} style={{ cursor: "default" }}>
            <td className="mono">{login}</td>
            <td className="mono">{d.position_id ?? "—"}</td>
            <td className="mono">{o ? dt(o.exec_ts) : "—"}</td>
            <td><b>{d.symbol || "—"}</b></td>
            <td><span className={`side ${side}`}>{side === "buy" ? "BUY" : "SELL"}</span></td>
            <td className="n">{d.lots != null ? Number(d.lots).toFixed(2) : "—"}</td>
            <td className="n">{px(d.entry_price ?? o?.price ?? null)}</td>
            <td className="n">{px(d.price)}</td>
            <td className="mono">{dt(d.exec_ts)}</td>
            <td className={`n ${Number(d.net_profit) > 0 ? "pos" : Number(d.net_profit) < 0 ? "neg" : ""}`}>{Number(d.net_profit) < 0 ? "-" : ""}${Math.abs(Number(d.net_profit)).toFixed(2)}</td>
            <td className={`n ${pct > 0 ? "pos" : pct < 0 ? "neg" : ""}`}>{pct.toFixed(2)}%</td>
          </tr>))}
          {!view.length && <tr><td colSpan={11} className="fine">Закрытых сделок пока нет.</td></tr>}
        </tbody></table></div>
      {rows.length > PAGE && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <span className="fine">Показано {page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} из {rows.length}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost" type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Назад">‹</button>
            <span className="count">{page + 1} / {pages}</span>
            <button className="btn ghost" type="button" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Вперёд">›</button>
          </div>
        </div>)}
    </section>
  );
}
