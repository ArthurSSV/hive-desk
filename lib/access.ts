/** Права доступа счёта (ProtoOAAccessRights): cTrader отдаёт число или имя; без поля — полный доступ. */
export type Access = "full" | "close_only" | "no_trading" | "no_login";
export function accessOf(v: number | string | null | undefined): Access {
  const k = String(v ?? 0).toUpperCase();
  return k === "1" || k === "CLOSE_ONLY" ? "close_only" : k === "2" || k === "NO_TRADING" ? "no_trading" : k === "3" || k === "NO_LOGIN" ? "no_login" : "full";
}
export const ACCESS_LABEL: Record<string, string> = { full: "торговля разрешена", close_only: "только закрытие позиций", no_trading: "торговля отключена", no_login: "вход отключён" };
