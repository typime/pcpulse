// Dizayn tizimi komponentlari: GlassCard (Panel), SectionHeader, PremiumButton, Segmented, Switch, Select, Field,
// StatusIndicator (Dot), Tag, Note, Meter, Ring, AnimatedNumber, Kv, Empty, Skeleton.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { clamp, num } from "../core/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Har `ms` da qayta chizish (sanoqlar, “oldin” yozuvlari uchun) */
export function useNow(ms = 1000): number {
  const [now, set] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ---------------------------------------------------------------- Panel (GlassCard)
export function Panel({ children, className, tone, as = "section", style, ...rest }: {
  children: ReactNode; className?: string; tone?: "hero" | "flush" | "tight" | "sunken"; as?: "section" | "div" | "article"; style?: CSSProperties; [k: string]: unknown;
}) {
  const T = as;
  return <T className={cx("pnl", tone, className)} style={style} {...rest}>{children}</T>;
}

export function SectionHeader({ title, sub, right, id }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="sec-head">
      <div><h2 className="t-h3" id={id}>{title}</h2>{sub ? <div className="t-sub">{sub}</div> : null}</div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- PremiumButton
type BtnProps = {
  children?: ReactNode; icon?: IconName; variant?: "pri" | "danger" | "ghost"; size?: "s"; busy?: boolean; disabled?: boolean;
  onClick?: () => void; href?: string; target?: string; type?: "button" | "submit"; className?: string; title?: string; label?: string; block?: boolean;
};
export function Button({ children, icon, variant, size, busy, disabled, onClick, href, target, type = "button", className, title, label, block }: BtnProps) {
  const cls = cx("btn", variant, size, !children && icon && "icon", busy && "busy", block && "block", className);
  const inner = <>{icon ? <Icon name={icon} /> : null}{children ? <span>{children}</span> : null}</>;
  if (href) return <a className={cls} href={href} target={target} rel={target ? "noopener" : undefined} title={title} aria-label={label}>{inner}</a>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title} aria-label={label || title} aria-busy={busy || undefined}>{inner}</button>;
}

// ---------------------------------------------------------------- Segmented (siljiydigan koʻrsatkich bilan)
export function Segmented<T extends string | number>({ options, value, onChange, label, className }: {
  options: [T, string][]; value: T; onChange: (v: T) => void; label: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const b = el.querySelector<HTMLButtonElement>('button[aria-checked="true"]');
      setInd(b ? { x: b.offsetLeft, w: b.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div className={cx("seg", className)} role="radiogroup" aria-label={label} ref={ref}>
      {ind ? <span className="seg-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} /> : null}
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => v !== value && onChange(v)}>{t}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Switch
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="sw">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

// ---------------------------------------------------------------- Select
export function Select<T extends string | number>({ value, options, onChange, label, className, style }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string; className?: string; style?: CSSProperties;
}) {
  const isNum = typeof value === "number";
  return (
    <span className={cx("sel", className)} style={style}>
      <select className="in" aria-label={label} value={String(value)} onChange={(e) => onChange((isNum ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
      </select>
      <Icon name="chevD" />
    </span>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return <div className="fld"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

// ---------------------------------------------------------------- StatusIndicator, Tag, Note
export function Dot({ level, live, label }: { level?: string; live?: boolean; label?: string }) {
  return <span className={cx("dot", level, live && "live")} role={label ? "img" : undefined} aria-label={label} />;
}
export function Tag({ children, level, title }: { children: ReactNode; level?: string; title?: string }) {
  return <span className={cx("tag")} title={title}>{level ? <Dot level={level} /> : null}<span>{children}</span></span>;
}
export function Note({ tone = "info", children, icon }: { tone?: "info" | "warn" | "crit"; children: ReactNode; icon?: IconName }) {
  return (
    <div className={cx("note", tone)} role={tone === "crit" ? "alert" : "status"}>
      <Icon name={icon || (tone === "info" ? "info" : "alert")} />
      <div className="note-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Meter
export function Meter({ pct, color, thick, label }: { pct: unknown; color?: string; thick?: boolean; label?: string }) {
  const p = clamp(num(pct) ? pct : 0, 0, 100);
  return (
    <div className={cx("meter", thick && "thick")} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={label}>
      <i style={{ width: `${p.toFixed(1)}%`, ["--c" as string]: color } as CSSProperties} />
    </div>
  );
}

// ---------------------------------------------------------------- AnimatedNumber
export function AnimatedNumber({ value, format = (v) => String(Math.round(v)), duration = 600 }: { value: unknown; format?: (v: number) => string; duration?: number }) {
  const target = num(value) ? value : null;
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number | null>(target);
  useEffect(() => {
    if (target === null) { setShown(null); from.current = null; return; }
    const start = from.current;
    if (start === null || reduceMotion() || Math.abs(target - start) < 1e-9) { setShown(target); from.current = target; return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      const v = start + (target - start) * e;
      setShown(v); from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{shown === null ? "—" : format(shown)}</>;
}

// ---------------------------------------------------------------- Ring (Gauge)
export function Ring({ pct, color, size = 120, stroke = 10, children, label }: { pct: unknown; color?: string; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = clamp(num(pct) ? pct : 0, 0, 100);
  return (
    <div className="ring" style={{ width: size, height: size, ["--c" as string]: color } as CSSProperties} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="val" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Kv, Empty, Skeleton
export function Kv({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="kv">{rows.map(([k, v], i) => <div key={i} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return <div className="empty"><div className="ico"><Icon name={icon} /></div><h3 className="t-h2">{title}</h3>{children}</div>;
}
export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}
