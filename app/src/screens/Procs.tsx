// Jarayonlar: RAM tarkibi, yengillatish maslahatlari, dasturlar roʻyxati (yopish), avtoyuklanish.
import type { CSSProperties } from "react";
import { S, render, type Json } from "../core/store";
import { fmtB, fmtUptime, GiB, initials, r0 } from "../core/format";
import * as A from "../core/actions";
import { Icon } from "../ui/icons";
import { AnimatedNumber, Button, Panel, SectionHeader, Segmented, Switch } from "../ui/kit";
import { Waiting } from "./common";

const TIPS: [RegExp, string][] = [
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
const tipFor = (name: string) => { const n = String(name || "").toLowerCase(); const t = TIPS.find(([re]) => re.test(n)); return t ? t[1] : ""; };
const PALETTE = ["var(--c-cpu)", "var(--c-gpu)", "var(--c-ram)", "var(--c-power)", "var(--c-5)", "var(--c-net)"];

export function Procs() {
  const L = S.live;
  if (!L) return <Waiting />;
  const ram = L.ram || {}, pr = L.procs || {};
  const k = S.sub.procs;
  const list: Json[] = k === "cpu" ? pr.by_cpu || [] : pr.by_mem || [];
  const top5: Json[] = (pr.by_mem || []).slice(0, 5);
  const rest = Math.max(0, ram.used - top5.reduce((a, p) => a + p.mem, 0));
  return (
    <>
      <Panel>
        <div className="row between nowrap" style={{ alignItems: "flex-start" }}>
          <div><h2 className="t-h3">Operativ xotira</h2><div className="t-sub">{fmtB(ram.used)} band, {fmtB(ram.avail)} boʻsh · jami {fmtB(ram.total)}</div></div>
          <div className="t-display t-num" style={{ fontSize: 40 }}><AnimatedNumber value={ram.percent} /><span className="t-unit">%</span></div>
        </div>
        <div className="stackbar" style={{ marginTop: 16 }} role="img" aria-label="RAM tarkibi">
          {top5.map((p, i) => <i key={p.name} title={p.title} style={{ width: `${((p.mem / ram.total) * 100).toFixed(2)}%`, background: PALETTE[i] }} />)}
          <i style={{ width: `${((rest / ram.total) * 100).toFixed(2)}%`, background: "var(--border-strong)" }} />
        </div>
        <div className="legend">
          {top5.map((p, i) => <span key={p.name}><i style={{ background: PALETTE[i] }} />{p.title} <b className="t-num">{fmtB(p.mem)}</b></span>)}
          <span><i style={{ background: "var(--border-strong)" }} />Boshqalar <b className="t-num">{fmtB(rest)}</b></span>
        </div>
      </Panel>

      <FixCard />

      <Panel>
        <SectionHeader title="Dasturlar" sub={`Jami ${pr.count || 0} ta jarayon. “Yopish” dasturni darhol toʻxtatadi — saqlanmagan ishlar yoʻqoladi.`}
          right={<Segmented label="Saralash" value={k} options={[["mem", "RAM boʻyicha"], ["cpu", "CPU boʻyicha"]]} onChange={(v) => { S.sub.procs = v; render(); }} />} />
        <div className="list">
          {list.length ? list.map((p) => {
            const tip = p.mem > 400 * 1048576 || p.cpu > 15 ? tipFor(p.name) : "";
            const share = k === "cpu" ? Math.min(100, p.cpu) : (p.mem / ram.total) * 100;
            return (
              <div className="li proc" key={p.name}>
                <div className="av">{initials(p.title)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{p.title}</div>
                  <div className="s">{p.name}{p.n > 1 ? ` · ${p.n} ta jarayon` : ""}</div>
                  <div className="proc-bar" style={{ ["--w" as string]: `${share.toFixed(1)}%`, ["--c" as string]: k === "cpu" ? "var(--c-cpu)" : "var(--c-ram)" } as CSSProperties} />
                </div>
                <div className="r">
                  <div style={{ textAlign: "right" }}>
                    <div className="num t-num">{k === "cpu" ? `${Number(p.cpu).toFixed(1)}%` : fmtB(p.mem)}</div>
                    <div className="t-sub t-num">{k === "cpu" ? fmtB(p.mem) : `CPU ${Number(p.cpu).toFixed(1)}%`}</div>
                  </div>
                  <Button size="s" busy={S.busy["kill-" + p.name]} disabled={p.protected} title={p.protected ? "Tizim jarayoni" : `${p.title} ni yopish`} onClick={() => A.kill(p.name, p.title)}>Yopish</Button>
                </div>
                {tip ? <div className="tip">{tip}</div> : null}
              </div>
            );
          }) : <div className="t-sub" style={{ padding: "14px 0" }}>Roʻyxat boʻsh</div>}
        </div>
      </Panel>

      <StartupCard />
    </>
  );
}

function FixCard() {
  const L = S.live, ram = L.ram || {}, top: Json[] = (L.procs || {}).by_mem || [];
  const tips: string[] = [];
  const t3 = top.filter((p) => !p.protected).slice(0, 3);
  if (ram.percent >= 70 && t3.length) tips.push(`Eng koʻp xotira olayotganlar: ${t3.map((p) => `${p.title} (${fmtB(p.mem)})`).join(", ")}. Hozir kerak boʻlmaganlarini yoping.`);
  if (top.some((p) => /^(chrome|msedge|firefox|opera|brave|browser|yandex)/i.test(p.name) && p.mem > GiB)) tips.push("Brauzer 1 GB dan koʻp olmoqda: tablarni kamaytiring yoki “Memory Saver” ni yoqing.");
  if (ram.swap_total && ram.swap_used > ram.total * 0.4) tips.push("Pagefile koʻp ishlatilmoqda — kompyuter sekinlashadi. Doimiy shunday boʻlsa, RAM qoʻshishni oʻylab koʻring.");
  if ((L.uptime || 0) > 3 * 86400) tips.push(`Kompyuter ${fmtUptime(L.uptime)} dan beri qayta yoqilmagan. Qayta ishga tushirish xotirani tozalaydi.`);
  tips.push("Avtoyuklanishdagi keraksiz dasturlarni oʻchiring (pastda) — Windows tezroq yuklanadi va RAM boʻshaydi.");
  if (ram.percent < 70 && tips.length === 1) tips.unshift("Xotira yetarli — hozircha hech narsa qilish shart emas.");
  return (
    <Panel>
      <SectionHeader title="Qanday yengillatish mumkin" sub={`RAM ${r0(ram.percent)}% band`} />
      <ul className="tips">{tips.map((t, i) => <li key={i}><Icon name={i === 0 && ram.percent >= 70 ? "alert" : "check"} size={16} /><span>{t}</span></li>)}</ul>
    </Panel>
  );
}

function StartupCard() {
  const caps = (S.live && S.live.caps) || {};
  if (!caps.startup) return null;
  const it = S.startup;
  return (
    <Panel>
      <SectionHeader title="Avtoyuklanish" sub="Windows bilan birga ishga tushadigan dasturlar. Oʻchirilgani oʻchirilmaydi, faqat avtomatik ishga tushmaydi."
        right={<Button size="s" icon={it ? "refresh" : "list"} busy={S.busy.startup_list} onClick={A.startupLoad}>{it ? "Yangilash" : "Roʻyxatni koʻrish"}</Button>} />
      {it ? (
        <div className="list">
          {it.length ? it.map((x: Json) => (
            <div className="li" key={x.id}>
              <div className="av">{initials(x.title)}</div>
              <div style={{ minWidth: 0 }}><div className="t">{x.title}</div><div className="s" title={x.command}>{x.scope === "user" ? "Faqat siz uchun" : "Barcha foydalanuvchilar"} · {x.command}</div></div>
              <Switch checked={!!x.enabled} label={x.title} disabled={S.busy.startup_toggle} onChange={(v) => { x.enabled = v; render(); A.startupToggle(x.id, v).then((ok) => { if (!ok) { x.enabled = !v; render(); } }); }} />
            </div>
          )) : <div className="t-sub">Roʻyxat boʻsh</div>}
        </div>
      ) : null}
    </Panel>
  );
}
