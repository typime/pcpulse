// Ekranlar uchun umumiy qismlar: SourceNote, PowerNote, WakeHelp, Waiting, EventsCard, QuickActions, MetricCard.
import type { CSSProperties, ReactNode } from "react";
import { S, device, type Json } from "../core/store";
import { CFG } from "../core/api";
import { fmtAgo, fmtCountdown, hhmm, num, r0 } from "../core/format";
import { activePower, WAKE_HINT_AFTER } from "../core/power";
import * as A from "../core/actions";
import { Icon, type IconName } from "../ui/icons";
import { AnimatedNumber, Button, Dot, Note, Panel, Ring, SectionHeader, cx, useNow } from "../ui/kit";
import { Sparkline } from "../ui/charts";

// ---------------------------------------------------------------- agent va drayver eslatmalari
function AgentNote() {
  const L = S.live;
  if (!L || !S.online) return null;
  const caps = L.caps || {}, up = L.update || {};
  if (caps.power && !caps.self_update) {
    return (
      <Note tone="warn">
        <div>Kompyuterdagi agent eski ({L.agent || "?"}) va oʻzini yangilay olmaydi{L.pawnio === false ? " — protsessor harorati, kuchlanish va fanlar shuning uchun koʻrinmayapti" : ""}.
          Yangi faylni <b>bir marta</b> yuklab, kompyuterda ishga tushiring va Windows soʻrasa “Ha” ni bosing — u eskisini oʻzi almashtiradi. Keyingi yangilanishlar avtomatik keladi.</div>
        <div className="row"><Button size="s" variant="pri" icon="download" href={CFG.exeUrl} target="_blank">Yangi PCPulseAgent.exe</Button></div>
      </Note>
    );
  }
  if (up.state === "downloading") return <Note>Agentning {up.latest || "yangi"} versiyasi yuklanmoqda{num(up.progress) ? ` — ${r0(up.progress)}%` : "…"}</Note>;
  if (up.state === "installing") return <Note>Agent {up.latest || ""} versiyaga yangilanmoqda — 20–40 soniyada qayta ulanadi.</Note>;
  if (up.available) {
    return (
      <Note>
        <div>Agentning yangi versiyasi bor: <b>{up.latest}</b> (hozir {L.agent}).</div>
        {up.error ? <div className="t-faint">{up.error}</div> : null}
        <div className="row"><Button size="s" variant="pri" icon="download" busy={S.busy.update_agent} onClick={A.updateAgent}>Hozir yangilash</Button></div>
      </Note>
    );
  }
  return null;
}
function PawnioNote() {
  const L = S.live;
  if (L && L.pawnio === false && L.source === "lhm") {
    const can = (L.caps || {}).pawnio_install && S.online;
    return (
      <Note tone="warn">
        <div>Protsessor harorati, PSU kuchlanishi va korpus fanlari koʻrinmayapti: kompyuterda bepul <b>PawnIO</b> drayveri yoʻq.{" "}
          {can ? "Tugmani bosing — agent drayverni oʻzi oʻrnatadi va qayta ishga tushadi (20–30 soniya)." : "Agentning yangi versiyasini oʻrnating yoki drayverni qoʻlda oʻrnating."}</div>
        <div className="row">
          {can ? <Button size="s" variant="pri" busy={S.busy.install_pawnio} onClick={A.installPawnio}>Drayverni oʻrnatish</Button> : <>
            <Button size="s" href={CFG.exeUrl} target="_blank" icon="download">Yangi PCPulseAgent.exe</Button>
            <Button size="s" variant="ghost" href="https://github.com/namazso/PawnIO.Setup/releases/latest" target="_blank" icon="external">PawnIO (qoʻlda)</Button>
          </>}
        </div>
      </Note>
    );
  }
  if (!L || L.source !== "basic") return null;
  return (
    <Note tone="warn">
      <div>Harorat, kuchlanish va fanlar koʻrinmayapti: sensorlar cheklangan rejimda. Agent administrator huquqisiz ishlayotgan boʻlishi mumkin — PCPulseAgent.exe ni qayta ishga tushirib, Windows ruxsat soʻraganda “Ha” ni bosing.</div>
      {L.lhm_error ? <div className="t-faint">{String(L.lhm_error).slice(0, 200)}</div> : null}
    </Note>
  );
}
export function SourceNote() {
  const L = S.live;
  const old = L && !(L.caps || {}).self_update && (L.caps || {}).power && S.online;
  if (old) return <AgentNote />;  // eski agent: bitta umumiy eslatma
  const a = <AgentNote />, p = <PawnioNote />;
  return <>{a}{p}</>;
}

// ---------------------------------------------------------------- quvvat holati
export function PowerNote({ id }: { id: string }) {
  useNow(1000);
  const p = activePower(id);
  if (!p) return null;
  const t = hhmm(p.at / 1000), el = (Date.now() - p.at) / 1000;
  const timer = <b className="t-num">{fmtCountdown(el)}</b>;
  if (p.kind === "wake") {
    if (el < WAKE_HINT_AFTER) return <Note icon="zap">Yoqish signali {t} da{p.via && p.via.length ? ` ${p.via.join(", ")} orqali` : ""} yuborildi. Kutilmoqda: {timer} — odatda 30–90 soniya.</Note>;
    return (
      <Note tone="warn">
        <div>Kompyuter hali yoqilmadi. Tekshiring: BIOS’da Wake-on-LAN (“Power On By PCI-E”) yoqilganmi, Windows’da “Tezkor ishga tushirish” (Fast startup) oʻchirilganmi, kompyuter kabel orqali ulangan va elektrdan uzilmaganmi.</div>
        <div className="row"><Button size="s" icon="zap" busy={S.busy.wake} onClick={A.wake}>Qayta yuborish</Button></div>
      </Note>
    );
  }
  if (p.kind === "restart") return <Note icon="restart">Kompyuter {t} da qayta yuklashga yuborildi — odatda 1–2 daqiqada qaytadi. Oʻtdi: {timer}</Note>;
  const what = { shutdown: "oʻchirildi", sleep: "uyqu rejimiga oʻtkazildi", hibernate: "gibernatsiyaga oʻtkazildi", logoff: "tizimdan chiqarildi" }[p.kind as string];
  return what ? <Note icon="power">Kompyuter {t} da siz tomoningizdan {what}.</Note> : null;
}
export function WakeHelp({ d }: { d: Json }) {
  const p = activePower(d.id);
  if (p && p.kind === "wake" && (Date.now() - p.at) / 1000 < WAKE_HINT_AFTER) return null;
  if (!d.mac) return <p className="t-sub">MAC manzil hali nomaʼlum — kompyuter agent bilan bir marta ulansin yoki uni Sozlamalarda kiriting.</p>;
  const relays = S.devices.filter((x) => x.id !== d.id && x.online).map((x) => x.name);
  return <p className="t-sub">{relays.length ? `Signalni ${relays.join(", ")} yuboradi — u shu kompyuter bilan bitta uy tarmogʻida boʻlishi kerak.` : "Yoqish signalini uy tarmogʻidagi yoniq boshqa qurilma (agent) yuboradi — hozir onlayn qurilma yoʻq."}</p>;
}

// ---------------------------------------------------------------- oflayn / kutish
export function Waiting({ detailed }: { detailed?: boolean }) {
  useNow(15000);
  const d = device() || ({} as Json);
  const ls = S.lastSeen || d.last_seen;
  return (
    <>
      <Panel tone="hero" className="offline">
        <div className="offline-grid">
          <div className="offline-ico"><Icon name={ls ? "power" : "monitor"} size={30} /></div>
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <h2 className="t-h1">{ls ? "Kompyuter oflayn" : "Maʼlumot kutilmoqda"}</h2>
              <p className="t-sub" style={{ marginTop: 6, fontSize: 15 }}>
                {ls ? (detailed ? <>Wake-on-LAN orqali masofadan yoqish mumkin{d.mac ? <> (MAC <span className="mono">{d.mac}</span>)</> : null}. Buning uchun BIOS va tarmoq kartasida WOL yoqilgan, kompyuter esa kabel orqali ulangan boʻlishi kerak.</>
                  : <>Oxirgi aloqa: {fmtAgo(ls)}. Kompyuter oʻchiq, uyquda yoki internetga ulanmagan.</>)
                  : "Agent hali maʼlumot yubormadi. Kompyuterda agent ishlayotganini tekshiring."}
              </p>
            </div>
            {ls ? <PowerNote id={d.id} /> : null}
            <div className="row">
              {ls ? <Button variant="pri" icon="zap" busy={S.busy.wake} disabled={!d.mac} onClick={A.wake}>Kompyuterni yoqish</Button> : null}
              {detailed ? <Button href="#/settings" icon="sliders">WOL sozlamalari</Button> : <Button href="#/control" icon="power">Boshqaruv</Button>}
            </div>
            {ls ? <WakeHelp d={d} /> : null}
          </div>
        </div>
      </Panel>
      <EventsCard n={detailed ? 8 : 6} />
    </>
  );
}

// ---------------------------------------------------------------- hodisalar
export function EventsCard({ n = 8 }: { n?: number }) {
  useNow(30000);
  const ev = (S.events || []).slice(0, n);
  if (!ev.length) return null;
  return (
    <Panel>
      <SectionHeader title="Soʻnggi hodisalar" />
      <ol className="timeline">
        {ev.map((e) => (
          <li key={e.id}>
            <Dot level={e.level === "ok" ? "ok" : e.level} />
            <div className="grow"><div className="tl-t">{e.title}</div>{e.body ? <div className="t-sub">{e.body}</div> : null}</div>
            <time className="t-faint">{fmtAgo(e.ts)}</time>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

// ---------------------------------------------------------------- amal plitkasi
export function ActionTile({ icon, title, sub, onClick, tone, busy, disabled }: {
  icon: IconName; title: string; sub: string; onClick: () => void; tone?: "danger" | "warn" | "violet"; busy?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" className={cx("act", tone, busy && "busy")} onClick={onClick} disabled={disabled} aria-busy={busy || undefined}>
      <span className="ico"><Icon name={icon} /></span>
      <span style={{ minWidth: 0 }}><b>{title}</b><small>{sub}</small></span>
    </button>
  );
}
export function QuickActions() {
  const caps = (S.live && S.live.caps) || {};
  const gs = ((S.live && S.live.guard) || {}).state || "off";
  return (
    <div className="acts two">
      <ActionTile icon="lock" title="Qulflash" sub="Ekranni hozir" onClick={A.lock} busy={S.busy.lock} disabled={!caps.lock} />
      {gs === "off" ? <ActionTile icon="shield" title="Qoʻriqlash" sub="Tegsa — qulflanadi" onClick={A.guardArm} busy={S.busy.guardArm} disabled={!caps.guard} tone="violet" />
        : <ActionTile icon="shield" title="Qoʻriqlash yoniq" sub="Oʻchirish uchun bosing" onClick={A.guardOff} busy={S.busy.guardOff} tone="warn" />}
      <ActionTile icon="moon" title="Uyqu" sub="Sleep rejimi" onClick={A.sleepPc} busy={S.busy.sleep} disabled={!caps.power} />
      <ActionTile icon="power" title="Oʻchirish" sub="Kompyuterni" onClick={A.shutdown} busy={S.busy.shutdown} disabled={!caps.power} tone="danger" />
    </div>
  );
}

// ---------------------------------------------------------------- amal qatori (Umumiy sahifa, pastki roʻyxat)
export function ActionRow({ icon, title, sub, onClick, tone, busy, disabled }: {
  icon: IconName; title: string; sub: string; onClick: () => void; tone?: "danger" | "warn" | "violet"; busy?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" className={cx("pnl arow", tone, busy && "busy")} onClick={onClick} disabled={disabled} aria-busy={busy || undefined}>
      <span className="arow-ico"><Icon name={icon} /></span>
      <span className="arow-t"><b>{title}</b><small>{sub}</small></span>
      <span className="arow-go" aria-hidden="true"><Icon name="chevR" size={16} /></span>
    </button>
  );
}
export function QuickRows() {
  const caps = (S.live && S.live.caps) || {};
  const gs = ((S.live && S.live.guard) || {}).state || "off";
  return (
    <div className="arows">
      <ActionRow icon="lock" title="Qulflash" sub="Ekranni hozir qulflaydi" onClick={A.lock} busy={S.busy.lock} disabled={!caps.lock} />
      {gs === "off" ? <ActionRow icon="shield" title="Qoʻriqlash" sub="Kimdir tegsa — ekran qulflanadi" onClick={A.guardArm} busy={S.busy.guardArm} disabled={!caps.guard} tone="violet" />
        : <ActionRow icon="shield" title="Qoʻriqlash yoniq" sub="Oʻchirish uchun bosing" onClick={A.guardOff} busy={S.busy.guardOff} tone="warn" />}
      <ActionRow icon="moon" title="Uyqu" sub="Kompyuterni uyqu rejimiga oʻtkazadi" onClick={A.sleepPc} busy={S.busy.sleep} disabled={!caps.power} />
      <ActionRow icon="power" title="Oʻchirish" sub="Tasdiqlagach 5 soniyada oʻchadi" onClick={A.shutdown} busy={S.busy.shutdown} disabled={!caps.power} tone="danger" />
    </div>
  );
}

// ---------------------------------------------------------------- MetricCard
export function MetricCard({ href, icon, label, meta, value, unit, sub, color, spark, foot }: {
  href: string; icon: IconName; label: string; meta?: string; value: unknown; unit?: string; sub?: ReactNode; color: string;
  spark?: (number | null | undefined)[]; foot?: ReactNode;
}) {
  return (
    <a className="pnl metric" href={href} style={{ ["--c" as string]: color } as CSSProperties}>
      <div className="metric-head"><span className="t-label"><Icon name={icon} />{label}</span>{meta ? <span className="meta" title={meta}>{meta}</span> : null}</div>
      <div className="metric-val t-display t-num"><AnimatedNumber value={value} />{unit ? <span className="t-unit">{unit}</span> : null}</div>
      <div className="metric-sub">{sub}</div>
      {foot ? <div className="metric-foot pad">{foot}</div> : <div className="metric-foot"><Sparkline values={spark || []} color={color} /></div>}
    </a>
  );
}

// ---------------------------------------------------------------- salomatlik halqasi
export function HealthRing({ score, level, size = 132 }: { score: unknown; level: string; size?: number }) {
  const color = level === "crit" ? "var(--crit)" : level === "warn" ? "var(--warn)" : "var(--ok)";
  return (
    <Ring pct={score} color={color} size={size} stroke={size > 100 ? 11 : 8} label={`Salomatlik bahosi: ${num(score) ? score : "—"}`}>
      <div><b style={{ fontSize: size * 0.3 }}><AnimatedNumber value={score} /></b><small>baho</small></div>
    </Ring>
  );
}
