"use client";
import { useState } from "react";
import { removeTrader } from "@/app/actions";

export default function ConfirmRemove({ id, name }: { id: string; name: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn ghost" type="button" onClick={() => setAsk(true)}>Убрать из группы</button>;
  return (
    <form action={removeTrader} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="user" value={id} />
      <p style={{ margin: 0 }}>Убрать {name || "трейдера"} из группы? Аккаунт, подключение cTrader и вся статистика будут удалены без возможности восстановления.</p>
      <div style={{ display: "flex", gap: 8 }}><button className="btn danger" type="submit">Удалить</button><button className="btn ghost" type="button" onClick={() => setAsk(false)}>Отмена</button></div>
    </form>
  );
}
