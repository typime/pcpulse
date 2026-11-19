-- Yangi agent buyruqlari: PawnIO drayverini oʻrnatish va agentni qayta ishga tushirish
create or replace function public.pp_command(p_token text, p_device text, p_cmd text, p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = pp, pp_private, pg_temp as $$
declare u pp.users := pp_private.auth(p_token); d pp.devices := pp_private.own(u.id, p_device); v_id bigint;
begin
  if p_cmd not in ('lock', 'logoff', 'sleep', 'hibernate', 'shutdown', 'restart', 'cancel_shutdown', 'guard_arm', 'guard_disarm',
                   'timer_set', 'timer_cancel', 'screenshot', 'message', 'media', 'kill', 'procs', 'sensors', 'startup_list',
                   'startup_toggle', 'cleanup_scan', 'cleanup_run', 'install_pawnio', 'restart_agent') then
    raise exception 'Nomaʼlum buyruq'; end if;
  if not pp_private.is_online(d) then raise exception 'Qurilma oflayn'; end if;
  if p_cmd in ('shutdown', 'restart', 'sleep', 'hibernate', 'logoff') then
    update pp.devices set last_power_cmd = p_cmd, last_power_at = now() where id = d.id;
  end if;
  update pp.devices set view_until = now() + interval '30 seconds' where id = d.id;
  insert into pp.commands(device_id, cmd, args) values (d.id, p_cmd, coalesce(p_args, '{}')) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
