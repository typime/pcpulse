// Formatlash yordamchilari (eski app.js dan oʻzgarishsiz koʻchirilgan).

export const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const r0 = (v: unknown): string | number => (num(v) ? Math.round(v) : "—");
export const GiB = 1073741824;

export function fmtB(b: unknown): string {
  if (!num(b)) return "—";
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(1) + " TB";
  if (b >= GiB) return (b / GiB).toFixed(b >= 100 * GiB ? 0 : 1) + " GB";
  if (b >= 1048576) return Math.round(b / 1048576) + " MB";
  return Math.max(0, Math.round(b / 1024)) + " KB";
}
export function fmtRate(bps: unknown): string {
  if (!num(bps)) return "—";
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + " MB/s";
  if (bps >= 1024) return Math.round(bps / 1024) + " KB/s";
  return Math.round(bps) + " B/s";
}
export function fmtDur(sec: number | undefined | null, short?: boolean): string {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return short ? `${h} soat ${m} daq` : `${h} soat ${m} daqiqa`;
  if (m) return short ? `${m} daq` : `${m} daqiqa`;
  return `${s} soniya`;
}
export const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
export const WD = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
export const WD_S = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const hhmm = (ts: number) => { const d = new Date(ts * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseDay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayIso = () => isoDay(new Date());
export function dayLabel(s: string): string {
  const d = parseDay(s), t = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === t) return "Bugun";
  if (s === isoDay(y)) return "Kecha";
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${WD[d.getDay()].toLowerCase()}`;
}
export function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return "hech qachon";
  const s = Date.now() / 1000 - ts;
  if (s < 15) return "hozirgina";
  if (s < 60) return `${Math.round(s)} soniya oldin`;
  if (s < 3600) return `${Math.round(s / 60)} daqiqa oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  const d = new Date(ts * 1000);
  return `${d.getDate()}-${MONTHS[d.getMonth()]} ${hhmm(ts)}`;
}
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`;
}
export function fmtUptime(sec: number | undefined): string {
  const s = sec || 0; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} kun ${h} soat` : h ? `${h} soat ${m} daq` : `${m} daq`;
}
/** Harorat → holat: cool / warm / hot / na */
export const heat = (t: unknown) => (!num(t) ? "na" : t < 60 ? "cool" : t < 80 ? "warm" : "hot");
/** Foiz → holat sinfi */
export const pctCls = (p: unknown, w = 75, c = 90) => (!num(p) ? "" : p >= c ? "crit" : p >= w ? "warn" : "");
export const initials = (s: unknown) => (String(s || "?").replace(/[^\p{L}\p{N}]/gu, "")[0] || "?").toUpperCase();
export const shortCpu = (n: unknown) => String(n || "").replace(/\(R\)|\(TM\)|CPU|Processor|@.*$|\d+-Core/gi, "").replace(/\s+/g, " ").trim();
export const shortGpu = (n: unknown) => String(n || "").replace(/NVIDIA |AMD |Intel\(R\) |GeForce /gi, "").trim();
/** Harorat → rang tokeni */
export const heatColor = (t: unknown) => { const h = heat(t); return h === "hot" ? "var(--crit)" : h === "warm" ? "var(--warn)" : h === "cool" ? "var(--c-cpu)" : "var(--text-3)"; };
