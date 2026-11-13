export type Rules = {
  p1: number;        // цель фазы 1, %
  p2: number;        // цель фазы 2, %
  daily: number;     // дневной лимит убытка, %
  max: number;       // общий лимит просадки, %
  minDays: number;   // мин. прибыльных дней
  profitDayPct: number; // день считается прибыльным от, %
  zoneGreen1: number; // зелёный «цель близко» в фазе 1: результат от, %
  zoneGreen2: number; // то же в фазе 2
  zoneGreenF: number; // то же на funded-счёте
  zoneYellow: number; // жёлтый «предупреждение»: результат ≤, % (отрицательное)
  zoneRed: number;    // красный «буксир»: результат ≤, % (отрицательное)
  redDaily: number;  // красный флаг: убыток за день от, %
  redDD: number;     // красный флаг: просадка от, %
  tz: string;        // часовой пояс торгового дня (сброс дневного лимита)
};

export const DEFAULT_RULES: Rules = { p1: 8, p2: 5, daily: 5, max: 10, minDays: 3, profitDayPct: 0.5, zoneGreen1: 6, zoneGreen2: 4, zoneGreenF: 4, zoneYellow: -2, zoneRed: -5, redDaily: 3, redDD: 7, tz: "UTC" };

export function normalizeRules(r: Partial<Rules> | null | undefined): Rules {
  return { ...DEFAULT_RULES, ...(r || {}) };
}

export const PHASE_LABEL: Record<number, string> = { 1: "Фаза 1", 2: "Фаза 2", 3: "Funded" };
export const STATUS_LABEL: Record<string, string> = { active: "Активен", passed: "Пройдено", failed: "Дохлик" };
export const LEVEL_LABEL: Record<string, string> = { green: "Цель близко", work: "В работе", yellow: "Предупреждение", red: "Буксир", failed: "Failed", none: "Нет данных" };

export type Zone = "green" | "work" | "yellow" | "red";

/** Зона светофора по результату фазы (% от начального баланса). */
export function zoneOf(totalPct: number, phase: number, R: Rules): Zone {
  const v = Number(totalPct) || 0;
  if (v <= R.zoneRed) return "red";
  if (v <= R.zoneYellow) return "yellow";
  const g = phase === 1 ? R.zoneGreen1 : phase === 2 ? R.zoneGreen2 : R.zoneGreenF;
  return v >= g ? "green" : "work";
}
