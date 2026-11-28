// Торговый день Форекс. Время событий задано по местному времени самих бирж —
// летнее/зимнее время (и недели, когда США и Европа переводят часы в разные даты) пересчитываются сами.
export type RowId = "syd" | "tok" | "hk" | "fra" | "lon" | "ny";
type Span = [string, string];
export const FX_ROWS: { id: RowId; name: string; tz: string; fx?: Span; stock?: Span; lunch?: Span; kz?: Span }[] = [
  { id: "syd", name: "Сидней", tz: "Australia/Sydney", fx: ["07:00", "17:00"], stock: ["10:00", "16:00"] },
  { id: "tok", name: "Токио", tz: "Asia/Tokyo", fx: ["09:00", "17:00"], stock: ["09:00", "15:30"] },
  { id: "hk", name: "Гонконг · Китай", tz: "Asia/Hong_Kong", stock: ["09:30", "15:30"] },
  { id: "fra", name: "Франкфурт", tz: "Europe/Berlin", fx: ["08:00", "17:30"] },
  { id: "lon", name: "Лондон", tz: "Europe/London", fx: ["08:00", "17:00"], stock: ["08:00", "16:30"], lunch: ["10:00", "12:00"] },
  { id: "ny", name: "Нью-Йорк", tz: "America/New_York", fx: ["08:00", "17:00"], stock: ["09:30", "16:00"], lunch: ["12:00", "13:00"], kz: ["07:30", "08:00"] },
];
// [пояс биржи, время, событие, народное название, строка, второстепенное (метка на ленте)]
const EVENTS: [string, string, string, string, RowId, boolean?][] = [
  ["Asia/Tokyo", "09:00", "Токио: открытие Форекс и биржи", "открытие Азии", "tok"],
  ["Asia/Tokyo", "09:55", "Токио: банковский фиксинг (5 минут)", "", "tok", true],
  ["Asia/Hong_Kong", "09:00", "Гонконг и Китай: премаркет", "", "hk"],
  ["Asia/Hong_Kong", "09:30", "Гонконг и Китай: открытие бирж", "", "hk"],
  ["Asia/Tokyo", "14:30", "Токио: подготовка к закрытию биржи", "переговоры · часто разворот азиатского тренда", "tok", true],
  ["Asia/Tokyo", "15:30", "Токио: закрытие биржи", "переговоры", "tok", true],
  ["Australia/Sydney", "16:00", "Сидней: закрытие биржи и аукцион закрытия (12 минут)", "", "syd"],
  ["Australia/Sydney", "17:00", "Сидней: закрытие Форекс", "", "syd"],
  ["Europe/Berlin", "08:00", "Франкфурт: открытие биржи и Форекс в Европе", "открытие Франкфурта", "fra"],
  ["Asia/Hong_Kong", "15:30", "Гонконг и Китай: закрытие бирж", "переговоры", "hk", true],
  ["Asia/Tokyo", "17:00", "Токио: закрытие Форекс", "закрытие Азии", "tok"],
  ["Europe/London", "08:00", "Лондон: открытие Форекс и биржи", "открытие Лондона", "lon"],
  ["Europe/London", "10:00", "Лондон: начало ланча", "начало ланча", "lon"],
  ["Europe/London", "12:00", "Лондон: окончание ланча", "окончание ланча", "lon"],
  ["America/New_York", "07:30", "США: старт крупнейших банков", "премаркет · киллзона", "ny"],
  ["America/New_York", "08:00", "Нью-Йорк: открытие Форекс", "открытие Америки", "ny"],
  ["America/New_York", "09:30", "Нью-Йорк: открытие биржи", "открытие Чикаго", "ny"],
  ["Europe/London", "16:30", "Лондон: закрытие биржи", "переговоры", "lon", true],
  ["Europe/London", "17:00", "Лондон: закрытие Форекс", "закрытие Лондона", "lon"],
  ["America/New_York", "12:00", "Начало американского ланча", "окончание утренней сессии · AM", "ny"],
  ["America/New_York", "13:00", "Окончание американского ланча", "начало вечерней сессии · PM", "ny"],
  ["America/New_York", "16:00", "Нью-Йорк: закрытие биржи", "", "ny"],
  ["America/New_York", "17:00", "Нью-Йорк: закрытие Форекс", "закрытие Америки", "ny"],
];

const offMin = (tz: string, ms: number) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const g = (t: string) => +p.find(x => x.type === t)!.value;
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ms / 1000) * 1000) / 60000;
};
export const ymdIn = (tz: string, ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
/** Местное время в поясе tz (дата + ЧЧ:ММ) → момент UTC. */
export function at(tz: string, ymd: string, hm: string) {
  const [y, m, d] = ymd.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) t = Date.UTC(y, m - 1, d, h, mi) - offMin(tz, t) * 60000;
  return t;
}
const addDay = (ymd: string, n: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (ymd: string) => { const w = new Date(ymd + "T12:00:00Z").getUTCDay(); return w >= 1 && w <= 5; };

/** Форекс открыт с воскресенья 17:00 до пятницы 17:00 по Нью-Йорку. */
export function fxOpen(ms: number) {
  const ny = "America/New_York", d = ymdIn(ny, ms), w = new Date(d + "T12:00:00Z").getUTCDay();
  if (w === 6) return false;
  if (w === 5 && ms >= at(ny, d, "17:00")) return false;
  if (w === 0 && ms < at(ny, d, "17:00")) return false;
  return true;
}
export function nextOpen(ms: number) {
  const ny = "America/New_York";
  for (let i = 0; i < 8; i++) { const d = addDay(ymdIn(ny, ms), i); if (new Date(d + "T12:00:00Z").getUTCDay() === 0) { const t = at(ny, d, "17:00"); if (t > ms) return t; } }
  return ms;
}
export type FxEvent = { ms: number; name: string; alias: string; row: RowId; minor: boolean };
export function fxEvents(ms: number): FxEvent[] {
  const out: FxEvent[] = [];
  for (const [tz, t, name, alias, row, minor] of EVENTS) for (let k = -1; k <= 2; k++) {
    const d = addDay(ymdIn(tz, ms), k); if (weekday(d)) out.push({ ms: at(tz, d, t), name, alias, row, minor: !!minor });
  }
  return out.sort((a, b) => a.ms - b.ms);
}
export function fxSpans(row: RowId, key: "fx" | "stock" | "lunch" | "kz", ms: number): [number, number][] {
  const r = FX_ROWS.find(x => x.id === row)!, v = r[key]; if (!v) return [];
  const res: [number, number][] = [];
  for (let k = -1; k <= 1; k++) { const d = addDay(ymdIn(r.tz, ms), k); if (weekday(d)) res.push([at(r.tz, d, v[0]), at(r.tz, d, v[1])]); }
  return res;
}
const inSpan = (row: RowId, key: "fx" | "stock" | "lunch" | "kz", ms: number) => fxSpans(row, key, ms).some(([a, b]) => ms >= a && ms < b);
export const rowOpen = (row: RowId, ms: number) => fxOpen(ms) && (inSpan(row, "fx", ms) || inSpan(row, "stock", ms));

export type Phase = { title: string; sub: string; short: string; color: string; open: boolean };
export function fxPhase(ms: number): Phase {
  if (!fxOpen(ms)) return { title: "Выходные — рынок закрыт", sub: "", short: "Рынок закрыт", color: "var(--muted)", open: false };
  const p = (title: string, sub: string, short: string, color: string): Phase => ({ title, sub, short, color, open: true });
  if (inSpan("ny", "kz", ms)) return p("Киллзона США", "старт крупнейших банков, до открытия Америки", "Киллзона", "var(--fx-kz)");
  const lon = inSpan("lon", "fx", ms), ny = inSpan("ny", "fx", ms);
  if (inSpan("ny", "lunch", ms)) return p("Американский ланч", "между утренней (AM) и вечерней (PM) сессиями", "Ланч США", "var(--muted)");
  if (inSpan("lon", "lunch", ms)) return p("Европейский ланч", "Лондон на паузе", "Ланч Европы", "var(--muted)");
  if (lon && ny) return p("Лондон + Нью-Йорк", "пересечение сессий — самая высокая ликвидность", "Лондон + Нью-Йорк", "var(--fx-ny)");
  if (lon) return p("Лондонская сессия", "", "Лондон", "var(--fx-lon)");
  if (ny) return p("Американская сессия", "", "Нью-Йорк", "var(--fx-ny)");
  if (inSpan("fra", "fx", ms)) return p("Франкфурт", "Европа открылась, Лондон ещё нет", "Франкфурт", "var(--fx-fra)");
  if (inSpan("tok", "fx", ms)) return p("Азиатская сессия", "Токио", "Азия", "var(--fx-tok)");
  if (inSpan("syd", "fx", ms)) return p("Сидней", "тихий рынок", "Сидней", "var(--fx-syd)");
  return p("Межсессионье", "после закрытия Америки, до Азии", "Межсессионье", "var(--muted)");
}
export const fxDur = (min: number) => { const m = Math.max(0, Math.round(min)), h = Math.floor(m / 60), mm = m % 60; return h ? `${h} ч ${String(mm).padStart(2, "0")} мин` : `${mm} мин`; };
