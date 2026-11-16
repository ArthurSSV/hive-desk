import { requireAdmin } from "@/lib/supabase";
import { rulesOf } from "@/lib/data";
import { saveInvite, saveRules, setSelfTrader, guideSaveText } from "@/app/actions";
import GuideUpload from "@/components/GuideUpload";
import { GUIDE_BUCKET } from "@/lib/rules";
import { supabaseUrl, anonKey } from "@/lib/env";

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
  const { sb, profile } = await requireAdmin();
  const R: any = await rulesOf(sb);
  const { data: st } = await sb.from("settings").select("invite_code").eq("id", 1).single();
  const invite = ((st as any)?.invite_code as string | null) || "";
  return (
    <>
      <div className="head"><div><h1>Правила и пороги</h1><p className="sub">Зоны светофора применяются сразу после сохранения. Параметры челленджа пересчитаются при следующей синхронизации (до 15 минут).</p></div></div>
      <section className="panel">
        <div className="ph"><h2>Я тоже трейдер</h2>{profile.is_trader ? <span className="pill l-green"><span className="dot" />Включено</span> : <span className="pill l-none"><span className="dot" />Выключено</span>}</div>
        <form action={setSelfTrader} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="on" value={profile.is_trader ? "0" : "1"} />
          <button className={profile.is_trader ? "btn ghost" : "btn"} type="submit">{profile.is_trader ? "Выключить" : "Включить и подключить счёт"}</button>
          <span className="fine">В меню появится «Мой кабинет»: подключение cTrader, прогресс, сделки и дневник — как у трейдеров. Ваш счёт попадёт в «Группу», «Сводку» и команды с меткой «админ». Баланс своего счёта подтверждаете в своей карточке на странице «Группа».</span>
        </form>
        {searchParams.saved === "self" && <p className="saved" style={{ marginTop: 6 }}>Режим трейдера выключен</p>}
      </section>
      <section className="panel">
        <div className="ph"><h2>Регистрация</h2>{invite ? <span className="pill l-green"><span className="dot" />По коду</span> : <span className="pill l-yellow"><span className="dot" />Открыта всем</span>}</div>
        <form action={saveInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label className="field" htmlFor="r-invite" style={{ minWidth: 220 }}>Код приглашения<input id="r-invite" name="invite" defaultValue={invite} placeholder="например MATR2026" maxLength={40} autoComplete="off" /></label>
          <button className="btn" type="submit">Сохранить код</button>
          <button className="btn ghost" type="submit" name="gen" value="1">Сгенерировать новый</button>
        </form>
        <p className="fine" style={{ marginTop: 10 }}>Без кода зарегистрироваться нельзя. Ссылка с кодом — на странице «Группа», кнопка «Скопировать ссылку для регистрации». Новый код не влияет на тех, кто уже зарегистрирован. Пустое поле открывает регистрацию всем.</p>
        {searchParams.saved === "invite" && <p className="saved" style={{ marginTop: 6 }}>Код сохранён</p>}
      </section>
      <section className="panel" id="guide">
        <div className="ph"><h2>Материалы для трейдеров</h2><span className="fine">кнопка в шапке · файл открывают только вошедшие</span></div>
        <div style={{ display: "grid", gap: 14 }}>
          <GuideUpload url={supabaseUrl()} anon={anonKey()} bucket={GUIDE_BUCKET} current={{ name: R.guide.name, size: R.guide.size, at: R.guide.at }} />
          <form action={guideSaveText} style={{ display: "grid", gap: 12 }}>
            <div className="rules">
              <label htmlFor="g-title">Название на кнопке<input id="g-title" name="title" maxLength={60} defaultValue={R.guide.title} /></label>
              <label htmlFor="g-note">Подпись<input id="g-note" name="note" maxLength={60} defaultValue={R.guide.note} placeholder="автор Артур" /></label>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="show" value="1" defaultChecked={R.guide.show} /> Показывать трейдерам в шапке</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><button className="btn" type="submit">Сохранить</button>
              {R.guide.file && <a className="linkbtn" href="/guide" target="_blank" rel="noopener">Открыть файл ↗</a>}
              {searchParams.saved === "guide" && <span className="saved">Сохранено</span>}</div>
          </form>
        </div>
      </section>
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
            <label htmlFor="r-gs">Старт челленджа группы<input id="r-gs" name="groupStart" type="date" defaultValue={R.groupStart || ""} /></label>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>«Старт челленджа группы» — с этого дня считаются итоги, графики и картинки в «Сводке». Кабинет трейдера, зоны и итог фазы считаются по всей фазе у пропа. Дневной лимит считается как у FundedHive: от баланса на начало дня, с учётом плавающего убытка. Часовой пояс определяет, когда день начинается и лимит сбрасывается; у FundedHive это UTC. Время сброса каждый видит в своём часовом поясе.</p>
        </section>
        <section className="panel"><div className="ph"><h2>Флаги поведения</h2><span className="fine">не меняют зону, показываются причинами</span></div>
          <div className="rules">{FLAGS.map(field(R))}</div>
          <div className="warn" style={{ marginTop: 12 }}>
            <div className="w l-red">Срочные: убыток за день и просадка выше порогов · сделок в 2 раза больше своей нормы · 2 дня подряд не по плану</div>
            <div className="w l-yellow">Внимание: 3+ убыточных дня подряд · настроение 1–2 · нет отчёта 2 дня · лот вырос в 1.5+ раза после убыточного дня</div>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>Трейдеры со срочными флагами попадают в «Требуют внимания» даже в зелёной зоне.</p>
        </section>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="btn" type="submit">Сохранить</button>{searchParams.saved && !["invite", "self", "guide"].includes(searchParams.saved) && <span className="saved">Сохранено</span>}</div>
      </form>
    </>
  );
}
