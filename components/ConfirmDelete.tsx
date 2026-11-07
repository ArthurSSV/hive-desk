"use client";
import { useState } from "react";

/** Удаление с подтверждением прямо на странице. */
export default function ConfirmDelete({ id, name, action }: { id: number; name: string; action: (fd: FormData) => void }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn ghost" type="button" onClick={() => setAsk(true)}>Удалить</button>;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="fine">Удалить «{name}»?</span>
      <button className="btn danger" type="submit" formAction={action} name="id" value={id}>Удалить</button>
      <button className="btn ghost" type="button" onClick={() => setAsk(false)}>Отмена</button>
    </span>
  );
}
