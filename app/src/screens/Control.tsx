// Boshqaruv: quvvat, qoʻriqlash, taymer, avtomatik qulflash, ekran rasmi, ekranga xabar, media, tozalash.
import { S, render, type Json } from "../core/store";
import { fmtB, fmtCountdown, hhmm } from "../core/format";
import * as A from "../core/actions";
import { Icon } from "../ui/icons";
import { Button, Kv, Note, Panel, SectionHeader, Segmented, Select, cx, useNow } from "../ui/kit";
import { ActionTile, EventsCard, Waiting } from "./common";

const T_ACT: [string, string][] = [["shutdown", "Oʻchirish"], ["restart", "Qayta yoqish"], ["sleep", "Uyqu"], ["hibernate", "Gibernatsiya"], ["lock", "Qulflash"]];

export function Control() {
  useNow(1000);
  const L = S.live;
  if (!L || !S.online) return <Waiting detailed />;
  const caps = L.caps || {}, st = (S.dev && S.dev.settings) || {};
  const g = L.guard || { state: "off" };
  const guardTxt: Record<string, [string, string]> = {
    off: ["Qoʻriqlash oʻchiq", "Yoqilgach, kimdir sichqoncha yoki klaviaturaga tegsa — ekran darhol qulflanadi va sizga bildirishnoma keladi."],
    arming: ["Qoʻriqlash yoqilmoqda…", `${Math.max(0, Math.round((g.grace_until || 0) - Date.now() / 1000))} soniyadan soʻng faollashadi — kompyuterdan uzoqlashing.`],
    armed: ["Qoʻriqlanmoqda", `${g.since ? hhmm(g.since) : ""} dan beri. Har qanday tegish — qulflash va bildirishnoma.`],
    watch: ["Ekran qulflangan, kuzatilmoqda", `${g.triggered_at ? hhmm(g.triggered_at) : ""} dan beri. Qulf ekranidagi harakat va qulfdan chiqarish haqida xabar beriladi.`],
  };
  const [gT, gS] = guardTxt[g.state] || ["", ""];
  const t = L.timer;
  const left = t ? Math.max(0, t.at - Date.now() / 1000) : 0;
  const tName = Object.fromEntries(T_ACT)[t ? t.action : ""] || "";
  const idleSel = (key: string, vals: [number, string][], cur: number) => (
    <Select label={key} value={Number(cur || 0)} options={vals} onChange={(v) => A.devSetting(key, v)} />
  );
  return (
    <>
      <Panel>
        <SectionHeader title="Quvvat" sub="Oʻchirish va qayta yoqish 5 soniyalik ogohlantirish bilan bajariladi" right={<Button size="s" variant="ghost" icon="x" onClick={A.cancelShutdown}>Oʻchirishni bekor qilish</Button>} />
        <div className="acts">
          <ActionTile icon="lock" title="Qulflash" sub="Win+L" onClick={A.lock} busy={S.busy.lock} disabled={!caps.lock} />
          <ActionTile icon="moon" title="Uyqu" sub="Tez uygʻonadi" onClick={A.sleepPc} busy={S.busy.sleep} disabled={!caps.power} />
          <ActionTile icon="snow" title="Gibernatsiya" sub="Diskka saqlab" onClick={A.hibernate} busy={S.busy.hibernate} disabled={!caps.power} tone="violet" />
          <ActionTile icon="restart" title="Qayta yoqish" sub="Restart" onClick={A.restart} busy={S.busy.restart} disabled={!caps.power} tone="warn" />
          <ActionTile icon="power" title="Oʻchirish" sub="Shutdown" onClick={A.shutdown} busy={S.busy.shutdown} disabled={!caps.power} tone="danger" />
          <ActionTile icon="logout" title="Chiqish" sub="Sign out" onClick={A.logoff} busy={S.busy.logoff} disabled={!caps.power} />
        </div>
      </Panel>

      <div className="grid c2">
        <Panel className={cx("guard", g.state !== "off" && (g.state === "watch" ? "alarm" : "on"))}>
          <div className="guard-head">
            <div className="shield"><Icon name="shield" size={28} /></div>
            <div><h2 className="t-h3">{gT}</h2><p className="t-sub" style={{ marginTop: 4 }}>{gS}</p></div>
          </div>
          <div className="row" style={{ marginTop: 18 }}>
            {g.state === "off" ? <>
              <Button variant="pri" icon="shield" busy={S.busy.guardArm} disabled={!caps.guard} onClick={A.guardArm}>Yoqish ({st.guard_grace_sec || 10} s)</Button>
              <Button icon="lock" busy={S.busy.guardLock} disabled={!caps.guard} onClick={A.guardLock}>Qulflab qoʻriqlash</Button>
            </> : <Button variant="danger" busy={S.busy.guardOff} onClick={A.guardOff}>Qoʻriqlashni oʻchirish</Button>}
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Taymer" sub={t ? `${tName} — ${hhmm(t.at)} da` : "Belgilangan vaqtdan soʻng kompyuter bilan amal bajariladi"} />
          {t ? (
            <div className="stack">
              <div className="t-display t-num timer-big">{fmtCountdown(left)}</div>
              <div><Button variant="danger" onClick={A.timerCancel}>Taymerni bekor qilish</Button></div>
            </div>
          ) : (
            <div className="stack">
              <div className="row">
                <Select label="Amal" value={S.form.timerAct} options={T_ACT} onChange={(v) => { S.form.timerAct = v; render(); }} />
                <Segmented label="Tez tanlash" value={Number(S.form.timerMin)} options={[15, 30, 60, 120].map((m) => [m, m < 60 ? `${m} daq` : `${m / 60} soat`] as [number, string])}
                  onChange={(m) => { S.form.timerMin = m; render(); }} />
              </div>
              <div className="row">
                <input className="in num" type="number" min={1} max={1440} value={S.form.timerMin} aria-label="Daqiqa" onChange={(e) => { S.form.timerMin = e.target.value; render(); }} />
                <span className="t-sub">daqiqadan soʻng</span>
                <Button variant="pri" icon="timer" busy={S.busy.timer_set} disabled={!caps.power} onClick={A.timerSet}>Boshlash</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <SectionHeader title="Avtomatik qulflash" sub="Toʻliq ekranda video yoki oʻyin ochiq boʻlsa, avtomatik qulflash va uxlatish ishlamaydi" />
        <div className="setlist">
          <div className="setrow"><div><b>Harakatsizlikda qulflash</b><div className="t-sub">Sichqoncha va klaviatura ishlatilmasa</div></div>
            {idleSel("idle_lock_min", [[0, "Oʻchiq"], [3, "3 daqiqa"], [5, "5 daqiqa"], [10, "10 daqiqa"], [15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"]], st.idle_lock_min)}</div>
          <div className="setrow"><div><b>Harakatsizlikda uxlatish</b><div className="t-sub">Uzoq qoldirilsa — elektr tejash</div></div>
            {idleSel("idle_sleep_min", [[0, "Oʻchiq"], [15, "15 daqiqa"], [30, "30 daqiqa"], [60, "1 soat"], [120, "2 soat"], [240, "4 soat"]], st.idle_sleep_min)}</div>
          <div className="setrow"><div><b>Qoʻriqlashni yoqish kechikishi</b><div className="t-sub">Uzoqlashishga ulgurish uchun</div></div>
            {idleSel("guard_grace_sec", [[5, "5 soniya"], [10, "10 soniya"], [20, "20 soniya"], [30, "30 soniya"], [60, "1 daqiqa"]], st.guard_grace_sec || 10)}</div>
        </div>
      </Panel>

      <div className="grid c2">
        <Panel>
          <SectionHeader title="Ekran rasmi" right={<Button size="s" icon="camera" busy={S.busy.screenshot} disabled={!caps.screenshot} onClick={A.screenshot}>Olish</Button>} />
          {S.screenshot ? (
            <button type="button" className="shot" onClick={() => { S.modal = { kind: "image" }; render(); }} aria-label="Ekran rasmini kattalashtirish">
              <img src={S.screenshot.url} alt="Kompyuter ekrani" />
              <span className="t-sub">{hhmm(S.screenshot.ts)} da olingan · kattalashtirish uchun bosing</span>
            </button>
          ) : <p className="t-sub">Kompyuter ekranida hozir nima borligini koʻring.{caps.screenshot ? "" : " (Pillow oʻrnatilmagan)"}</p>}
        </Panel>
        <Panel>
          <SectionHeader title="Ekranga xabar" />
          <textarea className="in" maxLength={500} placeholder="Masalan: Kechki ovqat tayyor!" aria-label="Xabar matni" value={S.form.msg} onChange={(e) => { S.form.msg = e.target.value; render(); }} />
          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <span className="t-faint t-num">{S.form.msg.length}/500</span>
            <Button icon="msg" busy={S.busy.message} onClick={A.sendMsg}>Yuborish</Button>
          </div>
        </Panel>
      </div>

      <div className="grid c2">
        <Panel>
          <SectionHeader title="Media va ovoz" />
          <div className="media">
            {([["prev", "prev", "Oldingi"], ["play", "play", "Ijro/pauza"], ["next", "next", "Keyingi"], ["vol_down", "volDown", "Ovozni pasaytirish"], ["mute", "mute", "Ovozsiz"], ["vol_up", "volUp", "Ovozni oshirish"]] as const)
              .map(([k, i, tt]) => <Button key={k} icon={i} label={tt} title={tt} busy={S.busy["media-" + k]} disabled={!caps.media} onClick={() => A.media(k)} className={k === "play" ? "media-play" : undefined} />)}
          </div>
        </Panel>
        <Cleanup caps={caps} />
      </div>

      <EventsCard n={10} />
    </>
  );
}

function Cleanup({ caps }: { caps: Json }) {
  const c = S.cleanup, r = S.cleanupResult;
  return (
    <Panel>
      <SectionHeader title="Tozalash" right={<Button size="s" icon="broom" busy={S.busy.cleanup_scan} disabled={!caps.cleanup} onClick={A.cleanScan}>Tekshirish</Button>} />
      {c ? (
        <div className="stack">
          <Kv rows={[["Vaqtinchalik fayllar", <>{fmtB(c.temp_cleanable)} <span className="t-sub">({c.temp_files} ta fayl)</span></>], ["Savat (Recycle Bin)", <>{fmtB(c.recycle_bytes)} <span className="t-sub">({c.recycle_items} ta)</span></>]]} />
          <div><Button variant="pri" busy={S.busy.cleanup_run} onClick={A.cleanRun}>Tozalash</Button></div>
        </div>
      ) : <p className="t-sub">Vaqtinchalik fayllar (24 soatdan eski) va savatni tozalab, diskda joy boʻshatadi.</p>}
      {r ? <div style={{ marginTop: 12 }}><Note icon="check">{fmtB(r.freed)} joy boʻshatildi ({r.deleted} ta fayl).</Note></div> : null}
    </Panel>
  );
}

