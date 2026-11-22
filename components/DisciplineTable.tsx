"use client";
// Таблица дисциплины трейдеров в «Сводке» с сортировкой по любой колонке.
import Link from "next/link";
import { useState } from "react";

export type DRow = { key: string; uid: string; name: string; phase: number; n: number; score: number | null; risk: number | null; cv: number | null; slPct: number | null; avgR: number | null; lotUpPct: number | null; planPct: number | null; journalPct: number | null; res: number | null };
const COLS: [keyof DRow, string][] = [["name", "Трейдер"], ["score", "Балл"], ["n", "Сделок"], ["risk", "Риск / сделку"], ["cv", "Разброс риска"], ["slPct", "Со стопом"], ["avgR", "Средний R"], ["lotUpPct", "Лот после стопа ↑"], ["planPct", "По плану"], ["journalPct", "Дневник"], ["res", "Результат"]];
const dash = <span className="fine">—</span>;

export default function DisciplineTable({ rows }: { rows: DRow[] }) {
  const [k, setK] = useState<keyof DRow>("score"), [dir, setDir] = useState(-1);
  const sorted = [...rows].sort((a, b) => {
    if (k === "name") return a.name.localeCompare(b.name) * dir * -1;
    const x = a[k] as number | null, y = b[k] as number | null;
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (x - y) * dir;
  });
  const tone = (s: number) => (s >= 75 ? "green" : s >= 55 ? "gold" : "red");
  const pct = (v: number | null, bad?: (v: number) => boolean) => (v == null ? dash : <span className={bad && bad(v) ? "neg" : ""}>{v}%</span>);
  return (
    <div className="tablewrap"><table className="dt"><thead><tr>
      {COLS.map(([c, l]) => (
        <th key={c} className={c === "name" ? "" : "n"} aria-sort={k === c ? (dir < 0 ? "descending" : "ascending") : undefined}>
          <button type="button" className="thbtn" onClick={() => { if (k === c) setDir(-dir); else { setK(c); setDir(c === "name" ? 1 : -1); } }}>{l}{k === c ? (dir < 0 ? " ↓" : " ↑") : ""}</button></th>))}
    </tr></thead><tbody>{sorted.map(r => (
      <tr key={r.key} style={{ cursor: "default" }}>
        <td className="who"><Link prefetch={false} href={`/admin/trader/${r.uid}`} style={{ color: "inherit", textDecoration: "none" }}><b>{r.name}</b></Link><span>Фаза {r.phase === 3 ? "Funded" : r.phase}</span></td>
        <td className="n">{r.score == null ? dash : <span className="score">{r.score}<i><b style={{ width: `${r.score}%`, background: `var(--${tone(r.score)})` }} /></i></span>}</td>
        <td className="n">{r.n || dash}</td>
        <td className="n">{r.risk == null ? dash : `${r.risk.toFixed(2)}%`}</td>
        <td className={`n ${r.cv != null && r.cv > 0.5 ? "neg" : ""}`}>{r.cv == null ? dash : r.cv > 0.5 ? "высокий" : r.cv > 0.25 ? "средний" : "низкий"}</td>
        <td className="n">{pct(r.slPct, v => v < 90)}</td>
        <td className={`n ${r.avgR == null ? "" : r.avgR >= 0 ? "pos" : "neg"}`}>{r.avgR == null ? dash : `${r.avgR >= 0 ? "+" : "−"}${Math.abs(r.avgR).toFixed(2)}R`}</td>
        <td className="n">{pct(r.lotUpPct, v => v >= 40)}</td>
        <td className="n">{pct(r.planPct)}</td>
        <td className="n">{pct(r.journalPct, v => v < 40)}</td>
        <td className={`n ${r.res == null ? "" : r.res >= 0 ? "pos" : "neg"}`}>{r.res == null ? dash : `${r.res > 0 ? "+" : ""}${r.res.toFixed(2)}%`}</td>
      </tr>))}</tbody></table></div>
  );
}
