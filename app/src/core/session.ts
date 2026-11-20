// Kirish/chiqish, marshrut va ishga tushirish.
import { S, render, type Route } from "./store";
import { rpc, toast } from "./api";
import { closeLive, loadDevices, loadEvents, loadMe, loadUsage, selectDevice } from "./data";
import { checkPush } from "./push";
import { loadPower } from "./power";
import { applyUi, updateHeat } from "./theme";

export const ROUTES: Route[] = ["overview", "system", "procs", "time", "control", "settings"];

export function onRoute(): void {
  const r = location.hash.replace(/^#\/?/, "").split("?")[0] || "overview";
  const prev = S.route;
  S.route = (ROUTES as string[]).includes(r) ? (r as Route) : "overview";
  if (prev !== S.route) { window.scrollTo(0, 0); S.navTick++; }
  if (S.route === "time" && S.devId && !S.usage.data) loadUsage(S.usage.day);
  render();
}
export function go(r: Route): void { location.hash = `#/${r}`; }

export async function afterLogin(): Promise<void> {
  await loadMe();
  await loadDevices();
  if (S.devId) selectDevice(S.devId, true);
  checkPush();
  loadEvents();
}

export function logout(silent?: boolean, skipServer?: boolean): void {
  if (S.token && !skipServer && !silent) rpc("pp_logout").catch(() => {});
  closeLive();
  try { localStorage.removeItem("pcp_token"); } catch { /* */ }
  S.token = ""; S.user = null; S.devices = []; S.live = null; S.dev = null;
  if (!silent) toast("Tizimdan chiqdingiz");
  updateHeat(); render();
}

export async function tryResume(): Promise<void> {
  try { S.bootErr = ""; render(); await afterLogin(); }
  catch (e) {
    if (S.token && !S.user) { S.bootErr = (e as Error).message; render(); setTimeout(() => { if (S.token && !S.user) tryResume(); }, 5000); }
  }
}

export async function boot(): Promise<void> {
  S.power = loadPower();
  applyUi();
  if ("serviceWorker" in navigator && !document.documentElement.hasAttribute("data-shell")) navigator.serviceWorker.register("./sw.js").catch(() => {});
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.modal) { S.modal = null; render(); } });
  onRoute();
  updateHeat();
  if (S.token) await tryResume();
  render();
}
