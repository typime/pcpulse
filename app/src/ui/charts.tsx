// MonitoringChart (24 soatlik chiziqli grafik, kursor bilan), Sparkline, UsageBars.
// Grafiklar konteyner kengligida haqiqiy piksellarda chiziladi — matn choʻzilmaydi.
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { clamp, dayLabel, fmtDur, hhmm, MONTHS, num, pad2, parseDay, WD_S } from "../core/format";

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el); setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------------------------------------------------------------- Sparkline
export function Sparkline({ values, color, max = 100, height = 46 }: { values: (number | undefined | null)[]; color: string; max?: number; height?: number }) {
  const id = useId().replace(/:/g, "");
  const w = 240, h = height;
  const v = values.slice(-60);
  const ok = v.filter(num).length >= 2;
  const n = v.length;
  const pts = ok ? v.map((x, i) => [(i / (n - 1)) * w, h - 3 - (clamp(num(x) ? x : 0, 0, max) / max) * (h - 8)]) : [];
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height, ["--c" as string]: color } as CSSProperties} aria-hidden="true">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {ok ? <><path d={`${line}L${w} ${h}L0 ${h}Z`} fill={`url(#sg${id})`} /><path className="ln" d={line} /></> : null}
    </svg>
  );
}

// ---------------------------------------------------------------- MonitoringChart
export function LineChart({ ts, vals, max, unit = "", color = "var(--c-cpu)", label }: {
  ts: number[]; vals: (number | null)[]; max?: number; unit?: string; color?: string; label: string;
}) {
  const id = useId().replace(/:/g, "");
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = W < 520 ? 190 : 220, L = 34, B = 24, T = 10, R = 6;
  const pts = ts.map((t, i) => [t, vals[i]] as [number, number | null]).filter((p): p is [number, number] => num(p[1]));
  if (pts.length < 2) return <div ref={ref} className="chart-wrap"><div className="t-sub" style={{ padding: "48px 0", textAlign: "center" }}>Hali yetarli maʼlumot yoʻq — grafik bir necha daqiqadan soʻng paydo boʻladi.</div></div>;
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const vmax = max || Math.max(10, Math.ceil(Math.max(...pts.map((p) => p[1])) / 10) * 10);
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - clamp(v, 0, vmax) / vmax) * (H - T - B);
  let d = "", prev: number | null = null, segStart = 0;
  const areas: string[] = [];
  pts.forEach(([t, v], i) => {
    const gap = prev !== null && t - prev > 600;
    if (gap) { areas.push(area(segStart, i - 1)); segStart = i; }
    d += `${gap || !d ? "M" : "L"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`; prev = t;
  });
  areas.push(area(segStart, pts.length - 1));
  function area(a: number, b: number) {
    if (b <= a) return "";
    const seg = pts.slice(a, b + 1);
    return `M${x(seg[0][0]).toFixed(1)} ${H - B}` + seg.map(([t, v]) => `L${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join("") + `L${x(seg[seg.length - 1][0]).toFixed(1)} ${H - B}Z`;
  }
  const span = t1 - t0, step = span > 86400 * 2 ? 86400 : span > 3600 * 8 ? (W < 520 ? 21600 : 10800) : 3600;
  const xl: { x: number; t: string }[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const dt = new Date(t * 1000);
    xl.push({ x: x(t), t: step >= 86400 ? `${dt.getDate()}-${MONTHS[dt.getMonth()].slice(0, 3)}` : hhmm(t) });
  }
  const hp = hover !== null ? pts[hover] : null;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - r.left;
    if (mx < L - 4 || mx > W) { setHover(null); return; }
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const dd = Math.abs(x(pts[i][0]) - mx); if (dd < bd) { bd = dd; best = i; } }
    setHover(best);
  };
  return (
    <div className="chart-wrap" ref={ref} style={{ ["--c" as string]: color } as CSSProperties}>
      {W > 0 ? (
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
          <defs>
            <linearGradient id={`lg${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const yy = T + f * (H - T - B);
            return <g key={f}><line className="gl" x1={L} x2={W - R} y1={yy} y2={yy} /><text x={L - 8} y={yy + 4} textAnchor="end">{Math.round(vmax * (1 - f))}</text></g>;
          })}
          {xl.map((l) => <text key={l.x} x={l.x} y={H - 6} textAnchor="middle">{l.t}</text>)}
          {areas.map((a, i) => (a ? <path key={i} d={a} fill={`url(#lg${id})`} /> : null))}
          <path className="ln" d={d} />
          {hp ? <g><line className="cross" x1={x(hp[0])} x2={x(hp[0])} y1={T} y2={H - B} /><circle className="pt" cx={x(hp[0])} cy={y(hp[1])} r={4.5} /></g> : null}
          <text x={W - R} y={T + 10} textAnchor="end">{unit}</text>
        </svg>
      ) : <div style={{ height: H }} />}
      {hp ? (
        <div className="chart-tip" style={{ left: clamp(x(hp[0]), 60, W - 60), top: Math.max(0, y(hp[1]) - 52) }}>
          <b>{Math.round(hp[1] * 10) / 10} {unit.replace(/^CPU |^GPU |^RAM /, "")}</b> <span className="t-faint">{hhmm(hp[0])}</span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- UsageBars (kunlik ekran vaqti)
export function UsageBars({ days, sel, onPick }: { days: { day: string; seconds: number }[]; sel: string; onPick: (d: string) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  if (!days.length) return <div ref={ref}><div className="t-sub" style={{ padding: "40px 0", textAlign: "center" }}>Yuklanmoqda…</div></div>;
  const H = W < 520 ? 190 : 230, B = 24, T = 22;
  const max = Math.max(3600, ...days.map((d) => d.seconds));
  const bw = (W - 8) / days.length;
  return (
    <div ref={ref}>
      {W > 0 ? (
        <svg className="bars" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kunlik ekran vaqti">
          <defs>
            <linearGradient id="pp-bar-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#5fe9f6" /><stop offset="1" stopColor="#6f68ff" />
            </linearGradient>
          </defs>
          {days.map((d, i) => {
            const h = (d.seconds / max) * (H - B - T), x = 4 + i * bw + bw * 0.16, w = bw * 0.68, y = H - B - h;
            const dt = parseDay(d.day);
            const lbl = days.length <= (W < 420 ? 7 : 14) ? WD_S[dt.getDay()] : (dt.getDate() % 5 === 0 || i === days.length - 1 ? String(dt.getDate()) : "");
            const isSel = d.day === sel;
            return (
              <g key={d.day}>
                <rect className={isSel ? "b sel" : "b"} x={x} y={d.seconds ? y : H - B - 2} width={w} height={Math.max(2, h)} rx={Math.min(7, w / 3)}
                  tabIndex={0} role="button" aria-label={`${dayLabel(d.day)}: ${fmtDur(d.seconds)}`}
                  onClick={() => onPick(d.day)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(d.day); } }}>
                  <title>{`${dayLabel(d.day)}: ${fmtDur(d.seconds)}`}</title>
                </rect>
                <text x={x + w / 2} y={H - 7} textAnchor="middle">{lbl}</text>
                {isSel && d.seconds ? <text className="v" x={x + w / 2} y={y - 7} textAnchor="middle">{`${Math.floor(d.seconds / 3600)}:${pad2(Math.floor((d.seconds % 3600) / 60))}`}</text> : null}
              </g>
            );
          })}
        </svg>
      ) : <div style={{ height: H }} />}
    </div>
  );
}
