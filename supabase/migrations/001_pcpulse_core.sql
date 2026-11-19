-- PC Pulse — Supabase backend (asosiy qism)
-- Jadvallar `pp` sxemasida (API orqali ochilmaydi). Ilova va agent faqat public.pp_* RPC funksiyalari orqali ishlaydi.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists pp;
create schema if not exists pp_private;
revoke all on schema pp, pp_private from public;

-- ======================================================================= jadvallar
create table if not exists pp.users (
  id bigint generated always as identity primary key,
  username text not null,
  pw_hash text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists users_username_lower on pp.users (lower(username));

create table if not exists pp.sessions (
  token_hash text primary key,
  user_id bigint not null references pp.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now()
);
create index if not exists sessions_user on pp.sessions(user_id);

create table if not exists pp.devices (
  id text primary key default substr(md5(gen_random_uuid()::text), 1, 12),
  user_id bigint not null references pp.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  mac text, broadcast text, wol_port int not null default 9, mac_manual bool not null default false,
  settings jsonb not null default '{}', settings_ver int not null default 1,
  sysinfo jsonb, live jsonb, health jsonb,
  online bool not null default false,
  last_seen timestamptz, offline_since timestamptz, view_until timestamptz,
  last_power_cmd text, last_power_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists devices_user on pp.devices(user_id);

create table if not exists pp.commands (
  id bigint generated always as identity primary key,
  device_id text not null references pp.devices(id) on delete cascade,
  cmd text not null,
  args jsonb not null default '{}',
  status text not null default 'pending',          -- pending | sent | done
  ok bool, result jsonb, error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists commands_dev_status on pp.commands(device_id, status);

create table if not exists pp.app_usage (
  device_id text not null references pp.devices(id) on delete cascade,
  day date not null, app text not null, name text, seconds int not null,
  primary key (device_id, day, app)
);

create table if not exists pp.metrics (
  device_id text not null references pp.devices(id) on delete cascade,
  ts timestamptz not null, n int not null default 1,
  cpu_load real, cpu_temp real, gpu_load real, gpu_temp real, ram real, power real,
  primary key (device_id, ts)
);

create table if not exists pp.events (
  id bigint generated always as identity primary key,
  user_id bigint not null references pp.users(id) on delete cascade,
  device_id text, ts timestamptz not null default now(),
  level text not null default 'info', title text not null, body text
);
create index if not exists events_user_ts on pp.events(user_id, ts desc);

create table if not exists pp.push_subs (
  id bigint generated always as identity primary key,
  user_id bigint not null references pp.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, label text,
  created_at timestamptz not null default now()
);

create table if not exists pp.push_queue (
  id bigint generated always as identity primary key,
  user_id bigint not null references pp.users(id) on delete cascade,
  payload jsonb not null, urgency text not null default 'normal',
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists push_queue_unsent on pp.push_queue(id) where sent_at is null;

create table if not exists pp.alert_state (
  device_id text not null references pp.devices(id) on delete cascade,
  key text not null, last_at timestamptz not null,
  primary key (device_id, key)
);
create table if not exists pp.digest_state (user_id bigint primary key references pp.users(id) on delete cascade, bucket bigint);
create table if not exists pp.login_attempts (key text not null, ts timestamptz not null default now());
create index if not exists login_attempts_key on pp.login_attempts(key, ts);
create table if not exists pp.config (key text primary key, value text);

-- RLS: hech kim toʻgʻridan-toʻgʻri oʻqiy olmasin (faqat SECURITY DEFINER funksiyalar)
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'pp' loop
    execute format('alter table pp.%I enable row level security', t);
    execute format('revoke all on pp.%I from public', t);
  end loop;
end $$;

-- ======================================================================= yordamchilar (pp_private)
create or replace function pp_private.th(p text) returns text language sql immutable
set search_path = pp_private, extensions, pg_temp as
$$ select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex') $$;

create or replace function pp_private.ep(t timestamptz) returns float8 language sql immutable as
$$ select extract(epoch from t)::float8 $$;

create or replace function pp_private.num(j jsonb) returns real language sql immutable as
$$ select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::real end $$;

create or replace function pp_private.hhmm(t timestamptz, tz int) returns text language sql stable as
$$ select to_char((t at time zone 'UTC') + make_interval(mins => coalesce(tz, 300)), 'HH24:MI') $$;

create or replace function pp_private.fmt_dur(sec numeric) returns text language sql immutable as
$$ select case when sec >= 3600 then floor(sec / 3600)::int || ' soat ' || floor(mod(sec, 3600) / 60)::int || ' daq'
               else floor(coalesce(sec, 0) / 60)::int || ' daq' end $$;

create or replace function pp_private.user_settings(s jsonb) returns jsonb language sql immutable as $$
  select d || (coalesce(s, '{}') - 'alerts') || jsonb_build_object('alerts', (d -> 'alerts') || coalesce(s -> 'alerts', '{}'))
  from (select '{"notify_enabled":true,"notify_interval":30,"quiet_enabled":false,"quiet_from":"23:00","quiet_to":"07:00","tz_offset":300,
                 "alerts":{"cpu_temp":90,"gpu_temp":87,"ram":93,"disk":95,"power_events":true,"critical":true}}'::jsonb as d) x
$$;

create or replace function pp_private.device_settings(s jsonb) returns jsonb language sql immutable as $$
  select '{"idle_lock_min":0,"idle_sleep_min":0,"idle_threshold_sec":180,"guard_grace_sec":10,"fan_min_pct":20,"fans":{}}'::jsonb || coalesce(s, '{}')
$$;

create or replace function pp_private.is_online(d pp.devices) returns bool language sql stable as
$$ select coalesce(d.online and d.last_seen > now() - interval '45 seconds', false) $$;

create or replace function pp_private.client_ip() returns text language plpgsql stable as $$
begin
  return coalesce(nullif(btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''), '?');
exception when others then return '?';
end $$;

create or replace function pp_private.rate_ok(p_key text, p_limit int, p_window interval) returns bool language sql stable
set search_path = pp, pg_temp as
$$ select count(*) < p_limit from pp.login_attempts where key = p_key and ts > now() - p_window $$;

create or replace function pp_private.public_user(u pp.users) returns jsonb language sql stable as
$$ select jsonb_build_object('id', u.id, 'username', u.username, 'settings', pp_private.user_settings(u.settings),
                             'created_at', pp_private.ep(u.created_at)) $$;

create or replace function pp_private.new_session(p_uid bigint) returns text language plpgsql
set search_path = pp, pp_private, extensions, pg_temp as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into pp.sessions(token_hash, user_id) values (pp_private.th(t), p_uid);
  return t;
end $$;

create or replace function pp_private.auth(p_token text) returns pp.users language plpgsql
set search_path = pp, pp_private, pg_temp as $$
declare u pp.users; h text := pp_private.th(p_token);
begin
  select usr.* into u from pp.sessions s join pp.users usr on usr.id = s.user_id where s.token_hash = h;
  if not found then raise exception using errcode = '28000', message = 'Sessiya tugagan — qayta kiring'; end if;
  update pp.sessions set last_used = now() where token_hash = h and last_used < now() - interval '1 hour';
  return u;
end $$;

create or replace function pp_private.dev_auth(p_token text) returns pp.devices language plpgsql
set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices;
begin
  select * into d from pp.devices where token_hash = pp_private.th(p_token);
  if not found then raise exception using errcode = '28000', message = 'Qurilma tokeni yaroqsiz — agentni qayta ulang'; end if;
  return d;
end $$;

create or replace function pp_private.own(p_uid bigint, p_dev text) returns pp.devices language plpgsql
set search_path = pp, pg_temp as $$
declare d pp.devices;
begin
  select * into d from pp.devices where id = p_dev and user_id = p_uid;
  if not found then raise exception 'Qurilma topilmadi'; end if;
  return d;
end $$;

create or replace function pp_private.device_public(d pp.devices) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'name', d.name, 'online', pp_private.is_online(d), 'last_seen', pp_private.ep(d.last_seen),
    'created_at', pp_private.ep(d.created_at), 'mac', d.mac, 'broadcast', d.broadcast, 'wol_port', d.wol_port, 'mac_manual', d.mac_manual,
    'summary', jsonb_build_object('cpu_load', d.live -> 'cpu' -> 'load', 'cpu_temp', d.live -> 'cpu' -> 'temp',
      'gpu_temp', d.live -> 'gpus' -> 0 -> 'temp', 'ram', d.live -> 'ram' -> 'percent',
      'score', d.health -> 'score', 'level', d.health -> 'level', 'host', d.live -> 'host'))
$$;

create or replace function pp_private.add_event(p_uid bigint, p_dev text, p_level text, p_title text, p_body text default null)
returns void language sql set search_path = pp, pg_temp as
$$ insert into pp.events(user_id, device_id, level, title, body) values (p_uid, p_dev, p_level, left(p_title, 200), left(p_body, 500)) $$;

create or replace function pp_private.enqueue_push(p_uid bigint, p_payload jsonb, p_urgency text default 'normal')
returns void language plpgsql set search_path = pp, pg_temp as $$
begin
  if p_payload is null then return; end if;
  if exists (select 1 from pp.push_subs where user_id = p_uid) then
    insert into pp.push_queue(user_id, payload, urgency) values (p_uid, p_payload, coalesce(p_urgency, 'normal'));
  end if;
end $$;

-- push navbatiga yozilganda edge funksiyani darhol uygʻotish (pg_net boʻlmasa — jim oʻtkazib yuboradi)
create or replace function pp_private.kick() returns void language plpgsql
set search_path = pp, pg_temp as $$
begin
  perform net.http_post(
    url := (select value from pp.config where key = 'push_url'),
    body := '{"drain":true}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-pp-secret', (select value from pp.config where key = 'cron_secret')),
    timeout_milliseconds := 15000);
exception when others then null;
end $$;

create or replace function pp_private.on_push_queue() returns trigger language plpgsql as $$
begin perform pp_private.kick(); return null; end $$;

drop trigger if exists push_queue_kick on pp.push_queue;
create trigger push_queue_kick after insert on pp.push_queue for each statement execute function pp_private.on_push_queue();

-- ======================================================================= AKKAUNT
create or replace function public.pp_register(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, extensions, pg_temp as $$
declare u pp.users; k text := 'reg:' || pp_private.client_ip();
begin
  if coalesce((select value from pp.config where key = 'allow_register'), '1') = '0' then
    return jsonb_build_object('error', 'Roʻyxatdan oʻtish oʻchirilgan'); end if;
  p_username := btrim(coalesce(p_username, ''));
  if p_username !~ '^[A-Za-z0-9_.-]{3,32}$' then return jsonb_build_object('error', 'Username 3–32 belgi: harflar, raqamlar, _ . -'); end if;
  if length(coalesce(p_password, '')) < 6 then return jsonb_build_object('error', 'Parol kamida 6 belgidan iborat boʻlsin'); end if;
  if not pp_private.rate_ok(k, 10, interval '1 hour') then return jsonb_build_object('error', 'Juda koʻp urinish. Keyinroq qayta urinib koʻring'); end if;
  insert into pp.login_attempts(key) values (k);
  if exists (select 1 from pp.users where lower(username) = lower(p_username)) then return jsonb_build_object('error', 'Bu username band'); end if;
  insert into pp.users(username, pw_hash) values (p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10))) returning * into u;
  return jsonb_build_object('token', pp_private.new_session(u.id), 'user', pp_private.public_user(u));
end $$;

create or replace function pp_private.check_login(p_username text, p_password text) returns pp.users language plpgsql
set search_path = pp, pp_private, extensions, pg_temp as $$
declare u pp.users; k text := 'login:' || lower(btrim(coalesce(p_username, '')));
begin
  if not pp_private.rate_ok(k, 10, interval '10 minutes') then
    raise exception using errcode = 'PP429', message = 'Juda koʻp notoʻgʻri urinish. 10 daqiqadan soʻng qayta urinib koʻring'; end if;
  select * into u from pp.users where lower(username) = lower(btrim(coalesce(p_username, '')));
  if not found or u.pw_hash <> extensions.crypt(coalesce(p_password, ''), u.pw_hash) then
    insert into pp.login_attempts(key) values (k);
    return null;
  end if;
  delete from pp.login_attempts where key = k;
  return u;
end $$;

create or replace function public.pp_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users;
begin
  begin
    u := pp_private.check_login(p_username, p_password);
  exception when sqlstate 'PP429' then return jsonb_build_object('error', sqlerrm);
  end;
  if u.id is null then return jsonb_build_object('error', 'Username yoki parol notoʻgʻri'); end if;
  return jsonb_build_object('token', pp_private.new_session(u.id), 'user', pp_private.public_user(u));
end $$;

create or replace function public.pp_me(p_token text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  return pp_private.public_user(u) || jsonb_build_object(
    'push_count', (select count(*) from pp.push_subs where user_id = u.id),
    'allow_register', coalesce((select value from pp.config where key = 'allow_register'), '1') <> '0',
    'server_version', '2.0.0');
end $$;

create or replace function public.pp_save_settings(p_token text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); cur jsonb; upd jsonb; new jsonb;
begin
  cur := pp_private.user_settings(u.settings);
  select coalesce(jsonb_object_agg(key, value), '{}') into upd from jsonb_each(coalesce(p_patch, '{}'))
    where key in ('notify_enabled', 'notify_interval', 'quiet_enabled', 'quiet_from', 'quiet_to', 'tz_offset', 'alerts');
  new := cur || (upd - 'alerts') || jsonb_build_object('alerts', (cur -> 'alerts') || coalesce(upd -> 'alerts', '{}'));
  new := jsonb_set(new, '{notify_interval}', to_jsonb(greatest(5, least(720, coalesce((new ->> 'notify_interval')::int, 30)))));
  update pp.users set settings = new where id = u.id;
  return jsonb_build_object('settings', new);
end $$;

create or replace function public.pp_change_password(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, extensions, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  if u.pw_hash <> extensions.crypt(coalesce(p_old, ''), u.pw_hash) then raise exception 'Joriy parol notoʻgʻri'; end if;
  if length(coalesce(p_new, '')) < 6 then raise exception 'Yangi parol kamida 6 belgi'; end if;
  update pp.users set pw_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = u.id;
  delete from pp.sessions where user_id = u.id;
  return jsonb_build_object('token', pp_private.new_session(u.id));
end $$;

create or replace function public.pp_logout(p_token text) returns jsonb
language sql security definer set search_path = pp, pp_private, pg_temp as
$$ delete from pp.sessions where token_hash = pp_private.th(p_token); select '{"ok":true}'::jsonb $$;

create or replace function public.pp_logout_all(p_token text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  delete from pp.sessions where user_id = u.id;
  return '{"ok":true}'::jsonb;
end $$;

-- ======================================================================= QURILMALAR
create or replace function public.pp_devices(p_token text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  return jsonb_build_object('devices', coalesce((select jsonb_agg(pp_private.device_public(d) order by d.created_at) from pp.devices d where d.user_id = u.id), '[]'));
end $$;

create or replace function public.pp_device(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
begin
  return pp_private.device_public(d) || jsonb_build_object('sysinfo', d.sysinfo, 'settings', pp_private.device_settings(d.settings));
end $$;

create or replace function public.pp_device_update(p_token text, p_device text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device); v_mac text;
begin
  if p_patch ? 'name' then
    update pp.devices set name = coalesce(nullif(left(btrim(p_patch ->> 'name'), 60), ''), name) where id = d.id;
  end if;
  if p_patch ?| array['mac', 'broadcast', 'wol_port'] then
    v_mac := nullif(btrim(coalesce(p_patch ->> 'mac', d.mac, '')), '');
    if v_mac is not null and v_mac !~ '^([0-9A-Fa-f]{2}[:-]?){5}[0-9A-Fa-f]{2}$' then raise exception 'MAC manzil formati: AA:BB:CC:DD:EE:FF'; end if;
    update pp.devices set mac = v_mac, broadcast = nullif(btrim(coalesce(p_patch ->> 'broadcast', d.broadcast, '')), ''),
      wol_port = coalesce((p_patch ->> 'wol_port')::int, wol_port), mac_manual = true where id = d.id;
  end if;
  return public.pp_device(p_token, p_device);
end $$;

create or replace function public.pp_device_delete(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
begin
  delete from pp.devices where id = d.id;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function public.pp_live(p_token text, p_device text, p_full bool default true) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
begin
  if d.view_until is null or d.view_until < now() + interval '20 seconds' then
    update pp.devices set view_until = now() + interval '30 seconds' where id = d.id;
  end if;
  return jsonb_build_object('type', 'live', 'online', pp_private.is_online(d), 'last_seen', pp_private.ep(d.last_seen),
    'data', d.live, 'health', d.health) || case when p_full then jsonb_build_object('sysinfo', d.sysinfo) else '{}'::jsonb end;
end $$;

create or replace function public.pp_device_settings(p_token text, p_device text, p_patch jsonb default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
        cur jsonb := pp_private.device_settings(d.settings); upd jsonb; fans jsonb; r record;
begin
  if p_patch is null then return jsonb_build_object('settings', cur); end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into upd from jsonb_each(p_patch)
    where key in ('idle_lock_min', 'idle_sleep_min', 'idle_threshold_sec', 'guard_grace_sec', 'fan_min_pct', 'fans');
  if jsonb_typeof(upd -> 'fans') = 'object' then
    fans := coalesce(cur -> 'fans', '{}');
    for r in select key, value from jsonb_each(upd -> 'fans') loop
      if jsonb_typeof(r.value) = 'null' then fans := fans - r.key; else fans := fans || jsonb_build_object(r.key, r.value); end if;
    end loop;
    upd := upd || jsonb_build_object('fans', fans);
  end if;
  cur := cur || upd;
  update pp.devices set settings = cur, settings_ver = settings_ver + 1 where id = d.id;
  return jsonb_build_object('settings', cur);
end $$;

create or replace function public.pp_command(p_token text, p_device text, p_cmd text, p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device); v_id bigint;
begin
  if p_cmd not in ('lock', 'logoff', 'sleep', 'hibernate', 'shutdown', 'restart', 'cancel_shutdown', 'guard_arm', 'guard_disarm',
                   'timer_set', 'timer_cancel', 'screenshot', 'message', 'media', 'kill', 'procs', 'sensors', 'startup_list',
                   'startup_toggle', 'cleanup_scan', 'cleanup_run') then
    raise exception 'Nomaʼlum buyruq'; end if;
  if not pp_private.is_online(d) then raise exception 'Qurilma oflayn'; end if;
  if p_cmd in ('shutdown', 'restart', 'sleep', 'hibernate', 'logoff') then
    update pp.devices set last_power_cmd = p_cmd, last_power_at = now() where id = d.id;
  end if;
  update pp.devices set view_until = now() + interval '30 seconds' where id = d.id;
  insert into pp.commands(device_id, cmd, args) values (d.id, p_cmd, coalesce(p_args, '{}')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.pp_command_result(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); c pp.commands;
begin
  select cm.* into c from pp.commands cm join pp.devices d on d.id = cm.device_id where cm.id = p_id and d.user_id = u.id;
  if not found then raise exception 'Buyruq topilmadi'; end if;
  if c.status <> 'done' then return jsonb_build_object('status', c.status); end if;
  return jsonb_build_object('status', 'done', 'ok', c.ok, 'result', c.result, 'error', c.error);
end $$;

create or replace function public.pp_wake(p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device); o pp.devices; names text[] := '{}';
begin
  if d.mac is null then raise exception 'MAC manzil nomaʼlum. Kompyuter kamida bir marta agent bilan ulanishi yoki MAC ni sozlamalarda kiritish kerak'; end if;
  for o in select * from pp.devices where user_id = u.id and id <> d.id loop
    if pp_private.is_online(o) then
      insert into pp.commands(device_id, cmd, args) values (o.id, 'wol', jsonb_build_object('mac', d.mac, 'broadcast', d.broadcast, 'port', d.wol_port));
      names := names || o.name;
    end if;
  end loop;
  if array_length(names, 1) is null then
    raise exception 'Uy tarmogʻida yoniq boshqa agent yoʻq. Yoqish signalini shu tarmoqdagi yoniq qurilma yuborishi kerak (README: Wake-on-LAN)';
  end if;
  perform pp_private.add_event(u.id, d.id, 'info', d.name || ': yoqish signali (Wake-on-LAN) yuborildi', 'Relay: ' || array_to_string(names, ', '));
  return jsonb_build_object('ok', true, 'sent_from', to_jsonb(names));
end $$;

-- ======================================================================= TARIX
create or replace function public.pp_usage(p_token text, p_device text, p_day text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device); v_day date;
begin
  v_day := coalesce(case when p_day ~ '^\d{4}-\d{2}-\d{2}$' then p_day::date end, (d.live ->> 'day')::date,
                    ((now() at time zone 'UTC') + make_interval(mins => (pp_private.user_settings(u.settings) ->> 'tz_offset')::int))::date);
  return (select jsonb_build_object('day', v_day, 'total', coalesce(sum(seconds), 0),
           'apps', coalesce(jsonb_agg(jsonb_build_object('app', app, 'name', name, 'seconds', seconds) order by seconds desc), '[]'))
          from pp.app_usage where device_id = d.id and day = v_day);
end $$;

create or replace function public.pp_usage_history(p_token text, p_device text, p_days int default 14, p_end text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
        v_end date; v_n int := greatest(1, least(366, coalesce(p_days, 14)));
begin
  v_end := coalesce(case when p_end ~ '^\d{4}-\d{2}-\d{2}$' then p_end::date end, current_date);
  return jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object('day', g::date, 'seconds', coalesce(s.total, 0)) order by g)
             from generate_series(v_end - (v_n - 1), v_end, interval '1 day') g
             left join (select day, sum(seconds) total from pp.app_usage where device_id = d.id group by day) s on s.day = g::date),
    'first_day', (select min(day) from pp.app_usage where device_id = d.id));
end $$;

create or replace function public.pp_metrics(p_token text, p_device text, p_hours int default 24) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
        h int := greatest(1, least(168, coalesce(p_hours, 24))); b int;
begin
  b := greatest(60, (h * 3600 / 240) / 60 * 60);
  return (with x as (
      select (floor(pp_private.ep(ts) / b) * b)::bigint t, avg(cpu_load) cl, max(cpu_temp) ct, avg(gpu_load) gl, max(gpu_temp) gt, avg(ram) r, avg(power) p
      from pp.metrics where device_id = d.id and ts > now() - make_interval(hours => h) group by 1)
    select jsonb_build_object('bucket', b, 'ts', coalesce(jsonb_agg(t order by t), '[]'),
      'cpu_load', coalesce(jsonb_agg(round(cl::numeric, 1) order by t), '[]'), 'cpu_temp', coalesce(jsonb_agg(round(ct::numeric, 1) order by t), '[]'),
      'gpu_load', coalesce(jsonb_agg(round(gl::numeric, 1) order by t), '[]'), 'gpu_temp', coalesce(jsonb_agg(round(gt::numeric, 1) order by t), '[]'),
      'ram', coalesce(jsonb_agg(round(r::numeric, 1) order by t), '[]'), 'power', coalesce(jsonb_agg(round(p::numeric, 1) order by t), '[]'))
    from x);
end $$;

create or replace function public.pp_events(p_token text, p_limit int default 30) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  return jsonb_build_object('events', coalesce((select jsonb_agg(x order by x.ts desc) from (
    select e.id, pp_private.ep(e.ts) ts, e.level, e.title, e.body, e.device_id, dv.name device_name
    from pp.events e left join pp.devices dv on dv.id = e.device_id
    where e.user_id = u.id order by e.ts desc limit greatest(1, least(200, coalesce(p_limit, 30)))) x), '[]'));
end $$;

-- ======================================================================= PUSH
create or replace function public.pp_push_key() returns jsonb
language sql security definer set search_path = pp, pg_temp as
$$ select jsonb_build_object('key', (select value from pp.config where key = 'vapid_public')) $$;

create or replace function public.pp_push_subscribe(p_token text, p_sub jsonb, p_label text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  if coalesce(p_sub ->> 'endpoint', '') !~ '^https://' or p_sub -> 'keys' ->> 'p256dh' is null or p_sub -> 'keys' ->> 'auth' is null then
    raise exception 'Obuna maʼlumoti notoʻgʻri'; end if;
  delete from pp.push_subs where endpoint = p_sub ->> 'endpoint';
  insert into pp.push_subs(user_id, endpoint, p256dh, auth, label)
    values (u.id, p_sub ->> 'endpoint', p_sub -> 'keys' ->> 'p256dh', p_sub -> 'keys' ->> 'auth', left(p_label, 80));
  return '{"ok":true}'::jsonb;
end $$;

create or replace function public.pp_push_unsubscribe(p_token text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token);
begin
  delete from pp.push_subs where endpoint = p_endpoint and user_id = u.id;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function public.pp_push_test(p_token text) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); n int;
begin
  select count(*) into n from pp.push_subs where user_id = u.id;
  if n = 0 then raise exception 'Faol obuna yoʻq. Avval shu qurilmada bildirishnomalarni yoqing'; end if;
  perform pp_private.enqueue_push(u.id, jsonb_build_object('title', 'PC Pulse', 'body', 'Test bildirishnoma ishlayapti ✅', 'tag', 'test'), 'high');
  return jsonb_build_object('ok', true, 'sent', n);
end $$;

-- ======================================================================= AGENT
create or replace function public.pp_agent_pair(p_username text, p_password text, p_name text, p_device_id text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, extensions, pg_temp as $$
declare u pp.users; d pp.devices; t text := 'dev_' || encode(extensions.gen_random_bytes(24), 'hex'); v_name text;
begin
  begin
    u := pp_private.check_login(p_username, p_password);
  exception when sqlstate 'PP429' then return jsonb_build_object('error', sqlerrm);
  end;
  if u.id is null then return jsonb_build_object('error', 'Username yoki parol notoʻgʻri'); end if;
  v_name := coalesce(nullif(left(btrim(coalesce(p_name, '')), 60), ''), 'Mening kompyuterim');
  select * into d from pp.devices where id = p_device_id and user_id = u.id;
  if found then
    update pp.devices set token_hash = pp_private.th(t), name = v_name where id = d.id;
  else
    insert into pp.devices(user_id, name, token_hash, settings) values (u.id, v_name, pp_private.th(t), pp_private.device_settings(null)) returning * into d;
    perform pp_private.add_event(u.id, d.id, 'info', 'Yangi qurilma ulandi: ' || v_name);
  end if;
  return jsonb_build_object('device_id', d.id, 'token', t, 'name', v_name);
end $$;

create or replace function public.pp_agent_telemetry(p_token text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices := pp_private.dev_auth(p_token); u pp.users; us jsonb; snap jsonb := p_body -> 'snapshot';
        hl jsonb := p_body -> 'health'; si jsonb := p_body -> 'sysinfo'; was bool; it jsonb; k text; res jsonb;
begin
  select * into u from pp.users where id = d.user_id;
  us := pp_private.user_settings(u.settings);

  if jsonb_typeof(si) = 'object' then
    update pp.devices set sysinfo = si,
      mac = case when not mac_manual and si -> 'net' ->> 'mac' is not null then si -> 'net' ->> 'mac' else mac end,
      broadcast = case when not mac_manual and si -> 'net' ->> 'mac' is not null then si -> 'net' ->> 'broadcast' else broadcast end
    where id = d.id;
  end if;

  if jsonb_typeof(p_body -> 'usage') = 'object' then
    insert into pp.app_usage(device_id, day, app, name, seconds)
    select d.id, dd.key::date, left(aa.key, 120), left(aa.value ->> 0, 120), greatest(0, (aa.value ->> 1)::numeric::int)
    from jsonb_each(p_body -> 'usage') dd, jsonb_each(case when jsonb_typeof(dd.value) = 'object' then dd.value else '{}' end) aa
    where dd.key ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_typeof(aa.value) = 'array'
    on conflict (device_id, day, app) do update set seconds = greatest(pp.app_usage.seconds, excluded.seconds), name = excluded.name;
  end if;

  if jsonb_typeof(snap) = 'object' then
    was := pp_private.is_online(d);
    update pp.devices set live = snap, health = hl, online = true, last_seen = now(), offline_since = null where id = d.id;
    insert into pp.metrics as m (device_id, ts, cpu_load, cpu_temp, gpu_load, gpu_temp, ram, power)
    values (d.id, date_trunc('minute', now()), pp_private.num(snap -> 'cpu' -> 'load'), pp_private.num(snap -> 'cpu' -> 'temp'),
            pp_private.num(snap -> 'gpus' -> 0 -> 'load'), pp_private.num(snap -> 'gpus' -> 0 -> 'temp'),
            pp_private.num(snap -> 'ram' -> 'percent'), pp_private.num(snap -> 'power' -> 'est'))
    on conflict (device_id, ts) do update set n = m.n + 1,
      cpu_load = coalesce((m.cpu_load * m.n + excluded.cpu_load) / (m.n + 1), m.cpu_load, excluded.cpu_load),
      gpu_load = coalesce((m.gpu_load * m.n + excluded.gpu_load) / (m.n + 1), m.gpu_load, excluded.gpu_load),
      ram = coalesce((m.ram * m.n + excluded.ram) / (m.n + 1), m.ram, excluded.ram),
      power = coalesce((m.power * m.n + excluded.power) / (m.n + 1), m.power, excluded.power),
      cpu_temp = greatest(m.cpu_temp, excluded.cpu_temp), gpu_temp = greatest(m.gpu_temp, excluded.gpu_temp);

    if not was and d.offline_since is not null and now() - d.offline_since > interval '2 minutes'
       and coalesce((us -> 'alerts' ->> 'power_events')::bool, true) then
      perform pp_private.add_event(u.id, d.id, 'ok', d.name || ' yoqildi', pp_private.fmt_dur(extract(epoch from now() - d.offline_since)::numeric) || ' oflayn boʻlgan');
      perform pp_private.enqueue_push(u.id, jsonb_build_object('title', '🟢 ' || d.name || ' yoqildi',
        'body', 'Kompyuter yana aloqada (' || pp_private.hhmm(now(), (us ->> 'tz_offset')::int) || ')', 'tag', 'power-' || d.id));
    end if;

    if coalesce((us -> 'alerts' ->> 'critical')::bool, true) and jsonb_typeof(hl -> 'items') = 'array' then
      for it in select value from jsonb_array_elements(hl -> 'items') where value ->> 'level' = 'crit' loop
        k := left(coalesce(it ->> 'key', it ->> 'title'), 80);
        if not exists (select 1 from pp.alert_state where device_id = d.id and key = k and last_at > now() - interval '30 minutes') then
          insert into pp.alert_state(device_id, key, last_at) values (d.id, k, now())
            on conflict (device_id, key) do update set last_at = now();
          perform pp_private.add_event(u.id, d.id, 'crit', d.name || ': ' || (it ->> 'title'), it ->> 'tip');
          perform pp_private.enqueue_push(u.id, jsonb_build_object('title', '⚠️ ' || d.name || ': ' || (it ->> 'title'),
            'body', left(concat_ws(' ', nullif(it ->> 'detail', ''), nullif(it ->> 'tip', '')), 240),
            'tag', 'alert-' || d.id || '-' || k, 'url', './#/overview'), 'high');
        end if;
      end loop;
    end if;
  else
    update pp.devices set last_seen = now() where id = d.id and online;
  end if;

  res := jsonb_build_object('ok', true, 'interval', case when d.view_until > now() then 2 else 10 end, 'alerts', us -> 'alerts');
  if coalesce((p_body ->> 'settings_ver')::int, -1) <> d.settings_ver then
    res := res || jsonb_build_object('settings', pp_private.device_settings(d.settings), 'settings_ver', d.settings_ver);
  end if;
  return res;
end $$;

create or replace function public.pp_agent_poll(p_token text, p_settings_ver int default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices := pp_private.dev_auth(p_token); cmds jsonb; res jsonb;
begin
  update pp.devices set last_seen = now() where id = d.id and online;
  with c as (
    update pp.commands set status = 'sent'
    where id in (select id from pp.commands where device_id = d.id and status = 'pending' order by id limit 20)
    returning id, cmd, args)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cmd', cmd, 'args', args) order by id), '[]') into cmds from c;
  res := jsonb_build_object('commands', cmds, 'fast', coalesce(d.view_until > now(), false));
  if p_settings_ver is distinct from d.settings_ver then
    res := res || jsonb_build_object('settings', pp_private.device_settings(d.settings), 'settings_ver', d.settings_ver);
  end if;
  return res;
end $$;

create or replace function public.pp_agent_result(p_token text, p_id bigint, p_ok bool, p_result jsonb default null, p_error text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices := pp_private.dev_auth(p_token); c pp.commands;
begin
  update pp.commands set status = 'done', ok = p_ok, result = p_result, error = left(p_error, 500), done_at = now()
    where id = p_id and device_id = d.id returning * into c;
  if found and p_ok and c.cmd in ('shutdown', 'restart', 'sleep', 'hibernate', 'logoff') then
    perform pp_private.add_event(d.user_id, d.id, 'info', d.name || ': ' || case c.cmd when 'shutdown' then 'oʻchirish' when 'restart' then 'qayta yoqish'
      when 'sleep' then 'uyqu rejimi' when 'hibernate' then 'gibernatsiya' else 'tizimdan chiqish' end || ' buyrugʻi bajarildi');
  end if;
  return '{"ok":true}'::jsonb;
end $$;

create or replace function public.pp_agent_event(p_token text, p_level text, p_title text, p_body text default null, p_push bool default true, p_tag text default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices := pp_private.dev_auth(p_token); lvl text := case when p_level in ('info', 'ok', 'warn', 'crit') then p_level else 'info' end;
begin
  if coalesce(p_title, '') = '' then raise exception 'title kerak'; end if;
  perform pp_private.add_event(d.user_id, d.id, lvl, d.name || ': ' || p_title, p_body);
  if coalesce(p_push, true) then
    perform pp_private.enqueue_push(d.user_id, jsonb_build_object('title', d.name || ': ' || left(p_title, 120), 'body', left(coalesce(p_body, ''), 240),
      'tag', coalesce(p_tag, 'ev-' || d.id), 'url', './#/control'), case when lvl in ('warn', 'crit') then 'high' else 'normal' end);
  end if;
  return '{"ok":true}'::jsonb;
end $$;

-- ======================================================================= CRON (har daqiqada)
create or replace function pp_private.in_quiet(s jsonb) returns bool language plpgsql stable as $$
declare cur int; a int; b int;
begin
  if not coalesce((s ->> 'quiet_enabled')::bool, false) then return false; end if;
  cur := extract(hour from (now() at time zone 'UTC') + make_interval(mins => (s ->> 'tz_offset')::int)) * 60
       + extract(minute from (now() at time zone 'UTC') + make_interval(mins => (s ->> 'tz_offset')::int));
  a := split_part(s ->> 'quiet_from', ':', 1)::int * 60 + split_part(s ->> 'quiet_from', ':', 2)::int;
  b := split_part(s ->> 'quiet_to', ':', 1)::int * 60 + split_part(s ->> 'quiet_to', ':', 2)::int;
  return case when a < b then cur >= a and cur < b else cur >= a or cur < b end;
exception when others then return false;
end $$;

create or replace function pp_private.build_digest(p_uid bigint, s jsonb) returns jsonb language plpgsql stable
set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices; lines text[] := '{}'; line text; parts text[]; probs text[]; lvl text; worst int := 0; tz int := (s ->> 'tz_offset')::int;
begin
  for d in select * from pp.devices where user_id = p_uid order by created_at loop
    if pp_private.is_online(d) and d.live is not null then
      parts := array_remove(array[
        case when num(d.live -> 'cpu' -> 'load') is not null then 'CPU ' || round(num(d.live -> 'cpu' -> 'load')) || '%'
          || coalesce(' ' || round(num(d.live -> 'cpu' -> 'temp')) || '°', '') end,
        case when num(d.live -> 'gpus' -> 0 -> 'temp') is not null then 'GPU ' || round(num(d.live -> 'gpus' -> 0 -> 'temp')) || '°' end,
        case when num(d.live -> 'ram' -> 'percent') is not null then 'RAM ' || round(num(d.live -> 'ram' -> 'percent')) || '%' end,
        case when coalesce(num(d.live -> 'usage_today' -> 'total'), 0) > 0 then 'ekran ' || fmt_dur(num(d.live -> 'usage_today' -> 'total')::numeric) end
      ], null);
      lvl := coalesce(d.health ->> 'level', 'ok');
      line := case lvl when 'crit' then '🔴 ' when 'warn' then '🟡 ' else '🟢 ' end || d.name || ': ' || array_to_string(parts, ' · ');
      select array_agg(value ->> 'title') into probs from jsonb_array_elements(coalesce(d.health -> 'items', '[]')) where value ->> 'level' in ('warn', 'crit');
      if probs is not null then
        line := line || E'\n   ⚠ ' || probs[1] || case when array_length(probs, 1) > 1 then ' (+' || (array_length(probs, 1) - 1) || ')' else '' end;
      end if;
      worst := greatest(worst, case lvl when 'crit' then 2 when 'warn' then 1 else 0 end);
    else
      line := '⚫ ' || d.name || ': oflayn' || coalesce(' (oxirgi ' || hhmm(d.last_seen, tz) || ')', '');
    end if;
    lines := lines || line;
  end loop;
  if array_length(lines, 1) is null then return null; end if;
  return jsonb_build_object('title', 'PC holati · ' || hhmm(now(), tz), 'body', array_to_string(lines, E'\n'),
                            'tag', 'digest', 'url', './#/overview', 'renotify', worst > 0);
end $$;

create or replace function pp_private.cron_tick() returns jsonb language plpgsql
set search_path = pp, pp_private, pg_temp as $$
declare d pp.devices; u pp.users; s jsonb; title text; lvl text; iv int; tz int; b bigint; last bigint; n_off int := 0; n_dig int := 0;
begin
  -- 1) oflayn boʻlgan qurilmalar
  for d in update pp.devices set online = false, offline_since = last_seen
           where online and last_seen < now() - interval '45 seconds' returning * loop
    n_off := n_off + 1;
    s := pp_private.user_settings((select settings from pp.users where id = d.user_id));
    if coalesce((s -> 'alerts' ->> 'power_events')::bool, true) then
      if d.last_power_at > now() - interval '10 minutes' then
        title := d.name || ' ' || case d.last_power_cmd when 'shutdown' then 'oʻchirildi' when 'restart' then 'qayta yuklanmoqda'
          when 'sleep' then 'uyqu rejimiga oʻtdi' when 'hibernate' then 'gibernatsiyaga oʻtdi' else 'tizimdan chiqdi' end;
        lvl := 'info';
      else
        title := d.name || ' bilan aloqa uzildi'; lvl := 'warn';
      end if;
      perform add_event(d.user_id, d.id, lvl, title, 'Oxirgi aloqa: ' || hhmm(d.last_seen, (s ->> 'tz_offset')::int));
      perform enqueue_push(d.user_id, jsonb_build_object('title', '⚫ ' || title, 'body', 'Oxirgi aloqa: ' || hhmm(d.last_seen, (s ->> 'tz_offset')::int),
        'tag', 'power-' || d.id));
    end if;
  end loop;

  -- 2) javobsiz qolgan buyruqlar
  update pp.commands set status = 'done', ok = false, error = 'Kompyuter javob bermadi', done_at = now()
    where status in ('pending', 'sent') and created_at < now() - interval '3 minutes';

  -- 3) muntazam hisobot (har 30 daqiqa va h.k.)
  for u in select * from pp.users usr where exists (select 1 from pp.push_subs p where p.user_id = usr.id) loop
    s := pp_private.user_settings(u.settings);
    continue when not coalesce((s ->> 'notify_enabled')::bool, true);
    iv := greatest(5, least(720, coalesce((s ->> 'notify_interval')::int, 30)));
    tz := coalesce((s ->> 'tz_offset')::int, 300);
    b := floor((extract(epoch from now()) / 60 + tz) / iv)::bigint;
    select bucket into last from pp.digest_state where user_id = u.id;
    insert into pp.digest_state(user_id, bucket) values (u.id, b) on conflict (user_id) do update set bucket = excluded.bucket;
    continue when last is null or last = b or pp_private.in_quiet(s);
    perform enqueue_push(u.id, build_digest(u.id, s));
    n_dig := n_dig + 1;
  end loop;

  -- 4) yuborilmay qolgan push lar boʻlsa — qayta uygʻotish
  if exists (select 1 from pp.push_queue where sent_at is null and created_at < now() - interval '30 seconds') then
    perform kick();
  end if;

  -- 5) tozalash (soatiga bir marta)
  if extract(minute from now())::int = 7 then
    delete from pp.metrics where ts < now() - interval '8 days';
    delete from pp.events where ts < now() - interval '30 days';
    delete from pp.commands where created_at < now() - interval '1 day';
    delete from pp.push_queue where created_at < now() - interval '2 days';
    delete from pp.login_attempts where ts < now() - interval '1 day';
  end if;
  return jsonb_build_object('offline', n_off, 'digests', n_dig);
end $$;

-- edge funksiya uchun: navbatdan olish (atomik)
create or replace function pp_private.queue_take(p_limit int default 100) returns table(id bigint, user_id bigint, payload jsonb, urgency text)
language sql set search_path = pp, pg_temp as $$
  update pp.push_queue q set sent_at = now()
  where q.id in (select x.id from pp.push_queue x where x.sent_at is null order by x.id limit p_limit for update skip locked)
  returning q.id, q.user_id, q.payload, q.urgency
$$;

-- ruxsatlar: ichki sxemalar yopiq, public.pp_* — anon uchun ochiq RPC
revoke all on all functions in schema pp_private from public;
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pp\_%' loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('grant execute on function %s to anon, authenticated', r.sig); end if;
  end loop;
end $$;
