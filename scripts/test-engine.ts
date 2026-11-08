// Проверка движка метрик на синтетических сделках: npm test
import assert from "node:assert/strict";
import { computeAccount, summarize, isProfitDay } from "../lib/engine";
import { DEFAULT_RULES, zoneOf } from "../lib/rules";
import { buildPositions, minEquityByDay } from "../lib/equity";

const R = { ...DEFAULT_RULES, tz: "UTC", minDays: 4 };
const deal = (day: string, profit: number, close = true, lots = 1) => ({ exec_ts: `${day}T10:00:00Z`, is_close: close, net_profit: profit, volume: lots * 100 * 100000 });
const pair = (day: string, profit: number, lots = 1) => [deal(day, 0, false, lots), deal(day, profit, true, lots)];

// 1. Проходит фазу 1: +2% × 4 дня = +8% (прибыльных дней ≥ 3)
let r = computeAccount({ phase: 1, initialBalance: 50000, rules: R, startDay: "2026-11-02", today: "2026-11-06", journal: [],
  deals: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap(d => pair(d, 1000)) });
assert.equal(r.status, "passed"); assert.equal(r.statusDay, "2026-11-05"); assert.equal(r.days.at(-1)!.total_pct, 8);

// 2. Нарушение дневного лимита: −5.2% за день
r = computeAccount({ phase: 1, initialBalance: 10000, rules: R, startDay: "2026-11-02", today: "2026-11-04", journal: [], deals: [...pair("2026-11-02", 100), ...pair("2026-11-03", -520)] });
assert.equal(r.status, "failed"); assert.equal(r.days.at(-1)!.breach, "daily"); assert.ok(r.days.at(-1)!.flags.some(f => f.lv === "red"));
assert.equal(r.days.at(-1)!.level, "yellow"); // −4.2% результата фазы → зона «Предупреждение»

// 3. Нарушение общего лимита серией убытков, с жёлтым флагом серии до этого
r = computeAccount({ phase: 2, initialBalance: 10000, rules: R, startDay: "2026-11-02", today: "2026-11-06", journal: [],
  deals: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap(d => pair(d, -260)) });
assert.equal(r.days[2].flags.some(f => f.t.includes("убыточных")), true);
assert.equal(r.status, "failed"); assert.equal(r.days.at(-1)!.breach, "max");

// 4. Овертрейдинг и рост лота после убытка
const many = Array.from({ length: 8 }, () => pair("2026-11-05", -10, 2)).flat();
r = computeAccount({ phase: 1, initialBalance: 10000, rules: R, startDay: "2026-11-02", today: "2026-11-05", journal: [],
  deals: [...pair("2026-11-02", 50), ...pair("2026-11-03", 20), ...pair("2026-11-04", -30), ...many] });
const t = r.days.at(-1)!;
assert.ok(t.flags.some(f => f.t.startsWith("Овертрейдинг")), "overtrading");
assert.ok(t.flags.some(f => f.t.startsWith("Лот")), "lot increase");
assert.ok(t.flags.some(f => f.lv === "red"));

// 5. Дневник: настроение и «не по плану» 2 дня подряд
r = computeAccount({ phase: 1, initialBalance: 10000, rules: R, startDay: "2026-11-02", today: "2026-11-03", deals: [...pair("2026-11-02", 10), ...pair("2026-11-03", 10)],
  journal: [{ day: "2026-11-02", mood: 3, plan: false }, { day: "2026-11-03", mood: 2, plan: false }] });
assert.ok(r.days[1].flags.some(f => f.t.includes("не по плану")));
assert.ok(r.days[1].flags.some(f => f.t.includes("Настроение")));

// 6. Пропуск отчётов и сводка
r = computeAccount({ phase: 1, initialBalance: 10000, rules: R, startDay: "2026-11-02", today: "2026-11-04", deals: pair("2026-11-02", 100), journal: [] });
assert.ok(r.days[1].flags.some(f => f.t === "Нет отчёта 2 дня"));
const s = summarize(r.days); assert.equal(s.tradingDays, 1); assert.equal(s.total, 1);
// до подключения отчёт не требуется
r = computeAccount({ phase: 1, initialBalance: 10000, rules: R, startDay: "2026-11-05", today: "2026-11-05", deals: [...pair("2026-11-02", 10), ...pair("2026-11-03", 10)], journal: [] });
assert.ok(!r.days.some(d => d.flags.some(f => f.t === "Нет отчёта 2 дня")));

// 7. Эквити: SELL 0.2 XAU (20 унций) по 4000, цена доходила до 4020 → плавающий −$400 на счёте $50 000
const xd = [
  { position_id: 1, symbol_id: 41, side: "sell", volume: 2000, exec_ts: "2026-11-04T10:00:00Z", is_close: false, price: 4000, entry_price: null, conv: null, net_profit: 0 },
  { position_id: 1, symbol_id: 41, side: "buy", volume: 2000, exec_ts: "2026-11-04T10:05:00Z", is_close: true, price: 3990, entry_price: 4000, conv: 1, net_profit: 200 },
];
const t0 = Date.parse("2026-11-04T10:00:00Z") / 60000;
const bars = new Map([[1, [[t0, 4000, 4005, 3998, 4004], [t0 + 1, 4004, 4020, 4003, 4015], [t0 + 2, 4015, 4016, 3990, 3990]]]]);
const me = minEquityByDay({ initial: 50000, deals: xd, positions: buildPositions(xd), bars, tz: "UTC" });
assert.equal(me.get("2026-11-04"), 49600);
r = computeAccount({ phase: 1, initialBalance: 50000, rules: R, startDay: "2026-11-04", today: "2026-11-04", journal: [], minEquity: me,
  deals: xd.map(d => ({ exec_ts: d.exec_ts, is_close: d.is_close, net_profit: d.net_profit, volume: d.volume })) });
assert.equal(r.days[0].dd_pct, 0.8); assert.equal(r.days[0].day_loss_pct, 0.8); assert.equal(r.days[0].total_pct, 0.4);

// 8. Зоны светофора по результату фазы
assert.equal(zoneOf(6, 1, R), "green"); assert.equal(zoneOf(5.9, 1, R), "work");
assert.equal(zoneOf(4, 2, R), "green"); assert.equal(zoneOf(-2, 1, R), "yellow");
assert.equal(zoneOf(-4.99, 2, R), "yellow"); assert.equal(zoneOf(-5, 1, R), "red");

// 9. Прибыльный день считается только над стартовым балансом
assert.equal(isProfitDay(0, 1, 1), true);       // с нуля +1%
assert.equal(isProfitDay(2, 3, 1), true);       // в плюсе ещё +1%
assert.equal(isProfitDay(-0.5, 0.5, 1), false); // отыграл минус, над стартом только +0.5%
assert.equal(isProfitDay(-0.5, 1.2, 1), true);  // над стартом +1.2%
assert.equal(isProfitDay(-3, -1.5, 1), false);  // весь день ниже старта

console.log("engine: все проверки пройдены");
