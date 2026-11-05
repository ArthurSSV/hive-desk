"use client";
import { useState } from "react";
import { saveWallet } from "@/app/actions";

export default function MetaMask({ wallet }: { wallet: string | null }) {
  const [w, setW] = useState(wallet), [err, setErr] = useState("");
  async function connect() {
    setErr("");
    const eth = (window as any).ethereum;
    if (!eth) return setErr("MetaMask не найден. Установите расширение или откройте сайт в браузере MetaMask.");
    try {
      const [addr] = await eth.request({ method: "eth_requestAccounts" });
      const r = await saveWallet(addr);
      if (r?.error) setErr(r.error); else setW(addr.toLowerCase());
    } catch { setErr("Подключение отменено."); }
  }
  return (
    <div className="conn">
      <div className="row">
        <div><b>MetaMask</b><span className="mono">{w || "Для статусов оплаты и выплат"}</span></div>
        {w ? <span className="ok">Подключён</span> : <button className="btn ghost" type="button" onClick={connect}>Подключить</button>}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
