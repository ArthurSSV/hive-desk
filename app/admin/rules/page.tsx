import { requireAdmin } from "@/lib/supabase";
import { rulesOf } from "@/lib/data";
import { saveRules } from "@/app/actions";

export const dynamic = "force-dynamic";

const F: [string, string, string][] = [["p1", "Цель фазы 1, %", "0.5"], ["p2", "Цель фазы 2, %", "0.5"], ["daily", "Дневной лимит, %", "0.5"], ["max", "Общий лимит, %", "0.5"], ["minDays", "Мин. прибыльных дней", "1"], ["profitDayPct", "Прибыльный день от, %", "0.1"], ["redDaily", "Красный: убыток за день от, %", "0.5"], ["redDD", "Красный: просадка от, %", "0.5"]];

export default async function RulesPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { sb } = await requireAdmin();
  const R: any = await rulesOf(sb);
  return (
    <>
      <div className="head"><div><h1>Правила и пороги</h1><p className="sub">Параметры челленджа и пороги светофора. Статусы пересчитаются при следующей синхронизации (до 15 минут).</p></div></div>
      <section className="panel"><div className="ph"><h2>Classic 2-step</h2></div>
        <form action={saveRules}>
          <div className="rules">
            {F.map(([k, l, step]) => <label key={k} htmlFor={`r-${k}`}>{l}<input id={`r-${k}`} name={k} type="number" step={step} min="0" defaultValue={R[k]} /></label>)}
            <label htmlFor="r-tz">Часовой пояс торгового дня<input id="r-tz" name="tz" defaultValue={R.tz} placeholder="UTC" /></label>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}><button className="btn" type="submit">Сохранить</button>{searchParams.saved && <span className="saved">Сохранено</span>}</div>
        </form>
        <p className="fine" style={{ marginTop: 10 }}>Часовой пояс определяет, когда сбрасывается дневной лимит. Укажите тот же, что у FundedHive, например UTC или Europe/Kiev.</p>
      </section>
      <section className="panel"><div className="ph"><h2>Логика светофора</h2></div>
        <div className="warn">
          <div className="w l-red">Красный: убыток за день ≥ порога · просадка ≥ порога · сделок в 2 раза больше своей нормы · 2 дня подряд не по плану</div>
          <div className="w l-yellow">Жёлтый: 3+ убыточных дня подряд · настроение 1–2 · нет отчёта 2 дня · лот вырос в 1.5+ раза после убыточного дня</div>
          <div className="w l-green">Зелёный: нет ни одного флага</div>
        </div>
        <p className="fine" style={{ marginTop: 10 }}>Красные и жёлтые флаги, а также закрытие счёта и выполнение цели приходят в Telegram.</p>
      </section>
    </>
  );
}
