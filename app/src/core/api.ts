// Supabase RPC, agent buyruqlari, toast va tasdiqlash oynasi.
import { S, render, type Json } from "./store";
import { logout } from "./session";

declare global { interface Window { PP_CONFIG?: { supabaseUrl: string; supabaseKey: string; exeUrl?: string }; pywebview?: unknown } }

export const CFG = { supabaseUrl: "", supabaseKey: "", exeUrl: "", ...(window.PP_CONFIG || {}) };
if (!CFG.exeUrl && location.hostname.endsWith(".github.io")) {
  const owner = location.hostname.split(".")[0], repo = location.pathname.split("/")[1] || `${owner}.github.io`;
  CFG.exeUrl = `https://github.com/${owner}/${repo}/releases/latest/download/PCPulseAgent.exe`;
}
if (!CFG.exeUrl) CFG.exeUrl = "https://github.com/typime/pcpulse/releases/latest/download/PCPulseAgent.exe";

export async function rpc(fn: string, params: Record<string, unknown> = {}, { auth = true } = {}): Promise<Json> {
  const body = auth ? { p_token: S.token, ...params } : params;
  let res: Response;
  try {
    res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch { throw new Error("Internet aloqasi yoʻq yoki server javob bermadi"); }
  let data: Json = null;
  try { data = await res.json(); } catch { /* boʻsh */ }
  if (!res.ok) {
    if (auth && data && data.code === "28000") logout(true);
    throw new Error((data && (data.message || data.error)) || `Xato (${res.status})`);
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.error && Object.keys(data).length === 1) throw new Error(data.error);
  return data;
}
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function toast(text: string, kind: "" | "ok" | "err" = ""): void {
  const id = Math.random().toString(36).slice(2);
  S.toasts = [...S.toasts.slice(-3), { id, text, kind }];
  render();
  setTimeout(() => { S.toasts = S.toasts.filter((t) => t.id !== id); render(); }, 3800);
}

export const SLOW: Record<string, number> = { install_pawnio: 200, update_agent: 40, screenshot: 30, cleanup_run: 120, cleanup_scan: 60, startup_list: 25, sensors: 25, procs: 20 };

export async function runCommand(name: string, args: Record<string, unknown>): Promise<Json> {
  const { id } = await rpc("pp_command", { p_device: S.devId, p_cmd: name, p_args: args });
  const until = Date.now() + (SLOW[name] || 20) * 1000;
  await sleep(400);
  while (Date.now() < until) {
    const r = await rpc("pp_command_result", { p_id: id });
    if (r.status === "done") return r;
    await sleep(700);
  }
  throw new Error("Kompyuter javob bermadi");
}

/** Agentga buyruq: band holati, xato va muvaffaqiyat xabari bilan */
export async function cmd(name: string, args: Record<string, unknown> = {}, { busy, ok }: { busy?: string; ok?: string } = {}): Promise<Json> {
  const key = busy || name;
  S.busy[key] = true; render();
  try {
    const r = await runCommand(name, args);
    if (!r.ok) throw new Error(r.error || "Buyruq bajarilmadi");
    if (ok) toast(ok, "ok");
    return r.result;
  } catch (e) { toast((e as Error).message, "err"); throw e; }
  finally { delete S.busy[key]; render(); }
}

export function confirmBox(title: string, text: string, okText: string, danger: boolean, onOk: () => void): void {
  S.modal = { kind: "confirm", title, text, okText, danger, onOk };
  render();
}
