// Datchiklar: ArcGauge (yoy boʻylab chiziqchalar) va HealthMeter (vertikal salomatlik shkalasi).
// Ranglar mavzu tokenlaridan (--gc1/--gc2 …) olinadi, shuning uchun uchala mavzuda ishlaydi.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clamp, heat, num } from "../core/format";
import { AnimatedNumber, cx } from "./kit";
import { Icon } from "./icons";

export type GaugeTone = "cool" | "warm" | "hot" | "off";

/** Harorat → datchik rangi: 70°C gacha sovuq, 85°C gacha iliq, undan yuqori — issiq */
export const tempTone = (t: unknown): GaugeTone => { const h = heat(t); return h === "na" ? "off" : h; };
/** Foiz → datchik rangi */
export const pctTone = (p: unknown, w = 75, c = 90): GaugeTone => (!num(p) ? "off" : p >= c ? "hot" : p >= w ? "warm" : "cool");

const N = 41;          // chiziqchalar soni
const SWEEP = 240;     // yoy burchagi (gradus)
const STEP = 12;       // chiziqchalar ketma-ket yonishi orasidagi kechikish (ms)
const CX = 100, CY = 96, R1 = 69, R2 = 86;

const TICKS = Array.from({ length: N }, (_, i) => {
  const a = ((-SWEEP / 2 + (SWEEP * i) / (N - 1)) * Math.PI) / 180;
  const s = Math.sin(a), c = Math.cos(a);
  return { x1: CX + R1 * s, y1: CY - R1 * c, x2: CX + R2 * s, y2: CY - R2 * c, mix: Math.round((i / (N - 1)) * 100) };
});

/** Birinchi kadrdan keyin true — kirishda chiziqchalar 0 dan yonib chiqishi uchun */
function useArmed(): boolean {
  const [on, set] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => set(true)); return () => cancelAnimationFrame(r); }, []);
  return on;
}

export function ArcGauge({ value, max = 100, unit, label, tone, aria, format }: {
  value: unknown; max?: number; unit?: string; label: string; tone: GaugeTone; aria: string; format?: (v: number) => string;
}) {
  const armed = useArmed();
  const p = num(value) ? clamp(value / max, 0, 1) : 0;
  const k = armed ? Math.round(p * N) : 0;
  // faqat oʻzgargan chiziqchalar ketma-ket yonadi/oʻchadi — oldingi holatdan boshlab
  const prev = useRef(0);
  const lo = Math.min(prev.current, k), hi = Math.max(prev.current, k), up = k >= prev.current;
  useEffect(() => { prev.current = k; });
  return (
    <div className={cx("gauge", `tone-${tone}`)} role="img" aria-label={aria}>
      <svg viewBox="0 0 200 146" aria-hidden="true">
        <g className="g-ticks">
          {TICKS.map((t, i) => {
            const lit = i < k;
            const d = i >= lo && i < hi ? (up ? i - lo : hi - 1 - i) * STEP : 0;
            return (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={lit ? "on" : undefined}
                style={{ stroke: lit ? `color-mix(in oklab, var(--g1), var(--g2) ${t.mix}%)` : undefined, transitionDelay: `${d}ms` }} />
            );
          })}
        </g>
      </svg>
      <div className="g-c">
        <div className="g-v t-num"><AnimatedNumber value={value} fromZero format={format} />{unit && num(value) ? <sup>{unit}</sup> : null}</div>
        <div className="g-l">{label}</div>
      </div>
      <i className="g-glow" aria-hidden="true" />
    </div>
  );
}

/** Apparat kartasi: chapda nomi va modeli, oʻngda datchik */
export function GaugeCard({ icon, title, model, stats, href, more = "Batafsil", children }: {
  icon: Parameters<typeof Icon>[0]["name"]; title: string; model?: ReactNode; stats?: ReactNode; href: string; more?: string; children: ReactNode;
}) {
  return (
    <section className="pnl gcard">
      <div className="gcard-l">
        <span className="gcard-ico"><Icon name={icon} size={20} /></span>
        <div className="gcard-t">
          <h3>{title}</h3>
          {model ? <p className="gcard-m">{model}</p> : null}
          {stats ? <p className="gcard-s">{stats}</p> : null}
        </div>
        <a className="btn s gcard-more" href={href}>{more}</a>
      </div>
      <div className="gcard-g">{children}</div>
    </section>
  );
}

/** Salomatlik bahosi: gradiyentli ustun va rangli shkala; tor ekranda gorizontal */
export function HealthMeter({ score, level, title }: { score: unknown; level: string; title: string }) {
  const armed = useArmed();
  const p = num(score) ? clamp(score, 0, 100) : 0;
  const lv = level === "crit" ? "crit" : level === "warn" ? "warn" : "ok";
  return (
    <div className={cx("hm", p > 80 && "hi")} style={{ ["--p" as string]: `${armed ? p : 0}%` } as CSSProperties}>
      <div className="hm-head">
        <span className="hm-h"><Icon name="heart" size={16} />Salomatlik</span>
        <span className={cx("hm-pill", lv)}><i aria-hidden="true" />{title}</span>
      </div>
      <div className="hm-body" role="meter" aria-label="Salomatlik bahosi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={num(score) ? score : undefined}>
        <div className="hm-bar"><i /></div>
        <div className="hm-scale" aria-hidden="true">
          <span className="hm-mark"><b className="t-num"><AnimatedNumber value={score} fromZero />%</b></span>
        </div>
      </div>
    </div>
  );
}
