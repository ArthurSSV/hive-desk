import { cookies } from "next/headers";

/** Часовой пояс того, кто смотрит страницу: браузер кладёт его в cookie tz (см. TzCookie). */
export function viewerTz(): string {
  try {
    const v = cookies().get("tz")?.value;
    if (v) { new Intl.DateTimeFormat("en", { timeZone: v }); return v; }
  } catch { /* неизвестный пояс */ }
  return "Europe/Kiev";
}

/** Короткое имя пояса, например GMT+2. */
export const tzLabel = (tz: string, at = new Date()) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find(p => p.type === "timeZoneName")?.value || tz;
