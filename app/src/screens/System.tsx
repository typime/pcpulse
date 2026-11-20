// Tizim: komponentlar (CPU, GPU, RAM, disklar, ona plata, OS), fanlar boshqaruvi, quvvat va PSU kuchlanishlari.
import type { CSSProperties, ReactNode } from "react";
import { S, render, type Json } from "../core/store";
import { clamp, fmtB, fmtRate, fmtUptime, heatColor, num, pctCls, r0 } from "../core/format";
import * as A from "../core/actions";
import { Icon } from "../ui/icons";
import { AnimatedNumber, Button, Dot, Empty, Kv, Meter, Note, Panel, SectionHeader, Segmented, Select, Tag } from "../ui/kit";
import { SourceNote, Waiting } from "./common";

const tone = (p: unknown, w: number, c: number, base: string) => { const k = pctCls(p, w, c); return k === "crit" ? "var(--crit)" : k === "warn" ? "var(--warn)" : base; };
const rows = (r: [ReactNode, ReactNode][]) => r.filter((x) => x[1] !== undefined && x[1] !== null && x[1] !== "");

export function SystemScreen() {
  const k = S.sub.system;
  const seg = <Segmented label="Tizim boʻlimi" value={k} options={[["comp", "Komponentlar"], ["fans", "Fanlar"], ["power", "Quvvat va kuchlanish"]]} onChange={(v) => { S.sub.system = v; render(); }} />;
  if (!S.live) return <>{seg}<Waiting /></>;
  return <>{seg}<SourceNote />{k === "fans" ? <Fans /> : k === "power" ? <Power /> : <Components />}</>;
}

function TempBadge({ t }: { t: unknown }) {
  if (!num(t)) return null;
  return <span className="temp t-num" style={{ color: heatColor(t) }}><Icon name="thermo" size={18} /><AnimatedNumber value={t} />°C</span>;
}

// ================================================================ komponentlar
function Components() {
  const L = S.live, si = S.sysinfo || {}, cpu = L.cpu || {}, ram = L.ram || {};
  const cores: number[] = cpu.cores || [];
  const maxCore = Math.max(100, ...cores);
  const mods: Json[] = si.ram_modules || [];
  const phys: Json[] = si.physical_disks || [];
  const mb = L.mb || {}, b = si.board || {}, bios = si.bios || {}, net = si.net || {};
  return (
    <>
      <div className="grid c2">
        <Panel className="hw">
          <div className="hw-head">
            <div className="hw-ico" style={{ ["--c" as string]: "var(--c-cpu)" } as CSSProperties}><Icon name="chip" /></div>
            <div className="grow"><h2 className="t-h3">Protsessor</h2><div className="t-sub ellipsis">{cpu.name || (si.cpu || {}).name || ""}</div></div>
            <TempBadge t={cpu.temp} />
          </div>
          <div className="hw-big"><span className="t-display t-num"><AnimatedNumber value={cpu.load} /><span className="t-unit">%</span></span><span className="t-sub">yuklama</span></div>
          <div className="cores" title="Har bir yadro yuklamasi" style={{ gridTemplateColumns: `repeat(${Math.max(1, cores.length)}, minmax(0, 1fr))` }}>
            {cores.map((c, i) => <i key={i} style={{ height: `${clamp((c / maxCore) * 100, 4, 100)}%` }} />)}
          </div>
          <Kv rows={rows([["Chastota", num(cpu.clock) ? `${(cpu.clock / 1000).toFixed(2)} GHz` : null], ["Quvvat", num(cpu.power) ? `${r0(cpu.power)} W` : null],
            ["Yadrolar / oqimlar", `${cpu.phys || (si.cpu || {}).cores || "?"} / ${cpu.threads || "?"}`], ["Soket", (si.cpu || {}).socket]])} />
        </Panel>
        {(L.gpus || []).length ? (L.gpus as Json[]).map((g, i) => (
          <Panel className="hw" key={i}>
            <div className="hw-head">
              <div className="hw-ico" style={{ ["--c" as string]: "var(--c-gpu)" } as CSSProperties}><Icon name="gpu" /></div>
              <div className="grow"><h2 className="t-h3">Videokarta{L.gpus.length > 1 ? ` ${i + 1}` : ""}</h2><div className="t-sub ellipsis">{g.name}</div></div>
              <TempBadge t={g.temp} />
            </div>
            <div className="hw-big"><span className="t-display t-num"><AnimatedNumber value={g.load} /><span className="t-unit">%</span></span><span className="t-sub">yuklama</span></div>
            {num(g.mem_used) && num(g.mem_total) ? (
              <div className="stack s2">
                <div className="row between t-sub"><span>VRAM</span><span className="t-num">{(g.mem_used / 1024).toFixed(1)} / {(g.mem_total / 1024).toFixed(1)} GB</span></div>
                <Meter pct={(g.mem_used / g.mem_total) * 100} color="var(--c-gpu)" label="VRAM" />
              </div>
            ) : null}
            <Kv rows={rows([["Hot spot", num(g.hotspot) ? `${r0(g.hotspot)}°C` : null], ["Xotira harorati", num(g.mem_temp) ? `${r0(g.mem_temp)}°C` : null],
              ["Quvvat", num(g.power) ? `${r0(g.power)} W` : null], ["Chastota", num(g.clock) ? `${r0(g.clock)} MHz` : null],
              ["Fan", num(g.fan_rpm) ? `${r0(g.fan_rpm)} RPM${num(g.fan_pct) ? ` (${r0(g.fan_pct)}%)` : ""}` : num(g.fan_pct) ? `${r0(g.fan_pct)}%` : null]])} />
          </Panel>
        )) : (si.gpus || []).length ? (
          <Panel className="hw">
            <div className="hw-head"><div className="hw-ico" style={{ ["--c" as string]: "var(--c-gpu)" } as CSSProperties}><Icon name="gpu" /></div><h2 className="t-h3">Videokarta</h2></div>
            {(si.gpus as Json[]).map((g, i) => <div key={i}><div>{g.name}</div><div className="t-sub">Drayver {g.driver || ""}</div></div>)}
          </Panel>
        ) : null}
      </div>

      <div className="grid c2">
        <Panel className="hw">
          <div className="hw-head">
            <div className="hw-ico" style={{ ["--c" as string]: "var(--c-ram)" } as CSSProperties}><Icon name="memory" /></div>
            <div className="grow"><h2 className="t-h3">Operativ xotira</h2><div className="t-sub">{fmtB(ram.used)} / {fmtB(ram.total)} band</div></div>
            <span className="temp t-num"><AnimatedNumber value={ram.percent} />%</span>
          </div>
          <Meter pct={ram.percent} thick color={tone(ram.percent, 80, 92, "var(--c-ram)")} label="RAM bandligi" />
          {num(ram.swap_total) && ram.swap_total ? <div className="row between t-sub"><span>Pagefile (swap)</span><span className="t-num">{fmtB(ram.swap_used)} / {fmtB(ram.swap_total)}</span></div> : null}
          {mods.length ? (
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>Slot</th><th>Hajm</th><th>Tezlik</th><th>Model</th></tr></thead>
              <tbody>{mods.map((m, i) => <tr key={i}><td>{m.slot || ""}</td><td className="t-num">{fmtB(m.capacity)}</td><td className="t-num">{m.speed ? `${m.speed} MT/s` : ""}</td><td className="t-sub">{[m.manufacturer, m.part].filter(Boolean).join(" ")}</td></tr>)}</tbody>
            </table></div>
          ) : null}
        </Panel>

        <Panel className="hw">
          <div className="hw-head">
            <div className="hw-ico" style={{ ["--c" as string]: "var(--c-net)" } as CSSProperties}><Icon name="disk" /></div>
            <div className="grow"><h2 className="t-h3">Disklar</h2><div className="t-sub t-num">Oʻqish {fmtRate((L.io || {}).read_bps)} · Yozish {fmtRate((L.io || {}).write_bps)}</div></div>
          </div>
          <div className="list">
            {(L.disks || []).length ? (L.disks as Json[]).map((d) => {
              const p = phys.find((x) => x.name === d.name) || {};
              const meta = [p.media, p.bus, p.size ? fmtB(p.size) : null, num(d.written_gb) ? `yozilgan ${(d.written_gb / 1024).toFixed(1)} TB` : null].filter(Boolean).join(" · ");
              return (
                <div className="li" key={d.name}>
                  <div className="av"><Icon name="disk" /></div>
                  <div style={{ minWidth: 0 }}><div className="t">{d.name}</div><div className="s">{meta}</div></div>
                  <div className="r">
                    {num(d.life) ? <Tag level={d.life < 10 ? "crit" : d.life < 30 ? "warn" : "ok"}>resurs {r0(d.life)}%</Tag> : null}
                    {num(d.temp) ? <b className="t-num" style={{ color: heatColor(d.temp + 18) }}>{r0(d.temp)}°C</b> : null}
                  </div>
                </div>
              );
            }) : phys.map((p) => (
              <div className="li" key={p.name}>
                <div className="av"><Icon name="disk" /></div>
                <div style={{ minWidth: 0 }}><div className="t">{p.name}</div><div className="s">{[p.media, p.bus, fmtB(p.size)].filter(Boolean).join(" · ")}</div></div>
                <div className="r"><Tag level={/healthy/i.test(p.health || "") ? "ok" : "warn"}>{p.health || "?"}</Tag></div>
              </div>
            ))}
          </div>
          <div className="stack">
            {(L.volumes || []).map((v: Json) => (
              <div key={v.mount} className="stack s2">
                <div className="row between"><b>{v.mount}</b><span className="t-sub t-num">{fmtB(v.free)} boʻsh / {fmtB(v.total)}</span></div>
                <Meter pct={v.percent} color={tone(v.percent, 85, 95, "var(--c-net)")} label={`${v.mount} bandligi`} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid c2">
        <Panel>
          <SectionHeader title="Ona plata" sub={b.product || mb.name || undefined} />
          <Kv rows={rows([["Ishlab chiqaruvchi", b.manufacturer], ["Model", b.product || mb.name], ["Versiya", b.version],
            ["BIOS", [bios.vendor, bios.version].filter(Boolean).join(" ")], ["BIOS sanasi", bios.date], ["Sensor chipi", mb.chip],
            ...((mb.temps || []) as Json[]).map((t) => [t.name, <span key={t.name} className="t-num" style={{ color: heatColor(t.value) }}>{r0(t.value)}°C</span>] as [ReactNode, ReactNode])])} />
        </Panel>
        <Panel>
          <SectionHeader title="Tizim" sub={si.os || undefined} />
          <Kv rows={rows([["Operatsion tizim", si.os], ["Versiya", si.os_ver], ["Kompyuter nomi", si.hostname || L.host],
            ["Kompyuter", [(si.computer || {}).manufacturer, (si.computer || {}).model].filter(Boolean).join(" ")],
            ["Ishlash vaqti", fmtUptime(L.uptime)], ["IP manzil", net.ip], ["MAC (Wake-on-LAN)", net.mac ? <span className="mono">{net.mac}</span> : null],
            ["Tarmoq", net.iface ? `${net.iface}${net.wifi ? " (Wi-Fi)" : ""}` : ""],
            ["Antivirus", si.defender ? (si.defender.rt ? "Defender yoniq" : "Defender real vaqt himoyasi oʻchiq") : null],
            ["Batareya", L.battery ? `${L.battery.percent}%${L.battery.plugged ? ", zaryadda" : ""}` : null],
            ["Agent", `${L.agent || ""}${(L.update || {}).available ? ` (yangi: ${L.update.latest})` : ""} · sensorlar: ${L.source}${(L.caps || {}).admin ? "" : " · admin emas"}`]])} />
          <div className="row" style={{ marginTop: 16 }}>
            <Button size="s" icon="list" busy={S.busy.sensors} onClick={A.sensorsAll}>Barcha sensorlar</Button>
            {(L.caps || {}).self_update && S.online ? <Button size="s" variant="ghost" icon="refresh" busy={S.busy.update_agent} onClick={A.updateAgent}>Yangilanishni tekshirish</Button> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

// ================================================================ fanlar
const PRESETS: [string, string][] = [["silent", "Sokin"], ["balanced", "Muvozanat"], ["performance", "Unumdor"], ["max", "Maksimal"]];
const commitTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function FanCard({ f }: { f: Json }) {
  const L = S.live, st = (S.dev && S.dev.settings) || {}, rules = st.fans || {};
  const caps = L.caps || {};
  const cid: string = f.control_id, r = (cid && rules[cid]) || {}, mode: string = r.mode || "auto";
  const draft = S.form.fanDraft[cid];
  const val: number = draft !== undefined ? draft : num(r.value) ? r.value : num(f.pct) ? Math.round(f.pct) : 50;
  const can = caps.fans && cid;
  const minP = Number(st.fan_min_pct ?? 20);
  const p = (((val - minP) / Math.max(1, 100 - minP)) * 100).toFixed(1) + "%";
  const onSlide = (v: number) => {
    S.form.fanDraft[cid] = v; render();
    clearTimeout(commitTimers[cid]);
    commitTimers[cid] = setTimeout(() => A.fanValue(cid, v), 450);
  };
  return (
    <Panel className="fan">
      <div className="fan-head">
        <div className="hw-ico" style={{ ["--c" as string]: f.hw === "gpu" ? "var(--c-gpu)" : "var(--c-cpu)" } as CSSProperties}><Icon name="fan" /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row tight nowrap"><b className="ellipsis">{f.name}</b>
            <Button size="s" variant="ghost" label="Nomini oʻzgartirish" title="Nomini oʻzgartirish" onClick={() => A.fanRename(cid || f.id, f.name)}>tahrirlash</Button></div>
          <div className="t-sub ellipsis">{f.hw === "gpu" ? "Videokarta" : "Ona plata"}{f.raw_name && f.raw_name !== f.name ? ` · ${f.raw_name}` : ""}</div>
        </div>
        <div className="fan-rpm">
          <div className="t-display t-num"><AnimatedNumber value={f.rpm} /><span className="t-unit">RPM</span></div>
          <div className="t-sub t-num">{num(f.pct) ? `quvvat ${r0(f.pct)}%` : ""}{num(f.target) ? ` → ${f.target}%` : ""}</div>
        </div>
      </div>
      {can ? (
        <div className="stack">
          <Segmented label="Fan rejimi" value={mode} options={[["auto", "Avto (BIOS)"], ["manual", "Qoʻlda"], ["curve", "Harorat boʻyicha"]]}
            onChange={(m) => A.fanMode(cid, m, Math.round(clamp(num(f.pct) ? f.pct : 50, minP, 100)))} />
          {mode === "manual" ? (
            <div className="row nowrap">
              <input className="range" type="range" min={minP} max={100} step={1} value={val} style={{ ["--p" as string]: p } as CSSProperties}
                aria-label="Fan tezligi" onChange={(e) => onSlide(Number(e.target.value))} />
              <b className="t-num" style={{ minWidth: 48, textAlign: "right" }}>{val}%</b>
            </div>
          ) : null}
          {mode === "curve" ? (
            <div className="row">
              <Select label="Profil" value={r.preset || "balanced"} options={PRESETS} onChange={(v) => A.fanPreset(cid, v)} />
              <Select label="Harorat manbasi" value={r.source || (f.hw === "gpu" ? "gpu" : "cpu")} options={[["cpu", "CPU harorati"], ["gpu", "GPU harorati"], ["max", "Eng issigʻi"]]} onChange={(v) => A.fanSource(cid, v)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function Fans() {
  const L = S.live, st = (S.dev && S.dev.settings) || {};
  const caps = L.caps || {};
  const fans: Json[] = L.fans || [];
  const live = fans.filter((f) => (f.rpm || 0) > 0 || f.hw === "gpu" || !num(f.rpm));
  const idle = fans.filter((f) => !live.includes(f));
  return (
    <>
      {!caps.fans && L.source !== "basic" ? <Note>Fan tezligini boshqarish uchun agent LibreHardwareMonitor DLL orqali, administrator huquqi bilan ishlashi kerak. Hozir faqat koʻrish mumkin.</Note> : null}
      {caps.fans ? <Note icon="shield">Xavfsizlik: CPU 90°C (GPU 88°C) dan oshsa, fan avtomatik 100% ga oʻtadi. Minimal tezlik: {st.fan_min_pct ?? 20}%. Agent toʻxtasa, fanlar BIOS boshqaruviga qaytariladi.</Note> : null}
      {live.length ? <div className="grid c2">{live.map((f) => <FanCard key={f.id} f={f} />)}</div>
        : <Panel><Empty icon="fan" title="Fanlar topilmadi"><p>Sensorlar fan maʼlumotini bermayapti.</p></Empty></Panel>}
      {idle.length ? (
        <details className="more">
          <summary><Icon name="chevR" size={16} />Ulanmagan yoki toʻxtagan fan ulagichlari ({idle.length})</summary>
          <div className="grid c2">{idle.map((f) => <FanCard key={f.id} f={f} />)}</div>
        </details>
      ) : null}
    </>
  );
}

// ================================================================ quvvat
function nominalV(name: string): number | null {
  const n = String(name).toLowerCase().replace(/\s/g, "");
  if (/vbat|cmos|battery/.test(n)) return 3.0;
  if (/12v/.test(n)) return 12;
  if (/(^|[^.\d])5v|5vsb/.test(n)) return 5;
  if (/3\.3v|3v3|3vcc|3vsb|avcc|\+3v/.test(n)) return 3.3;
  return null;
}

function Rail({ v }: { v: Json & { nom: number } }) {
  const dev = ((v.value - v.nom) / v.nom) * 100, a = Math.abs(dev);
  const lvl = v.nom === 3 ? (v.value < 2.5 ? "crit" : v.value < 2.75 ? "warn" : "ok") : a <= 5 ? "ok" : a <= 8 ? "warn" : a <= 25 ? "crit" : "info";
  const txt = { ok: "meʼyorida", warn: "chegarada", crit: "meʼyordan chetda", info: "sensor masshtabi notoʻgʻri boʻlishi mumkin" }[lvl];
  const pos = clamp(50 + dev * 5, 2, 98);
  return (
    <div className="rail">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row tight"><b>{v.name}</b><span className="t-sub">meʼyor {v.nom} V{v.nom === 3 ? ", CMOS batareya" : " ±5%"}</span></div>
        <div className="rail-scale" aria-hidden="true"><i style={{ left: `calc(${pos}% - 2px)` }} /></div>
        <div className="t-sub row tight"><Dot level={lvl} />{txt}{v.nom !== 3 ? ` · ${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%` : ""}</div>
      </div>
      <div className="rail-v t-display t-num">{v.value.toFixed(v.value < 10 ? 3 : 2)}<span className="t-unit">V</span></div>
    </div>
  );
}

function Power() {
  const L = S.live, pw = L.power || {}, psu = L.psu;
  const rails = ((L.voltages || []) as Json[]).map((v) => ({ ...v, nom: nominalV(v.name) }));
  const main = rails.filter((v) => v.nom).sort((a, b) => (b.nom as number) - (a.nom as number)) as (Json & { nom: number })[];
  const other = rails.filter((v) => !v.nom);
  return (
    <>
      <Panel tone="flush" className="strip" style={{ ["--n" as string]: 3 }}>
        <div><span className="t-label">Jami (taxminan)</span><span className="v big-v t-num"><AnimatedNumber value={pw.est} /><span className="t-unit">W</span></span><span className="t-sub">{psu && num(psu.power) ? "Raqamli PSU oʻlchovi" : "CPU + GPU + ~35 W qolgan qismlar"}</span></div>
        <div><span className="t-label">Protsessor</span><span className="v big-v t-num"><AnimatedNumber value={pw.cpu} /><span className="t-unit">W</span></span><span className="t-sub">Package quvvati</span></div>
        <div><span className="t-label">Videokarta</span><span className="v big-v t-num"><AnimatedNumber value={pw.gpu} /><span className="t-unit">W</span></span><span className="t-sub">Board/package quvvati</span></div>
      </Panel>
      <Panel>
        <SectionHeader title="Quvvat bloki (PSU) kuchlanishlari" sub="ATX standarti boʻyicha ±5% ruxsat etiladi" />
        {main.length ? <div className="list rails">{main.map((v) => <Rail key={v.id} v={v} />)}</div>
          : <p className="t-sub">Ona plata sensori +12V/+5V/+3.3V qiymatlarini bermayapti.{L.source === "basic" ? " LibreHardwareMonitor ulang." : ""}</p>}
        <p className="t-sub" style={{ marginTop: 14 }}>Baʼzi platalarda sensor “+12V” ni boshqa masshtabda oʻlchaydi — shubhali boʻlsa BIOS dagi qiymat bilan solishtiring.</p>
      </Panel>
      {psu ? (
        <Panel><SectionHeader title={psu.name} /><Kv rows={[["Chiqish quvvati", `${r0(psu.power)} W`], ["Harorat", `${r0(psu.temp)}°C`], ["Fan", `${r0(psu.fan_rpm)} RPM`]]} /></Panel>
      ) : null}
      {other.length ? (
        <Panel><SectionHeader title="Boshqa kuchlanishlar" />
          <table className="tbl"><tbody>{other.map((v) => <tr key={v.id}><td>{v.name}</td><td className="n t-num">{Number(v.value).toFixed(3)} V</td></tr>)}</tbody></table>
        </Panel>
      ) : null}
    </>
  );
}

