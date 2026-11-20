// Foydalanuvchi amallari (eski ACT / CHANGE / SUBMIT jadvallari). Mantiq oʻzgarmagan, faqat DOM atributlari oʻrniga parametrlar.
import { S, render, type Json } from "./store";
import { rpc, toast, cmd, confirmBox } from "./api";
import { markPower } from "./power";
import { afterLogin, logout, tryResume } from "./session";
import { loadDevices, loadUsage, loadUsageHistory, saveDevSettings, saveFan, saveUserSettings, selectDevice } from "./data";
import { enablePush, disablePush } from "./push";
import { isoDay, num, parseDay, todayIso } from "./format";

const noop = () => {};

// ---------------------------------------------------------------- quvvat
export async function wake(): Promise<void> {
  S.busy.wake = true; render();
  try {
    const r = await rpc("pp_wake", { p_device: S.devId });
    markPower("wake", { via: r.sent_from || [] });
    toast(`Yoqish signali yuborildi (${(r.sent_from || []).join(", ")} orqali)`, "ok");
  } catch (e) { toast((e as Error).message, "err"); }
  finally { delete S.busy.wake; render(); }
}
export const lock = () => cmd("lock", {}, { busy: "lock", ok: "Ekran qulflandi" }).catch(noop);
export const sleepPc = () => confirmBox("Uyqu rejimi", "Kompyuter uyqu rejimiga oʻtadi. Yana yoqish uchun Wake-on-LAN yoki kompyuterdagi tugmadan foydalaning.", "Uxlatish", false,
  () => cmd("sleep", {}, { busy: "sleep", ok: "Uyqu rejimiga oʻtkazilmoqda" }).then(() => markPower("sleep"), noop));
export const hibernate = () => confirmBox("Gibernatsiya", "Ochiq dasturlar diskka saqlanib, kompyuter oʻchadi.", "Davom etish", false,
  () => cmd("hibernate", {}, { busy: "hibernate", ok: "Gibernatsiyaga oʻtkazilmoqda" }).then(() => markPower("hibernate"), noop));
export const restart = () => confirmBox("Qayta yoqish", "Kompyuter 5 soniyadan soʻng qayta yuklanadi. Saqlanmagan ishlar yoʻqolishi mumkin.", "Qayta yoqish", true,
  () => cmd("restart", { delay: 5 }, { busy: "restart", ok: "Qayta yuklanmoqda" }).then(() => markPower("restart"), noop));
export const shutdown = () => confirmBox("Kompyuterni oʻchirish", "Kompyuter 5 soniyadan soʻng oʻchadi. Saqlanmagan ishlar yoʻqolishi mumkin.", "Oʻchirish", true,
  () => cmd("shutdown", { delay: 5 }, { busy: "shutdown", ok: "Kompyuter oʻchirilmoqda" }).then(() => markPower("shutdown"), noop));
export const logoff = () => confirmBox("Tizimdan chiqish", "Windows sessiyasi yopiladi, ochiq dasturlar yopiladi.", "Chiqish", true,
  () => cmd("logoff", {}, { busy: "logoff", ok: "Tizimdan chiqilmoqda" }).then(() => markPower("logoff"), noop));
export const cancelShutdown = () => cmd("cancel_shutdown", {}, { ok: "Oʻchirish bekor qilindi" }).catch(noop);

// ---------------------------------------------------------------- qoʻriqlash, taymer
export const guardArm = () => cmd("guard_arm", {}, { busy: "guardArm", ok: "Qoʻriqlash yoqilmoqda — kompyuterdan uzoqlashing" }).catch(noop);
export const guardLock = () => cmd("guard_arm", { lock: true }, { busy: "guardLock", ok: "Ekran qulflandi va kuzatilmoqda" }).catch(noop);
export const guardOff = () => cmd("guard_disarm", {}, { busy: "guardOff", ok: "Qoʻriqlash oʻchirildi" }).catch(noop);
export function timerSet(): void {
  const m = Number(S.form.timerMin);
  if (!(m >= 1 && m <= 1440)) { toast("Daqiqa 1 dan 1440 gacha boʻlsin", "err"); return; }
  cmd("timer_set", { action: S.form.timerAct, minutes: m }, { ok: "Taymer oʻrnatildi" }).catch(noop);
}
export const timerCancel = () => cmd("timer_cancel", {}, { ok: "Taymer bekor qilindi" }).catch(noop);

// ---------------------------------------------------------------- ekran, xabar, media
export async function screenshot(): Promise<void> {
  try {
    const r = await cmd("screenshot", {}, {});
    if (r && r.image) { S.screenshot = { url: "data:image/jpeg;base64," + r.image, ts: Date.now() / 1000 }; render(); }
  } catch { /* xato toast qilingan */ }
}
export async function sendMsg(): Promise<void> {
  if (!S.form.msg.trim()) { toast("Xabar matnini yozing", "err"); return; }
  try {
    await cmd("message", { text: S.form.msg }, { busy: "message", ok: "Xabar ekranga chiqarildi" });
    S.form.msg = ""; render();
  } catch { /* */ }
}
export const media = (key: string) => cmd("media", { key, times: key.startsWith("vol") ? 3 : 1 }, { busy: "media-" + key }).catch(noop);

// ---------------------------------------------------------------- tozalash, jarayonlar, avtoyuklanish, sensorlar
export async function cleanScan(): Promise<void> {
  try { S.cleanup = await cmd("cleanup_scan"); S.cleanupResult = null; render(); } catch { /* */ }
}
export const cleanRun = () => confirmBox("Tozalash", "24 soatdan eski vaqtinchalik fayllar oʻchiriladi va savat boʻshatiladi. Savatdagi fayllarni qaytarib boʻlmaydi.", "Tozalash", true, async () => {
  try { S.cleanupResult = await cmd("cleanup_run", { temp: true, recycle: true }); S.cleanup = null; render(); } catch { /* */ }
});
export const kill = (name: string, title: string) => confirmBox(`${title} yopilsinmi?`, "Dastur darhol toʻxtatiladi. Saqlanmagan maʼlumotlar yoʻqoladi.", "Yopish", true, async () => {
  try {
    const r = await cmd("kill", { name }, { busy: "kill-" + name });
    if (r) toast(`${title}: ${r.killed} ta jarayon yopildi`, "ok");
  } catch { /* */ }
});
export async function startupLoad(): Promise<void> {
  try { const r = await cmd("startup_list"); S.startup = r.items; render(); } catch { /* */ }
}
export async function startupToggle(id: string, enabled: boolean): Promise<boolean> {
  try {
    const r = await cmd("startup_toggle", { id, enabled }, { busy: "startup_toggle", ok: enabled ? "Avtoyuklanish yoqildi" : "Avtoyuklanishdan olib tashlandi" });
    S.startup = r.items; render(); return true;
  } catch { return false; }
}
export async function sensorsAll(): Promise<void> {
  try { S.sensorsRaw = await cmd("sensors", {}, { busy: "sensors" }); S.modal = { kind: "sensors" }; render(); } catch { /* */ }
}

// ---------------------------------------------------------------- fanlar
export function fanMode(id: string, mode: string, current?: number): void {
  const cur = ((S.dev && S.dev.settings && S.dev.settings.fans) || {})[id] || {};
  const patch: Record<string, unknown> = { mode };
  if (mode === "manual" && !num(cur.value)) patch.value = Number(current) || 50;
  saveFan(id, patch);
}
export function fanRename(id: string, name: string): void {
  S.modal = { kind: "prompt", title: "Fan nomi", value: name, onSubmit: (v) => saveFan(id, { label: v.trim() || undefined }) };
  render();
}
export function fanValue(id: string, v: number): void { delete S.form.fanDraft[id]; saveFan(id, { mode: "manual", value: v }); }
export const fanPreset = (id: string, preset: string) => saveFan(id, { mode: "curve", preset });
export const fanSource = (id: string, source: string) => saveFan(id, { mode: "curve", source });

// ---------------------------------------------------------------- ekran vaqti
export function dayShift(n: number): void { const d = parseDay(S.usage.day); d.setDate(d.getDate() + n); const s = isoDay(d); if (s <= todayIso()) loadUsage(s); }
export const dayToday = () => loadUsage(todayIso());
export const pickDay = (day: string) => { if (day) loadUsage(day); };
export function histDays(n: number): void { S.sub.hist = n; loadUsageHistory(); }

// ---------------------------------------------------------------- bildirishnomalar, qurilmalar, agent
export const pushOn = () => enablePush();
export const pushOff = () => disablePush();
export async function pushTest(): Promise<void> {
  S.busy.pushTest = true; render();
  try { await rpc("pp_push_test"); toast("Yuborildi — bir necha soniyada keladi", "ok"); } catch (e) { toast((e as Error).message, "err"); }
  finally { delete S.busy.pushTest; render(); }
}
export const devDelete = (id: string, name: string) => confirmBox(`${name} oʻchirilsinmi?`, "Qurilma va uning barcha tarixi (ekran vaqti, grafiklar) oʻchiriladi. Agentni qayta ulash mumkin.", "Oʻchirish", true, async () => {
  try { await rpc("pp_device_delete", { p_device: id }); toast("Qurilma oʻchirildi", "ok"); await loadDevices(); } catch (e) { toast((e as Error).message, "err"); }
});
export async function devSave(id: string, body: { name: string; mac: string; broadcast: string; wol_port: number }): Promise<void> {
  try { await rpc("pp_device_update", { p_device: id, p_patch: body }); toast("Saqlandi", "ok"); await loadDevices(); } catch (e) { toast((e as Error).message, "err"); }
}
export const installPawnio = () => cmd("install_pawnio", {}, { ok: "Drayver oʻrnatildi — agent qayta ishga tushmoqda, 30 soniyada harorat koʻrinadi" }).catch(noop);
export async function updateAgent(): Promise<void> {
  try {
    const r = await cmd("update_agent", {});
    toast(r.latest ? `Agent eng soʻnggi versiyada (${r.version})` : `Yangilanmoqda: ${r.from} → ${r.version}. Agent bir daqiqada qayta ulanadi`, "ok");
  } catch { /* xato toast qilingan */ }
}
export const device = (id: string) => selectDevice(id);
export const devSetting = (k: string, v: number | boolean) => saveDevSettings({ [k]: v });
export function userSetting(k: string, v: unknown): void { saveUserSettings(k.startsWith("alerts.") ? { alerts: { [k.slice(7)]: v } } : { [k]: v }); }
export function alertSetting(k: string, v: number): void { if (v) saveUserSettings({ alerts: { [k]: v } }); }

// ---------------------------------------------------------------- akkaunt
export async function auth(username: string, password: string, password2: string): Promise<void> {
  const reg = S.form.authMode === "register";
  if (reg && password !== password2) { S.form.authErr = "Parollar mos kelmadi"; render(); return; }
  S.busy.auth = true; S.form.authErr = ""; render();
  try {
    const r = await rpc(reg ? "pp_register" : "pp_login", { p_username: username.trim(), p_password: password }, { auth: false });
    S.token = r.token; try { localStorage.setItem("pcp_token", r.token); } catch { /* */ }
    S.user = r.user;
    await afterLogin();
  } catch (e) { S.form.authErr = (e as Error).message; }
  finally { delete S.busy.auth; render(); }
}
export async function changePassword(oldPw: string, newPw: string): Promise<boolean> {
  try {
    const r = await rpc("pp_change_password", { p_old: oldPw, p_new: newPw });
    S.token = r.token; try { localStorage.setItem("pcp_token", r.token); } catch { /* */ }
    toast("Parol oʻzgartirildi. Boshqa qurilmalarda qayta kirish kerak.", "ok");
    return true;
  } catch (e) { toast((e as Error).message, "err"); return false; }
}
export const doLogout = () => logout();
export const retry = () => tryResume();
export const logoutAll = () => confirmBox("Barcha qurilmalardan chiqish", "Telefon, kompyuter va boshqa brauzerlardagi barcha sessiyalar yopiladi. Agentlar ishlashda davom etadi.", "Chiqish", true, async () => {
  try { await rpc("pp_logout_all"); } catch { /* */ } logout(false, true);
});
export async function install(): Promise<void> {
  const p: Json = S.installPrompt; if (!p) return;
  p.prompt(); await p.userChoice; S.installPrompt = null; render();
}
export function closeModal(): void { S.modal = null; render(); }
export function modalOk(): void { const m = S.modal; S.modal = null; render(); if (m && m.kind === "confirm") m.onOk(); }
