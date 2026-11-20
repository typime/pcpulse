// AnimatedModal (tasdiqlash, nom kiritish, ekran rasmi, barcha sensorlar) va toastlar.
import { useEffect, useRef, type ReactNode } from "react";
import { S } from "../core/store";
import { closeModal, modalOk } from "../core/actions";
import { Button } from "./kit";
import { Icon } from "./icons";

function Overlay({ children, label, plain, wide }: { children: ReactNode; label: string; plain?: boolean; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current;
    const first = el?.querySelector<HTMLElement>("[autofocus], input, button.pri, button.danger, button");
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")).filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      const a = f[0], b = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", trap);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", trap); document.body.style.overflow = ""; prev?.focus?.(); };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }} style={plain ? { padding: 8 } : undefined}>
      {plain ? <div ref={box} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
        : <div className={wide ? "modal wide" : "modal"} ref={box} role="dialog" aria-modal="true" aria-label={label}>{children}</div>}
    </div>
  );
}

const UNITS: Record<string, string> = { Temperature: "°C", Voltage: "V", Fan: "RPM", Load: "%", Control: "%", Clock: "MHz", Power: "W", Data: "GB", SmallData: "MB", Level: "%", Throughput: "B/s", Current: "A", Frequency: "Hz" };

export function ModalHost() {
  const m = S.modal;
  if (!m) return null;
  if (m.kind === "confirm") {
    return (
      <Overlay label={m.title}>
        <h2>{m.title}</h2><p>{m.text}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={closeModal}>Bekor qilish</Button>
          <Button variant={m.danger ? "danger" : "pri"} onClick={modalOk}>{m.okText}</Button>
        </div>
      </Overlay>
    );
  }
  if (m.kind === "prompt") {
    return (
      <Overlay label={m.title}>
        <h2>{m.title}</h2>
        <form onSubmit={(e) => { e.preventDefault(); const v = (new FormData(e.currentTarget).get("v") as string) || ""; closeModal(); m.onSubmit(v); }}>
          <input className="in" name="v" defaultValue={m.value} maxLength={40} autoFocus aria-label={m.title} />
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="ghost" onClick={closeModal}>Bekor qilish</Button>
            <Button variant="pri" type="submit">Saqlash</Button>
          </div>
        </form>
      </Overlay>
    );
  }
  if (m.kind === "image") {
    return (
      <Overlay label="Kompyuter ekrani" plain>
        <img src={S.screenshot ? S.screenshot.url : ""} alt="Kompyuter ekrani" style={{ maxWidth: "100%", maxHeight: "94dvh", borderRadius: 14 }} onClick={closeModal} />
      </Overlay>
    );
  }
  // sensors
  const groups: Record<string, { name: string; type: string; value: number | null }[]> = {};
  for (const s of (S.sensorsRaw || {}).sensors || []) (groups[s.chip ? `${s.hw_name} / ${s.chip}` : s.hw_name || s.hw] ||= []).push(s);
  return (
    <Overlay label="Barcha sensorlar" wide>
      <Button className="close" variant="ghost" icon="x" label="Yopish" onClick={closeModal} />
      <h2>Barcha sensorlar</h2>
      <div className="t-sub" style={{ marginBottom: 12 }}>Manba: {(S.sensorsRaw || {}).source || ""}</div>
      {Object.keys(groups).length ? Object.entries(groups).map(([g, ss]) => (
        <div key={g} style={{ marginTop: 18 }}>
          <h3 className="t-h3" style={{ marginBottom: 6 }}>{g}</h3>
          <div className="scroll-x"><table className="tbl"><tbody>
            {ss.map((s, i) => <tr key={i}><td>{s.name}</td><td className="t-sub">{s.type}</td><td className="n">{s.value === null ? "—" : `${s.value} ${UNITS[s.type] || ""}`}</td></tr>)}
          </tbody></table></div>
        </div>
      )) : <p>Sensor maʼlumotlari yoʻq (cheklangan rejim).</p>}
    </Overlay>
  );
}

export function Toasts() {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {S.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === "ok" ? "check" : t.kind === "err" ? "alert" : "info"} /><span>{t.text}</span></div>
      ))}
    </div>
  );
}
