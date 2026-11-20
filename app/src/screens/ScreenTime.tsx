// Ekran vaqti: kun tanlash, jami vaqt va oʻrtacha bilan solishtirish, kunlik grafik, ilovalar boʻyicha.
import type { CSSProperties } from "react";
import { S, type Json } from "../core/store";
import { dayLabel, fmtDur, initials, todayIso } from "../core/format";
import * as A from "../core/actions";
import { Button, Meter, Panel, SectionHeader, Segmented } from "../ui/kit";
import { UsageBars } from "../ui/charts";

const APP_COLORS = ["var(--c-cpu)", "var(--c-gpu)", "var(--c-gpu)", "var(--c-power)"];

export function ScreenTime() {
  const U = S.usage, d = U.data;
  const day = U.day, isToday = day === todayIso();
  const hist: Json[] = (U.history && U.history.days) || [];
  const prevDays = hist.filter((x) => x.day < day && x.seconds > 0).slice(-7);
  const avg = prevDays.length ? prevDays.reduce((a, x) => a + x.seconds, 0) / prevDays.length : 0;
  const total = d ? d.total : 0;
  const cmp = avg && d ? Math.round(((total - avg) / avg) * 100) : null;
  const maxApp = d && d.apps.length ? d.apps[0].seconds : 1;
  const idleMin = Math.round(((S.dev && S.dev.settings && S.dev.settings.idle_threshold_sec) || 180) / 60);
  return (
    <>
      <Panel tone="hero" className="usage-hero">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="stack s2">
            <span className="t-label">{dayLabel(day)}</span>
            <div className="t-display t-num usage-total">{d ? fmtDur(total) : "…"}</div>
            <div className="t-sub">
              {cmp === null ? "Kompyuter oldida oʻtkazilgan faol vaqt" : (
                <span className={cmp >= 0 ? "t-warn" : "t-ok"}>{cmp >= 0 ? "▲" : "▼"} Oxirgi {prevDays.length} kunlik oʻrtachadan {Math.abs(cmp)}% {cmp >= 0 ? "koʻp" : "kam"}</span>
              )}
            </div>
          </div>
          <div className="day-nav">
            <Button icon="chevL" label="Oldingi kun" onClick={() => A.dayShift(-1)} />
            <input className="in" type="date" value={day} max={todayIso()} aria-label="Sana" onChange={(e) => A.pickDay(e.target.value)} />
            <Button icon="chevR" label="Keyingi kun" disabled={isToday} onClick={() => A.dayShift(1)} />
            {isToday ? null : <Button size="s" variant="ghost" onClick={A.dayToday}>Bugun</Button>}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeader title="Kunlar kesimida" right={<Segmented label="Davr" value={S.sub.hist} options={[[7, "7 kun"], [14, "14 kun"], [30, "30 kun"]]} onChange={A.histDays} />} />
        <UsageBars days={hist} sel={day} onPick={A.pickDay} />
      </Panel>

      <Panel>
        <SectionHeader title="Ilovalar" sub={d && d.apps.length ? `${d.apps.length} ta ilova` : undefined} />
        {d && d.apps.length ? (
          <div className="list">
            {d.apps.map((a: Json, i: number) => (
              <div className="li" key={a.app} style={{ ["--c" as string]: APP_COLORS[Math.min(i, 3)] } as CSSProperties}>
                <div className="av">{initials(a.name)}</div>
                <div style={{ minWidth: 0 }}><div className="t">{a.name}</div><div style={{ marginTop: 8 }}><Meter pct={(a.seconds / maxApp) * 100} color={APP_COLORS[Math.min(i, 3)]} label={a.name} /></div></div>
                <div style={{ textAlign: "right" }}><div className="num t-num">{fmtDur(a.seconds, true)}</div><div className="t-sub t-num">{total ? Math.round((a.seconds / total) * 100) : 0}%</div></div>
              </div>
            ))}
          </div>
        ) : <div className="t-sub" style={{ padding: "10px 0" }}>{d ? "Bu kunda maʼlumot yoʻq." : "Yuklanmoqda…"}</div>}
        <p className="t-sub" style={{ marginTop: 14 }}>Faqat siz faol boʻlgan vaqt hisoblanadi: {idleMin} daqiqa harakatsizlikdan soʻng hisob toʻxtaydi (toʻliq ekrandagi video va oʻyinlar bundan mustasno).</p>
      </Panel>
    </>
  );
}
