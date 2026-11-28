"use client";
// Торговый день Форекс: плашка в шапке, точка на вкладке и вкладка «Торговый день» в кабинете.
// Всё считается в браузере раз в секунду — без запросов к серверу.
import { useEffect, useRef, useState } from "react";
import { FX_ROWS, fxEvents, fxOpen, fxPhase, fxSpans, fxDur, nextOpen, rowOpen, at, ymdIn, type FxEvent } from "@/lib/fxday";

const COLOR: Record<string, string> = { syd: "var(--fx-syd)", tok: "var(--fx-tok)", hk: "var(--fx-hk)", fra: "var(--fx-fra)", lon: "var(--fx-lon)", ny: "var(--fx-ny)" };

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}
const fmt = (tz: string, ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...o }).format(new Date(ms));
const hm = (tz: string, ms: number) => fmt(tz, ms, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function EventRow({ e, now, tz, first }: { e: FxEvent; now: number; tz: string; first?: boolean }) {
  return (
    <div className={`fxev${first ? " next" : ""}${e.ms <= now ? " past" : ""}`}>
      <span className="t mono">{hm(tz, e.ms)}</span>
      <span>{e.name}{e.alias && <span className="w">«{e.alias}»</span>}</span>
      <span className="in">{e.ms > now ? fxDur((e.ms - now) / 6e4) : ""}</span>
    </div>);
}
function Closed({ now, tz }: { now: number; tz: string }) {
  const o = nextOpen(now);
  return <p className="fine" style={{ margin: "6px 0 0" }}>Рынок закрыт. Откроется {fmt(tz, o, { weekday: "long" })} в {hm(tz, o)} — через {fxDur((o - now) / 6e4)}.</p>;
}
const Upcoming = ({ now, tz, n }: { now: number; tz: string; n: number }) =>
  fxOpen(now) ? <>{fxEvents(now).filter(e => e.ms > now).slice(0, n).map((e, i) => <EventRow key={e.ms + e.name} e={e} now={now} tz={tz} first={!i} />)}</> : <Closed now={now} tz={tz} />;

/** Плашка в шапке: фаза рынка и следующее событие; по нажатию — ближайшие события. */
export function FxPill({ tz }: { tz: string }) {
  const now = useNow(), [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (now == null) return null;
  const ph = fxPhase(now), nx = fxEvents(now).find(e => e.ms > now);
  return (
    <span ref={box} className="fxwrap">
      <button type="button" className="fxpill" aria-expanded={open} onClick={() => setOpen(!open)} title="Торговый день Форекс">
        <span className={`dot${ph.open ? " live" : ""}`} style={{ background: ph.color }} />
        <b>{ph.short}</b><span className="m mono">{hm(tz, now)}</span>
        <span className="m hide-sm">· {ph.open && nx ? `${nx.alias || nx.name} через ${fxDur((nx.ms - now) / 6e4)}` : `откроется через ${fxDur((nextOpen(now) - now) / 6e4)}`}</span>
      </button>
      {open && (
        <div className="fxpop" role="dialog" aria-label="Торговый день">
          <div className="fine" style={{ letterSpacing: ".06em", textTransform: "uppercase" }}>Торговый день · {fmt(tz, now, { weekday: "long" })}</div>
          <div className="fxphase" style={{ margin: "6px 0 8px" }}><span className="dot" style={{ background: ph.color }} />{ph.title}</div>
          <Upcoming now={now} tz={tz} n={5} />
        </div>)}
    </span>);
}

/** Точка на вкладке: мигает, пока рынок открыт. */
export function FxTabDot() {
  const now = useNow();
  return now == null ? null : <span className={`fxdot${fxOpen(now) ? "" : " off"}`} aria-hidden="true" />;
}

/** Вкладка «Торговый день»: лента суток по биржам, ближайшие события и весь день. */
export default function FxDay({ tz }: { tz: string }) {
  const now = useNow(), wrap = useRef<HTMLDivElement>(null), scrolled = useRef(false);
  useEffect(() => {
    // На телефоне лента прокручивается к текущему времени один раз
    const w = wrap.current, l = w?.querySelector(".fxnow") as HTMLElement | null;
    if (!scrolled.current && w && l && innerWidth < 760 && w.scrollWidth > w.clientWidth + 4) { w.scrollLeft = Math.max(0, l.offsetLeft - w.clientWidth / 2); scrolled.current = true; }
  });
  if (now == null) return <section className="panel"><p className="fine" style={{ margin: 0 }}>Загружаю торговый день…</p></section>;
  const ph = fxPhase(now), ev = fxEvents(now);
  const ds = at(tz, ymdIn(tz, now), "00:00"), de = ds + 864e5, X = (ms: number) => ((ms - ds) / 864e5) * 100;
  const clip = ([a, b]: [number, number]) => [Math.max(a, ds), Math.min(b, de)] as const;
  const today = ev.filter(e => e.ms >= ds && e.ms < de), nx = ev.find(e => e.ms > now);
  return (
    <>
      <section className="panel">
        <div className="fxhead">
          <div className="fxtitle"><h2 style={{ margin: 0 }}>Торговый день</h2><span className="fxclock mono">{fmt(tz, now, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}</span><span className="fine">{fmt(tz, now, { weekday: "long", day: "numeric", month: "long" })}</span></div>
          <div className="fxphase"><span className="dot" style={{ background: ph.color }} />{ph.title}<span className="fine">{ph.sub ? `· ${ph.sub}` : ph.open && nx ? `· дальше ${nx.name} в ${hm(tz, nx.ms)}` : ""}</span></div>
        </div>
        <div className="fxbody">
          <div className="fxtlwrap" ref={wrap}>
            <div className="fxtl">
              <div className="fxhours">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: `${i * 12.5}%` }}>{String(i * 3).padStart(2, "0")}:00</span>)}</div>
              {FX_ROWS.map(r => {
                const on = rowOpen(r.id, now), c = COLOR[r.id];
                return (
                  <div className="fxrow" key={r.id}>
                    <span className="nm" style={{ color: on ? c : "var(--muted)" }}>{r.name}</span>
                    {(["fx", "stock"] as const).flatMap(k => fxSpans(r.id, k, now).map(s => { const [a, b] = clip(s); return b > a ? <i key={k + s[0]} className={`bar${k === "stock" ? " stock" : ""}`} title={`${r.name}: ${k === "fx" ? "Форекс" : "биржа"} ${hm(tz, s[0])}–${hm(tz, s[1])}`} style={{ left: `${X(a)}%`, width: `${X(b) - X(a)}%`, background: c, opacity: on ? undefined : 0.45 }} /> : null; }))}
                    {fxSpans(r.id, "lunch", now).map(s => { const [a, b] = clip(s); return b > a ? <i key={"l" + s[0]} className="lunch" title={`Ланч ${hm(tz, s[0])}–${hm(tz, s[1])}`} style={{ left: `${X(a)}%`, width: `${X(b) - X(a)}%` }} /> : null; })}
                    {fxSpans(r.id, "kz", now).map(s => { const [a, b] = clip(s); return b > a ? <i key={"k" + s[0]} className="kz" title={`Киллзона ${hm(tz, s[0])}–${hm(tz, s[1])}`} style={{ left: `${X(a)}%`, width: `${Math.max(0.7, X(b) - X(a))}%` }} /> : null; })}
                    {ev.filter(e => e.row === r.id && e.minor && e.ms >= ds && e.ms < de).map(e => <i key={"t" + e.ms} className="tick" title={`${hm(tz, e.ms)} ${e.name}`} style={{ left: `${X(e.ms)}%` }} />)}
                  </div>);
              })}
              <i className="fxnow" style={{ left: `calc(96px + (100% - 96px) * ${X(now) / 100})` }} />
            </div>
            <div className="fxlegend">
              <span><i style={{ background: "var(--fx-lon)" }} />Форекс-сессия</span>
              <span><i style={{ background: "var(--fx-lon)", height: 5, filter: "brightness(.75)" }} />Фондовая биржа</span>
              <span><i className="lunch-i" />Ланч</span>
              <span><i className="kz-i" />Киллзона</span>
              <span><i style={{ width: 2, background: "var(--fg)", opacity: .5 }} />Фиксинг · «переговоры»</span>
            </div>
          </div>
          <div><div className="fine" style={{ letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>Дальше</div><Upcoming now={now} tz={tz} n={5} /></div>
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h2>Весь день</h2><span className="fine">время — {fmt(tz, now, { timeZoneName: "short" }).split(" ").pop()}</span></div>
        {today.length ? <div className="fxall">{today.map(e => <EventRow key={e.ms + e.name} e={e} now={now} tz={tz} />)}</div> : <p className="fine" style={{ margin: 0 }}>Сегодня выходной — событий нет.</p>}
      </section>
    </>);
}
