// Sozlamalar: koʻrinish, bildirishnomalar, ogohlantirish chegaralari, kompyuterlar, akkaunt, ilova.
import { useState, type ReactNode } from "react";
import { S, type Json } from "../core/store";
import { CFG } from "../core/api";
import { fmtAgo } from "../core/format";
import { setUiPref, uiPref, type Mode, type Ui } from "../core/theme";
import * as A from "../core/actions";
import { Icon, type IconName } from "../ui/icons";
import { Button, Dot, Field, Kv, Panel, Segmented, Select, Switch, Tag, cx } from "../ui/kit";

const SECTIONS: [string, string, IconName][] = [
  ["look", "Koʻrinish", "palette"], ["notify", "Bildirishnomalar", "bell"], ["limits", "Chegaralar", "thermo"],
  ["pcs", "Kompyuterlar", "monitor"], ["account", "Akkaunt", "user"], ["app", "Ilova", "download"],
];

function Row({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return <div className="setrow"><div><b>{title}</b>{sub ? <div className="t-sub">{sub}</div> : null}</div><div className="setrow-ctl">{children}</div></div>;
}
function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <Panel id={id} className="set-sec" aria-labelledby={`${id}-h`}>
      <div className="set-sec-head"><h2 className="t-h3" id={`${id}-h`}>{title}</h2>{sub ? <p className="t-sub">{sub}</p> : null}</div>
      {children}
    </Panel>
  );
}

export function Settings() {
  const u = S.user, us = u.settings, al = us.alerts || {};
  const push = S.push.state;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Json).standalone || document.documentElement.hasAttribute("data-shell");
  const pushTxt = {
    on: "Bu qurilmada yoqilgan", off: "Bu qurilmada oʻchiq", denied: "Brauzer bildirishnomalarni bloklagan — sayt sozlamalaridan ruxsat bering",
    unsupported: ios && !standalone ? "iPhone da: Safari → Ulashish → “Ekranga qoʻshish”, soʻng ilovani ochib shu yerdan yoqing" : "Bu brauzer push bildirishnomalarni qoʻllamaydi",
    insecure: "Push uchun HTTPS kerak", unknown: "Tekshirilmoqda…",
  }[push];
  const st = (S.dev && S.dev.settings) || {};
  const { ui, mode } = uiPref();
  return (
    <div className="settings">
      <nav className="set-nav" aria-label="Sozlamalar boʻlimlari">
        {SECTIONS.map(([id, t, i]) => (
          <a key={id} href={`#/settings`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <Icon name={i} size={17} />{t}
          </a>
        ))}
      </nav>
      <div className="set-main">
        <Section id="look" title="Koʻrinish" sub="Faqat shu qurilmada saqlanadi — telefon va kompyuterda har xil tanlash mumkin.">
          <div className="themes" role="radiogroup" aria-label="Mavzu">
            {([["aurora", "Aurora Glass", "Shisha panellar, fon kompyuter haroratiga qarab oʻzgaradi"], ["once", "Once UI", "Toza va aniq; qorongʻi yoki yorugʻ"]] as [Ui, string, string][]).map(([v, t, sub]) => (
              <button key={v} type="button" className={cx("theme-opt", ui === v && "on")} role="radio" aria-checked={ui === v} onClick={() => setUiPref("pp_ui", v)}>
                <span className={cx("theme-prev", `tp-${v}`)} aria-hidden="true"><i /><i /><i /><i /></span>
                <span className="theme-meta"><b>{t}</b><span className="t-sub">{sub}</span></span>
                {ui === v ? <span className="theme-check"><Icon name="check" size={14} /></span> : null}
              </button>
            ))}
          </div>
          {ui === "once" ? (
            <Row title="Rejim" sub="Tizim — telefon yoki kompyuter sozlamasiga ergashadi">
              <Segmented label="Rejim" value={mode} options={[["dark", "Qorongʻi"], ["light", "Yorugʻ"], ["system", "Tizim"]] as [Mode, string][]} onChange={(v) => setUiPref("pp_mode", v)} />
            </Row>
          ) : null}
        </Section>

        <Section id="notify" title="Bildirishnomalar" sub="Har yarim soatlik hisobot va muhim ogohlantirishlar telefoningizga keladi.">
          <Row title="Push bildirishnomalar" sub={pushTxt}>
            {push === "on" ? <Button size="s" onClick={A.pushOff}>Oʻchirish</Button>
              : <Button size="s" variant="pri" icon="bell" busy={S.busy.push} disabled={push === "unsupported" || push === "insecure"} onClick={A.pushOn}>Yoqish</Button>}
          </Row>
          <Row title="Muntazam hisobot" sub="CPU, GPU, RAM va ekran vaqti"><Switch label="Muntazam hisobot" checked={!!us.notify_enabled} onChange={(v) => A.userSetting("notify_enabled", v)} /></Row>
          <Row title="Hisobot oraligʻi">
            <Select label="Hisobot oraligʻi" value={Number(us.notify_interval)} options={[[15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"], [120, "2 soat"], [240, "4 soat"]]} onChange={(v) => A.userSetting("notify_interval", v)} />
          </Row>
          <Row title="Tungi sokinlik" sub="Bu vaqtda hisobot yuborilmaydi (muhim ogohlantirishlar keladi)"><Switch label="Tungi sokinlik" checked={!!us.quiet_enabled} onChange={(v) => A.userSetting("quiet_enabled", v)} /></Row>
          {us.quiet_enabled ? (
            <Row title="Oraliq">
              <div className="row tight nowrap">
                <input className="in" type="time" aria-label="Boshlanishi" defaultValue={us.quiet_from} onBlur={(e) => e.target.value !== us.quiet_from && A.userSetting("quiet_from", e.target.value)} />
                <span className="t-sub">—</span>
                <input className="in" type="time" aria-label="Tugashi" defaultValue={us.quiet_to} onBlur={(e) => e.target.value !== us.quiet_to && A.userSetting("quiet_to", e.target.value)} />
              </div>
            </Row>
          ) : null}
          <Row title="Yoqildi/oʻchdi xabarlari"><Switch label="Yoqildi/oʻchdi xabarlari" checked={!!al.power_events} onChange={(v) => A.userSetting("alerts.power_events", v)} /></Row>
          <Row title="Muhim ogohlantirishlar" sub="Qizib ketish, disk toʻlishi va h.k."><Switch label="Muhim ogohlantirishlar" checked={!!al.critical} onChange={(v) => A.userSetting("alerts.critical", v)} /></Row>
          <div className="row" style={{ marginTop: 14 }}><Button size="s" icon="bell" busy={S.busy.pushTest} onClick={A.pushTest}>Test bildirishnoma</Button></div>
        </Section>

        <Section id="limits" title="Ogohlantirish chegaralari" sub="Shu qiymatlardan oshsa, telefoningizga ogohlantirish keladi.">
          {([["cpu_temp", "CPU harorati", "°C", 60, 105], ["gpu_temp", "GPU harorati", "°C", 60, 105], ["ram", "RAM bandligi", "%", 50, 100], ["disk", "Disk toʻlishi", "%", 50, 100]] as [string, string, string, number, number][]).map(([k, t, unit, mn, mx]) => (
            <Row key={k} title={t} sub={unit}>
              <input className="in num t-num" type="number" min={mn} max={mx} defaultValue={al[k]} aria-label={t}
                onBlur={(e) => { const v = Number(e.target.value); if (v && v !== al[k]) A.alertSetting(k, v); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </Row>
          ))}
          {S.dev ? <>
            <Row title="Ekran vaqti: harakatsizlik chegarasi" sub={`${S.dev.name} uchun`}>
              <Select label="Harakatsizlik chegarasi" value={Number(st.idle_threshold_sec || 180)} options={[[60, "1 daqiqa"], [120, "2 daqiqa"], [180, "3 daqiqa"], [300, "5 daqiqa"], [600, "10 daqiqa"]]} onChange={(v) => A.devSetting("idle_threshold_sec", v)} />
            </Row>
            <Row title="Fan minimal tezligi" sub="Qoʻlda va harorat rejimlari uchun">
              <Select label="Fan minimal tezligi" value={Number(st.fan_min_pct ?? 20)} options={[[0, "0%"], [10, "10%"], [20, "20%"], [30, "30%"], [40, "40%"]]} onChange={(v) => A.devSetting("fan_min_pct", v)} />
            </Row>
            <Row title="Agentni avtomatik yangilash" sub={`Yangi versiya chiqqanda ${S.dev.name} oʻzini yangilaydi`}>
              <Switch label="Agentni avtomatik yangilash" checked={st.auto_update !== false} onChange={(v) => A.devSetting("auto_update", v)} />
            </Row>
          </> : null}
        </Section>

        <Section id="pcs" title="Kompyuterlar" sub="Wake-on-LAN uchun MAC manzil agentdan avtomatik olinadi; kerak boʻlsa qoʻlda kiriting.">
          <div className="stack">
            {S.devices.length ? S.devices.map((d) => <DeviceCard key={d.id} d={d} />) : <div className="t-sub">Hali qurilma yoʻq.</div>}
          </div>
          <details className="more" style={{ marginTop: 14 }}>
            <summary><Icon name="plus" size={16} />Yangi kompyuter qoʻshish</summary>
            <p className="t-sub" style={{ margin: "6px 0 12px" }}>Yangi kompyuterda <b>PCPulseAgent.exe</b> ni ishga tushiring va username <code className="mono">{u.username}</code> hamda parolingiz bilan kiring.</p>
            <Button size="s" icon="download" href={CFG.exeUrl} target="_blank">PCPulseAgent.exe ni yuklab olish</Button>
          </details>
        </Section>

        <Section id="account" title="Akkaunt">
          <Kv rows={[["Username", u.username], ["Roʻyxatdan oʻtgan", new Date(u.created_at * 1000).toLocaleDateString("uz")], ["Server versiyasi", u.server_version || "—"]]} />
          <PasswordForm />
          <div className="row" style={{ marginTop: 16 }}>
            <Button size="s" icon="logout" onClick={A.doLogout}>Chiqish</Button>
            <Button size="s" variant="ghost" onClick={A.logoutAll}>Barcha qurilmalardan chiqish</Button>
          </div>
        </Section>

        <Section id="app" title="Ilova" sub="PC Pulse ni telefon yoki kompyuterga ilova sifatida oʻrnating — alohida oynada ochiladi va bildirishnomalar keladi.">
          {S.installPrompt ? <Button variant="pri" icon="download" onClick={A.install}>Oʻrnatish</Button>
            : standalone ? <Tag level="ok">Ilova sifatida ochilgan</Tag>
              : <p className="t-sub">{ios ? "Safari: Ulashish tugmasi → “Ekranga qoʻshish”." : "Brauzer menyusi → “Ilovani oʻrnatish” / “Add to Home screen”. Kompyuterda PCPulseAgent.exe ham PC Pulse ni oʻz oynasida ochadi."}</p>}
        </Section>
      </div>
    </div>
  );
}

function DeviceCard({ d }: { d: Json }) {
  const [f, setF] = useState({ name: d.name || "", mac: d.mac || "", broadcast: d.broadcast || "", wol_port: String(d.wol_port || 9) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="pnl sunken dev-edit">
      <div className="row between">
        <div className="row tight"><Dot level={d.online ? "on" : ""} /><b>{d.name}</b><span className="t-sub">{d.online ? "onlayn" : `oflayn · ${fmtAgo(d.last_seen)}`}</span></div>
        <Button size="s" variant="danger" icon="trash" onClick={() => A.devDelete(d.id, d.name)}>Oʻchirish</Button>
      </div>
      <form className="grid c2" style={{ marginTop: 14, gap: 12 }} onSubmit={(e) => { e.preventDefault(); A.devSave(d.id, { name: f.name, mac: f.mac, broadcast: f.broadcast, wol_port: Number(f.wol_port) || 9 }); }}>
        <Field label="Nomi"><input className="in" value={f.name} onChange={set("name")} maxLength={60} /></Field>
        <Field label="MAC manzil (Wake-on-LAN)"><input className="in mono" value={f.mac} onChange={set("mac")} placeholder="AA:BB:CC:DD:EE:FF" /></Field>
        <Field label="Broadcast manzil"><input className="in mono" value={f.broadcast} onChange={set("broadcast")} placeholder="192.168.1.255" /></Field>
        <Field label="WOL port"><input className="in" type="number" value={f.wol_port} onChange={set("wol_port")} /></Field>
        <div className="row tight"><Button size="s" type="submit">Saqlash</Button><span className="t-sub">{d.mac_manual ? "qoʻlda kiritilgan" : "agentdan avtomatik"}</span></div>
      </form>
    </div>
  );
}

function PasswordForm() {
  const [o, setO] = useState(""), [n, setN] = useState("");
  return (
    <form className="pw-form" onSubmit={async (e) => { e.preventDefault(); if (await A.changePassword(o, n)) { setO(""); setN(""); } }}>
      <input className="in" type="password" placeholder="Joriy parol" autoComplete="current-password" required value={o} onChange={(e) => setO(e.target.value)} aria-label="Joriy parol" />
      <input className="in" type="password" placeholder="Yangi parol (kamida 6 belgi)" autoComplete="new-password" minLength={6} required value={n} onChange={(e) => setN(e.target.value)} aria-label="Yangi parol" />
      <Button size="s" type="submit" icon="key">Parolni oʻzgartirish</Button>
    </form>
  );
}
