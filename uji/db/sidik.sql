-- Sidik skema: satu baris JSON berisi setiap fungsi, kolom, batasan,
-- indeks, kebijakan RLS, dan pemicu di skema public — cukup untuk tahu apakah dua
-- database punya skema yang sama.
--
-- Dijalankan dua kali dengan isi yang persis sama: terhadap produksi
-- (konektor Supabase) dan terhadap hasil bangun.sh. banding.sh
-- menanam hash keluaran lokal ke dalam kueri untuk produksi.
select jsonb_build_object(
  'fungsi', (select jsonb_object_agg(k, v) from (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
             jsonb_build_object(
               'isi',     md5(p.prosrc),
               'hasil',   pg_get_function_result(p.oid),
               'definer', p.prosecdef,
               'atur',    coalesce(array_to_string(p.proconfig, ','), ''),
               -- siapa yang boleh menjalankan; inilah yang bocor di 023
               'jalan',   (select coalesce(string_agg(r, ',' order by r), '')
                             from (select case when a.grantee = 0 then 'PUBLIC'
                                               else pg_get_userbyid(a.grantee) end as r
                                     from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                    where a.privilege_type = 'EXECUTE'
                                      and (a.grantee = 0 or pg_get_userbyid(a.grantee)
                                           in ('anon','authenticated','service_role'))) x)
             ) as v
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prokind = 'f') f),
  'kolom', (select jsonb_object_agg(k, v) from (
      select c.table_name || '.' || c.column_name as k,
             c.data_type || case when c.is_nullable = 'NO' then ' not null' else '' end
               || coalesce(' = ' || c.column_default, '') as v
        from information_schema.columns c
       where c.table_schema = 'public') c),
  'batasan', (select jsonb_object_agg(k, v) from (
      select r.relname || '.' || n.conname as k, pg_get_constraintdef(n.oid) as v
        from pg_constraint n join pg_class r on r.oid = n.conrelid
       where r.relnamespace = 'public'::regnamespace) b),
  'rls', (select jsonb_object_agg(relname, relrowsecurity) from pg_class
           where relnamespace = 'public'::regnamespace and relkind = 'r'),
  'kebijakan', (select jsonb_object_agg(k, v) from (
      select tablename || '.' || policyname as k,
             jsonb_build_object('cmd', cmd, 'peran', array_to_string(roles, ','),
                                'pakai', coalesce(qual, ''), 'cek', coalesce(with_check, '')) as v
        from pg_policies where schemaname = 'public') k),
  'indeks', (select jsonb_object_agg(tablename || '.' || indexname, indexdef)
              from pg_indexes where schemaname = 'public'),
  'pemicu', (select jsonb_object_agg(k, v) from (
      select c.relname || '.' || t.tgname as k, pg_get_triggerdef(t.oid) as v
        from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) t)
) as sidik;
