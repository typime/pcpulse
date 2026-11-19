// PC Pulse: push navbatini yuboradi. pg_net trigger (navbatga yozilganda) va pg_cron chaqiradi.
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { sendWebPush, Vapid } from "./webpush.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });
let cfg: Record<string, string> | null = null;
let vapid: Vapid | null = null;

async function load() {
  if (!cfg) {
    const rows = await sql`select key, value from pp.config`;
    cfg = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  }
  if (!vapid) vapid = await Vapid.fromJwk(JSON.parse(cfg!.vapid_private_jwk), cfg!.vapid_public, cfg!.vapid_sub || "mailto:admin@pcpulse.app");
}

Deno.serve(async (req) => {
  try {
    await load();
    if (!cfg!.cron_secret || req.headers.get("x-pp-secret") !== cfg!.cron_secret) return new Response("forbidden", { status: 403 });
    let sent = 0, failed = 0, gone = 0;
    for (let round = 0; round < 5; round++) {
      const rows = await sql`select * from pp_private.queue_take(100)`;
      if (!rows.length) break;
      for (const row of rows) {
        const subs = await sql`select id, endpoint, p256dh, auth from pp.push_subs where user_id = ${row.user_id}`;
        await Promise.all(subs.map(async (s: { id: number; endpoint: string; p256dh: string; auth: string }) => {
          try {
            const st = await sendWebPush(vapid!, s, row.payload, row.urgency || "normal");
            if (st === 404 || st === 410) { gone++; await sql`delete from pp.push_subs where id = ${s.id}`; }
            else if (st >= 200 && st < 300) sent++;
            else failed++;
          } catch (e) { failed++; console.error("push error", e); }
        }));
      }
    }
    return Response.json({ ok: true, sent, failed, gone });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
