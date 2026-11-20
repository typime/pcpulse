// Quvvat buyruqlari holati: yoqish signali yuborilgach kutish, oʻchirilgach sababini koʻrsatish.
import { S, type PowerKind, type PowerMark } from "./store";

export const POWER_TTL = 15 * 60 * 1000;
export const WAKE_HINT_AFTER = 180;

function save() { try { localStorage.setItem("pp_power", JSON.stringify(S.power)); } catch { /* maxfiy rejim */ } }

export function loadPower(): Record<string, PowerMark> {
  try {
    const v = JSON.parse(localStorage.getItem("pp_power") || "{}") as Record<string, PowerMark>, now = Date.now();
    for (const k in v) if (!v[k] || now - v[k].at > POWER_TTL) delete v[k];
    return v;
  } catch { return {}; }
}
export function markPower(kind: PowerKind, extra: Partial<PowerMark> = {}): void {
  S.power[S.devId] = { kind, at: Date.now(), ...extra };
  save();
}
export function clearPower(id: string): void {
  delete S.power[id];
  save();
}
export function activePower(id: string): PowerMark | null {
  const p = S.power[id];
  return p && Date.now() - p.at <= POWER_TTL ? p : null;
}
