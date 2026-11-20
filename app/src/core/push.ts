// Web Push obunasi (eski app.js mantiqi).
import { S, render } from "./store";
import { rpc, toast } from "./api";

function b64ToU8(s: string): Uint8Array {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export async function checkPush(): Promise<void> {
  if (!window.isSecureContext) { S.push.state = "insecure"; return render(); }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { S.push.state = "unsupported"; return render(); }
  if (Notification.permission === "denied") { S.push.state = "denied"; return render(); }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    S.push.state = sub ? "on" : "off";
    if (sub) rpc("pp_push_subscribe", { p_sub: sub.toJSON(), p_label: navigator.userAgent.slice(0, 80) }).catch(() => {});
  } catch { S.push.state = "off"; }
  render();
}
export async function enablePush(): Promise<void> {
  S.busy.push = true; render();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { S.push.state = perm === "denied" ? "denied" : "off"; throw new Error("Bildirishnomaga ruxsat berilmadi"); }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await rpc("pp_push_key", {}, { auth: false });
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) as BufferSource });
    await rpc("pp_push_subscribe", { p_sub: sub.toJSON(), p_label: navigator.userAgent.slice(0, 80) });
    S.push.state = "on";
    toast("Bildirishnomalar yoqildi", "ok");
  } catch (e) { toast((e as Error).message, "err"); }
  finally { delete S.busy.push; render(); }
}
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await rpc("pp_push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    S.push.state = "off"; toast("Bu qurilmada bildirishnomalar oʻchirildi"); render();
  } catch (e) { toast((e as Error).message, "err"); }
}
