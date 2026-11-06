import Link from "next/link";
import { requireAdmin } from "@/lib/supabase";
import { summaryBundle } from "@/lib/data";
import { LEVEL_LABEL, PHASE_LABEL } from "@/lib/rules";
import { GroupChart, Pill, cls, fmtD, sg } from "@/components/ui";
import CopyReport from "@/components/CopyReport";

export const dynamic = "force-dynamic";

const money = (v: number, signed = false) => (signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US");
const longDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" });

export default async function Summary({ searchParams }: { searchParams: { day?: string } }) {
  const { sb } = await requireAdmin();
  const S = await summaryBundle(sb, searchParams.day);
  if (!S.count || !S.sel) return (
    <div className="head"><div><h1>Сводка группы</h1><p className="sub">Сводка появится, когда хотя бы один трейдер подключит счёт и укажет начальный баланс.</p></div></div>
  );
  const d = S.sel;
  const traded = d.plus + d.minus;
  const best = S.traders.filter(t => t.pnl != null && t.pnl > 0)[0];
  const worst = [...S.traders].filter(t => t.pnl != null && t.pnl < 0).sort((a, b) => a.pnl! - b.pnl!)[0];
  const attention = S.traders.filter(t => t.zone === "red" || t.zone === "yellow");
  const report = [
    `📊 Матрёшка — Челлендж · сводка за ${fmtD(d.day)}`,
    `Счетов: ${S.count} · капитал ${money(S.capital)}`,
    `День: ${money(d.pnl, true)} (${sg(d.pct)}%) · в плюсе ${d.plus}, в минусе ${d.minus}, без сделок ${d.flat}`,
    `Итог группы: ${money(d.cum, true)} (${sg(d.cumPct)}%)`,
    `Зоны: 🟢 ${d.zones.green} · ⚪ ${d.zones.work} · 🟡 ${d.zones.yellow} · 🔴 ${d.zones.red}`,
    `Фаза 1: ${S.phases.p1} · Фаза 2: ${S.phases.p2} · Funded: ${S.phases.funded} · Failed: ${S.phases.failed}`,
    best ? `Лучший день: ${best.name} ${sg(best.pnlPct!)}%` : null,
    worst ? `Худший день: ${worst.name} ${sg(worst.pnlPct!)}%` : null,
    `Требуют внимания: ${attention.length ? attention.map(t => `${t.name} (${LEVEL_LABEL[t.zone]})`).join(", ") : "нет"}`,
  ].filter(Boolean).join("\n");

  return (
    <>
      <div className="head">
        <div>
          <div className="titlerow"><h1>Сводка группы</h1><span className="count">{fmtD(d.day)}</span></div>
          <p className="sub" style={{ textTransform: "capitalize" }}>{longDate(d.day)}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {S.prev ? <Link className="btn ghost" href={`/admin/summary?day=${S.prev}`}>‹ {fmtD(S.prev)}</Link> : <span className="btn ghost" aria-disabled="true" style={{ opacity: .4 }}>‹</span>}
            {S.next ? <Link className="btn ghost" href={`/admin/summary?day=${S.next}`}>{fmtD(S.next)} ›</Link> : <span className="btn ghost" aria-disabled="true" style={{ opacity: .4 }}>›</span>}
          </div>
        </div>
        <CopyReport text={report} />
      </div>

      <section className="strip" aria-label="Итоги">
        <div><div className="k">Капитал в работе</div><div className="v">{money(S.capital)}</div><div className="fine">{S.count} счетов · баланс {money(S.balance)}</div></div>
        <div><div className="k">Итог группы</div><div className={`v ${cls(d.cum)}`}>{money(d.cum, true)}</div><div className={`fine ${cls(d.cumPct)}`}>{sg(d.cumPct)}% от капитала</div></div>
        <div><div className="k">За день</div><div className={`v ${cls(d.pnl)}`}>{money(d.pnl, true)}</div><div className={`fine ${cls(d.pct)}`}>{sg(d.pct)}%</div></div>
        <div><div className="k">Плюс / минус</div><div className="v"><span className="pos">{d.plus}</span> / <span className="neg">{d.minus}</span></div><div className="fine">торговали {traded} из {S.count} · без сделок {d.flat}</div></div>
        <div><div className="k">Сделок за день</div><div className="v">{d.trades}</div><div className="fine">в среднем {traded ? (d.trades / traded).toFixed(1) : 0} на трейдера</div></div>
        <div><div className="k">Зоны</div><div className="v" style={{ fontSize: 20 }}><span className="pos">{d.zones.green}</span> · <span style={{ color: "var(--gold2)" }}>{d.zones.work}</span> · <span style={{ color: "var(--amber)" }}>{d.zones.yellow}</span> · <span className="neg">{d.zones.red}</span></div><div className="fine">цель · работа · предупр. · буксир</div></div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Как мы двигаемся вместе</h2><span className="fine">линия — накопленный результат, % от общего капитала · столбцы — итог дня, $</span></div>
        <GroupChart rows={S.days.slice(-30)} sel={d.day} />
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Трейдеры за {fmtD(d.day)}</h2><span className="fine">по итогу дня</span></div>
          <div className="tablewrap"><table className="daytbl">
            <thead><tr><th>Трейдер</th><th>Этап</th><th className="n">Итог дня</th><th className="n">%</th><th className="n">Итог фазы</th><th className="n">Сделки</th><th>Зона</th></tr></thead>
            <tbody>{S.traders.map(t => (
              <tr key={t.id} style={{ cursor: "default" }}>
                <td><Link href={`/admin/trader/${t.id}`} style={{ color: "var(--fg)", fontWeight: 700, textDecoration: "none" }}>{t.name}</Link></td>
                <td><span className="fine">{t.status === "failed" ? "Failed" : PHASE_LABEL[t.phase]}</span></td>
                <td className={`n ${cls(t.pnl ?? 0)}`}>{t.pnl == null ? "—" : money(t.pnl, true)}</td>
                <td className={`n ${cls(t.pnlPct ?? 0)}`}>{t.pnlPct == null ? "—" : `${sg(t.pnlPct)}%`}</td>
                <td className={`n ${cls(t.total ?? 0)}`}>{t.total == null ? "—" : `${sg(t.total)}%`}</td>
                <td className="n">{t.trades || "—"}</td>
                <td><Pill level={t.zone} /></td>
              </tr>))}</tbody>
          </table></div>
        </section>
        <section className="panel">
          <div className="ph"><h2>По дням</h2></div>
          <div className="tablewrap"><table style={{ minWidth: 380 }}>
            <thead><tr><th>Дата</th><th className="n">Итог дня</th><th className="n">Группа</th><th className="n">+ / −</th></tr></thead>
            <tbody>{[...S.days].reverse().slice(0, 14).map(r => (
              <tr key={r.day} style={{ cursor: "default", background: r.day === d.day ? "rgba(232,181,74,.06)" : undefined }}>
                <td className="mono"><Link href={`/admin/summary?day=${r.day}`} style={{ color: "inherit", textDecoration: "none" }}>{fmtD(r.day)}</Link></td>
                <td className={`n ${cls(r.pnl)}`}>{money(r.pnl, true)}</td>
                <td className={`n ${cls(r.cumPct)}`}>{sg(r.cumPct)}%</td>
                <td className="n"><span className="pos">{r.plus}</span> / <span className="neg">{r.minus}</span></td>
              </tr>))}</tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
