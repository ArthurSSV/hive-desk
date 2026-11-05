export type Rules = {
  p1: number;        // цель фазы 1, %
  p2: number;        // цель фазы 2, %
  daily: number;     // дневной лимит убытка, %
  max: number;       // общий лимит просадки, %
  minDays: number;   // мин. торговых дней
  redDaily: number;  // красный флаг: убыток за день от, %
  redDD: number;     // красный флаг: просадка от, %
  tz: string;        // часовой пояс торгового дня (сброс дневного лимита)
};

export const DEFAULT_RULES: Rules = { p1: 8, p2: 5, daily: 5, max: 10, minDays: 4, redDaily: 3, redDD: 7, tz: "UTC" };

export function normalizeRules(r: Partial<Rules> | null | undefined): Rules {
  return { ...DEFAULT_RULES, ...(r || {}) };
}

export const PHASE_LABEL: Record<number, string> = { 1: "Фаза 1", 2: "Фаза 2", 3: "Funded" };
export const STATUS_LABEL: Record<string, string> = { active: "Активен", passed: "Пройдено", failed: "Failed" };
export const LEVEL_LABEL: Record<string, string> = { red: "Красный", yellow: "Жёлтый", green: "Зелёный", failed: "Выбыл", none: "Нет данных" };
