"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import TradeChart, { type Bars } from "./TradeChart";

type D = { deal_id: number; position_id: number | null; symbol: string | null; side: string | null; lots: number | null; price: number | null; entry_price: number | null; exec_ts: string; is_close: boolean; net_profit: number };

const PAGE = 10;
const dtIn = (tz: string) => (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const px = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 5 }));

/** История сделок: одна строка на закрытую позицию (или её часть). */
export default function DealsHistory({ deals, login, initial, accountId, tz }: { deals: D[]; login: number; initial: number; accountId: number; tz: string }) {
  const dt = dtIn(tz);
  const [page, setPage] = useState(0), [q, setQ] = useState("");
  const [hover, setHover] = useState<{ key: number; pos: number; top: number; left: number; pinned: boolean } | null>(null);
  const [cache, setCache] = useState<Record<number, Bars | "loading" | "none">>({});
  const hideT = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setHover(null); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  function show(e: React.MouseEvent<HTMLTableRowElement>, key: number, pos: number | null, pinned: boolean) {
    if (pos == null) return;
    clearTimeout(hideT.current);
    const r = e.currentTarget.getBoundingClientRect(), w = Math.min(640, innerWidth - 32), h = 360;
    const left = Math.max(16, Math.min(e.clientX - w / 2, innerWidth - w - 16));
    const top = r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6);
    setHover(cur => (pinned && cur?.pinned && cur.key === key ? null : { key, pos, top, left, pinned }));
    if (!cache[pos]) {
      setCache(c => ({ ...c, [pos]: "loading" }));
      fetch(`/api/bars?acc=${accountId}&pos=${pos}`).then(r => (r.ok ? r.json() : null)).then(j => setCache(c => ({ ...c, [pos]: j && j.bars ? j : "none" }))).catch(() => setCache(c => ({ ...c, [pos]: "none" })));
    }
  }
  const leave = () => { hideT.current = setTimeout(() => setHover(h => (h?.pinned ? h : null)), 120); };
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
          <tr key={d.deal_id} style={{ cursor: "pointer", background: hover?.key === d.deal_id ? "rgba(232,181,74,.06)" : undefined }}
            onMouseEnter={e => !hover?.pinned && show(e, d.deal_id, d.position_id, false)} onMouseLeave={leave}
            onClick={e => show(e, d.deal_id, d.position_id, true)} title="Наведите или нажмите, чтобы открыть график">
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
      {hover && (() => {
        const row = rows.find(x => x.d.deal_id === hover.key); if (!row) return null;
        const c = cache[hover.pos], { d, o, side } = row;
        return (
          <div role="dialog" aria-label="График сделки" onMouseEnter={() => clearTimeout(hideT.current)} onMouseLeave={leave}
            style={{ position: "fixed", zIndex: 30, top: hover.top, left: hover.left, width: "min(640px, calc(100vw - 32px))", padding: 14, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--gold-dim)", boxShadow: "0 18px 50px rgba(0,0,0,.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b>{d.symbol}</b><span className={`side ${side}`}>{side === "buy" ? "BUY" : "SELL"}</span><span className="mono fine">{d.lots != null ? Number(d.lots).toFixed(2) : "—"} лот · #{d.position_id}{c && typeof c === "object" ? ` · ${c.period}` : ""}</span></div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}><b className={`mono ${Number(d.net_profit) >= 0 ? "pos" : "neg"}`}>{Number(d.net_profit) < 0 ? "-" : "+"}${Math.abs(Number(d.net_profit)).toFixed(2)}</b>
                {hover.pinned && <button type="button" className="signout" style={{ margin: 0 }} onClick={() => setHover(null)}>Закрыть</button>}</div>
            </div>
            {c === "loading" || c === undefined ? <p className="fine" style={{ height: 260, display: "grid", placeItems: "center", margin: 0 }}>Загружаю график…</p>
              : c === "none" ? <p className="fine" style={{ height: 80, display: "grid", placeItems: "center", margin: 0 }}>График появится после следующей синхронизации (до 15 минут).</p>
              : <TradeChart data={c} openMs={o ? Date.parse(o.exec_ts) : null} closeMs={Date.parse(d.exec_ts)} entry={d.entry_price ?? o?.price ?? null} exit={d.price} side={side} />}
            <div className="fine" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <span>Вход {o ? dt(o.exec_ts) : "—"} по {px(d.entry_price ?? o?.price ?? null)}</span><span>Выход {dt(d.exec_ts)} по {px(d.price)}</span></div>
          </div>);
      })()}
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
