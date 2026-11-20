// Umumiy: salomatlik, asosiy koʻrsatkichlar, telemetriya qatori, 24 soatlik grafik, tezkor amallar, hodisalar.
import { S, render } from "../core/store";
import { fmtB, fmtDur, fmtRate, fmtUptime, heatColor, num, pctCls, r0, shortCpu, shortGpu } from "../core/format";
import { Panel, SectionHeader, Segmented, Meter, Tag } from "../ui/kit";
import { LineChart } from "../ui/charts";
import { EventsCard, HealthRing, MetricCard, QuickActions, SourceNote, Waiting } from "./common";

const METRICS: [string, string, string][] = [
  ["cpu_temp", "CPU °C", "var(--c-cpu)"], ["gpu_temp", "GPU °C", "var(--c-gpu)"], ["cpu_load", "CPU %", "var(--c-cpu)"], ["ram", "RAM %", "var(--c-ram)"], ["power", "Vatt", "var(--c-power)"],
];

export function Overview() {
  const L = S.live;
  if (!L || !S.online) return <Waiting />;
  const h = S.health || { score: 0, level: "ok", items: [], summary: "" };
  const parts = String(h.summary || "").split(". ");
  const lead = (parts[0] || "").replace(/\.$/, "") + ".";
  const rest = parts.slice(1).join(". ");
  const probs = (h.items || []).filter((i: { level: string }) => i.level === "warn" || i.level === "crit");
  const goods = (h.items || []).filter((i: { level: string }) => i.level === "ok" || i.level === "info");
  const cpu = L.cpu || {}, g = (L.gpus || [])[0], ram = L.ram || {};
  const vols = L.volumes || [];
  const sysVol = vols.find((v: { mount: string }) => /^c:/i.test(v.mount)) || vols[0];
  const ut = L.usage_today || {}, top = (ut.top || [])[0];
  const net = L.net || {}, pw = L.power || {};
  const M = S.metrics, k = S.sub.metric, mdef = METRICS.find((m) => m[0] === k) || METRICS[0];

  return (
    <>
      <SourceNote />

      <Panel tone="hero" className="health" aria-labelledby="health-h">
        <div className="health-grid">
          <HealthRing score={h.score} level={h.level} />
          <div className="health-text">
            <h2 className="t-h1" id="health-h">{lead}</h2>
            {rest ? <p className="health-lead">{rest}</p> : null}
          </div>
        </div>
        {probs.length ? (
          <ul className="issues">
            {probs.map((i: { title: string; detail?: string; tip?: string; level: string }, n: number) => (
              <li key={n} className={i.level}>
                <span className="issue-mark" aria-hidden="true" />
                <div><b>{i.title}</b>{i.detail ? <span className="t-sub"> {i.detail}</span> : null}{i.tip ? <div className="t-sub issue-tip">{i.tip}</div> : null}</div>
              </li>
            ))}
          </ul>
        ) : null}
        {goods.length ? <div className="chips">{goods.map((i: { title: string; tip?: string; detail?: string; level: string }, n: number) => <Tag key={n} level={i.level} title={i.tip || i.detail || ""}>{i.title}</Tag>)}</div> : null}
      </Panel>

      <div className="grid c4">
        <MetricCard href="#/system" icon="chip" label="Protsessor" meta={shortCpu(cpu.name)} value={cpu.load} unit="%" color="var(--c-cpu)" spark={S.hist.cpu}
          sub={<>{num(cpu.temp) ? <span style={{ color: heatColor(cpu.temp) }}>{r0(cpu.temp)}°C</span> : null}{num(cpu.clock) ? <span>{(cpu.clock / 1000).toFixed(2)} GHz</span> : null}</>} />
        {g ? (
          <MetricCard href="#/system" icon="gpu" label="Videokarta" meta={shortGpu(g.name)} value={g.load} unit="%" color="var(--c-gpu)" spark={S.hist.gpu}
            sub={<>{num(g.temp) ? <span style={{ color: heatColor(g.temp) }}>{r0(g.temp)}°C</span> : null}{num(g.mem_used) && num(g.mem_total) ? <span>VRAM {(g.mem_used / 1024).toFixed(1)}/{(g.mem_total / 1024).toFixed(0)} GB</span> : null}</>} />
        ) : <MetricCard href="#/system" icon="gpu" label="Videokarta" value={null} color="var(--c-gpu)" spark={[]} sub={<span>Maʼlumot yoʻq</span>} />}
        <MetricCard href="#/procs" icon="memory" label="Operativ xotira" meta={fmtB(ram.total)} value={ram.percent} unit="%" color="var(--c-ram)" spark={S.hist.ram}
          sub={<><span>{fmtB(ram.used)} band</span><span>{fmtB(ram.avail)} boʻsh</span></>} />
        {sysVol ? (
          <MetricCard href="#/system" icon="disk" label={`Disk ${String(sysVol.mount).replace(/[\\/]$/, "")}`} meta={fmtB(sysVol.total)} value={100 - sysVol.percent} unit="% boʻsh" color="var(--c-net)"
            sub={<span>{fmtB(sysVol.free)} boʻsh joy</span>}
            foot={<Meter pct={sysVol.percent} color={pctCls(sysVol.percent, 85, 95) === "crit" ? "var(--crit)" : pctCls(sysVol.percent, 85, 95) === "warn" ? "var(--warn)" : "var(--c-net)"} label="Disk bandligi" />} />
        ) : null}
      </div>

      <Panel tone="flush" className="strip" style={{ ["--n" as string]: 4 }}>
        <div><span className="t-label">Tarmoq</span><span className="v t-num">↓ {fmtRate(net.down_bps)}</span><span className="t-sub">↑ {fmtRate(net.up_bps)}{num(net.ping_ms) ? ` · ping ${net.ping_ms} ms` : ""}</span></div>
        <div><span className="t-label">Quvvat</span><span className="v t-num">{num(pw.est) ? `${pw.est} W` : "—"}</span><span className="t-sub">{num(pw.est) ? `CPU ${r0(pw.cpu)} W · GPU ${r0(pw.gpu)} W` : "Sensor ulanmagan"}</span></div>
        <div><span className="t-label">Bugungi ekran vaqti</span><span className="v">{fmtDur(ut.total, true)}</span><span className="t-sub ellipsis">{top ? `Eng koʻp: ${top.name}` : "Hali faollik yoʻq"}</span></div>
        <div><span className="t-label">Ishlash vaqti</span><span className="v">{fmtUptime(L.uptime)}</span><span className="t-sub ellipsis">{L.fg ? `Hozir: ${L.fg.name}` : L.locked ? "Ekran qulflangan" : " "}</span></div>
      </Panel>

      <div className="grid split">
        <Panel>
          <SectionHeader title="Oxirgi 24 soat" right={
            <Segmented label="Grafik" value={k} options={METRICS.map(([v, t]) => [v, t] as [string, string])} onChange={(v) => { S.sub.metric = v; render(); }} />
          } />
          {M ? <LineChart ts={M.ts} vals={M[k] || []} max={k === "cpu_load" || k === "ram" ? 100 : undefined} unit={mdef[1]} color={mdef[2]} label={`${mdef[1]} — oxirgi 24 soat`} />
            : <div className="t-sub" style={{ padding: "48px 0", textAlign: "center" }}>Yuklanmoqda…</div>}
        </Panel>
        <Panel>
          <SectionHeader title="Tezkor amallar" />
          <QuickActions />
        </Panel>
      </div>

      <EventsCard n={6} />
    </>
  );
}
