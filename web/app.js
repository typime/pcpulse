/* PC Pulse — PWA. Kutubxonasiz: HTML satrlarini render qilib, kichik "morph" bilan DOM ga qoʻllaydi. */
"use strict";

// =================================================================== yordamchilar
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => typeof v === "number" && isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r0 = (v) => (num(v) ? Math.round(v) : "—");
const GiB = 1073741824;
function fmtB(b) {
  if (!num(b)) return "—";
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(1) + " TB";
  if (b >= GiB) return (b / GiB).toFixed(b >= 100 * GiB ? 0 : 1) + " GB";
  if (b >= 1048576) return Math.round(b / 1048576) + " MB";
  return Math.max(0, Math.round(b / 1024)) + " KB";
}
function fmtRate(bps) {
  if (!num(bps)) return "—";
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + " MB/s";
  if (bps >= 1024) return Math.round(bps / 1024) + " KB/s";
  return Math.round(bps) + " B/s";
}
function fmtDur(sec, short) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return short ? `${h} soat ${m} daq` : `${h} soat ${m} daqiqa`;
  if (m) return short ? `${m} daq` : `${m} daqiqa`;
  return `${sec} soniya`;
}
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const WD = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const WD_S = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (ts) => { const d = new Date(ts * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayIso = () => isoDay(new Date());
function dayLabel(s) {
  const d = parseDay(s), t = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (s === t) return "Bugun";
  if (s === isoDay(y)) return "Kecha";
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${WD[d.getDay()].toLowerCase()}`;
}
function fmtAgo(ts) {
  if (!ts) return "hech qachon";
  const s = Date.now() / 1000 - ts;
  if (s < 15) return "hozirgina";
  if (s < 60) return `${Math.round(s)} soniya oldin`;
  if (s < 3600) return `${Math.round(s / 60)} daqiqa oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  const d = new Date(ts * 1000);
  return `${d.getDate()}-${MONTHS[d.getMonth()]} ${hhmm(ts)}`;
}
const heat = (t) => (!num(t) ? "na" : t < 60 ? "cool" : t < 80 ? "warm" : "hot");
const pctCls = (p, w = 75, c = 90) => (!num(p) ? "" : p >= c ? "hot" : p >= w ? "warm" : "");
const initials = (s) => (String(s || "?").replace(/[^\p{L}\p{N}]/gu, "")[0] || "?").toUpperCase();

// =================================================================== ikonlar (24×24, chiziqli)
const P = {
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  layers: '<path d="M4 6h16M4 12h11M4 18h7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  power: '<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  zap: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  camera: '<rect x="3" y="6.5" width="18" height="13" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6.5l1.5-2.5h4l1.5 2.5"/>',
  msg: '<path d="M4 5.5h16v10H9l-5 4z"/>',
  broom: '<path d="M14 3l-4.5 9"/><path d="M6 13h8l1 8H5z"/><path d="M8 17v4M11 17v4"/>',
  fan: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C11 6 12.5 3.5 15 3.5c2 0 2.5 2.5 1 4.5s-3 2-4 2.2zM13.6 12.9c3.9 1.6 5.4 4.1 4.2 6.3-1 1.7-3.5 1-4.5-1.3s-.2-3.8.3-5zM10.4 12.9c-3.3 2.8-6.1 2.8-7.2.6-.9-1.8 1-3.5 3.6-3.7s3.4 1.6 3.6 3.1z"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  next: '<path d="M6 5.5v13l9-6.5zM18 5.5v13"/>',
  prev: '<path d="M18 5.5v13l-9-6.5zM6 5.5v13"/>',
  volDown: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 12h4"/>',
  volUp: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 12h4M17.5 10v4"/>',
  mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l4 5M20 9.5l-4 5"/>',
  chevL: '<path d="M14.5 6l-6 6 6 6"/>',
  chevR: '<path d="M9.5 6l6 6-6 6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const ic = (n, cls = "") => `<svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

// =================================================================== holat
const S = {
  token: localStorage.getItem("pcp_token") || "",
  user: null,
  devices: [],
  devId: localStorage.getItem("pcp_dev") || "",
  dev: null,              // tanlangan qurilma tafsilotlari (settings, sysinfo)
  live: null, health: null, sysinfo: null, online: false, lastSeen: 0,
  hist: { t: [], cpu: [], gpu: [], ram: [], cpuT: [], gpuT: [] },
  route: "overview",
  sub: { system: "comp", procs: "mem", hist: 14, metric: "cpu_temp" },
  usage: { day: todayIso(), data: null, history: null, loading: false },
  metrics: null, metricsAt: 0,
  events: [], eventsAt: 0,
  startup: null, cleanup: null, cleanupResult: null, screenshot: null, sensorsRaw: null,
  busy: {}, form: { msg: "", timerMin: 30, timerAct: "shutdown", authMode: "login", fanDraft: {} },
  modal: null, toasts: [],
  push: { state: "unknown" },
  installPrompt: null,
  es: null, pollTimer: null, pollMode: false,
};
const REF = { liveTimer: null };

// =================================================================== API (Supabase RPC)
const CFG = Object.assign({}, window.PP_CONFIG || {});
if (!CFG.exeUrl && location.hostname.endsWith(".github.io")) {
  const owner = location.hostname.split(".")[0], repo = location.pathname.split("/")[1] || `${owner}.github.io`;
  CFG.exeUrl = `https://github.com/${owner}/${repo}/releases/latest/download/PCPulseAgent.exe`;
}
async function rpc(fn, params = {}, { auth = true } = {}) {
  const body = auth ? { p_token: S.token, ...params } : params;
  let res;
  try {
    res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch { throw new Error("Internet aloqasi yoʻq yoki server javob bermadi"); }
  let data = null;
  try { data = await res.json(); } catch { /* boʻsh */ }
  if (!res.ok) {
    const code = data && data.code;
    if (auth && (code === "28000" || res.status === 401 && /JWT|apikey/i.test((data && data.message) || ""))) {
      if (code === "28000") { logout(true); }
    }
    throw new Error((data && (data.message || data.error)) || `Xato (${res.status})`);
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.error && Object.keys(data).length === 1) throw new Error(data.error);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(text, kind = "") {
  const id = Math.random().toString(36).slice(2);
  S.toasts.push({ id, text, kind });
  render();
  setTimeout(() => { S.toasts = S.toasts.filter((t) => t.id !== id); render(); }, 3800);
}

const SLOW = { screenshot: 30, cleanup_run: 120, cleanup_scan: 60, startup_list: 25, sensors: 25, procs: 20 };
async function runCommand(name, args) {
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

async function cmd(name, args = {}, { busy, ok } = {}) {
  const key = busy || name;
  S.busy[key] = true; render();
  try {
    const r = await runCommand(name, args);
    if (!r.ok) throw new Error(r.error || "Buyruq bajarilmadi");
    if (ok) toast(ok, "ok");
    return r.result;
  } catch (e) { toast(e.message, "err"); throw e; }
  finally { delete S.busy[key]; render(); }
}

function confirmBox(title, text, okText, danger, onOk) {
  S.modal = { kind: "confirm", title, text, okText, danger, onOk };
  render();
}

// =================================================================== morph (DOM ni minimal yangilash)
function morph(parent, html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  patchChildren(parent, tpl.content);
}
function patchChildren(a, b) {
  const an = Array.from(a.childNodes), bn = Array.from(b.childNodes);
  for (let i = 0; i < bn.length; i++) {
    if (i >= an.length) a.appendChild(bn[i]);
    else patchNode(an[i], bn[i]);
  }
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}
function patchNode(x, y) {
  if (x.nodeType === 1 && x.dataset.dirty && x.nodeName === y.nodeName) return; // foydalanuvchi tahrirlayotgan forma
  if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName ||
      (x.nodeType === 1 && (x.getAttribute("data-key") || "") !== (y.getAttribute("data-key") || ""))) {
    x.replaceWith(y); return;
  }
  if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
  for (const at of Array.from(y.attributes)) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
  for (const at of Array.from(x.attributes)) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
  const tag = x.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    const keep = document.activeElement === x || x.dataset.dragging;
    if (x.type === "checkbox" || x.type === "radio") x.checked = y.hasAttribute("checked");
    else if (!keep) {
      const v = tag === "TEXTAREA" ? y.textContent : (y.getAttribute("value") ?? "");
      if (x.value !== v) x.value = v;
    }
    if (tag === "TEXTAREA") return;
  }
  patchChildren(x, y);
  if (tag === "SELECT" && document.activeElement !== x) {
    const sel = y.querySelector("option[selected]");
    if (sel && x.value !== sel.value) x.value = sel.value;
  }
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; morph($("#app"), view()); });
}

// =================================================================== koʻrinishlar: umumiy
const NAV = [
  ["overview", "Umumiy", "pulse"],
  ["system", "Tizim", "chip"],
  ["procs", "Jarayonlar", "layers"],
  ["time", "Ekran vaqti", "clock"],
  ["control", "Boshqaruv", "power"],
  ["settings", "Sozlamalar", "sliders"],
];
const TITLES = Object.fromEntries(NAV.map(([k, t]) => [k, t]));

function view() {
  let html = !S.token || !S.user ? (S.token ? loadingView() : authView()) : shellView();
  html += modalView() + `<div class="toasts" role="status">${S.toasts.map((t) => `<div class="toast ${t.kind}" data-key="${t.id}">${esc(t.text)}</div>`).join("")}</div>`;
  html += `<svg width="0" height="0" style="position:absolute"><defs>
    <linearGradient id="gCool" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5ee1d9" stop-opacity=".35"/><stop offset="1" stop-color="#5ee1d9" stop-opacity="0"/></linearGradient>
    <linearGradient id="gLilac" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a99bff" stop-opacity=".35"/><stop offset="1" stop-color="#a99bff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gWarm" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f5b454" stop-opacity=".35"/><stop offset="1" stop-color="#f5b454" stop-opacity="0"/></linearGradient>
  </defs></svg>`;
  return html;
}

function loadingView() {
  if (S.bootErr) return `<div class="auth"><div class="card g" style="text-align:center"><h1 style="font-size:20px">Server bilan aloqa yoʻq</h1>
    <p class="sub">${esc(S.bootErr)}. Server ishlayotganini va internet aloqasini tekshiring — qayta ulanishga urinib koʻrilmoqda.</p>
    <button class="btn pri" data-act="retry">Qayta urinish</button> <button class="btn ghost" data-act="logout">Chiqish</button></div></div>`;
  return `<div class="auth"><div class="sub">Yuklanmoqda…</div></div>`;
}

function authView() {
  const reg = S.form.authMode === "register";
  return `<div class="auth"><div class="card g">
    <div class="logo"><img src="icons/icon-192.png" alt=""><div><h1>PC Pulse</h1><div class="sub">Kompyuteringiz holati — telefoningizda</div></div></div>
    <div class="seg" role="tablist">
      <button type="button" class="${reg ? "" : "on"}" data-act="authMode" data-v="login">Kirish</button>
      <button type="button" class="${reg ? "on" : ""}" data-act="authMode" data-v="register">Roʻyxatdan oʻtish</button>
    </div>
    <form data-submit="auth" autocomplete="on">
      <div class="field"><label for="u">Username</label><input class="in" id="u" name="username" value="${esc(S.form.authUser || "")}" data-model="authUser" autocomplete="username" required minlength="3" maxlength="32" autocapitalize="none" spellcheck="false"></div>
      <div class="field"><label for="p">Parol</label><input class="in" id="p" name="password" value="${esc(S.form.authPass || "")}" data-model="authPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" required ${reg ? 'minlength="6"' : ""}></div>
      ${reg ? `<div class="field"><label for="p2">Parolni takrorlang</label><input class="in" id="p2" name="password2" value="${esc(S.form.authPass2 || "")}" data-model="authPass2" type="password" autocomplete="new-password" required minlength="6"></div>` : ""}
      <div class="err" id="autherr">${esc(S.form.authErr || "")}</div>
      <button class="btn pri ${S.busy.auth ? "busy" : ""}" type="submit">${reg ? "Akkaunt yaratish" : "Kirish"}</button>
      <div class="sub">${reg ? "Shu username va parol bilan telefon va kompyuterdan kirasiz, agentni ham shu akkauntga ulaysiz." : "Telefon va kompyuterda bir xil akkaunt ishlatiladi."}</div>
    </form>
  </div></div>`;
}

function shellView() {
  const nav = NAV.map(([k, t, i]) => `<a class="nav ${S.route === k ? "on" : ""}" href="#/${k}">${ic(i)}<span>${t}</span></a>`).join("");
  const MOB = { overview: "Umumiy", system: "Tizim", procs: "Jarayon", time: "Vaqt", control: "Boshqaruv" };
  const tab = NAV.filter(([k]) => k !== "settings").map(([k, t, i]) => `<a class="${S.route === k ? "on" : ""}" href="#/${k}">${ic(i)}<span>${MOB[k]}</span></a>`).join("");
  return `<div class="shell">
    <aside class="side g" style="border-radius:0;border-width:0 1px 0 0">
      <div class="brand"><img src="icons/icon-192.png" alt="">PC Pulse</div>
      ${nav}
      <div class="spacer"></div>
      <div class="sub" style="padding:0 12px">${esc(S.user.username)}</div>
    </aside>
    <main class="main">
      ${topView()}
      <div class="stack" id="page">${pageView()}</div>
    </main>
    <nav class="tabbar g" aria-label="Boʻlimlar">${tab}</nav>
  </div>`;
}

function topView() {
  const d = S.devices.find((x) => x.id === S.devId);
  let devsel = "";
  if (S.devices.length) {
    const opts = S.devices.map((x) => `<option value="${esc(x.id)}" ${x.id === S.devId ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    const status = S.online ? `<span class="dot on"></span><span class="ctext">${S.live && S.live.locked ? "qulflangan" : "onlayn"}</span>` : `<span class="dot"></span><span class="ctext">${d && (S.lastSeen || d.last_seen) ? "oflayn" : "kutilmoqda"}</span>`;
    devsel = `<div class="devsel g"><span class="conn">${status}</span>${S.devices.length > 1 ? `<select aria-label="Qurilma" data-change="device">${opts}</select>` : `<b style="padding-right:8px">${esc(d ? d.name : "")}</b>`}</div>`;
  }
  const gear = S.route !== "settings" ? `<a class="btn icon ghost mob-only" href="#/settings" aria-label="Sozlamalar">${ic("sliders")}</a>` : "";
  return `<header class="top"><h2>${TITLES[S.route] || ""}</h2>${devsel}${gear}</header>`;
}

function pageView() {
  if (S.route === "settings") return settingsView();
  if (!S.devices.length) return noDeviceView();
  switch (S.route) {
    case "system": return systemView();
    case "procs": return procsView();
    case "time": return timeView();
    case "control": return controlView();
    default: return overviewView();
  }
}

function noDeviceView() {
  return `<section class="g empty">
    <h3>Kompyuterni ulang</h3>
    <p>Akkaunt tayyor. Kompyuteringizga <b>PCPulseAgent.exe</b> ni yuklab oling, ishga tushiring va shu username hamda parol bilan kiring — maʼlumotlar shu yerda paydo boʻladi.</p>
    <a class="btn pri" href="${esc(CFG.exeUrl || "#")}" target="_blank" rel="noopener">${ic("power")}PCPulseAgent.exe ni yuklab olish</a>
    <p class="sub" style="margin-top:16px">Windows 10/11. Birinchi ishga tushirishda Windows administrator ruxsatini soʻraydi — “Ha” ni bosing. SmartScreen chiqsa: “More info” → “Run anyway”.</p>
  </section>`;
}

function waitingView() {
  const d = S.devices.find((x) => x.id === S.devId) || {};
  const ls = S.lastSeen || d.last_seen;
  return `<section class="g hero">
    <div><h1>${ls ? "Kompyuter oflayn" : "Maʼlumot kutilmoqda"}</h1>
    <p class="lead">${ls ? `Oxirgi aloqa: ${fmtAgo(ls)}. Kompyuter oʻchiq, uyquda yoki internetga ulanmagan.` : "Agent hali maʼlumot yubormadi. Kompyuterda agent ishlayotganini tekshiring."}</p>
    <div class="row">${ls ? `<button class="btn pri ${S.busy.wake ? "busy" : ""}" data-act="wake">${ic("zap")}Kompyuterni yoqish</button>` : ""}
    <a class="btn" href="#/control">Boshqaruv</a></div></div>
    <div class="ringwrap">${ring(0, "na", "—")}</div>
  </section>${eventsCard(6)}`;
}

// =================================================================== grafik elementlar
function ring(pct, cls, label, size = 112, sw = 10) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, off = c * (1 - clamp(num(pct) ? pct : 0, 0, 100) / 100);
  return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-size="${size * 0.27}">${esc(label)}</text></svg>`;
}

function spark(vals, cls = "cool", max = 100) {
  const w = 120, h = 34;
  const v = vals.slice(-60);
  if (v.filter(num).length < 2) return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"></svg>`;
  const n = v.length;
  const pts = v.map((x, i) => [(i / (n - 1)) * w, h - 2 - (clamp(num(x) ? x : 0, 0, max) / max) * (h - 5)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${line}L${w} ${h}L0 ${h}Z"/><path class="l" d="${line}" vector-effect="non-scaling-stroke"/></svg>`;
}

function barH(pct, cls = "") {
  return `<div class="bar ${cls}"><i style="width:${clamp(num(pct) ? pct : 0, 0, 100).toFixed(1)}%"></i></div>`;
}

const chartW = () => (innerWidth < 600 ? 360 : innerWidth < 1200 ? 640 : 760);
function lineChart(ts, vals, { max, unit = "", color = "#5ee1d9" } = {}) {
  const W = chartW(), H = innerWidth < 600 ? 200 : 180, L = 34, B = 22, T = 8;
  const pts = ts.map((t, i) => [t, vals[i]]).filter((p) => num(p[1]));
  if (pts.length < 2) return `<div class="sub" style="padding:40px 0;text-align:center">Hali yetarli maʼlumot yoʻq — grafik bir necha daqiqadan soʻng paydo boʻladi.</div>`;
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const vmax = max || Math.max(10, Math.ceil(Math.max(...pts.map((p) => p[1])) / 10) * 10);
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - 4);
  const y = (v) => T + (1 - clamp(v, 0, vmax) / vmax) * (H - T - B);
  let d = "", prev = null;
  for (const [t, v] of pts) { d += `${prev !== null && t - prev > 600 ? "M" : d ? "L" : "M"}${x(t).toFixed(1)} ${y(v).toFixed(1)}`; prev = t; }
  const grid = [0, .25, .5, .75, 1].map((f) => { const yy = T + f * (H - T - B); return `<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end">${Math.round(vmax * (1 - f))}</text>`; }).join("");
  const span = t1 - t0, step = span > 86400 * 2 ? 86400 : span > 3600 * 8 ? 21600 : 3600;
  let xl = "";
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) xl += `<text x="${x(t)}" y="${H - 5}" text-anchor="middle">${step >= 86400 ? `${new Date(t * 1000).getDate()}-${MONTHS[new Date(t * 1000).getMonth()].slice(0, 3)}` : hhmm(t)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik"><g class="grid">${grid}</g>${xl}
    <path class="l" d="${d}" stroke="${color}"/><text x="${W - 4}" y="${T + 10}" text-anchor="end">${esc(unit)}</text></svg>`;
}

// =================================================================== UMUMIY
function overviewView() {
  const L = S.live;
  if (!L || !S.online) return waitingView();
  const h = S.health || { score: 0, level: "ok", items: [], summary: "" };
  const lead = (h.summary || "").split(". ")[0].replace(/\.$/, "") + ".";
  const probs = h.items.filter((i) => i.level === "warn" || i.level === "crit");
  const goods = h.items.filter((i) => i.level === "ok" || i.level === "info");
  const issues = probs.map((i) => `<li class="issue"><span class="dot ${i.level}"></span><div><b>${esc(i.title)}</b>${i.detail ? ` <span class="sub">${esc(i.detail)}</span>` : ""}</div>${i.tip ? `<div class="tip">${esc(i.tip)}</div>` : ""}</li>`).join("");
  const chips = goods.map((i) => `<span class="chip" title="${esc(i.tip || i.detail || "")}"><span class="dot ${i.level}"></span>${esc(i.title)}</span>`).join("");
  const cpu = L.cpu || {}, g = (L.gpus || [])[0], ram = L.ram || {};
  const sysVol = (L.volumes || []).find((v) => /^c:/i.test(v.mount)) || (L.volumes || [])[0];
  const ut = L.usage_today || {};
  const top = (ut.top || [])[0];

  const tile = (href, name, right, big, sub, sp = "") => `<a class="g tile" href="${href}"><div class="name"><span>${name}</span><span>${right}</span></div><div class="big">${big}</div><div class="sub">${sub}</div>${sp}</a>`;
  const tiles = [
    tile("#/system", "Protsessor", esc(shortCpu(cpu.name)), `${r0(cpu.load)}<span class="unit">%</span>`,
      `${num(cpu.temp) ? `<span class="t-${heat(cpu.temp)}">${r0(cpu.temp)}°C</span> · ` : ""}${num(cpu.clock) ? (cpu.clock / 1000).toFixed(2) + " GHz" : ""}`, spark(S.hist.cpu, "cool")),
    g ? tile("#/system", "Videokarta", esc(shortGpu(g.name)), `${r0(g.load)}<span class="unit">%</span>`,
      `${num(g.temp) ? `<span class="t-${heat(g.temp)}">${r0(g.temp)}°C</span>` : ""}${num(g.mem_used) && num(g.mem_total) ? ` · VRAM ${(g.mem_used / 1024).toFixed(1)}/${(g.mem_total / 1024).toFixed(0)} GB` : ""}`, spark(S.hist.gpu, "lilac"))
      : tile("#/system", "Videokarta", "", "—", "Maʼlumot yoʻq", spark([], "lilac")),
    tile("#/procs", "Operativ xotira", fmtB(ram.total), `${r0(ram.percent)}<span class="unit">%</span>`, `${fmtB(ram.used)} band · ${fmtB(ram.avail)} boʻsh`, spark(S.hist.ram, "warm")),
    sysVol ? tile("#/system", "Disk " + esc(sysVol.mount.replace(/[\\/]$/, "")), fmtB(sysVol.total), `${r0(100 - sysVol.percent)}<span class="unit">% boʻsh</span>`,
      `${fmtB(sysVol.free)} boʻsh joy`, `<div style="margin-top:14px">${barH(sysVol.percent, pctCls(sysVol.percent, 85, 95))}</div>`) : "",
  ].join("");

  const net = L.net || {}, pw = L.power || {};
  const mini = [
    ["Tarmoq", `↓ ${fmtRate(net.down_bps)}`, `↑ ${fmtRate(net.up_bps)}${num(net.ping_ms) ? ` · ping ${net.ping_ms} ms` : ""}`],
    ["Quvvat", num(pw.est) ? `${pw.est} W` : "—", num(pw.est) ? `CPU ${r0(pw.cpu)} W · GPU ${r0(pw.gpu)} W` : "Sensor ulanmagan"],
    ["Bugungi ekran vaqti", fmtDur(ut.total, true), top ? `Eng koʻp: ${esc(top.name)}` : "Hali faollik yoʻq"],
    ["Ishlash vaqti", fmtUptime(L.uptime), L.fg ? `Hozir: ${esc(L.fg.name)}` : L.locked ? "Ekran qulflangan" : "&nbsp;"],
  ].map(([n, v, s]) => `<div class="g tile"><div class="name"><span>${n}</span></div><div class="mid">${v}</div><div class="sub">${s}</div></div>`).join("");

  return `
  <section class="g hero">
    <div><h1>${esc(lead)}</h1><p class="lead">${esc(h.summary.split(". ").slice(1).join(". ") || "")}</p></div>
    <div class="ringwrap">${ring(h.score, h.level, String(h.score))}</div>
    ${issues ? `<ul class="issues">${issues}</ul>` : ""}
    ${chips ? `<div class="chips">${chips}</div>` : ""}
  </section>
  <div class="grid4">${tiles}</div>
  <div class="grid4">${mini}</div>
  <div class="split">
    ${metricsCard()}
    <section class="g pad"><h3>Tezkor amallar</h3>${quickActions()}</section>
  </div>
  ${eventsCard(6)}`;
}

function shortCpu(n) { return String(n || "").replace(/\(R\)|\(TM\)|CPU|Processor|@.*$|\d+-Core/gi, "").replace(/\s+/g, " ").trim(); }
function shortGpu(n) { return String(n || "").replace(/NVIDIA |AMD |Intel\(R\) |GeForce /gi, "").trim(); }
function fmtUptime(s) {
  s = s || 0; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} kun ${h} soat` : h ? `${h} soat ${m} daq` : `${m} daq`;
}

function metricsCard() {
  const M = S.metrics;
  const opts = [["cpu_temp", "CPU °C"], ["gpu_temp", "GPU °C"], ["cpu_load", "CPU %"], ["ram", "RAM %"], ["power", "Vatt"]];
  const k = S.sub.metric;
  const colors = { cpu_temp: "#5ee1d9", gpu_temp: "#a99bff", cpu_load: "#5ee1d9", ram: "#f5b454", power: "#72e6a8" };
  const body = M ? lineChart(M.ts, M[k] || [], { max: k === "cpu_load" || k === "ram" ? 100 : undefined, unit: opts.find((o) => o[0] === k)[1], color: colors[k] })
    : `<div class="sub" style="padding:40px 0;text-align:center">Yuklanmoqda…</div>`;
  return `<section class="g pad"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Oxirgi 24 soat</h3>
    <div class="seg">${opts.map(([v, t]) => `<button class="${k === v ? "on" : ""}" data-act="metric" data-v="${v}">${t}</button>`).join("")}</div></div>${body}</section>`;
}

function quickActions() {
  const caps = (S.live && S.live.caps) || {};
  const gs = ((S.live && S.live.guard) || {}).state || "off";
  const a = (act, icon, t, s, cls = "", dis = false) => `<button class="act ${cls} ${S.busy[act] ? "busy" : ""}" data-act="${act}" ${dis ? "disabled" : ""}>${ic(icon)}<span>${t}<small>${s}</small></span></button>`;
  return `<div class="actions two">
    ${a("lock", "lock", "Qulflash", "Ekranni hozir", "", !caps.lock)}
    ${gs === "off" ? a("guardArm", "shield", "Qoʻriqlash", "Tegsa — qulflanadi", "", !caps.guard) : a("guardOff", "shield", "Qoʻriqlash yoniq", "Oʻchirish uchun bosing", "warn")}
    ${a("sleep", "moon", "Uyqu", "Sleep rejimi", "", !caps.power)}
    ${a("shutdown", "power", "Oʻchirish", "Kompyuterni", "danger", !caps.power)}
  </div>`;
}

function eventsCard(n = 8) {
  const ev = (S.events || []).slice(0, n);
  if (!ev.length) return "";
  return `<section class="g pad"><h3>Soʻnggi hodisalar</h3><div class="list">${ev.map((e) =>
    `<div class="ev" data-key="ev${e.id}"><span class="dot ${e.level === "ok" ? "ok" : e.level}"></span><div><div>${esc(e.title)}</div>${e.body ? `<div class="sub">${esc(e.body)}</div>` : ""}</div><time>${fmtAgo(e.ts)}</time></div>`).join("")}</div></section>`;
}

// =================================================================== TIZIM
function systemView() {
  const k = S.sub.system;
  const seg = `<div class="seg">${[["comp", "Komponentlar"], ["fans", "Fanlar"], ["power", "Quvvat va kuchlanish"]].map(([v, t]) =>
    `<button class="${k === v ? "on" : ""}" data-act="sub" data-p="system" data-v="${v}">${t}</button>`).join("")}</div>`;
  if (!S.live) return seg + waitingView();
  return seg + (k === "fans" ? fansView() : k === "power" ? powerView() : compView());
}

function sourceNote() {
  const L = S.live;
  if (L && L.pawnio === false && L.source === "lhm") {
    return `<div class="note">CPU harorati, PSU kuchlanishi va fanlar uchun kompyuterga bepul <b>PawnIO</b> drayverini oʻrnating, soʻng kompyuterni qayta ishga tushiring.
      <div style="margin-top:8px"><a class="btn sm" href="https://github.com/namazso/PawnIO.Setup/releases/latest" target="_blank" rel="noopener">PawnIO ni yuklab olish</a></div></div>`;
  }
  if (!L || L.source !== "basic") return "";
  return `<div class="note">Harorat, kuchlanish va fanlar koʻrinmayapti: sensorlar cheklangan rejimda.
    Agent administrator huquqisiz ishlayotgan boʻlishi mumkin — PCPulseAgent.exe ni qayta ishga tushirib, Windows ruxsat soʻraganda “Ha” ni bosing.
    ${L.lhm_error ? `<div class="faint" style="margin-top:6px">${esc(L.lhm_error).slice(0, 200)}</div>` : ""}</div>`;
}

function compView() {
  const L = S.live, si = S.sysinfo || {}, cpu = L.cpu || {}, ram = L.ram || {};
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== undefined && r[1] !== null && r[1] !== "").map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`;
  const maxCore = Math.max(100, ...(cpu.cores || []));
  const cpuCard = `<section class="g pad"><div class="row between"><h3 style="margin:0">Protsessor</h3><span class="mid t-${heat(cpu.temp)}">${num(cpu.temp) ? r0(cpu.temp) + "°C" : ""}</span></div>
    <div class="sub" style="margin:2px 0 12px">${esc(cpu.name || (si.cpu || {}).name || "")}</div>
    ${kv([["Yuklama", `${r0(cpu.load)}%`], ["Chastota", num(cpu.clock) ? `${(cpu.clock / 1000).toFixed(2)} GHz` : null],
      ["Quvvat", num(cpu.power) ? `${r0(cpu.power)} W` : null], ["Yadrolar / oqimlar", `${cpu.phys || (si.cpu || {}).cores || "?"} / ${cpu.threads || "?"}`],
      ["Soket", (si.cpu || {}).socket]])}
    <div class="cores" title="Har bir yadro yuklamasi" style="grid-template-columns:repeat(${Math.max(1, (cpu.cores || []).length)},minmax(0,1fr))">${(cpu.cores || []).map((c) => `<i style="height:${clamp((c / maxCore) * 100, 4, 100)}%"></i>`).join("")}</div></section>`;

  const gpuCards = (L.gpus || []).map((g, i) => `<section class="g pad"><div class="row between"><h3 style="margin:0">Videokarta${L.gpus.length > 1 ? " " + (i + 1) : ""}</h3><span class="mid t-${heat(g.temp)}">${num(g.temp) ? r0(g.temp) + "°C" : ""}</span></div>
    <div class="sub" style="margin:2px 0 12px">${esc(g.name)}</div>
    ${kv([["Yuklama", `${r0(g.load)}%`], ["Hot spot", num(g.hotspot) ? `${r0(g.hotspot)}°C` : null], ["Xotira harorati", num(g.mem_temp) ? `${r0(g.mem_temp)}°C` : null],
      ["Quvvat", num(g.power) ? `${r0(g.power)} W` : null], ["Chastota", num(g.clock) ? `${r0(g.clock)} MHz` : null],
      ["Fan", num(g.fan_rpm) ? `${r0(g.fan_rpm)} RPM${num(g.fan_pct) ? ` (${r0(g.fan_pct)}%)` : ""}` : num(g.fan_pct) ? `${r0(g.fan_pct)}%` : null]])}
    ${num(g.mem_used) && num(g.mem_total) ? `<div class="row between sub" style="margin-top:12px"><span>VRAM</span><span>${(g.mem_used / 1024).toFixed(1)} / ${(g.mem_total / 1024).toFixed(1)} GB</span></div>${barH((g.mem_used / g.mem_total) * 100, "lilac")}` : ""}
  </section>`).join("") || ((si.gpus || []).length ? `<section class="g pad"><h3>Videokarta</h3>${(si.gpus || []).map((g) => `<div>${esc(g.name)}</div><div class="sub">Drayver ${esc(g.driver || "")}</div>`).join("")}</section>` : "");

  const mods = si.ram_modules || [];
  const ramCard = `<section class="g pad"><div class="row between"><h3 style="margin:0">Operativ xotira</h3><span class="mid">${r0(ram.percent)}%</span></div>
    <div class="sub" style="margin:2px 0 10px">${fmtB(ram.used)} / ${fmtB(ram.total)} band</div>${barH(ram.percent, pctCls(ram.percent, 80, 92) || "warm")}
    ${num(ram.swap_total) && ram.swap_total ? `<div class="row between sub" style="margin-top:12px"><span>Pagefile (swap)</span><span>${fmtB(ram.swap_used)} / ${fmtB(ram.swap_total)}</span></div>` : ""}
    ${mods.length ? `<div class="scroll-x" style="margin-top:12px"><table class="tb"><tr><th>Slot</th><th>Hajm</th><th>Tezlik</th><th>Model</th></tr>${mods.map((m) =>
      `<tr><td>${esc(m.slot || "")}</td><td>${fmtB(m.capacity)}</td><td>${m.speed ? esc(m.speed) + " MT/s" : ""}</td><td class="sub">${esc([m.manufacturer, m.part].filter(Boolean).join(" "))}</td></tr>`).join("")}</table></div>` : ""}</section>`;

  const phys = si.physical_disks || [];
  const diskRows = (L.disks || []).map((d) => {
    const p = phys.find((x) => x.name === d.name) || {};
    return `<div class="li" data-key="d-${esc(d.name)}"><div class="av">${ic("layers")}</div><div><div class="t">${esc(d.name)}</div>
      <div class="s">${[p.media, p.bus, p.size ? fmtB(p.size) : null, num(d.written_gb) ? `yozilgan ${(d.written_gb / 1024).toFixed(1)} TB` : null].filter(Boolean).map(esc).join(" · ")}</div></div>
      <div class="r">${num(d.life) ? `<span class="chip"><span class="dot ${d.life < 10 ? "crit" : d.life < 30 ? "warn" : "ok"}"></span>resurs ${r0(d.life)}%</span>` : ""}<span class="num t-${heat(num(d.temp) ? d.temp + 8 : null)}">${num(d.temp) ? r0(d.temp) + "°C" : ""}</span></div></div>`;
  }).join("") || phys.map((p) => `<div class="li"><div class="av">${ic("layers")}</div><div><div class="t">${esc(p.name)}</div><div class="s">${esc([p.media, p.bus, fmtB(p.size)].filter(Boolean).join(" · "))}</div></div>
      <div class="r"><span class="chip"><span class="dot ${/healthy/i.test(p.health || "") ? "ok" : "warn"}"></span>${esc(p.health || "?")}</span></div></div>`).join("");
  const vols = (L.volumes || []).map((v) => `<div style="margin-top:12px"><div class="row between"><b>${esc(v.mount)}</b><span class="sub">${fmtB(v.free)} boʻsh / ${fmtB(v.total)}</span></div>${barH(v.percent, pctCls(v.percent, 85, 95))}</div>`).join("");
  const diskCard = `<section class="g pad"><h3>Disklar</h3><div class="list">${diskRows}</div>${vols}
    <div class="row sub" style="margin-top:12px"><span>Oʻqish ${fmtRate((L.io || {}).read_bps)}</span><span>Yozish ${fmtRate((L.io || {}).write_bps)}</span></div></section>`;

  const mb = L.mb || {}, b = si.board || {}, bios = si.bios || {};
  const mbCard = `<section class="g pad"><h3>Ona plata</h3>${kv([
      ["Ishlab chiqaruvchi", esc(b.manufacturer)], ["Model", esc(b.product || mb.name)], ["Versiya", esc(b.version)],
      ["BIOS", esc([bios.vendor, bios.version].filter(Boolean).join(" "))], ["BIOS sanasi", esc(bios.date)], ["Sensor chipi", esc(mb.chip)],
      ...((mb.temps || []).map((t) => [esc(t.name), `<span class="t-${heat(t.value)}">${r0(t.value)}°C</span>`])),
    ])}</section>`;

  const net = (si.net || {});
  const osCard = `<section class="g pad"><h3>Tizim</h3>${kv([
      ["Operatsion tizim", esc(si.os)], ["Versiya", esc(si.os_ver)], ["Kompyuter nomi", esc(si.hostname || L.host)],
      ["Kompyuter", esc([((si.computer || {}).manufacturer), ((si.computer || {}).model)].filter(Boolean).join(" "))],
      ["Ishlash vaqti", fmtUptime(L.uptime)], ["IP manzil", esc(net.ip)], ["MAC (Wake-on-LAN)", esc(net.mac)],
      ["Tarmoq", esc(net.iface ? `${net.iface}${net.wifi ? " (Wi-Fi)" : ""}` : "")],
      ["Antivirus", si.defender ? (si.defender.rt ? "Defender yoniq" : "Defender real vaqt himoyasi oʻchiq") : null],
      ["Batareya", L.battery ? `${L.battery.percent}%${L.battery.plugged ? ", zaryadda" : ""}` : null],
      ["Agent", `${esc(L.agent || "")} · sensorlar: ${esc(L.source)}${(L.caps || {}).admin ? "" : " · admin emas"}`],
    ])}
    <button class="btn sm" style="margin-top:14px" data-act="sensorsAll">${ic("list")}Barcha sensorlar</button></section>`;

  return `${sourceNote()}<div class="grid2">${cpuCard}${gpuCards}</div><div class="grid2">${ramCard}${diskCard}</div><div class="grid2">${mbCard}${osCard}</div>`;
}

const PRESET_NAMES = { silent: "Sokin", balanced: "Muvozanat", performance: "Unumdor", max: "Maksimal" };
function fansView() {
  const L = S.live, st = (S.dev && S.dev.settings) || {}, rules = st.fans || {};
  const caps = L.caps || {};
  const fans = L.fans || [];
  const live = fans.filter((f) => (f.rpm || 0) > 0 || f.hw === "gpu" || !num(f.rpm));
  const idle = fans.filter((f) => !live.includes(f));
  const row = (f) => {
    const cid = f.control_id, r = (cid && rules[cid]) || {}, mode = r.mode || "auto";
    const draft = S.form.fanDraft[cid];
    const val = draft !== undefined ? draft : num(r.value) ? r.value : num(f.pct) ? Math.round(f.pct) : 50;
    const can = caps.fans && cid;
    const minP = Number(st.fan_min_pct ?? 20);
    return `<section class="g pad" data-key="fan-${esc(f.id)}">
      <div class="row between"><div style="min-width:0"><b>${esc(f.name)}</b> <button class="btn ghost sm" data-act="fanRename" data-id="${esc(cid || f.id)}" data-name="${esc(f.name)}" aria-label="Nomini oʻzgartirish">tahrirlash</button>
        <div class="sub">${esc(f.hw === "gpu" ? "Videokarta" : "Ona plata")}${f.raw_name && f.raw_name !== f.name ? " · " + esc(f.raw_name) : ""}</div></div>
        <div style="text-align:right"><div class="mid">${num(f.rpm) ? r0(f.rpm) : "—"}<span class="unit">RPM</span></div><div class="sub">${num(f.pct) ? `quvvat ${r0(f.pct)}%` : ""}${num(f.target) ? ` → ${f.target}%` : ""}</div></div></div>
      ${can ? `<div class="row" style="margin-top:12px"><div class="seg">${[["auto", "Avto (BIOS)"], ["manual", "Qoʻlda"], ["curve", "Harorat boʻyicha"]].map(([m, t]) =>
        `<button class="${mode === m ? "on" : ""}" data-act="fanMode" data-id="${esc(cid)}" data-v="${m}" data-cur="${Math.round(clamp(num(f.pct) ? f.pct : 50, minP, 100))}">${t}</button>`).join("")}</div></div>
      ${mode === "manual" ? `<div class="row" style="margin-top:10px;flex-wrap:nowrap"><input type="range" min="${minP}" max="100" step="1" value="${val}" style="--p:${(((val - minP) / Math.max(1, 100 - minP)) * 100).toFixed(1)}%"
          data-input="fanDraft" data-change="fanValue" data-id="${esc(cid)}" aria-label="Fan tezligi"><b style="min-width:48px;text-align:right">${val}%</b></div>` : ""}
      ${mode === "curve" ? `<div class="row" style="margin-top:10px">
          <select class="in" style="width:auto" data-change="fanPreset" data-id="${esc(cid)}">${Object.entries(PRESET_NAMES).map(([k, t]) => `<option value="${k}" ${(r.preset || "balanced") === k ? "selected" : ""}>${t}</option>`).join("")}</select>
          <select class="in" style="width:auto" data-change="fanSource" data-id="${esc(cid)}">${[["cpu", "CPU harorati"], ["gpu", "GPU harorati"], ["max", "Eng issigʻi"]].map(([k, t]) =>
            `<option value="${k}" ${(r.source || (f.hw === "gpu" ? "gpu" : "cpu")) === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>` : ""}` : ""}
    </section>`;
  };
  return `${sourceNote()}
    ${!caps.fans && L.source !== "basic" ? `<div class="note info">Fan tezligini boshqarish uchun agent LibreHardwareMonitor DLL orqali, administrator huquqi bilan ishlashi kerak. Hozir faqat koʻrish mumkin.</div>` : ""}
    ${caps.fans ? `<div class="note info">Xavfsizlik: CPU 90°C (GPU 88°C) dan oshsa, fan avtomatik 100% ga oʻtadi. Minimal tezlik: ${st.fan_min_pct ?? 20}%. Agent toʻxtasa, fanlar BIOS boshqaruviga qaytariladi.</div>` : ""}
    ${live.length ? `<div class="grid2">${live.map(row).join("")}</div>` : `<section class="g empty"><h3>Fanlar topilmadi</h3><p>Sensorlar fan maʼlumotini bermayapti.</p></section>`}
    ${idle.length ? `<details class="more"><summary>Ulanmagan yoki toʻxtagan fan ulagichlari (${idle.length})</summary><div class="grid2">${idle.map(row).join("")}</div></details>` : ""}`;
}

function nominalV(name) {
  const n = String(name).toLowerCase().replace(/\s/g, "");
  if (/vbat|cmos|battery/.test(n)) return 3.0;
  if (/12v/.test(n)) return 12;
  if (/(^|[^.\d])5v|5vsb/.test(n)) return 5;
  if (/3\.3v|3v3|3vcc|3vsb|avcc|\+3v/.test(n)) return 3.3;
  return null;
}
function powerView() {
  const L = S.live, pw = L.power || {};
  const rails = (L.voltages || []).map((v) => ({ ...v, nom: nominalV(v.name) }));
  const main = rails.filter((v) => v.nom).sort((a, b) => b.nom - a.nom), other = rails.filter((v) => !v.nom);
  const railRow = (v) => {
    const dev = ((v.value - v.nom) / v.nom) * 100, a = Math.abs(dev);
    const lvl = v.nom === 3 ? (v.value < 2.5 ? "crit" : v.value < 2.75 ? "warn" : "ok") : a <= 5 ? "ok" : a <= 8 ? "warn" : a <= 25 ? "crit" : "info";
    const txt = { ok: "meʼyorida", warn: "chegarada", crit: "meʼyordan chetda", info: "sensor masshtabi notoʻgʻri boʻlishi mumkin" }[lvl];
    const pos = clamp(50 + dev * 5, 2, 98);
    return `<div class="li" data-key="v-${esc(v.id)}" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t">${esc(v.name)} <span class="sub">(meʼyor ${v.nom} V${v.nom === 3 ? ", CMOS batareya" : " ±5%"})</span></div>
      <div style="position:relative;height:6px;border-radius:6px;margin-top:8px;background:linear-gradient(90deg,rgba(255,107,107,.35) 0 25%,rgba(114,230,168,.35) 25% 75%,rgba(255,107,107,.35) 75%)">
        <i style="position:absolute;top:-4px;left:calc(${pos}% - 2px);width:4px;height:14px;border-radius:2px;background:#fff"></i></div>
      <div class="sub" style="margin-top:6px"><span class="dot ${lvl}" style="display:inline-block;margin-right:6px"></span>${txt}${v.nom !== 3 ? ` · ${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%` : ""}</div></div>
      <div class="mid">${v.value.toFixed(v.value < 10 ? 3 : 2)}<span class="unit">V</span></div></div>`;
  };
  const psu = L.psu;
  return `${sourceNote()}
  <div class="grid3">
    <div class="g tile"><div class="name"><span>Jami (taxminan)</span></div><div class="big">${num(pw.est) ? pw.est : "—"}<span class="unit">W</span></div><div class="sub">${psu && num(psu.power) ? "Raqamli PSU oʻlchovi" : "CPU + GPU + ~35 W qolgan qismlar"}</div></div>
    <div class="g tile"><div class="name"><span>Protsessor</span></div><div class="big">${num(pw.cpu) ? r0(pw.cpu) : "—"}<span class="unit">W</span></div><div class="sub">Package quvvati</div></div>
    <div class="g tile"><div class="name"><span>Videokarta</span></div><div class="big">${num(pw.gpu) ? r0(pw.gpu) : "—"}<span class="unit">W</span></div><div class="sub">Board/package quvvati</div></div>
  </div>
  <section class="g pad"><h3>Quvvat bloki (PSU) kuchlanishlari</h3>
    ${main.length ? `<div class="list">${main.map(railRow).join("")}</div>` : `<p class="sub">Ona plata sensori +12V/+5V/+3.3V qiymatlarini bermayapti.${L.source === "basic" ? " LibreHardwareMonitor ulang." : ""}</p>`}
    <p class="sub" style="margin:12px 0 0">ATX standarti boʻyicha ±5% ruxsat etiladi. Baʼzi platalarda sensor “+12V” ni boshqa masshtabda oʻlchaydi — shubhali boʻlsa BIOS dagi qiymat bilan solishtiring.</p>
  </section>
  ${psu ? `<section class="g pad"><h3>${esc(psu.name)}</h3><dl class="kv"><dt>Chiqish quvvati</dt><dd>${r0(psu.power)} W</dd><dt>Harorat</dt><dd>${r0(psu.temp)}°C</dd><dt>Fan</dt><dd>${r0(psu.fan_rpm)} RPM</dd></dl></section>` : ""}
  ${other.length ? `<section class="g pad"><h3>Boshqa kuchlanishlar</h3><table class="tb">${other.map((v) => `<tr><td>${esc(v.name)}</td><td class="n">${v.value.toFixed(3)} V</td></tr>`).join("")}</table></section>` : ""}`;
}

// =================================================================== JARAYONLAR
const TIPS = [
  [/^(chrome|msedge|firefox|opera|brave|browser|yandex|vivaldi)/, "Brauzer: keraksiz tablarni yoping. Chrome/Edge sozlamalarida “Memory Saver” (Xotirani tejash) ni yoqing, kengaytmalarni kamaytiring."],
  [/^(telegram|discord|slack|teams|ms-teams|whatsapp|zoom)/, "Messenjer: doim kerak boʻlmasa, avtoyuklanishdan oʻchiring va ishlatmaganda yoping."],
  [/^(code|idea64|pycharm64|webstorm64|devenv|studio64|rider64|cursor)/, "IDE: ochiq loyihalar va kengaytmalarni kamaytiring."],
  [/^(steam|steamwebhelper|epicgameslauncher|battle\.net|eadesktop|ubisoftconnect|galaxyclient)/, "Oʻyin launcheri: oʻynamayotganda yoping va avtoyuklanishdan olib tashlang."],
  [/^(msmpeng|mssense|nissrv)/, "Windows Defender skanerlamoqda — odatda vaqtinchalik. Toʻliq skanerlashni tunga qoldiring."],
  [/^(searchindexer|searchhost|searchapp)/, "Windows qidiruv indeksatsiyasi — biroz vaqtdan soʻng tinchlanadi."],
  [/^(photoshop|afterfx|adobe premiere|premiere|blender|resolve|illustrator)/, "Ogʻir grafik dastur: kesh va History hajmini kamaytiring, ishlatmayotgan hujjatlarni yoping."],
  [/^(java|javaw|node|python|pythonw|php|ruby)/, "Dasturchi vositasi yoki skript — kerak boʻlmasa toʻxtating."],
  [/^dwm/, "Oyna menejeri (tizim). Koʻp RAM olsa videodrayverni yangilang."],
  [/^explorer/, "Explorer — koʻp RAM olsa, uni “Yopish” orqali qayta ishga tushirish yordam beradi (Windows avtomatik qayta ochadi)."],
  [/^memory compression/, "Windows xotirani siqmoqda — bu RAM yetishmayotganining belgisi."],
  [/^(onedrive|dropbox|googledrivefs)/, "Bulut sinxronizatsiyasi: katta papkalarni “faqat onlayn” rejimga oʻtkazing."],
];
const tipFor = (name) => { const n = String(name || "").toLowerCase(); const t = TIPS.find(([re]) => re.test(n)); return t ? t[1] : ""; };
const PALETTE = ["#5ee1d9", "#a99bff", "#f5b454", "#72e6a8", "#ff8fa3", "#7cb4ff"];

function procsView() {
  const L = S.live;
  if (!L) return waitingView();
  const ram = L.ram || {}, pr = L.procs || {};
  const k = S.sub.procs;
  const list = k === "cpu" ? pr.by_cpu || [] : pr.by_mem || [];
  const top5 = (pr.by_mem || []).slice(0, 5);
  const stack = top5.map((p, i) => `<i style="width:${((p.mem / ram.total) * 100).toFixed(2)}%;background:${PALETTE[i]}" title="${esc(p.title)}"></i>`).join("");
  const rest = Math.max(0, ram.used - top5.reduce((a, p) => a + p.mem, 0));
  const rows = list.map((p) => {
    const tip = p.mem > 400 * 1048576 || p.cpu > 15 ? tipFor(p.name) : "";
    return `<div class="li" data-key="p-${esc(p.name)}"><div class="av">${esc(initials(p.title))}</div>
      <div><div class="t">${esc(p.title)}</div><div class="s">${esc(p.name)}${p.n > 1 ? ` · ${p.n} ta jarayon` : ""}</div></div>
      <div class="r"><div style="text-align:right"><div class="num">${k === "cpu" ? `${p.cpu.toFixed(1)}%` : fmtB(p.mem)}</div><div class="sub">${k === "cpu" ? fmtB(p.mem) : `CPU ${p.cpu.toFixed(1)}%`}</div></div>
      <button class="btn sm ${S.busy["kill-" + p.name] ? "busy" : ""}" data-act="kill" data-name="${esc(p.name)}" data-title="${esc(p.title)}" ${p.protected ? 'disabled title="Tizim jarayoni"' : ""}>Yopish</button></div>
      ${tip ? `<div class="tip">${esc(tip)}</div>` : ""}</div>`;
  }).join("");
  return `
  <section class="g pad"><div class="row between"><div><h3 style="margin:0 0 2px">Operativ xotira</h3><div class="sub">${fmtB(ram.used)} band, ${fmtB(ram.avail)} boʻsh · jami ${fmtB(ram.total)}</div></div><div class="big">${r0(ram.percent)}<span class="unit">%</span></div></div>
    <div class="stackbar" style="margin-top:14px">${stack}<i style="width:${((rest / ram.total) * 100).toFixed(2)}%;background:rgba(255,255,255,.22)"></i></div>
    <div class="legend">${top5.map((p, i) => `<span><i style="background:${PALETTE[i]}"></i>${esc(p.title)} ${fmtB(p.mem)}</span>`).join("")}<span><i style="background:rgba(255,255,255,.22)"></i>Boshqalar ${fmtB(rest)}</span></div>
  </section>
  ${fixCard()}
  <section class="g pad"><div class="row between" style="margin-bottom:6px"><h3 style="margin:0">Dasturlar</h3>
    <div class="seg"><button class="${k === "mem" ? "on" : ""}" data-act="sub" data-p="procs" data-v="mem">RAM boʻyicha</button><button class="${k === "cpu" ? "on" : ""}" data-act="sub" data-p="procs" data-v="cpu">CPU boʻyicha</button></div></div>
    <div class="sub" style="margin-bottom:6px">Jami ${pr.count || 0} ta jarayon. “Yopish” dasturni darhol toʻxtatadi — saqlanmagan ishlar yoʻqoladi.</div>
    <div class="list">${rows || `<div class="sub" style="padding:14px 0">Roʻyxat boʻsh</div>`}</div></section>
  ${startupCard()}`;
}

function fixCard() {
  const L = S.live, ram = L.ram || {}, top = (L.procs || {}).by_mem || [];
  const tips = [];
  const t3 = top.filter((p) => !p.protected).slice(0, 3);
  if (ram.percent >= 70 && t3.length) tips.push(`Eng koʻp xotira olayotganlar: ${t3.map((p) => `${p.title} (${fmtB(p.mem)})`).join(", ")}. Hozir kerak boʻlmaganlarini yoping.`);
  if (top.some((p) => /^(chrome|msedge|firefox|opera|brave|browser|yandex)/i.test(p.name) && p.mem > GiB)) tips.push("Brauzer 1 GB dan koʻp olmoqda: tablarni kamaytiring yoki “Memory Saver” ni yoqing.");
  if (ram.swap_total && ram.swap_used > ram.total * 0.4) tips.push("Pagefile koʻp ishlatilmoqda — kompyuter sekinlashadi. Doimiy shunday boʻlsa, RAM qoʻshishni oʻylab koʻring.");
  if ((L.uptime || 0) > 3 * 86400) tips.push(`Kompyuter ${fmtUptime(L.uptime)} dan beri qayta yoqilmagan. Qayta ishga tushirish xotirani tozalaydi.`);
  tips.push("Avtoyuklanishdagi keraksiz dasturlarni oʻchiring (pastda) — Windows tezroq yuklanadi va RAM boʻshaydi.");
  if (ram.percent < 70 && tips.length === 1) tips.unshift("Xotira yetarli — hozircha hech narsa qilish shart emas.");
  return `<section class="g pad"><h3>Qanday yengillatish mumkin</h3><ul class="issues" style="grid-column:auto">${tips.map((t) => `<li class="issue"><span class="dot info"></span><div>${esc(t)}</div></li>`).join("")}</ul></section>`;
}

function startupCard() {
  const caps = (S.live && S.live.caps) || {};
  if (!caps.startup) return "";
  const it = S.startup;
  return `<section class="g pad"><div class="row between"><h3 style="margin:0">Avtoyuklanish</h3><button class="btn sm ${S.busy.startup_list ? "busy" : ""}" data-act="startupLoad">${it ? "Yangilash" : "Roʻyxatni koʻrish"}</button></div>
    <div class="sub" style="margin:4px 0 6px">Windows bilan birga ishga tushadigan dasturlar. Oʻchirilgani oʻchirilmaydi, faqat avtomatik ishga tushmaydi.</div>
    ${it ? `<div class="list">${it.map((x) => `<div class="li" data-key="su-${esc(x.id)}" style="grid-template-columns:38px minmax(0,1fr) auto"><div class="av">${esc(initials(x.title))}</div>
      <div><div class="t">${esc(x.title)}</div><div class="s" title="${esc(x.command)}">${esc(x.scope === "user" ? "Faqat siz uchun" : "Barcha foydalanuvchilar")} · ${esc(x.command)}</div></div>
      <label class="switch" aria-label="${esc(x.title)}"><input type="checkbox" data-change="startupToggle" data-id="${esc(x.id)}" ${x.enabled ? "checked" : ""}><span></span></label></div>`).join("") || `<div class="sub">Roʻyxat boʻsh</div>`}</div>` : ""}
  </section>`;
}

// =================================================================== EKRAN VAQTI
function timeView() {
  const U = S.usage, d = U.data;
  const day = U.day, isToday = day === todayIso();
  const hist = (U.history && U.history.days) || [];
  const prevDays = hist.filter((x) => x.day < day && x.seconds > 0).slice(-7);
  const avg = prevDays.length ? prevDays.reduce((a, x) => a + x.seconds, 0) / prevDays.length : 0;
  const total = d ? d.total : 0;
  const cmp = avg && d ? Math.round(((total - avg) / avg) * 100) : null;
  const maxApp = d && d.apps.length ? d.apps[0].seconds : 1;
  const apps = d ? d.apps.map((a, i) => `<div class="li" data-key="u-${esc(a.app)}" style="grid-template-columns:38px minmax(0,1fr) auto"><div class="av">${esc(initials(a.name))}</div>
      <div><div class="t">${esc(a.name)}</div><div style="margin-top:6px">${barH((a.seconds / maxApp) * 100, i === 0 ? "" : i < 3 ? "lilac" : "ok")}</div></div>
      <div style="text-align:right"><div class="num">${fmtDur(a.seconds, true)}</div><div class="sub">${total ? Math.round((a.seconds / total) * 100) : 0}%</div></div></div>`).join("") : "";
  return `
  <section class="g pad"><div class="row between">
    <div class="row" style="gap:6px"><button class="btn icon" data-act="dayShift" data-v="-1" aria-label="Oldingi kun">${ic("chevL")}</button>
      <input class="in" type="date" value="${day}" max="${todayIso()}" data-change="day" style="width:auto" aria-label="Sana">
      <button class="btn icon" data-act="dayShift" data-v="1" ${isToday ? "disabled" : ""} aria-label="Keyingi kun">${ic("chevR")}</button>
      ${isToday ? "" : `<button class="btn sm ghost" data-act="dayToday">Bugun</button>`}</div>
  </div>
  <div style="margin-top:18px"><div class="sub">${esc(dayLabel(day))}</div><div class="big">${d ? fmtDur(total) : "…"}</div>
    <div class="sub">${cmp === null ? "Kompyuter oldida oʻtkazilgan faol vaqt" : `Oxirgi ${prevDays.length} kunlik oʻrtachadan ${Math.abs(cmp)}% ${cmp >= 0 ? "koʻp" : "kam"}`}</div></div></section>
  <section class="g pad"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Kunlar kesimida</h3>
    <div class="seg">${[7, 14, 30].map((n) => `<button class="${S.sub.hist === n ? "on" : ""}" data-act="histDays" data-v="${n}">${n} kun</button>`).join("")}</div></div>
    ${histChart(hist, day)}</section>
  <section class="g pad"><h3>Ilovalar</h3>
    ${d && d.apps.length ? `<div class="list">${apps}</div>` : `<div class="sub" style="padding:10px 0">${d ? "Bu kunda maʼlumot yoʻq." : "Yuklanmoqda…"}</div>`}
    <p class="sub" style="margin:12px 0 0">Faqat siz faol boʻlgan vaqt hisoblanadi: ${Math.round(((S.dev && S.dev.settings && S.dev.settings.idle_threshold_sec) || 180) / 60)} daqiqa harakatsizlikdan soʻng hisob toʻxtaydi (toʻliq ekrandagi video va oʻyinlar bundan mustasno).</p></section>`;
}

function histChart(days, sel) {
  if (!days.length) return `<div class="sub" style="padding:30px 0;text-align:center">Yuklanmoqda…</div>`;
  const W = innerWidth < 600 ? 360 : 960, H = innerWidth < 600 ? 190 : 230, B = 24, T = 18;
  const max = Math.max(3600, ...days.map((d) => d.seconds));
  const bw = (W - 8) / days.length;
  const bars = days.map((d, i) => {
    const h = (d.seconds / max) * (H - B - T), x = 4 + i * bw + bw * 0.15, w = bw * 0.7, y = H - B - h;
    const dt = parseDay(d.day);
    const lbl = days.length <= (W < 400 ? 7 : 14) ? WD_S[dt.getDay()] : (dt.getDate() % 5 === 0 || i === days.length - 1 ? String(dt.getDate()) : "");
    return `<g><rect class="bar-r ${d.day === sel ? "sel" : ""}" x="${x.toFixed(1)}" y="${(d.seconds ? y : H - B - 2).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="${Math.min(6, w / 3).toFixed(1)}"
      data-act="pickDay" data-v="${d.day}"><title>${esc(dayLabel(d.day))}: ${fmtDur(d.seconds)}</title></rect>
      <text x="${(x + w / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${lbl}</text>
      ${d.day === sel && d.seconds ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" style="fill:var(--text);font-weight:700">${Math.floor(d.seconds / 3600)}:${pad2(Math.floor((d.seconds % 3600) / 60))}</text>` : ""}</g>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kunlik ekran vaqti">${bars}</svg>`;
}

// =================================================================== BOSHQARUV
function controlView() {
  const L = S.live, d = S.devices.find((x) => x.id === S.devId) || {};
  if (!L || !S.online) {
    return `<section class="g hero"><div><h1>Kompyuter oflayn</h1><p class="lead">Wake-on-LAN orqali masofadan yoqish mumkin${d.mac ? ` (MAC ${esc(d.mac)})` : ""}. Buning uchun BIOS va tarmoq kartasida WOL yoqilgan, kompyuter esa kabel orqali ulangan boʻlishi kerak.</p>
      <div class="row"><button class="btn pri ${S.busy.wake ? "busy" : ""}" data-act="wake" ${d.mac ? "" : "disabled"}>${ic("zap")}Kompyuterni yoqish</button><a class="btn" href="#/settings">WOL sozlamalari</a></div></div></section>${eventsCard(8)}`;
  }
  const caps = L.caps || {}, st = (S.dev && S.dev.settings) || {};
  const a = (act, icon, t, s, cls = "", dis = false) => `<button class="act ${cls} ${S.busy[act] ? "busy" : ""}" data-act="${act}" ${dis ? "disabled" : ""}>${ic(icon)}<span>${t}<small>${s}</small></span></button>`;
  const g = L.guard || { state: "off" };
  const guardTxt = {
    off: ["Qoʻriqlash oʻchiq", "Yoqilgach, kimdir sichqoncha yoki klaviaturaga tegsa — ekran darhol qulflanadi va sizga bildirishnoma keladi."],
    arming: ["Qoʻriqlash yoqilmoqda…", `${Math.max(0, Math.round((g.grace_until || 0) - Date.now() / 1000))} soniyadan soʻng faollashadi — kompyuterdan uzoqlashing.`],
    armed: ["Qoʻriqlanmoqda", `${g.since ? hhmm(g.since) : ""} dan beri. Har qanday tegish — qulflash va bildirishnoma.`],
    watch: ["Ekran qulflangan, kuzatilmoqda", `${g.triggered_at ? hhmm(g.triggered_at) : ""} dan beri. Qulf ekranidagi harakat va qulfdan chiqarish haqida xabar beriladi.`],
  }[g.state] || ["", ""];
  const t = L.timer;
  const left = t ? Math.max(0, t.at - Date.now() / 1000) : 0;
  const tAct = { shutdown: "Oʻchirish", restart: "Qayta yoqish", sleep: "Uyqu", hibernate: "Gibernatsiya", lock: "Qulflash" };
  const sel = (key, vals, cur) => `<select class="in" data-change="devSetting" data-k="${key}">${vals.map(([v, l]) => `<option value="${v}" ${Number(cur || 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return `
  <section class="g pad"><h3>Quvvat</h3><div class="actions">
    ${a("lock", "lock", "Qulflash", "Win+L", "", !caps.lock)}
    ${a("sleep", "moon", "Uyqu", "Tez uygʻonadi", "", !caps.power)}
    ${a("hibernate", "snow", "Gibernatsiya", "Diskka saqlab", "", !caps.power)}
    ${a("restart", "restart", "Qayta yoqish", "Restart", "warn", !caps.power)}
    ${a("shutdown", "power", "Oʻchirish", "Shutdown", "danger", !caps.power)}
    ${a("logoff", "logout", "Chiqish", "Sign out", "", !caps.power)}
  </div><div class="row" style="margin-top:12px"><button class="btn sm ghost" data-act="cancelShutdown">Oʻchirishni bekor qilish</button><span class="sub">Oʻchirish/qayta yoqish 5 soniyalik ogohlantirish bilan bajariladi.</span></div></section>

  <div class="grid2">
  <section class="g pad"><div class="guard ${g.state === "off" ? "" : g.state === "watch" ? "alarm" : "on"}"><div class="shield">${ic("shield")}</div>
    <div><h3 style="margin:0">${guardTxt[0]}</h3><div class="sub">${guardTxt[1]}</div></div></div>
    <div class="row" style="margin-top:14px">${g.state === "off"
      ? `<button class="btn pri ${S.busy.guardArm ? "busy" : ""}" data-act="guardArm" ${caps.guard ? "" : "disabled"}>${ic("shield")}Yoqish (${st.guard_grace_sec || 10} s)</button><button class="btn ${S.busy.guardLock ? "busy" : ""}" data-act="guardLock" ${caps.guard ? "" : "disabled"}>${ic("lock")}Qulflab qoʻriqlash</button>`
      : `<button class="btn danger ${S.busy.guardOff ? "busy" : ""}" data-act="guardOff">Qoʻriqlashni oʻchirish</button>`}</div></section>

  <section class="g pad"><h3>Taymer</h3>${t ? `<div class="countdown" data-countdown="${t.at}">${fmtCountdown(left)}</div><div class="sub">${tAct[t.action]} — ${hhmm(t.at)} da</div>
      <button class="btn danger" style="margin-top:12px" data-act="timerCancel">Taymerni bekor qilish</button>`
    : `<div class="row"><select class="in" style="width:auto" data-model="timerAct">${Object.entries(tAct).map(([k, v]) => `<option value="${k}" ${S.form.timerAct === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <div class="seg">${[15, 30, 60, 120].map((m) => `<button class="${Number(S.form.timerMin) === m ? "on" : ""}" data-act="timerMin" data-v="${m}">${m < 60 ? m + " daq" : m / 60 + " soat"}</button>`).join("")}</div></div>
      <div class="row" style="margin-top:10px"><input class="in" type="number" min="1" max="1440" style="width:110px" value="${esc(S.form.timerMin)}" data-model="timerMin" aria-label="Daqiqa"><span class="sub">daqiqadan soʻng</span>
      <button class="btn pri ${S.busy.timer_set ? "busy" : ""}" data-act="timerSet" ${caps.power ? "" : "disabled"}>${ic("timer")}Boshlash</button></div>`}</section>
  </div>

  <section class="g pad"><h3>Avtomatik qulflash</h3>
    <div class="setrow"><div><b>Harakatsizlikda qulflash</b><div class="sub">Sichqoncha va klaviatura ishlatilmasa</div></div>${sel("idle_lock_min", [[0, "Oʻchiq"], [3, "3 daqiqa"], [5, "5 daqiqa"], [10, "10 daqiqa"], [15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"]], st.idle_lock_min)}</div>
    <div class="setrow"><div><b>Harakatsizlikda uxlatish</b><div class="sub">Uzoq qoldirilsa — elektr tejash</div></div>${sel("idle_sleep_min", [[0, "Oʻchiq"], [15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"], [120, "2 soat"], [240, "4 soat"]], st.idle_sleep_min)}</div>
    <div class="setrow"><div><b>Qoʻriqlashni yoqish kechikishi</b><div class="sub">Uzoqlashishga ulgurish uchun</div></div>${sel("guard_grace_sec", [[5, "5 soniya"], [10, "10 soniya"], [20, "20 soniya"], [30, "30 soniya"], [60, "1 daqiqa"]], st.guard_grace_sec || 10)}</div>
    <p class="sub" style="margin:8px 0 0">Toʻliq ekranda video yoki oʻyin ochiq boʻlsa, avtomatik qulflash va uxlatish ishlamaydi.</p></section>

  <div class="grid2">
  <section class="g pad"><div class="row between"><h3 style="margin:0">Ekran rasmi</h3><button class="btn sm ${S.busy.screenshot ? "busy" : ""}" data-act="screenshot" ${caps.screenshot ? "" : "disabled"}>${ic("camera")}Olish</button></div>
    ${S.screenshot ? `<img class="shot" style="margin-top:12px" src="${S.screenshot.url}" alt="Kompyuter ekrani" data-act="shotFull"><div class="sub" style="margin-top:6px">${hhmm(S.screenshot.ts)} da olingan · kattalashtirish uchun bosing</div>`
      : `<p class="sub" style="margin:8px 0 0">Kompyuter ekranida hozir nima borligini koʻring.${caps.screenshot ? "" : " (Pillow oʻrnatilmagan)"}</p>`}</section>
  <section class="g pad"><h3>Ekranga xabar</h3><textarea class="in" maxlength="500" placeholder="Masalan: Kechki ovqat tayyor!" data-model="msg">${esc(S.form.msg)}</textarea>
    <button class="btn ${S.busy.message ? "busy" : ""}" style="margin-top:10px" data-act="sendMsg">${ic("msg")}Yuborish</button></section>
  </div>

  <div class="grid2">
  <section class="g pad"><h3>Media va ovoz</h3><div class="row">
    ${[["prev", "prev", "Oldingi"], ["play", "play", "Ijro/pauza"], ["next", "next", "Keyingi"], ["vol_down", "volDown", "Ovozni pasaytirish"], ["mute", "mute", "Ovozsiz"], ["vol_up", "volUp", "Ovozni oshirish"]]
      .map(([k, i, t]) => `<button class="btn icon" data-act="media" data-v="${k}" aria-label="${t}" title="${t}" ${caps.media ? "" : "disabled"}>${ic(i)}</button>`).join("")}</div></section>
  ${cleanupCard(caps)}
  </div>
  ${eventsCard(10)}`;
}

function fmtCountdown(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${m}:${pad2(x)}`;
}

function cleanupCard(caps) {
  const c = S.cleanup, r = S.cleanupResult;
  return `<section class="g pad"><div class="row between"><h3 style="margin:0">Tozalash</h3><button class="btn sm ${S.busy.cleanup_scan ? "busy" : ""}" data-act="cleanScan" ${caps.cleanup ? "" : "disabled"}>${ic("broom")}Tekshirish</button></div>
    ${c ? `<dl class="kv" style="margin-top:12px"><dt>Vaqtinchalik fayllar</dt><dd>${fmtB(c.temp_cleanable)} <span class="sub">(${c.temp_files} ta fayl)</span></dd><dt>Savat (Recycle Bin)</dt><dd>${fmtB(c.recycle_bytes)} <span class="sub">(${c.recycle_items} ta)</span></dd></dl>
      <button class="btn pri ${S.busy.cleanup_run ? "busy" : ""}" style="margin-top:12px" data-act="cleanRun">Tozalash</button>` : `<p class="sub" style="margin:8px 0 0">Vaqtinchalik fayllar (24 soatdan eski) va savatni tozalab, diskda joy boʻshatadi.</p>`}
    ${r ? `<div class="note info" style="margin-top:12px">${fmtB(r.freed)} joy boʻshatildi (${r.deleted} ta fayl).</div>` : ""}</section>`;
}

// =================================================================== SOZLAMALAR
function settingsView() {
  const u = S.user, us = u.settings, al = us.alerts || {};
  const push = S.push.state;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const pushTxt = {
    on: "Bu qurilmada yoqilgan", off: "Bu qurilmada oʻchiq", denied: "Brauzer bildirishnomalarni bloklagan — sayt sozlamalaridan ruxsat bering",
    unsupported: ios && !standalone ? "iPhone da: Safari → Ulashish → “Ekranga qoʻshish”, soʻng ilovani ochib shu yerdan yoqing" : "Bu brauzer push bildirishnomalarni qoʻllamaydi",
    insecure: "Push uchun HTTPS kerak (README: Tailscale yoki Cloudflare Tunnel)", unknown: "Tekshirilmoqda…",
  }[push];
  const sw = (k, on, sub) => `<label class="switch"><input type="checkbox" data-change="userSetting" data-k="${k}" ${on ? "checked" : ""}><span></span></label>`;
  const numIn = (k, v, min, max) => `<input class="in" type="number" min="${min}" max="${max}" value="${v}" style="width:96px" data-change="alertSetting" data-k="${k}">`;
  const devs = S.devices.map((d) => `<div class="g pad" data-key="dev-${d.id}" style="background:rgba(255,255,255,.03)">
      <div class="row between"><div><b>${esc(d.name)}</b> <span class="sub"><span class="dot ${d.online ? "on" : ""}" style="display:inline-block;margin:0 6px 0 4px"></span>${d.online ? "onlayn" : `oflayn · ${fmtAgo(d.last_seen)}`}</span></div>
      <button class="btn sm danger" data-act="devDelete" data-id="${d.id}" data-name="${esc(d.name)}">${ic("trash")}Oʻchirish</button></div>
      <form data-submit="devSave" data-keep data-id="${d.id}" class="grid2" style="margin-top:12px;gap:10px">
        <div class="field"><label>Nomi</label><input class="in" name="name" value="${esc(d.name)}" maxlength="60"></div>
        <div class="field"><label>MAC manzil (Wake-on-LAN)</label><input class="in" name="mac" value="${esc(d.mac || "")}" placeholder="AA:BB:CC:DD:EE:FF"></div>
        <div class="field"><label>Broadcast manzil</label><input class="in" name="broadcast" value="${esc(d.broadcast || "")}" placeholder="192.168.1.255"></div>
        <div class="field"><label>WOL port</label><input class="in" name="wol_port" type="number" value="${d.wol_port || 9}"></div>
        <div><button class="btn sm" type="submit">Saqlash</button> ${d.mac_manual ? `<span class="sub">qoʻlda kiritilgan</span>` : `<span class="sub">agentdan avtomatik</span>`}</div>
      </form></div>`).join("");
  const st = (S.dev && S.dev.settings) || {};
  return `
  <div class="grid2">
  <section class="g pad"><h3>Bildirishnomalar</h3>
    <div class="setrow"><div><b>Push bildirishnomalar</b><div class="sub">${esc(pushTxt)}</div></div>
      ${push === "on" ? `<button class="btn sm" data-act="pushOff">Oʻchirish</button>` : `<button class="btn sm pri ${S.busy.push ? "busy" : ""}" data-act="pushOn" ${["unsupported", "insecure"].includes(push) ? "disabled" : ""}>${ic("bell")}Yoqish</button>`}</div>
    <div class="setrow"><div><b>Muntazam hisobot</b><div class="sub">CPU, GPU, RAM va ekran vaqti</div></div>${sw("notify_enabled", us.notify_enabled)}</div>
    <div class="setrow"><div><b>Hisobot oraligʻi</b></div><select class="in" data-change="userSettingNum" data-k="notify_interval">${[[15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"], [120, "2 soat"], [240, "4 soat"]].map(([v, l]) => `<option value="${v}" ${us.notify_interval === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="setrow"><div><b>Tungi sokinlik</b><div class="sub">Bu vaqtda hisobot yuborilmaydi (muhim ogohlantirishlar keladi)</div></div>${sw("quiet_enabled", us.quiet_enabled)}</div>
    ${us.quiet_enabled ? `<div class="setrow"><div class="sub">Oraliq</div><div class="row"><input class="in" type="time" value="${esc(us.quiet_from)}" data-change="userSetting" data-k="quiet_from"><span class="sub">—</span><input class="in" type="time" value="${esc(us.quiet_to)}" data-change="userSetting" data-k="quiet_to"></div></div>` : ""}
    <div class="setrow"><div><b>Yoqildi/oʻchdi xabarlari</b></div>${sw("alerts.power_events", al.power_events)}</div>
    <div class="setrow"><div><b>Muhim ogohlantirishlar</b><div class="sub">Qizib ketish, disk toʻlishi va h.k.</div></div>${sw("alerts.critical", al.critical)}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm ${S.busy.pushTest ? "busy" : ""}" data-act="pushTest">Test bildirishnoma</button></div>
  </section>
  <section class="g pad"><h3>Ogohlantirish chegaralari</h3>
    <div class="setrow"><div><b>CPU harorati</b><div class="sub">°C</div></div>${numIn("cpu_temp", al.cpu_temp, 60, 105)}</div>
    <div class="setrow"><div><b>GPU harorati</b><div class="sub">°C</div></div>${numIn("gpu_temp", al.gpu_temp, 60, 105)}</div>
    <div class="setrow"><div><b>RAM bandligi</b><div class="sub">%</div></div>${numIn("ram", al.ram, 50, 100)}</div>
    <div class="setrow"><div><b>Disk toʻlishi</b><div class="sub">%</div></div>${numIn("disk", al.disk, 50, 100)}</div>
    ${S.dev ? `<div class="setrow"><div><b>Ekran vaqti: harakatsizlik chegarasi</b><div class="sub">${esc(S.dev.name)} uchun</div></div><select class="in" data-change="devSetting" data-k="idle_threshold_sec">${[[60, "1 daqiqa"], [120, "2 daqiqa"], [180, "3 daqiqa"], [300, "5 daqiqa"], [600, "10 daqiqa"]].map(([v, l]) => `<option value="${v}" ${Number(st.idle_threshold_sec || 180) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="setrow"><div><b>Fan minimal tezligi</b><div class="sub">Qoʻlda va harorat rejimlari uchun</div></div><select class="in" data-change="devSetting" data-k="fan_min_pct">${[[0, "0%"], [10, "10%"], [20, "20%"], [30, "30%"], [40, "40%"]].map(([v, l]) => `<option value="${v}" ${Number(st.fan_min_pct ?? 20) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>` : ""}
  </section>
  </div>
  <section class="g pad"><div class="row between"><h3 style="margin:0">Kompyuterlar</h3></div>
    <div class="stack" style="margin-top:12px">${devs || `<div class="sub">Hali qurilma yoʻq.</div>`}</div>
    <details class="more" style="margin-top:8px"><summary>${ic("plus", "")} Yangi kompyuter qoʻshish</summary>
      <p class="sub">Yangi kompyuterda <b>PCPulseAgent.exe</b> ni ishga tushiring va username <code>${esc(u.username)}</code> hamda parolingiz bilan kiring.</p>
      <a class="btn sm" href="${esc(CFG.exeUrl || "#")}" target="_blank" rel="noopener">PCPulseAgent.exe ni yuklab olish</a></details></section>
  <div class="grid2">
  <section class="g pad"><h3>Akkaunt</h3>
    <dl class="kv"><dt>Username</dt><dd>${esc(u.username)}</dd><dt>Roʻyxatdan oʻtgan</dt><dd>${new Date(u.created_at * 1000).toLocaleDateString("uz")}</dd><dt>Versiya</dt><dd>${esc(u.server_version || "")}</dd></dl>
    <form data-submit="password" data-keep class="stack" style="margin-top:14px;gap:10px">
      <input class="in" type="password" name="old" placeholder="Joriy parol" autocomplete="current-password" required>
      <input class="in" type="password" name="new" placeholder="Yangi parol (kamida 6 belgi)" autocomplete="new-password" minlength="6" required>
      <button class="btn sm" type="submit">Parolni oʻzgartirish</button></form>
    <div class="row" style="margin-top:14px"><button class="btn sm" data-act="logout">${ic("logout")}Chiqish</button><button class="btn sm ghost" data-act="logoutAll">Barcha qurilmalardan chiqish</button></div></section>
  <section class="g pad"><h3>Ilova</h3>
    <p class="sub" style="margin-top:0">PC Pulse ni telefon yoki kompyuterga ilova sifatida oʻrnating — alohida oynada ochiladi va bildirishnomalar keladi.</p>
    ${S.installPrompt ? `<button class="btn pri" data-act="install">Oʻrnatish</button>` : standalone ? `<div class="chip"><span class="dot ok"></span>Ilova sifatida ochilgan</div>`
      : `<div class="sub">${ios ? "Safari: Ulashish tugmasi → “Ekranga qoʻshish”." : "Brauzer menyusi → “Ilovani oʻrnatish” / “Add to Home screen”."}</div>`}
  </section></div>`;
}

// =================================================================== modal
function modalView() {
  const m = S.modal;
  if (!m) return "";
  if (m.kind === "confirm") {
    return `<div class="overlay" data-act="modalClose"><div class="modal g" role="dialog" aria-modal="true" data-stop>
      <h3>${esc(m.title)}</h3><p>${esc(m.text)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="modalClose">Bekor qilish</button><button class="btn ${m.danger ? "danger" : "pri"}" data-act="modalOk">${esc(m.okText)}</button></div></div></div>`;
  }
  if (m.kind === "prompt") {
    return `<div class="overlay" data-act="modalClose"><div class="modal g" role="dialog" aria-modal="true" data-stop>
      <h3>${esc(m.title)}</h3><form data-submit="prompt"><input class="in" name="v" value="${esc(m.value || "")}" maxlength="40" autofocus>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn ghost" data-act="modalClose">Bekor qilish</button><button class="btn pri" type="submit">Saqlash</button></div></form></div></div>`;
  }
  if (m.kind === "image") {
    return `<div class="overlay" data-act="modalClose" style="padding:8px"><img src="${S.screenshot ? S.screenshot.url : ""}" alt="Kompyuter ekrani" style="max-width:100%;max-height:96dvh;border-radius:12px"></div>`;
  }
  if (m.kind === "sensors") {
    const groups = {};
    for (const s of (S.sensorsRaw || {}).sensors || []) (groups[s.chip ? `${s.hw_name} / ${s.chip}` : s.hw_name || s.hw] ||= []).push(s);
    const units = { Temperature: "°C", Voltage: "V", Fan: "RPM", Load: "%", Control: "%", Clock: "MHz", Power: "W", Data: "GB", SmallData: "MB", Level: "%", Throughput: "B/s", Current: "A", Frequency: "Hz" };
    return `<div class="overlay" data-act="modalClose"><div class="modal wide g" role="dialog" aria-modal="true" data-stop>
      <div class="row between"><h3 style="margin:0">Barcha sensorlar</h3><button class="btn icon ghost" data-act="modalClose" aria-label="Yopish">${ic("x")}</button></div>
      <div class="sub" style="margin-bottom:10px">Manba: ${esc((S.sensorsRaw || {}).source || "")}</div>
      ${Object.entries(groups).map(([g, ss]) => `<h3 style="margin:16px 0 6px">${esc(g)}</h3><div class="scroll-x"><table class="tb">${ss.map((s) => `<tr><td>${esc(s.name)}</td><td class="sub">${esc(s.type)}</td><td class="n">${s.value === null ? "—" : `${s.value} ${units[s.type] || ""}`}</td></tr>`).join("")}</table></div>`).join("")
        || `<p>Sensor maʼlumotlari yoʻq (cheklangan rejim).</p>`}</div></div>`;
  }
  return "";
}

// =================================================================== hodisalar (delegatsiya)
const ACT = {
  authMode: (el) => { S.form.authMode = el.dataset.v; S.form.authErr = ""; render(); },
  sub: (el) => { S.sub[el.dataset.p] = el.dataset.v; render(); },
  metric: (el) => { S.sub.metric = el.dataset.v; render(); },
  modalClose: (el, e) => { if (e.target.closest("[data-stop]") && el.classList.contains("overlay")) return; S.modal = null; render(); },
  modalOk: () => { const m = S.modal; S.modal = null; render(); m && m.onOk && m.onOk(); },
  wake: async () => {
    S.busy.wake = true; render();
    try { const r = await rpc("pp_wake", { p_device: S.devId }); toast(`Yoqish signali yuborildi (${r.sent_from.join(", ")} orqali). 1–2 daqiqa kuting.`, "ok"); }
    catch (e) { toast(e.message, "err"); } finally { delete S.busy.wake; render(); }
  },
  lock: () => cmd("lock", {}, { busy: "lock", ok: "Ekran qulflandi" }),
  sleep: () => confirmBox("Uyqu rejimi", "Kompyuter uyqu rejimiga oʻtadi. Yana yoqish uchun Wake-on-LAN yoki kompyuterdagi tugmadan foydalaning.", "Uxlatish", false, () => cmd("sleep", {}, { busy: "sleep", ok: "Uyqu rejimiga oʻtkazilmoqda" })),
  hibernate: () => confirmBox("Gibernatsiya", "Ochiq dasturlar diskka saqlanib, kompyuter oʻchadi.", "Davom etish", false, () => cmd("hibernate", {}, { busy: "hibernate", ok: "Gibernatsiyaga oʻtkazilmoqda" })),
  restart: () => confirmBox("Qayta yoqish", "Kompyuter 5 soniyadan soʻng qayta yuklanadi. Saqlanmagan ishlar yoʻqolishi mumkin.", "Qayta yoqish", true, () => cmd("restart", { delay: 5 }, { busy: "restart", ok: "Qayta yuklanmoqda" })),
  shutdown: () => confirmBox("Kompyuterni oʻchirish", "Kompyuter 5 soniyadan soʻng oʻchadi. Saqlanmagan ishlar yoʻqolishi mumkin.", "Oʻchirish", true, () => cmd("shutdown", { delay: 5 }, { busy: "shutdown", ok: "Kompyuter oʻchirilmoqda" })),
  logoff: () => confirmBox("Tizimdan chiqish", "Windows sessiyasi yopiladi, ochiq dasturlar yopiladi.", "Chiqish", true, () => cmd("logoff", {}, { busy: "logoff", ok: "Tizimdan chiqilmoqda" })),
  cancelShutdown: () => cmd("cancel_shutdown", {}, { ok: "Oʻchirish bekor qilindi" }),
  guardArm: () => cmd("guard_arm", {}, { busy: "guardArm", ok: "Qoʻriqlash yoqilmoqda — kompyuterdan uzoqlashing" }),
  guardLock: () => cmd("guard_arm", { lock: true }, { busy: "guardLock", ok: "Ekran qulflandi va kuzatilmoqda" }),
  guardOff: () => cmd("guard_disarm", {}, { busy: "guardOff", ok: "Qoʻriqlash oʻchirildi" }),
  timerMin: (el) => { S.form.timerMin = Number(el.dataset.v); render(); },
  timerSet: () => {
    const m = Number(S.form.timerMin);
    if (!(m >= 1 && m <= 1440)) return toast("Daqiqa 1 dan 1440 gacha boʻlsin", "err");
    cmd("timer_set", { action: S.form.timerAct, minutes: m }, { ok: "Taymer oʻrnatildi" });
  },
  timerCancel: () => cmd("timer_cancel", {}, { ok: "Taymer bekor qilindi" }),
  screenshot: async () => { const r = await cmd("screenshot", {}, {}); if (r && r.image) { S.screenshot = { url: "data:image/jpeg;base64," + r.image, ts: Date.now() / 1000 }; render(); } },
  sendMsg: async () => {
    if (!S.form.msg.trim()) return toast("Xabar matnini yozing", "err");
    await cmd("message", { text: S.form.msg }, { busy: "message", ok: "Xabar ekranga chiqarildi" });
    S.form.msg = ""; render();
  },
  media: (el) => cmd("media", { key: el.dataset.v, times: el.dataset.v.startsWith("vol") ? 3 : 1 }, { busy: "media-" + el.dataset.v }),
  cleanScan: async () => { S.cleanup = await cmd("cleanup_scan"); S.cleanupResult = null; render(); },
  cleanRun: () => confirmBox("Tozalash", "24 soatdan eski vaqtinchalik fayllar oʻchiriladi va savat boʻshatiladi. Savatdagi fayllarni qaytarib boʻlmaydi.", "Tozalash", true, async () => {
    S.cleanupResult = await cmd("cleanup_run", { temp: true, recycle: true }); S.cleanup = null; render();
  }),
  kill: (el) => confirmBox(`${el.dataset.title} yopilsinmi?`, "Dastur darhol toʻxtatiladi. Saqlanmagan maʼlumotlar yoʻqoladi.", "Yopish", true, async () => {
    const r = await cmd("kill", { name: el.dataset.name }, { busy: "kill-" + el.dataset.name });
    if (r) toast(`${el.dataset.title}: ${r.killed} ta jarayon yopildi`, "ok");
  }),
  startupLoad: async () => { const r = await cmd("startup_list"); S.startup = r.items; render(); },
  sensorsAll: async () => { S.sensorsRaw = await cmd("sensors", {}, { busy: "sensors" }); S.modal = { kind: "sensors" }; render(); },
  fanMode: (el) => {
    const cur = ((S.dev && S.dev.settings && S.dev.settings.fans) || {})[el.dataset.id] || {};
    const patch = { mode: el.dataset.v };
    if (el.dataset.v === "manual" && !num(cur.value)) patch.value = Number(el.dataset.cur) || 50;
    saveFan(el.dataset.id, patch);
  },
  fanRename: (el) => { S.modal = { kind: "prompt", title: "Fan nomi", value: el.dataset.name, onSubmit: (v) => saveFan(el.dataset.id, { label: v.trim() || undefined }) }; render(); },
  dayShift: (el) => { const d = parseDay(S.usage.day); d.setDate(d.getDate() + Number(el.dataset.v)); const s = isoDay(d); if (s <= todayIso()) loadUsage(s); },
  dayToday: () => loadUsage(todayIso()),
  pickDay: (el) => loadUsage(el.dataset.v),
  histDays: (el) => { S.sub.hist = Number(el.dataset.v); loadUsageHistory(); },
  pushOn: () => enablePush(),
  pushOff: () => disablePush(),
  pushTest: async () => { S.busy.pushTest = true; render(); try { await rpc("pp_push_test"); toast("Yuborildi — bir necha soniyada keladi", "ok"); } catch (e) { toast(e.message, "err"); } finally { delete S.busy.pushTest; render(); } },
  devDelete: (el) => confirmBox(`${el.dataset.name} oʻchirilsinmi?`, "Qurilma va uning barcha tarixi (ekran vaqti, grafiklar) oʻchiriladi. Agentni qayta ulash mumkin.", "Oʻchirish", true, async () => {
    try { await rpc("pp_device_delete", { p_device: el.dataset.id }); toast("Qurilma oʻchirildi", "ok"); await loadDevices(); } catch (e) { toast(e.message, "err"); }
  }),
  shotFull: () => { S.modal = { kind: "image" }; render(); },
  logout: () => logout(),
  retry: () => tryResume(),
  logoutAll: () => confirmBox("Barcha qurilmalardan chiqish", "Telefon, kompyuter va boshqa brauzerlardagi barcha sessiyalar yopiladi. Agentlar ishlashda davom etadi.", "Chiqish", true, async () => {
    try { await rpc("pp_logout_all"); } catch { /* */ } logout(false, true);
  }),
  install: async () => { const p = S.installPrompt; if (!p) return; p.prompt(); await p.userChoice; S.installPrompt = null; render(); },
};

const CHANGE = {
  device: (el) => selectDevice(el.value),
  devSetting: (el) => saveDevSettings({ [el.dataset.k]: Number(el.value) }),
  fanValue: (el) => { const v = Number(el.value); delete S.form.fanDraft[el.dataset.id]; delete el.dataset.dragging; saveFan(el.dataset.id, { mode: "manual", value: v }); },
  fanPreset: (el) => saveFan(el.dataset.id, { mode: "curve", preset: el.value }),
  fanSource: (el) => saveFan(el.dataset.id, { mode: "curve", source: el.value }),
  startupToggle: async (el) => {
    try { const r = await cmd("startup_toggle", { id: el.dataset.id, enabled: el.checked }, { busy: "startup_toggle", ok: el.checked ? "Avtoyuklanish yoqildi" : "Avtoyuklanishdan olib tashlandi" }); S.startup = r.items; render(); }
    catch { el.checked = !el.checked; }
  },
  day: (el) => el.value && loadUsage(el.value),
  userSetting: (el) => {
    const v = el.type === "checkbox" ? el.checked : el.value;
    const k = el.dataset.k;
    saveUserSettings(k.startsWith("alerts.") ? { alerts: { [k.slice(7)]: v } } : { [k]: v });
  },
  userSettingNum: (el) => saveUserSettings({ [el.dataset.k]: Number(el.value) }),
  alertSetting: (el) => { const v = Number(el.value); if (v) saveUserSettings({ alerts: { [el.dataset.k]: v } }); },
};

const SUBMIT = {
  auth: async (f) => {
    const username = f.username.value.trim(), password = f.password.value;
    const reg = S.form.authMode === "register";
    if (reg && password !== f.password2.value) { S.form.authErr = "Parollar mos kelmadi"; render(); return; }
    S.busy.auth = true; S.form.authErr = ""; render();
    try {
      const r = await rpc(reg ? "pp_register" : "pp_login", { p_username: username, p_password: password }, { auth: false });
      S.token = r.token; localStorage.setItem("pcp_token", r.token);
      S.user = r.user;
      S.form.authPass = S.form.authPass2 = "";
      await afterLogin();
    } catch (e) { S.form.authErr = e.message; }
    finally { delete S.busy.auth; render(); }
  },
  devSave: async (f) => {
    const id = f.dataset.id;
    const body = { name: f.name.value, mac: f.mac.value, broadcast: f.broadcast.value, wol_port: Number(f.wol_port.value) || 9 };
    try { await rpc("pp_device_update", { p_device: id, p_patch: body }); toast("Saqlandi", "ok"); await loadDevices(); } catch (e) { toast(e.message, "err"); }
  },
  password: async (f) => {
    try {
      const r = await rpc("pp_change_password", { p_old: f.old.value, p_new: f.new.value });
      S.token = r.token; localStorage.setItem("pcp_token", r.token); f.reset(); toast("Parol oʻzgartirildi. Boshqa qurilmalarda qayta kirish kerak.", "ok");
    } catch (e) { toast(e.message, "err"); }
  },
  prompt: (f) => { const m = S.modal; S.modal = null; render(); m && m.onSubmit && m.onSubmit(f.v.value); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "A") e.preventDefault();
  if (el.dataset.act === "modalClose" && el.classList.contains("overlay") && e.target !== el) return;
  fn(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.model) { S.form[el.dataset.model] = el.value; render(); }
  const fn = CHANGE[el.dataset.change];
  if (fn) fn(el, e);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.model) S.form[el.dataset.model] = el.value;
  const kf = el.closest && el.closest("form[data-keep]");
  if (kf) kf.dataset.dirty = "1";
  if (el.dataset.input === "fanDraft") {
    el.dataset.dragging = "1";
    S.form.fanDraft[el.dataset.id] = Number(el.value);
    const mn = Number(el.min) || 0;
    el.style.setProperty("--p", (((el.value - mn) / Math.max(1, 100 - mn)) * 100).toFixed(1) + "%");
    const b = el.parentElement.querySelector("b"); if (b) b.textContent = el.value + "%";
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  const fn = SUBMIT[f.dataset.submit];
  if (!fn) return;
  e.preventDefault();
  delete f.dataset.dirty;
  fn(f);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.modal) { S.modal = null; render(); } });

// =================================================================== maʼlumot yuklash
async function loadMe() {
  const me = await rpc("pp_me");
  S.user = me;
  const tz = -new Date().getTimezoneOffset();
  if (me.settings.tz_offset !== tz) saveUserSettings({ tz_offset: tz }, true);
}

async function loadDevices() {
  const r = await rpc("pp_devices");
  S.devices = r.devices;
  if (!S.devices.find((d) => d.id === S.devId)) S.devId = S.devices[0] ? S.devices[0].id : "";
  const d = S.devices.find((x) => x.id === S.devId);
  if (d) S.online = d.online;
  render();
}

async function selectDevice(id, keepLive) {
  if (id !== S.devId || !keepLive) {
    S.devId = id; localStorage.setItem("pcp_dev", id);
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

async function loadMetrics() {
  if (!S.devId) return;
  try { S.metrics = await rpc("pp_metrics", { p_device: S.devId, p_hours: 24 }); S.metricsAt = Date.now(); render(); } catch { /* */ }
}
async function loadEvents() {
  try { S.events = (await rpc("pp_events", { p_limit: 30 })).events; S.eventsAt = Date.now(); render(); } catch { /* */ }
}
async function loadUsage(day) {
  if (!S.devId) return;
  S.usage.day = day; S.usage.data = null; render();
  try { S.usage.data = await rpc("pp_usage", { p_device: S.devId, p_day: day }); } catch (e) { S.usage.data = { day, total: 0, apps: [] }; }
  render();
  if (!S.usage.history || !S.usage.history.days.some((d) => d.day === day)) loadUsageHistory();
}
async function loadUsageHistory() {
  const sel = parseDay(S.usage.day), t = new Date();
  const end = new Date(Math.min(t, new Date(sel.getTime() + Math.floor(S.sub.hist / 2) * 86400000)));
  try { S.usage.history = await rpc("pp_usage_history", { p_device: S.devId, p_days: S.sub.hist, p_end: isoDay(end) }); } catch { /* */ }
  render();
}

async function saveDevSettings(patch) {
  try {
    const r = await rpc("pp_device_settings", { p_device: S.devId, p_patch: patch });
    if (S.dev) S.dev.settings = r.settings;
    toast("Saqlandi", "ok");
  } catch (e) { toast(e.message, "err"); }
}
async function saveFan(cid, patch) {
  const cur = ((S.dev && S.dev.settings && S.dev.settings.fans) || {})[cid] || {};
  const next = { ...cur, ...patch };
  if (patch.label === undefined && "label" in patch) delete next.label;
  if (S.dev) { S.dev.settings.fans = { ...(S.dev.settings.fans || {}), [cid]: next }; render(); }
  try { const r = await rpc("pp_device_settings", { p_device: S.devId, p_patch: { fans: { [cid]: next } } }); if (S.dev) S.dev.settings = r.settings; render(); }
  catch (e) { toast(e.message, "err"); }
}
async function saveUserSettings(patch, quiet) {
  try {
    const r = await rpc("pp_save_settings", { p_patch: patch });
    S.user.settings = r.settings; render();
    if (!quiet) toast("Saqlandi", "ok");
  } catch (e) { toast(e.message, "err"); }
}

// =================================================================== jonli aloqa (SSE + polling zaxirasi)
function closeLive() {
  if (S.pollTimer) { clearTimeout(S.pollTimer); S.pollTimer = null; }
  S.liveGen = (S.liveGen || 0) + 1;
}
function connectLive() {
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
function onLive(m) {
  const wasOnline = S.online;
  if (m.type === "live") {
    S.online = m.online; S.lastSeen = m.last_seen;
    if (m.sysinfo) S.sysinfo = m.sysinfo;
    if (m.health) S.health = m.health;
    if (m.data && (!S.live || m.data.ts !== S.live.ts)) { S.live = m.data; pushHist(m.data); }
  } else if (m.type === "status") { S.online = m.online; S.lastSeen = m.last_seen; }
  const d = S.devices.find((x) => x.id === S.devId);
  if (d) { d.online = S.online; d.last_seen = S.lastSeen; }
  if (wasOnline !== S.online) loadEvents();
  updateHeat();
  render();
}
function pushHist(L) {
  const H = S.hist, g = (L.gpus || [])[0] || {};
  H.t.push(L.ts); H.cpu.push((L.cpu || {}).load); H.gpu.push(g.load); H.ram.push((L.ram || {}).percent);
  H.cpuT.push((L.cpu || {}).temp); H.gpuT.push(g.temp);
  for (const k in H) if (H[k].length > 90) H[k].shift();
}

const HEAT = {
  off: ["#2b3a55", "#1d2a40", "#3b4a66"],
  cool: ["#1d4ed8", "#0e9f9a", "#5b45d6"],
  warm: ["#e0782a", "#0e8f8a", "#8b3fd9"],
  hot: ["#dc3b3b", "#d97706", "#7f1d1d"],
};
function updateHeat() {
  let band = "off";
  if (S.online && S.live) {
    const c = S.live.cpu || {}, g = (S.live.gpus || [])[0] || {};
    const temps = [c.temp, g.temp].filter(num);
    const t = temps.length ? Math.max(...temps) : 40 + (c.load || 0) * 0.45;
    band = t >= 82 ? "hot" : t >= 66 ? "warm" : "cool";
  }
  if (S.token && !S.user) band = "cool";
  const [a, b, c] = HEAT[band];
  const st = document.documentElement.style;
  st.setProperty("--heat-a", a); st.setProperty("--heat-b", b); st.setProperty("--heat-c", c);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = "#0b1322";
}

document.addEventListener("visibilitychange", () => {
  if (!S.token || !S.user) return;
  if (document.hidden) closeLive();
  else { connectLive(); loadDevices().catch(() => {}); loadEvents(); if (Date.now() - S.metricsAt > 300000) loadMetrics(); }
});

// har soniyada: taymer va "qoʻriqlash" qayta sanogʻi
setInterval(() => {
  const el = document.querySelector("[data-countdown]");
  if (el) el.textContent = fmtCountdown(Number(el.dataset.countdown) - Date.now() / 1000);
  if (S.live && S.live.guard && S.live.guard.state === "arming" && S.route === "control") render();
}, 1000);
setInterval(() => { if (S.user && !document.hidden) { loadMetrics(); loadEvents(); if (S.route === "time" && S.usage.day === todayIso()) loadUsage(S.usage.day); } }, 300000);

// =================================================================== push
function b64ToU8(s) {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function checkPush() {
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
async function enablePush() {
  S.busy.push = true; render();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { S.push.state = perm === "denied" ? "denied" : "off"; throw new Error("Bildirishnomaga ruxsat berilmadi"); }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await rpc("pp_push_key", {}, { auth: false });
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    await rpc("pp_push_subscribe", { p_sub: sub.toJSON(), p_label: navigator.userAgent.slice(0, 80) });
    S.push.state = "on";
    toast("Bildirishnomalar yoqildi", "ok");
  } catch (e) { toast(e.message, "err"); }
  finally { delete S.busy.push; render(); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await rpc("pp_push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    S.push.state = "off"; toast("Bu qurilmada bildirishnomalar oʻchirildi"); render();
  } catch (e) { toast(e.message, "err"); }
}

// =================================================================== marshrut va ishga tushirish
function onRoute() {
  const r = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "overview";
  const prev = S.route;
  S.route = TITLES[r] ? r : "overview";
  if (prev !== S.route) window.scrollTo(0, 0);
  if (S.route === "time" && S.devId && !S.usage.data) loadUsage(S.usage.day);
  render();
}

async function afterLogin() {
  await loadMe();
  await loadDevices();
  if (S.devId) selectDevice(S.devId, true);
  checkPush();
  loadEvents();
}

function logout(silent, skipServer) {
  if (S.token && !skipServer && !silent) rpc("pp_logout").catch(() => {});
  closeLive();
  localStorage.removeItem("pcp_token");
  S.token = ""; S.user = null; S.devices = []; S.live = null; S.dev = null;
  if (!silent) toast("Tizimdan chiqdingiz");
  updateHeat(); render();
}

window.addEventListener("hashchange", onRoute);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; render(); });

async function tryResume() {
  try { S.bootErr = ""; await afterLogin(); }
  catch (e) {
    if (S.token && !S.user) { S.bootErr = e.message; render(); setTimeout(() => { if (S.token && !S.user) tryResume(); }, 5000); }
  }
}

(async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  onRoute();
  updateHeat();
  if (S.token) await tryResume();
  render();
})();
