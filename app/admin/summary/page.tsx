import Link from "next/link";
import { requireAdmin } from "@/lib/supabase";
import { summaryBundle, type Period } from "@/lib/data";
import { LEVEL_LABEL, PHASE_LABEL } from "@/lib/rules";
import { GroupChart, Pill, cls, fmtD, sg } from "@/components/ui";
import CopyReport from "@/components/CopyReport";
import ShareImage, { type CardData } from "@/components/ShareImage";

export const dynamic = "force-dynamic";

const money = (v: number, signed = false) => (signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US");
const TABS: [Period, string][] = [["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]];
const FOR: Record<Period, string> = { day: "за день", week: "за неделю", month: "за месяц", all: "за всё время" };

export default async function Summary({ searchParams }: { searchParams: { day?: string; period?: string } }) {
  const { sb } = await requireAdmin();
  const S = await summaryBundle(sb, { day: searchParams.day, period: searchParams.period });
  if (!S.count || S.empty) return (
    <div className="head"><div><h1>Сводка группы</h1><p className="sub">Сводка появится, когда хотя бы один трейдер подключит счёт и укажет начальный баланс.</p></div></div>
  );
  const P = S.period, sum = S.sum, day = P === "day";
  const href = (p: Period, d = S.anchor) => `/admin/summary?period=${p}&day=${d}`;
  const best = S.traders.find(t => (t.pnl ?? 0) > 0);
  const worst = [...S.traders].reverse().find(t => (t.pnl ?? 0) < 0);
  const attention = S.traders.filter(t => t.zone === "red" || t.zone === "yellow");
  const titleFor = day ? `за ${S.label.short}` : P === "all" ? "за всё время" : `${FOR[P]} ${S.label.short}`;
  const year = S.end.slice(0, 4);

  const report = [
    `📊 Матрёшка — Челлендж · сводка ${titleFor}`,
    `Счетов: ${S.count} · капитал ${money(S.capital)}`,
    `${day ? "День" : "Период"}: ${money(sum.pnl, true)} (${sg(sum.pct)}%) · в плюсе ${sum.plus}, в минусе ${sum.minus}, без сделок ${sum.flat}`,
    !day ? `Торговых дней: ${sum.tradingDays} · сделок: ${sum.trades}` : `Сделок: ${sum.trades}`,
    sum.bestDay && sum.worstDay ? `Лучший день группы: ${fmtD(sum.bestDay.day)} ${money(sum.bestDay.pnl, true)} · худший: ${fmtD(sum.worstDay.day)} ${money(sum.worstDay.pnl, true)}` : null,
    `Итог группы: ${money(sum.cum, true)} (${sg(sum.cumPct)}%)`,
    `Зоны: 🟢 ${S.zones.green} · ⚪ ${S.zones.work} · 🟡 ${S.zones.yellow} · 🔴 ${S.zones.red}`,
    `Фаза 1: ${S.phases.p1} · Фаза 2: ${S.phases.p2} · Funded: ${S.phases.funded} · Failed: ${S.phases.failed}`,
    best ? `Лучший результат: ${best.name} ${sg(best.pnlPct!)}%` : null,
    worst ? `Слабее всех: ${worst.name} ${sg(worst.pnlPct!)}%` : null,
    `Требуют внимания: ${attention.length ? attention.map(t => `${t.name} (${LEVEL_LABEL[t.zone]})`).join(", ") : "нет"}`,
  ].filter(Boolean).join("\n");

  const card: CardData = {
    file: `matryoshka-svodka-${P}-${S.key}`,
    caption: day ? "Сводка группы" : P === "all" ? "Сводка за всё время" : P === "week" ? "Сводка за неделю" : "Сводка за месяц",
    date: day ? `${fmtD(S.end)}.${year}` : P === "month" ? S.label.short : `${fmtD(S.start)}–${fmtD(S.end)}.${year}`,
    heroPct: sum.cumPct, heroUsd: sum.cum, capital: S.capital,
    curve: S.chart.map(d => ({ day: fmtD(d.day), v: d.cumPct })),
    tiles: [
      P === "all"
        ? { k: "Торговых дней", v: String(sum.tradingDays), f: `сделок ${sum.trades}` }
        : { k: day ? "За день" : P === "week" ? "За неделю" : "За месяц", v: money(sum.pnl, true), f: `${sg(sum.pct)}% к капиталу`, tone: sum.pnl > 0 ? "pos" : sum.pnl < 0 ? "neg" : "" },
      { k: "Плюс / минус", v: "", f: `без сделок ${sum.flat}`, parts: [{ t: String(sum.plus), tone: "pos" }, { t: " / ", tone: "" }, { t: String(sum.minus), tone: "neg" }] },
      P === "all" ? { k: "Капитал", v: money(S.capital), f: `баланс ${money(S.balance)}` } : { k: "Сделок", v: String(sum.trades), f: day ? "за день" : `${sum.tradingDays} торг. дн.` },
      { k: "Счетов", v: String(S.count), f: `Фаза 1 · ${S.phases.p1}` },
    ],
    zones: S.zones as CardData["zones"],
    best: best ? `${best.name} ${sg(best.pnlPct!)}%` : null,
    phases: { p2: S.phases.p2, funded: S.phases.funded, failed: S.phases.failed },
  };

  return (
    <>
      <div className="head">
        <div>
          <div className="titlerow"><h1>Сводка группы</h1><span className="count">{S.label.short}</span></div>
          <p className="sub" style={{ textTransform: day ? "capitalize" : undefined }}>{S.label.long}{!day ? ` · торговых дней ${sum.tradingDays}` : ""}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <nav className="seg2" aria-label="Период">{TABS.map(([p, l]) => <Link key={p} href={href(p)} aria-current={p === P ? "page" : undefined}>{l}</Link>)}</nav>
            {P !== "all" && <>
              {S.prev ? <Link className="btn ghost" href={href(P, S.prev)} aria-label="Предыдущий период">‹</Link> : <span className="btn ghost" aria-disabled="true" style={{ opacity: .35 }}>‹</span>}
              {S.next ? <Link className="btn ghost" href={href(P, S.next)} aria-label="Следующий период">›</Link> : <span className="btn ghost" aria-disabled="true" style={{ opacity: .35 }}>›</span>}
            </>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <ShareImage data={card} />
          <CopyReport text={report} />
        </div>
      </div>

      <section className="strip" aria-label="Итоги">
        <div><div className="k">Капитал в работе</div><div className="v">{money(S.capital)}</div><div className="fine">{S.count} счетов · баланс {money(S.balance)}</div></div>
        <div><div className="k">Итог группы</div><div className={`v ${cls(sum.cum)}`}>{money(sum.cum, true)}</div><div className={`fine ${cls(sum.cumPct)}`}>{sg(sum.cumPct)}% от капитала{!day ? ` на ${fmtD(S.end)}` : ""}</div></div>
        <div><div className="k">{day ? "За день" : `Результат ${FOR[P]}`}</div><div className={`v ${cls(sum.pnl)}`}>{money(sum.pnl, true)}</div><div className={`fine ${cls(sum.pct)}`}>{sg(sum.pct)}%</div></div>
        <div><div className="k">Плюс / минус</div><div className="v"><span className="pos">{sum.plus}</span> / <span className="neg">{sum.minus}</span></div><div className="fine">трейдеров {FOR[P]} · без сделок {sum.flat}</div></div>
        <div><div className="k">Сделок</div><div className="v">{sum.trades}</div><div className="fine">{day ? "за день" : `${sum.tradingDays} торг. дн. · ${(sum.trades / Math.max(1, sum.tradingDays)).toFixed(1)} в день`}</div></div>
        <div><div className="k">Зоны</div><div className="v" style={{ fontSize: 20 }}><span className="pos">{S.zones.green}</span> · <span style={{ color: "var(--gold2)" }}>{S.zones.work}</span> · <span style={{ color: "var(--amber)" }}>{S.zones.yellow}</span> · <span className="neg">{S.zones.red}</span></div><div className="fine">цель · работа · предупр. · буксир</div></div>
      </section>

      {sum.bestDay && sum.worstDay && (
        <div className="warn" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          <div className="w l-green">Лучший день группы: {fmtD(sum.bestDay.day)} · {money(sum.bestDay.pnl, true)} ({sg(sum.bestDay.pct)}%)</div>
          <div className={`w ${sum.worstDay.pnl < 0 ? "l-red" : "l-work"}`}>Худший день группы: {fmtD(sum.worstDay.day)} · {money(sum.worstDay.pnl, true)} ({sg(sum.worstDay.pct)}%)</div>
        </div>)}

      <section className="panel">
        <div className="ph"><h2>Как мы двигаемся вместе</h2><span className="fine">линия — накопленный результат, % от общего капитала · столбцы — итог дня, ${P !== "all" ? " · выбранный период подсвечен" : ""}</span></div>
        <GroupChart rows={S.chart} from={P === "all" ? null : S.start} to={P === "all" ? null : S.end} />
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Трейдеры {day ? `за ${S.label.short}` : FOR[P]}</h2><span className="fine">по результату {FOR[P]}</span></div>
          <div className="tablewrap"><table className="daytbl">
            <thead><tr><th>Трейдер</th><th>Этап</th><th className="n">Итог</th><th className="n">%</th>{!day && <th className="n">Дни + / −</th>}<th className="n">Итог фазы</th><th className="n">Сделки</th><th>Зона</th></tr></thead>
            <tbody>{S.traders.map(t => (
              <tr key={t.id} style={{ cursor: "default" }}>
                <td><Link href={`/admin/trader/${t.id}`} style={{ color: "var(--fg)", fontWeight: 700, textDecoration: "none" }}>{t.name}</Link></td>
                <td><span className="fine">{t.failed ? "Failed" : PHASE_LABEL[t.phase]}</span></td>
                <td className={`n ${cls(t.pnl ?? 0)}`}>{t.pnl == null ? "—" : money(t.pnl, true)}</td>
                <td className={`n ${cls(t.pnlPct ?? 0)}`}>{t.pnlPct == null ? "—" : `${sg(t.pnlPct)}%`}</td>
                {!day && <td className="n"><span className="pos">{t.plusDays}</span> / <span className="neg">{t.minusDays}</span></td>}
                <td className={`n ${cls(t.total ?? 0)}`}>{t.total == null ? "—" : `${sg(t.total)}%`}</td>
                <td className="n">{t.trades || "—"}</td>
                <td><Pill level={t.zone} /></td>
              </tr>))}</tbody>
          </table></div>
        </section>
        <section className="panel">
          <div className="ph"><h2>По дням</h2>{P === "all" && <span className="fine">{S.table.length} дн.</span>}</div>
          <div className="tablewrap" style={{ maxHeight: 560, overflowY: "auto" }}><table style={{ minWidth: 0 }}>
            <thead><tr><th>Дата</th><th className="n">Итог дня</th><th className="n">Группа</th><th className="n">+ / −</th></tr></thead>
            <tbody>{S.table.map(r => (
              <tr key={r.day} style={{ cursor: "default", background: day && r.day === S.end ? "rgba(232,181,74,.06)" : undefined }}>
                <td className="mono"><Link href={href("day", r.day)} style={{ color: "inherit", textDecoration: "none" }}>{fmtD(r.day)}</Link></td>
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
