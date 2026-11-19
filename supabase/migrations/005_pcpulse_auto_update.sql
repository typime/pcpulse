-- Agentni masofadan yangilash buyrugʻi va “avtomatik yangilash” sozlamasi (standart: yoqiq)

create or replace function pp_private.device_settings(s jsonb) returns jsonb language sql immutable
set search_path = pp, pp_private, pg_temp as $$
  select '{"idle_lock_min":0,"idle_sleep_min":0,"idle_threshold_sec":180,"guard_grace_sec":10,"fan_min_pct":20,"fans":{},"auto_update":true}'::jsonb || coalesce(s, '{}')
$$;

create or replace function public.pp_device_settings(p_token text, p_device text, p_patch jsonb default null) returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device);
        cur jsonb := pp_private.device_settings(d.settings); upd jsonb; fans jsonb; r record;
begin
  if p_patch is null then return jsonb_build_object('settings', cur); end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into upd from jsonb_each(p_patch)
    where key in ('idle_lock_min', 'idle_sleep_min', 'idle_threshold_sec', 'guard_grace_sec', 'fan_min_pct', 'fans', 'auto_update');
  if upd ? 'auto_update' then
    upd := upd || jsonb_build_object('auto_update', coalesce((upd ->> 'auto_update')::boolean, true));
  end if;
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
                   'startup_toggle', 'cleanup_scan', 'cleanup_run', 'install_pawnio', 'restart_agent', 'update_agent') then
    raise exception 'Nomaʼlum buyruq'; end if;
  if not pp_private.is_online(d) then raise exception 'Qurilma oflayn'; end if;
  if p_cmd in ('shutdown', 'restart', 'sleep', 'hibernate', 'logoff') then
    update pp.devices set last_power_cmd = p_cmd, last_power_at = now() where id = d.id;
  end if;
  update pp.devices set view_until = now() + interval '30 seconds' where id = d.id;
  insert into pp.commands(device_id, cmd, args) values (d.id, p_cmd, coalesce(p_args, '{}')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

revoke execute on function public.pp_device_settings(text, text, jsonb) from public, authenticated;
revoke execute on function public.pp_command(text, text, text, jsonb) from public, authenticated;
grant execute on function public.pp_device_settings(text, text, jsonb) to anon;
grant execute on function public.pp_command(text, text, text, jsonb) to anon;
