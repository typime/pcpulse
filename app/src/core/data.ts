// Maʼlumot yuklash va jonli kuzatuv (eski app.js mantiqi oʻzgarishsiz).
import { S, render, device, type Json } from "./store";
import { rpc, toast } from "./api";
import { isoDay, parseDay, todayIso } from "./format";
import { clearPower } from "./power";
import { updateHeat } from "./theme";

export async function loadMe(): Promise<void> {
  const me = await rpc("pp_me");
  S.user = me;
  const tz = -new Date().getTimezoneOffset();
  if (me.settings.tz_offset !== tz) saveUserSettings({ tz_offset: tz }, true);
}

export async function loadDevices(): Promise<void> {
  const r = await rpc("pp_devices");
  S.devices = r.devices;
  if (!S.devices.find((d) => d.id === S.devId)) S.devId = S.devices[0] ? S.devices[0].id : "";
  const d = device();
  if (d) S.online = d.online;
  render();
}

export async function selectDevice(id: string, keepLive?: boolean): Promise<void> {
  if (id !== S.devId || !keepLive) {
    S.devId = id; try { localStorage.setItem("pcp_dev", id); } catch { /* */ }
    S.live = null; S.health = null; S.sysinfo = null; S.metrics = null; S.screenshot = null; S.startup = null; S.cleanup = null;
    S.hist = { t: [], cpu: [], gpu: [], ram: [], cpuT: [], gpuT: [] };
    S.usage = { day: todayIso(), data: null, history: null };
  }
  render();
  if (!id) return;
  try { S.dev = await rpc("pp_device", { p_device: id }); S.sysinfo = S.dev.sysinfo; } catch { /* */ }
  connectLive();
  loadMetrics(); loadEvents(); loadUsage(S.usage.day);
}

export async function loadMetrics(): Promise<void> {
  if (!S.devId) return;
  try { S.metrics = await rpc("pp_metrics", { p_device: S.devId, p_hours: 24 }); S.metricsAt = Date.now(); render(); } catch { /* */ }
}
export async function loadEvents(): Promise<void> {
  try { S.events = (await rpc("pp_events", { p_limit: 30 })).events; S.eventsAt = Date.now(); render(); } catch { /* */ }
}
export async function loadUsage(day: string): Promise<void> {
  if (!S.devId) return;
  S.usage.day = day; S.usage.data = null; render();
  try { S.usage.data = await rpc("pp_usage", { p_device: S.devId, p_day: day }); } catch { S.usage.data = { day, total: 0, apps: [] }; }
  render();
  if (!S.usage.history || !S.usage.history.days.some((d: Json) => d.day === day)) loadUsageHistory();
}
export async function loadUsageHistory(): Promise<void> {
  const sel = parseDay(S.usage.day), t = new Date();
  const end = new Date(Math.min(t.getTime(), sel.getTime() + Math.floor(S.sub.hist / 2) * 86400000));
  try { S.usage.history = await rpc("pp_usage_history", { p_device: S.devId, p_days: S.sub.hist, p_end: isoDay(end) }); } catch { /* */ }
  render();
}

export async function saveDevSettings(patch: Record<string, unknown>): Promise<void> {
  try {
    const r = await rpc("pp_device_settings", { p_device: S.devId, p_patch: patch });
    if (S.dev) S.dev.settings = r.settings;
    toast("Saqlandi", "ok");
  } catch (e) { toast((e as Error).message, "err"); }
  render();
}
export async function saveFan(cid: string, patch: Record<string, unknown>): Promise<void> {
  const cur = ((S.dev && S.dev.settings && S.dev.settings.fans) || {})[cid] || {};
  const next = { ...cur, ...patch };
  if (patch.label === undefined && "label" in patch) delete next.label;
  if (S.dev) { S.dev.settings.fans = { ...(S.dev.settings.fans || {}), [cid]: next }; render(); }
  try { const r = await rpc("pp_device_settings", { p_device: S.devId, p_patch: { fans: { [cid]: next } } }); if (S.dev) S.dev.settings = r.settings; render(); }
  catch (e) { toast((e as Error).message, "err"); }
}
export async function saveUserSettings(patch: Record<string, unknown>, quiet?: boolean): Promise<void> {
  try {
    const r = await rpc("pp_save_settings", { p_patch: patch });
    S.user.settings = r.settings; render();
    if (!quiet) toast("Saqlandi", "ok");
  } catch (e) { toast((e as Error).message, "err"); }
}

// ---------------------------------------------------------------- jonli aloqa (polling)
export function closeLive(): void {
  if (S.pollTimer) { clearTimeout(S.pollTimer); S.pollTimer = null; }
  S.liveGen = (S.liveGen || 0) + 1;
}
export function connectLive(): void {
  closeLive();
  if (!S.devId || !S.token || document.hidden) return;
  const gen = S.liveGen, dev = S.devId;
  let first = true;
  const tick = async () => {
    if (gen !== S.liveGen) return;
    try {
      const m = await rpc("pp_live", { p_device: dev, p_full: first });
      if (gen !== S.liveGen) return;
      first = false;
      onLive(m);
    } catch { /* tarmoq uzilishi — keyingi urinish */ }
    if (gen === S.liveGen) S.pollTimer = setTimeout(tick, document.hidden ? 15000 : 2500);
  };
  tick();
}
function onLive(m: Json): void {
  const wasOnline = S.online;
  if (m.type === "live") {
    S.online = m.online; S.lastSeen = m.last_seen;
    if (m.sysinfo) S.sysinfo = m.sysinfo;
    if (m.health) S.health = m.health;
    if (m.data && (!S.live || m.data.ts !== S.live.ts)) { S.live = m.data; pushHist(m.data); }
  } else if (m.type === "status") { S.online = m.online; S.lastSeen = m.last_seen; }
  const d = device();
  if (d) { d.online = S.online; d.last_seen = S.lastSeen; }
  if (wasOnline !== S.online) {
    loadEvents();
    const p = S.power[S.devId];
    if (S.online && wasOnline === false && p) {
      if (p.kind !== "logoff") toast(p.kind === "wake" ? "Kompyuter yoqildi" : "Kompyuter yana onlayn", "ok");
      clearPower(S.devId);
    }
  }
  const pOld = S.power[S.devId];
  if (S.online && pOld && Date.now() - pOld.at > 180000) clearPower(S.devId);  // allaqachon qaytgan — eski yozuv kerak emas
  updateHeat();
  render();
}
function pushHist(L: Json): void {
  const H = S.hist, g = (L.gpus || [])[0] || {};
  H.t.push(L.ts); H.cpu.push((L.cpu || {}).load); H.gpu.push(g.load); H.ram.push((L.ram || {}).percent);
  H.cpuT.push((L.cpu || {}).temp); H.gpuT.push(g.temp);
  for (const k of Object.keys(H) as (keyof typeof H)[]) if (H[k].length > 90) H[k].shift();
}

document.addEventListener("visibilitychange", () => {
  if (!S.token || !S.user) return;
  if (document.hidden) closeLive();
  else { connectLive(); loadDevices().catch(() => {}); loadEvents(); if (Date.now() - S.metricsAt > 300000) loadMetrics(); }
});
setInterval(() => { if (S.user && !document.hidden) { loadMetrics(); loadEvents(); if (S.route === "time" && S.usage.day === todayIso()) loadUsage(S.usage.day); } }, 300000);
