// Koʻrinish: Pulse (asosiy), Aurora Glass yoki Once UI; Once uchun qorongʻi / yorugʻ / tizim. Faqat shu qurilmada saqlanadi.
// Fon yorugʻligi (Pulse va Aurora) kompyuter haroratiga qarab rangini oʻzgartiradi.
import { S, render } from "./store";
import { num } from "./format";

export type Ui = "pulse" | "aurora" | "once";
export type Mode = "dark" | "light" | "system";
const mqLight = matchMedia("(prefers-color-scheme: light)");

export function uiPref(): { ui: Ui; mode: Mode } {
  let ui: Ui = "pulse", mode: Mode = "dark";
  try {
    // pp_ui2 — yangi kalit. Eski pp_ui dan faqat Once UI tanlovi oʻtadi; eski Aurora (avvalgi asosiy) yangi Pulse’ga almashadi.
    const v = localStorage.getItem("pp_ui2") || (localStorage.getItem("pp_ui") === "once" ? "once" : "pulse");
    ui = v === "once" || v === "aurora" ? v : "pulse";
    const m = localStorage.getItem("pp_mode");
    if (m === "light" || m === "system" || m === "dark") mode = m;
  } catch { /* maxfiy rejim */ }
  return { ui, mode };
}
export function applyUi(): void {
  const { ui, mode } = uiPref(), d = document.documentElement;
  const light = ui === "once" && (mode === "light" || (mode === "system" && mqLight.matches));
  d.setAttribute("data-ui", ui);
  d.setAttribute("data-theme", light ? "light" : "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", ui === "pulse" ? "#07090e" : ui === "aurora" ? "#060912" : light ? "#f9f9f9" : "#0a0a0a");
}
export function setUiPref(k: "pp_ui2" | "pp_mode", v: string): void {
  try { localStorage.setItem(k, v); } catch { /* maxfiy rejim */ }
  applyUi();
  render();
}
mqLight.addEventListener?.("change", () => { if (uiPref().mode === "system") applyUi(); });

// harorat diapazoni → aurora ranglari (a, b, c, d)
const HEAT: Record<string, [string, string, string, string]> = {
  off: ["#22306a", "#352f6e", "#1a4560", "#151d44"],
  cool: ["#2b4dff", "#7a3cff", "#00b7d6", "#1b2a7a"],
  warm: ["#e0702c", "#9a3cff", "#f0a43a", "#3d1d6a"],
  hot: ["#ff3b52", "#ff7a1a", "#b0124e", "#4a0f2a"],
};
type Band = "off" | "cool" | "warm" | "hot";
let lastBand: Band = "off";
export function heatBand(): Band {
  if (!(S.online && S.live)) return (lastBand = S.token && !S.user ? "cool" : "off");
  const c = S.live.cpu || {}, g = (S.live.gpus || [])[0] || {};
  const temps = [c.temp, g.temp].filter(num);
  const t = temps.length ? Math.max(...temps) : 40 + (c.load || 0) * 0.45;
  // histerezis: qiziganda darhol, soviganda chegaradan 3°C pastga tushgandagina — rang chegarada tebranmasin
  // chegaralar datchiklar bilan bir xil: 70°C dan iliq, 85°C dan issiq
  const up = t >= 85 ? "hot" : t >= 70 ? "warm" : "cool";
  const down = t >= 82 ? "hot" : t >= 67 ? "warm" : "cool";
  const rank = { off: 0, cool: 1, warm: 2, hot: 3 } as const;
  lastBand = lastBand === "off" ? up : rank[up] > rank[lastBand] ? up : rank[down] < rank[lastBand] ? down : lastBand;
  return lastBand;
}
export function updateHeat(): void {
  const [a, b, c, d] = HEAT[heatBand()];
  const st = document.documentElement.style;
  st.setProperty("--aur-a", a); st.setProperty("--aur-b", b); st.setProperty("--aur-c", c); st.setProperty("--aur-d", d);
}
