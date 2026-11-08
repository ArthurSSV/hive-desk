"use client";
import { useState } from "react";

/** Кнопка отправки формы с подтверждением прямо на странице. */
export default function ConfirmButton({ name, value, label, question }: { name: string; value: string; label: string; question: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="btn ghost" type="button" onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="fine">{question}</span>
      <button className="btn danger" type="submit" name={name} value={value}>Да, удалить</button>
      <button className="btn ghost" type="button" onClick={() => setAsk(false)}>Отмена</button>
    </span>
  );
}
