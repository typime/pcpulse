// Umumiy: salomatlik shkalasi, toʻrtta apparat datchigi, tezkor amallar, salomatlik tafsilotlari,
// telemetriya qatori, 24 soatlik grafik va hodisalar.
import { S, render, type Json } from "../core/store";
import { fmtB, fmtDur, fmtRate, fmtUptime, num, r0, shortCpu, shortGpu } from "../core/format";
import { Panel, SectionHeader, Segmented, Tag } from "../ui/kit";
import { LineChart } from "../ui/charts";
import { ArcGauge, GaugeCard, HealthMeter, pctTone, tempTone } from "../ui/gauges";
import { EventsCard, QuickRows, SourceNote, Waiting } from "./common";

const METRICS: [string, string, string][] = [
  ["cpu_temp", "CPU °C", "var(--c-cpu)"], ["gpu_temp", "GPU °C", "var(--c-gpu)"], ["cpu_load", "CPU %", "var(--c-cpu)"], ["ram", "RAM %", "var(--c-ram)"], ["power", "Vatt", "var(--c-power)"],
];
const gb = (mb: number) => (mb / 1024).toFixed(mb >= 10240 ? 0 : 1).replace(/\.0$/, "");
const drive = (m: unknown) => String(m || "").replace(/[\\/]$/, "");
const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** Harorat boʻlsa — harorat datchigi, boʻlmasa — yuklama */
function heatGauge(name: string, temp: unknown, load: unknown) {
  return num(temp)
    ? <ArcGauge value={temp} unit="°C" label="Harorat" tone={tempTone(temp)} aria={`${name} harorati ${r0(temp)}°C`} />
    : <ArcGauge value={load} unit="%" label="Yuklama" tone={pctTone(load, 80, 95)} aria={`${name} yuklamasi ${r0(load)}%`} />;
}

export function Overview() {
  const L = S.live;
  if (!L || !S.online) return <Waiting />;
  const h = S.health || { score: null, level: "ok", items: [], summary: "", title: "" };
  const items: Json[] = h.items || [];
  const probs = items.filter((i) => i.level === "warn" || i.level === "crit");
  const goods = items.filter((i) => i.level === "ok" || i.level === "info");
  const cpu = L.cpu || {}, g = (L.gpus || [])[0], ram = L.ram || {};
  const vols: Json[] = L.volumes || [];
  const sysVol = vols.find((v) => /^c:/i.test(v.mount)) || vols[0];
  const others = vols.filter((v) => v !== sysVol).slice(0, 2);
  const phys: Json[] = (S.sysinfo || {}).physical_disks || [];
  const ut = L.usage_today || {}, top = (ut.top || [])[0];
  const net = L.net || {}, pw = L.power || {};
  const M = S.metrics, k = S.sub.metric, mdef = METRICS.find((m) => m[0] === k) || METRICS[0];
  const pill = h.title || (h.level === "crit" ? "Muammo bor" : h.level === "warn" ? "Eʼtibor bering" : "Yaxshi");

  return (
    <>
      <SourceNote />

      <div className="ov-top">
        <Panel className="hm-card"><HealthMeter score={h.score} level={h.level} title={pill} /></Panel>
        <div className="ov-gauges">
          <GaugeCard icon="chip" title="Protsessor" model={shortCpu(cpu.name) || "—"} href="#/system"
            stats={join([num(cpu.load) && `Yuklama ${r0(cpu.load)}%`, num(cpu.clock) && `${(cpu.clock / 1000).toFixed(2)} GHz`])}>
            {heatGauge("Protsessor", cpu.temp, cpu.load)}
          </GaugeCard>
          {g ? (
            <GaugeCard icon="gpu" title="Videokarta" model={shortGpu(g.name) || "—"} href="#/system"
              stats={join([num(g.load) && `Yuklama ${r0(g.load)}%`, num(g.mem_used) && num(g.mem_total) && `VRAM ${gb(g.mem_used)}/${gb(g.mem_total)} GB`])}>
              {heatGauge("Videokarta", g.temp, g.load)}
            </GaugeCard>
          ) : (
            <GaugeCard icon="gpu" title="Videokarta" model="Maʼlumot yoʻq" href="#/system">
              <ArcGauge value={null} label="Sensor yoʻq" tone="off" aria="Videokarta maʼlumoti yoʻq" />
            </GaugeCard>
          )}
          <GaugeCard icon="memory" title="Xotira" model={num(ram.total) ? `${fmtB(ram.total)} RAM` : "RAM"} href="#/procs" more="Jarayonlar"
            stats={num(ram.used) ? `${fmtB(ram.used)} band · ${fmtB(ram.avail)} boʻsh` : null}>
            <ArcGauge value={ram.percent} unit="%" label="Band" tone={pctTone(ram.percent)} aria={`Operativ xotira ${r0(ram.percent)}% band`} />
          </GaugeCard>
          {sysVol ? (
            <GaugeCard icon="disk" title={`Disk ${drive(sysVol.mount)}`} href="#/system"
              model={phys.length === 1 && phys[0].name ? phys[0].name : `${fmtB(sysVol.total)} · ${sysVol.fs || "disk"}`}
              stats={join([`${fmtB(sysVol.free)} boʻsh`, ...others.map((v) => `${drive(v.mount)} ${r0(v.percent)}%`)])}>
              <ArcGauge value={sysVol.percent} unit="%" label="Band" tone={pctTone(sysVol.percent, 85, 95)} aria={`Disk ${drive(sysVol.mount)} ${r0(sysVol.percent)}% band`} />
            </GaugeCard>
          ) : (
            <GaugeCard icon="disk" title="Disk" model="Maʼlumot yoʻq" href="#/system">
              <ArcGauge value={null} label="Maʼlumot yoʻq" tone="off" aria="Disk maʼlumoti yoʻq" />
            </GaugeCard>
          )}
        </div>
      </div>

      <QuickRows />

      {probs.length || goods.length ? (
        <Panel aria-labelledby="hd-h">
          <SectionHeader id="hd-h" title="Salomatlik tafsilotlari" sub={`${items.length} ta tekshiruv · baho ${num(h.score) ? h.score : "—"}/100`} />
          {probs.length ? (
            <ul className="issues">
              {probs.map((i, n) => (
                <li key={n} className={i.level}>
                  <span className="issue-mark" aria-hidden="true" />
                  <div><b>{i.title}</b>{i.detail ? <span className="t-sub"> {i.detail}</span> : null}{i.tip ? <div className="t-sub issue-tip">{i.tip}</div> : null}</div>
                </li>
              ))}
            </ul>
          ) : null}
          {goods.length ? <div className="chips">{goods.map((i, n) => <Tag key={n} level={i.level} title={i.tip || i.detail || ""}>{i.title}</Tag>)}</div> : null}
        </Panel>
      ) : null}

      <Panel tone="flush" className="strip" style={{ ["--n" as string]: 4 }}>
        <div><span className="t-label">Tarmoq</span><span className="v t-num">↓ {fmtRate(net.down_bps)}</span><span className="t-sub">↑ {fmtRate(net.up_bps)}{num(net.ping_ms) ? ` · ping ${net.ping_ms} ms` : ""}</span></div>
        <div><span className="t-label">Quvvat</span><span className="v t-num">{num(pw.est) ? `${pw.est} W` : "—"}</span><span className="t-sub">{num(pw.est) ? `CPU ${r0(pw.cpu)} W · GPU ${r0(pw.gpu)} W` : "Sensor ulanmagan"}</span></div>
        <div><span className="t-label">Bugungi ekran vaqti</span><span className="v">{fmtDur(ut.total, true)}</span><span className="t-sub ellipsis">{top ? `Eng koʻp: ${top.name}` : "Hali faollik yoʻq"}</span></div>
        <div><span className="t-label">Ishlash vaqti</span><span className="v">{fmtUptime(L.uptime)}</span><span className="t-sub ellipsis">{L.fg ? `Hozir: ${L.fg.name}` : L.locked ? "Ekran qulflangan" : " "}</span></div>
      </Panel>

      <div className={(S.events || []).length ? "grid ov-bottom" : "grid"}>
        <Panel>
          <SectionHeader title="Oxirgi 24 soat" right={
            <Segmented label="Grafik" value={k} options={METRICS.map(([v, t]) => [v, t] as [string, string])} onChange={(v) => { S.sub.metric = v; render(); }} />
          } />
          {M ? <LineChart ts={M.ts} vals={M[k] || []} max={k === "cpu_load" || k === "ram" ? 100 : undefined} unit={mdef[1]} color={mdef[2]} label={`${mdef[1]} — oxirgi 24 soat`} />
            : <div className="t-sub" style={{ padding: "48px 0", textAlign: "center" }}>Yuklanmoqda…</div>}
        </Panel>
        <EventsCard n={6} />
      </div>
    </>
  );
}
