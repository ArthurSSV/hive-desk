"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Запоминает часовой пояс браузера в cookie, чтобы сервер показывал время по местному времени. */
export default function TzCookie({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== current) { document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }
    } catch { /* старый браузер — останется пояс по умолчанию */ }
  }, [current, router]);
  return null;
}
