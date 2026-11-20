// Ilova karkasi: NavigationSidebar, TopBar, MobileBottomNavigation, sahifalar, modal va toastlar.
import { useEffect, useState } from "react";
import { S, render, useStore, device, type Route } from "./core/store";
import { fmtAgo, initials, num, r0 } from "./core/format";
import * as A from "./core/actions";
import { Icon, type IconName } from "./ui/icons";
import { Button, Dot, Field, Segmented, Select, cx, useNow } from "./ui/kit";
import { ModalHost, Toasts } from "./ui/overlays";
import { Overview } from "./screens/Overview";
import { SystemScreen } from "./screens/System";
import { Procs } from "./screens/Procs";
import { ScreenTime } from "./screens/ScreenTime";
import { Control } from "./screens/Control";
import { Settings } from "./screens/Settings";

export const NAV: [Route, string, IconName, string][] = [
  ["overview", "Umumiy", "pulse", "Umumiy"],
  ["system", "Tizim", "chip", "Tizim"],
  ["procs", "Jarayonlar", "layers", "Jarayon"],
  ["time", "Ekran vaqti", "clock", "Vaqt"],
  ["control", "Boshqaruv", "power", "Boshqaruv"],
  ["settings", "Sozlamalar", "sliders", "Sozlama"],
];
const TITLE: Record<Route, string> = Object.fromEntries(NAV.map(([k, t]) => [k, t])) as Record<Route, string>;

export function App() {
  useStore();
  useEffect(() => { document.title = S.user ? `${TITLE[S.route]} — PC Pulse` : "PC Pulse"; });
  return (
    <>
      {!S.token || !S.user ? (S.token ? <Loading /> : <Auth />) : <Shell />}
      <ModalHost />
      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------- yuklanish / server xatosi
function Loading() {
  return (
    <div className="auth">
      {S.bootErr ? (
        <div className="pnl hero auth-card" style={{ textAlign: "center" }}>
          <div className="auth-mark"><Icon name="wifi" size={26} /></div>
          <h1 className="t-h2">Server bilan aloqa yoʻq</h1>
          <p className="t-sub" style={{ margin: "8px 0 20px" }}>{S.bootErr}. Internet aloqasini tekshiring — qayta ulanishga urinib koʻrilmoqda.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Button variant="pri" icon="refresh" onClick={A.retry}>Qayta urinish</Button>
            <Button variant="ghost" onClick={A.doLogout}>Chiqish</Button>
          </div>
        </div>
      ) : <div className="boot"><img src="icons/icon-192.png" alt="" width={56} height={56} /><span className="t-sub">Yuklanmoqda…</span></div>}
    </div>
  );
}

// ---------------------------------------------------------------- kirish / roʻyxatdan oʻtish
function Auth() {
  const reg = S.form.authMode === "register";
  const [u, setU] = useState(""), [p, setP] = useState(""), [p2, setP2] = useState("");
  return (
    <div className="auth">
      <div className="auth-wrap">
        <div className="auth-brand">
          <img src="icons/icon-192.png" alt="" width={52} height={52} />
          <div>
            <h1 className="t-display auth-title">PC Pulse</h1>
            <p className="t-sub">Kompyuteringiz holati, fanlar va boshqaruv — telefon va kompyuterda bitta akkaunt bilan.</p>
          </div>
        </div>
        <div className="pnl hero auth-card">
          <Segmented label="Kirish turi" value={S.form.authMode} options={[["login", "Kirish"], ["register", "Roʻyxatdan oʻtish"]]}
            onChange={(v) => { S.form.authMode = v; S.form.authErr = ""; render(); }} />
          <form className="stack" style={{ marginTop: 20, gap: 14 }} onSubmit={(e) => { e.preventDefault(); A.auth(u, p, p2); }}>
            <Field label="Username" htmlFor="u">
              <input className="in" id="u" name="username" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required minLength={3} maxLength={32} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Parol" htmlFor="p">
              <input className="in" id="p" name="password" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete={reg ? "new-password" : "current-password"} required minLength={reg ? 6 : undefined} />
            </Field>
            {reg ? (
              <Field label="Parolni takrorlang" htmlFor="p2">
                <input className="in" id="p2" name="password2" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" required minLength={6} />
              </Field>
            ) : null}
            <div className="err" role="alert" aria-live="assertive">{S.form.authErr}</div>
            <Button variant="pri" type="submit" busy={S.busy.auth} block>{reg ? "Akkaunt yaratish" : "Kirish"}</Button>
            <p className="t-sub">{reg ? "Shu username va parol bilan telefon va kompyuterdan kirasiz, agentni ham shu akkauntga ulaysiz." : "Telefon va kompyuterda bir xil akkaunt ishlatiladi."}</p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- karkas
function Shell() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main" id="main">
        <div className="main-inner">
          <TopBar />
          <div className={cx("page", S.navTick > 0 && "enter")} key={S.route}>
            <Page />
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function Page() {
  switch (S.route) {
    case "system": return <SystemScreen />;
    case "procs": return <Procs />;
    case "time": return <ScreenTime />;
    case "control": return <Control />;
    case "settings": return <Settings />;
    default: return <Overview />;
  }
}

function Sidebar() {
  return (
    <aside className="side" aria-label="Asosiy menyu">
      <a className="brand" href="#/overview" aria-label="PC Pulse — Umumiy">
        <img src="icons/icon-192.png" alt="" width={30} height={30} />
        <span>PC Pulse</span>
      </a>
      <nav className="side-nav">
        {NAV.map(([k, t, i]) => (
          <a key={k} className={cx("nav-i", S.route === k && "on")} href={`#/${k}`} aria-current={S.route === k ? "page" : undefined}>
            <Icon name={i} size={19} /><span>{t}</span>
          </a>
        ))}
      </nav>
      <div className="side-spacer" />
      <DeviceCard />
      <div className="side-user">
        <span className="av sm">{initials(S.user.username)}</span>
        <span className="grow ellipsis">{S.user.username}</span>
        <Button variant="ghost" size="s" icon="logout" label="Chiqish" title="Chiqish" onClick={A.doLogout} />
      </div>
    </aside>
  );
}

function DeviceCard() {
  useNow(15000);
  const d = device();
  if (!S.devices.length) return null;
  const L = S.live, cpu = (L && L.cpu) || {};
  const state = S.online ? (L && L.locked ? "qulflangan" : "onlayn") : d && (S.lastSeen || d.last_seen) ? `oflayn · ${fmtAgo(S.lastSeen || d.last_seen)}` : "kutilmoqda";
  return (
    <div className="dev-card">
      <div className="dev-ico"><Icon name="monitor" size={18} /><Dot level={S.online ? "on" : ""} /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        {S.devices.length > 1 ? (
          <Select label="Qurilma" value={S.devId} options={S.devices.map((x) => [x.id, x.name] as [string, string])} onChange={A.device} className="dev-sel" />
        ) : <div className="dev-name ellipsis">{d ? d.name : ""}</div>}
        <div className="t-sub ellipsis">{state}{S.online && num(cpu.temp) ? ` · CPU ${r0(cpu.temp)}°C` : ""}</div>
      </div>
    </div>
  );
}

function TopBar() {
  const d = device();
  const L = S.live;
  return (
    <header className="top">
      <div className="top-title">
        <h1 className="t-h1">{TITLE[S.route]}</h1>
      </div>
      <div className="top-right">
        {S.devices.length ? (
          <div className="top-dev">
            <Dot level={S.online ? "on" : ""} label={S.online ? "onlayn" : "oflayn"} />
            {S.devices.length > 1 ? (
              <Select label="Qurilma" value={S.devId} options={S.devices.map((x) => [x.id, x.name] as [string, string])} onChange={A.device} className="dev-sel" />
            ) : <span className="dev-name ellipsis">{d ? d.name : ""}</span>}
            <span className="top-state t-sub">{S.online ? (L && L.locked ? "qulflangan" : "onlayn") : "oflayn"}</span>
          </div>
        ) : null}
        {S.route !== "settings" ? <Button className="mob-only" variant="ghost" icon="sliders" label="Sozlamalar" href="#/settings" /> : null}
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bnav" aria-label="Boʻlimlar">
      {NAV.filter(([k]) => k !== "settings").map(([k, , i, short]) => (
        <a key={k} className={cx(S.route === k && "on")} href={`#/${k}`} aria-current={S.route === k ? "page" : undefined}>
          <span className="bnav-ico"><Icon name={i} size={22} /></span><span>{short}</span>
        </a>
      ))}
    </nav>
  );
}
