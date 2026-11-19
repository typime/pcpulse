-- Ichki yordamchi funksiyalar uchun qatʼiy search_path
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'pp_private' and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) loop
    execute format('alter function %s set search_path = pp, pp_private, pg_temp', r.sig);
  end loop;
end $$;

-- Supabase Auth ishlatilmaydi: RPC lar faqat anon (publishable key) uchun
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pp\_%' loop
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $$;
