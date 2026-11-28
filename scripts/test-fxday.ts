// Проверка торгового дня: зимнее время по МСК совпадает с таблицей клуба
import assert from "node:assert/strict";
import { fxEvents, fxOpen, fxPhase, at } from "../lib/fxday";
const msk = (ms: number) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const t = Date.UTC(2026, 10, 27, 9, 0); // пт 27.11, 12:00 МСК
const day = fxEvents(t).filter(e => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(e.ms)) === "2026-11-27");
const get = (n: string) => msk(day.find(e => e.name.startsWith(n))!.ms);
assert.equal(get("Токио: открытие"), "03:00"); assert.equal(get("Франкфурт"), "10:00"); assert.equal(get("Лондон: открытие"), "11:00");
assert.equal(get("Лондон: начало ланча"), "13:00"); assert.equal(get("США: старт"), "15:30"); assert.equal(get("Нью-Йорк: открытие Форекс"), "16:00");
assert.equal(get("Нью-Йорк: открытие биржи"), "17:30"); assert.equal(get("Лондон: закрытие Форекс"), "20:00");
// лето: Лондон 10:00 МСК, киллзона 14:30
const s = Date.UTC(2026, 6, 15, 9, 0), sd = fxEvents(s).filter(e => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(e.ms)) === "2026-07-15");
assert.equal(msk(sd.find(e => e.name.startsWith("Лондон: открытие"))!.ms), "10:00"); assert.equal(msk(sd.find(e => e.name.startsWith("США: старт"))!.ms), "14:30");
// выходные
assert.equal(fxOpen(Date.UTC(2026, 10, 28, 12)), false); assert.equal(fxOpen(Date.UTC(2026, 10, 27, 12)), true);
assert.equal(fxPhase(Date.UTC(2026, 10, 27, 12, 40)).short, "Киллзона");
assert.ok(at("Europe/London", "2026-03-30", "08:00") === Date.UTC(2026, 2, 30, 7, 0)); // BST
console.log("fxday ok");
