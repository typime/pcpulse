-- Faqat Supabase: HTTP (pg_net) va har daqiqalik vazifa (pg_cron)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'pcpulse-tick';
select cron.schedule('pcpulse-tick', '* * * * *', $$ select pp_private.cron_tick() $$);

-- Maxfiy sozlamalar (repoga YOZILMAYDI). SQL Editor da oʻz qiymatlaringiz bilan bajaring:
-- insert into pp.config(key, value) values
--   ('vapid_public', '<base64url, 65 bayt>'),
--   ('vapid_private_jwk', '{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}'),
--   ('cron_secret', '<tasodifiy satr>'),
--   ('vapid_sub', 'mailto:siz@example.com'),
--   ('push_url', 'https://<project-ref>.supabase.co/functions/v1/pp-push')
-- on conflict (key) do update set value = excluded.value;
