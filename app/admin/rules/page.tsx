import { requireAdmin } from "@/lib/supabase";
import { rulesOf } from "@/lib/data";
import { saveRules } from "@/app/actions";

export const dynamic = "force-dynamic";

type F = [key: string, label: string, step: string, min?: string];
const CHALLENGE: F[] = [["p1", "Цель фазы 1, %", "0.5", "0"], ["p2", "Цель фазы 2, %", "0.5", "0"], ["daily", "Дневной лимит, %", "0.5", "0"], ["max", "Общий лимит, %", "0.5", "0"], ["minDays", "Мин. прибыльных дней", "1", "0"], ["profitDayPct", "Прибыльный день от, %", "0.1", "0"]];
const ZONES: [string, string, string, string, string][] = [
  ["zoneGreen1", "Цель близко · Фаза 1", "≥", "green", "Результат фазы от, %"],
  ["zoneGreen2", "Цель близко · Фаза 2", "≥", "green", "Результат фазы от, %"],
  ["zoneGreenF", "Цель близко · Funded", "≥", "green", "Прибыль от, %"],
  ["zoneYellow", "Предупреждение", "≤", "yellow", "Сигнал менять методичку"],
  ["zoneRed", "Буксир", "≤", "red", "Сигнал к остановке"],
];
const FLAGS: F[] = [["redDaily", "Флаг: убыток за день от, %", "0.5", "0"], ["redDD", "Флаг: просадка от, %", "0.5", "0"]];

const field = (R: any) => ([k, l, step, min]: F) => <label key={k} htmlFor={`r-${k}`}>{l}<input id={`r-${k}`} name={k} type="number" step={step} min={min} defaultValue={R[k]} /></label>;

export default async function RulesPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { sb } = await requireAdmin();
  const R: any = await rulesOf(sb);
  return (
    <>
      <div className="head"><div><h1>Правила и пороги</h1><p className="sub">Зоны светофора применяются сразу после сохранения. Параметры челленджа пересчитаются при следующей синхронизации (до 15 минут).</p></div></div>
      <form action={saveRules} style={{ display: "grid", gap: 20 }}>
        <section className="panel"><div className="ph"><h2>Зоны светофора</h2><span className="fine">по результату фазы, % от начального баланса</span></div>
          <div className="zones">
            {ZONES.map(([k, l, op, lv, hint]) => (
              <label key={k} htmlFor={`r-${k}`} className={`zone z-${lv}`}>
                <span className="zt"><span className="dot" />{l}</span>
                <span className="zi"><b>{op}</b><input id={`r-${k}`} name={k} type="number" step="0.5" defaultValue={R[k]} /><b>%</b></span>
                <span className="fine">{hint}</span>
              </label>))}
          </div>
          <div className="zscale" aria-hidden="true">
            <span className="l-red">Буксир ≤ {R.zoneRed}%</span>
            <span className="l-yellow">Предупреждение ≤ {R.zoneYellow}%</span>
            <span className="l-work">В работе</span>
            <span className="l-green">Цель близко ≥ {R.zoneGreen1}% / {R.zoneGreen2}% / {R.zoneGreenF}%</span>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>Пороги «Предупреждение» и «Буксир» — отрицательные числа, например −2 и −5. Между ними и зелёной зоной трейдер «В работе». Смена зоны приходит в Telegram.</p>
        </section>
        <section className="panel"><div className="ph"><h2>Classic 2-step</h2></div>
          <div className="rules">
            {CHALLENGE.map(field(R))}
            <label htmlFor="r-tz">Часовой пояс торгового дня<input id="r-tz" name="tz" defaultValue={R.tz} placeholder="UTC" /></label>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>Часовой пояс определяет, когда сбрасывается дневной лимит. Укажите тот же, что у FundedHive, например UTC или Europe/Kiev.</p>
        </section>
        <section className="panel"><div className="ph"><h2>Флаги поведения</h2><span className="fine">не меняют зону, показываются причинами</span></div>
          <div className="rules">{FLAGS.map(field(R))}</div>
          <div className="warn" style={{ marginTop: 12 }}>
            <div className="w l-red">Срочные: убыток за день и просадка выше порогов · сделок в 2 раза больше своей нормы · 2 дня подряд не по плану</div>
            <div className="w l-yellow">Внимание: 3+ убыточных дня подряд · настроение 1–2 · нет отчёта 2 дня · лот вырос в 1.5+ раза после убыточного дня</div>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>Трейдеры со срочными флагами попадают в «Требуют внимания» даже в зелёной зоне.</p>
        </section>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="btn" type="submit">Сохранить</button>{searchParams.saved && <span className="saved">Сохранено</span>}</div>
      </form>
    </>
  );
}
