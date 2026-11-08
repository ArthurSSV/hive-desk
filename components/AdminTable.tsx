"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LEVEL_LABEL, PHASE_LABEL } from "@/lib/rules";

export type Row = {
  id: string; name: string; email: string; team: string | null; unconfirmed: boolean; isAdmin?: boolean; fresh: boolean; level: string; phase: number | null; status: string | null;
  size: number | null; total: number; today: number; maxDD: number; days: number; trades: number; avgTrades: number;
  mood: number | null; flags: string; target: number | null;
};

const LV = ["red", "yellow", "work", "green", "failed", "none"];
const sg = (v: number) => (v > 0 ? "+" : "") + v.toFixed(2);
const cls = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

export default function AdminTable({ rows, max, redDD, minDays, teams = [] }: { rows: Row[]; max: number; redDD: number; minDays: number; teams?: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [st, setSt] = useState("all"), [lv, setLv] = useState("all"), [tm, setTm] = useState("all");
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: "risk", d: -1 });
  const risk = (r: Row) => (r.level === "failed" || r.level === "none" ? -1 : (r.level === "red" ? 300 : r.level === "yellow" ? 200 : r.level === "work" ? 100 : 0) + (r.flags ? 50 : 0) + r.maxDD * 3);
  const key: Record<string, (r: Row) => any> = {
    risk, name: r => r.name, size: r => r.size ?? 0, st: r => (r.status === "failed" ? 9 : r.phase ?? 0), total: r => r.total,
    today: r => r.today, dd: r => r.maxDD, days: r => r.days, trades: r => (r.avgTrades ? r.trades / r.avgTrades : 0), mood: r => r.mood ?? 0,
  };
  const list = useMemo(() => rows
    .filter(r => (st === "all" || (st === "failed" ? r.status === "failed" : r.status !== "failed" && String(r.phase) === st))
      && (lv === "all" || r.level === lv) && (tm === "all" || (tm === "" ? !r.team : r.team === tm)) && (r.name + r.email).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => { const A = key[sort.k](a), B = key[sort.k](b); return (A > B ? 1 : A < B ? -1 : 0) * sort.d; }), [rows, q, st, lv, tm, sort]);
  const cols: [string | null, string, boolean?][] = [["risk", "Светофор"], ["name", "Трейдер"], ["size", "Счёт", true], ["st", "Статус"], ["total", "P&L фазы", true], ["today", "Сегодня", true], ["dd", "Макс. DD", true], ["days", "Прибыльн. дни", true], ["trades", "Сделки / норма", true], ["mood", "Настр.", true], [null, "Причины"]];
  const open = (id: string) => router.push(`/admin/trader/${id}`);
  return (
    <section className="panel">
      <div className="ph"><h2>Все трейдеры</h2>
        <div className="tools">
          <input id="q" type="search" placeholder="Поиск по имени или email" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск" />
          <select id="fst" value={st} onChange={e => setSt(e.target.value)} aria-label="Статус"><option value="all">Все статусы</option><option value="1">Фаза 1</option><option value="2">Фаза 2</option><option value="3">Funded</option><option value="failed">Failed</option></select>
          {teams.length > 0 && <select id="ftm" value={tm} onChange={e => setTm(e.target.value)} aria-label="Команда"><option value="all">Все команды</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}<option value="">Без команды</option></select>}
          <select id="flv" value={lv} onChange={e => setLv(e.target.value)} aria-label="Светофор"><option value="all">Любой светофор</option>{LV.map(k => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}</select>
        </div></div>
      <div className="tablewrap"><table><thead><tr>{cols.map(([k, l, n]) => (
        <th key={l} className={n ? "n" : undefined} aria-sort={sort.k === k ? (sort.d > 0 ? "ascending" : "descending") : undefined}
          onClick={k ? () => setSort(s => ({ k, d: s.k === k ? -s.d : k === "name" ? 1 : -1 })) : undefined}>{l}</th>))}</tr></thead>
        <tbody>{list.map(r => {
          const prog = r.target ? Math.max(0, Math.min(100, (r.total / r.target) * 100)) : 100;
          const ddCol = r.maxDD >= redDD ? "var(--red)" : r.maxDD >= max / 2 ? "var(--amber)" : "var(--green)";
          const over = r.avgTrades > 0 && r.trades >= r.avgTrades * 2 && r.trades >= 4;
          const noAcc = r.phase == null;
          return (
            <tr key={r.id} tabIndex={0} onClick={() => open(r.id)} onKeyDown={e => e.key === "Enter" && open(r.id)}>
              <td><span className={`pill l-${r.level}`}><span className="dot" />{LEVEL_LABEL[r.level]}</span></td>
              <td className="who"><b>{r.name || "Без имени"}{r.fresh && <> <span className="st p2">новый</span></>}{r.isAdmin && <> <span className="st">админ</span></>}</b><span>{r.team ? `${r.team} · ` : ""}{r.email}</span></td>
              <td className="n">{r.size ? "$" + Math.round(r.size).toLocaleString("en-US") : "—"}{r.unconfirmed && <span title="Баланс не подтверждён админом" style={{ color: "var(--amber)", marginLeft: 4 }}>⚠</span>}</td>
              <td>{noAcc ? <span className="fine">нет счёта</span> : <span className={`st ${r.status === "failed" ? "failed" : r.phase === 3 ? "funded" : r.phase === 2 ? "p2" : "p1"}`}>{r.status === "failed" ? "Failed" : PHASE_LABEL[r.phase!]}{r.status === "passed" ? " ✓" : ""}</span>}</td>
              <td className={`n ${cls(r.total)}`}>{noAcc ? "—" : <>{sg(r.total)}%{r.target ? <span className="mini"><i style={{ width: `${prog}%`, background: "var(--hive)" }} /></span> : null}</>}</td>
              <td className={`n ${cls(r.today)}`}>{noAcc || r.status === "failed" ? "—" : `${sg(r.today)}%`}</td>
              <td className="n">{noAcc ? "—" : <>{r.maxDD.toFixed(1)}%<span className="mini"><i style={{ width: `${Math.min(100, (r.maxDD / max) * 100)}%`, background: ddCol }} /></span></>}</td>
              <td className="n">{r.days}{r.target ? <span className="fine">/{minDays}</span> : null}</td>
              <td className={`n ${over ? "neg" : ""}`}>{r.trades}<span className="fine"> / {r.avgTrades.toFixed(0)}</span></td>
              <td className="n">{r.mood ?? "—"}</td>
              <td><span className="flagtxt" title={r.flags}>{r.flags || "—"}</span></td>
            </tr>);
        })}
          {!list.length && <tr><td colSpan={11} className="fine">Никого не найдено.</td></tr>}</tbody></table></div>
      <p className="fine" style={{ marginTop: 10 }}>Нажмите на строку, чтобы открыть карточку трейдера. Сделки / норма — сегодня против среднего за 10 дней.</p>
    </section>
  );
}
