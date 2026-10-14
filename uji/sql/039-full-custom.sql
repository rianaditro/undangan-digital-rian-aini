-- Uji migrasi 039: Full Custom dan kolom pasangan yang dijaga. Dibatalkan di akhir.

-- Menjalankan satu perintah sebagai pengguna yang login (peran
-- authenticated, auth.uid() = p_sub), seperti REST dari dasbor.
-- Hasil: 'ok' atau SQLSTATE galatnya.
create or replace function pg_temp.sebagai(p_sub uuid, p_sql text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  begin
    execute 'set local role authenticated';
    execute p_sql;
    execute 'reset role';
    return 'ok';
  exception when others then
    return sqlstate;
  end;
end $$;

do $$
declare
  ps uuid; fc uuid; lain uuid; u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid(); owner uuid := gen_random_uuid();
  r text; n int; d jsonb; lap text := ''; lulus int := 0; gagal int := 0;
  boleh text[]; tolak text[]; q text;
begin
  insert into auth.users (id, email) values (u1, 'u1@uji.id'), (u2, 'u2@uji.id'), (u3, 'u3@uji.id'), (owner, 'own@uji.id');
  insert into public.admin (user_id, peran) values (owner, 'owner');
  insert into public.pasangan (slug, status, terbit) values ('uji-039-biasa', 'draf', false) returning id into ps;
  insert into public.pasangan (slug, status, terbit, paket) values ('uji-039-fc', 'aktif', true, 'premium') returning id into fc;
  insert into public.pasangan (slug, status, terbit) values ('uji-039-lain', 'aktif', true) returning id into lain;
  insert into public.pemilik (user_id, pasangan_id) values (u1, ps), (u2, fc), (u3, lain);

  -- ---------- 1. yang dipakai dasbor (main dan cabang) tetap boleh ----------
  boleh := array[
    format('update public.pasangan set tanggal_acara = %L, kota = %L, pihak_bawaan = %L, pembuka = %L where id = %L', '2027-01-02', 'Kudus', 'keluarga-pria', 'kristen', ps),
    format('update public.pasangan set tema = %L, tema_setel = %L where id = %L', 'dua-bingkai', '{"palet":"x"}', ps),
    format('update public.pasangan set terbit = true, status = %L where id = %L', 'aktif', ps),
    format('update public.pasangan set terbit = false, status = %L where id = %L', 'draf', ps),
    format('update public.pasangan set kenangan_terbit = true where id = %L', ps),
    format('update public.pasangan set tanggal_acara = tanggal_acara, kota = kota, tema = tema, pihak_bawaan = pihak_bawaan, pembuka = pembuka where id = %L', ps)];
  foreach q in array boleh loop
    r := pg_temp.sebagai(u1, q);
    if r = 'ok' then lulus := lulus + 1; lap := lap || format(E'ok     pasangan boleh: %s\n', left(q, 70));
    else gagal := gagal + 1; lap := lap || format(E'GAGAL  pasangan ditolak (%s): %s\n', r, q); end if;
  end loop;

  -- ---------- 2. kolom berbayar dan milik platform ditolak ----------
  tolak := array[
    format('update public.pasangan set paket = %L where id = %L', 'premium', ps),
    format('update public.pasangan set paket = %L where id = %L', 'full_custom', ps),
    format('update public.pasangan set masa_aktif = %L where id = %L', '2099-01-01', ps),
    format('update public.pasangan set hapus_pada = %L where id = %L', '2099-01-01', ps),
    format('update public.pasangan set slug = %L where id = %L', 'uji-039-baru', ps),
    format('update public.pasangan set reseller_id = null, canonical_host = %L where id = %L', 'x.mengundang.id', ps),
    format('update public.pasangan set status = %L where id = %L', 'arsip', ps),
    format('update public.pasangan set tema = %L where id = %L', 'custom/teras-jati', ps),
    format('update public.pasangan set khusus = %L where id = %L', '{"a":1}', ps),
    format('delete from public.pasangan where id = %L', ps)];
  foreach q in array tolak loop
    r := pg_temp.sebagai(u1, q);
    if r = '42501' then lulus := lulus + 1; lap := lap || format(E'ok     pasangan ditolak: %s\n', left(q, 70));
    else gagal := gagal + 1; lap := lap || format(E'GAGAL  pasangan boleh (%s): %s\n', r, q); end if;
  end loop;
  if (select paket from public.pasangan where id = ps) = 'standar' then
    lulus := lulus + 1; lap := lap || E'ok     paket tetap standar\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  paket berubah\n'; end if;

  -- pemilik platform lewat REST tetap boleh
  r := pg_temp.sebagai(owner, format('update public.pasangan set masa_aktif = %L where id = %L', '2030-01-01', ps));
  if r = 'ok' then lulus := lulus + 1; lap := lap || E'ok     pemilik platform boleh lewat REST\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  pemilik platform ditolak: %s\n', r); end if;

  -- ---------- 3. paket full_custom ----------
  r := pg_temp.sebagai(u2, format('select public.admin_paket(%L, %L)', fc, 'full_custom'));
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     admin_paket ditolak untuk pasangan\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  admin_paket oleh pasangan: %s\n', r); end if;
  r := pg_temp.sebagai(owner, format('select public.admin_paket(%L, %L)', fc, 'full_custom'));
  if r = 'ok' and (select paket || ' ' || coalesce(canonical_host, '') from public.pasangan where id = fc) = 'full_custom uji-039-fc.mengundang.id' then
    lulus := lulus + 1; lap := lap || E'ok     full_custom: paket sah, beralamat subdomain\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  full_custom: %s %s\n', r, (select row(paket, canonical_host) from public.pasangan where id = fc)); end if;

  -- ---------- 4. brief ----------
  r := pg_temp.sebagai(u1, format('insert into public.brief_custom (pasangan_id, isi) values (%L, %L)', ps, '{}'));
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     brief ditolak untuk paket bukan Full Custom\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  brief paket biasa: %s\n', r); end if;
  r := pg_temp.sebagai(u2, format('insert into public.brief_custom (pasangan_id, isi, status, pratinjau, tenggat) values (%L, %L, %L, %L, %L)',
                                   fc, '{"suasana":"teduh"}', 'terbit', 'https://curang.example', '2026-12-01'));
  if r = 'ok' and (select status || coalesce(pratinjau, '-') from public.brief_custom where pasangan_id = fc) = 'baru-' then
    lulus := lulus + 1; lap := lap || E'ok     brief Full Custom tersimpan, status dan pratinjau dari pasangan diabaikan\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  brief: %s\n', r); end if;
  r := pg_temp.sebagai(u2, format('update public.brief_custom set isi = %L where pasangan_id = %L', '{"suasana":"cerah"}', fc));
  n := 0; if r = 'ok' then n := 1; end if;
  r := pg_temp.sebagai(u2, format('update public.brief_custom set status = %L where pasangan_id = %L', 'terbit', fc));
  if n = 1 and r = '42501' and (select isi->>'suasana' from public.brief_custom where pasangan_id = fc) = 'cerah' then
    lulus := lulus + 1; lap := lap || E'ok     pasangan mengubah isi brief, bukan statusnya\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  ubah brief: %s\n', r); end if;
  perform set_config('request.jwt.claim.sub', u3::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.brief_custom;
  reset role;
  if n = 0 then lulus := lulus + 1; lap := lap || E'ok     pasangan lain tidak melihat brief\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  brief terlihat pasangan lain\n'; end if;

  -- ---------- 5. status oleh pemilik platform, revisi ----------
  r := pg_temp.sebagai(owner, format('select public.admin_custom_status(%L, %L, %L)', fc, 'pratinjau', 'https://pr-12.mengundang.workers.dev/uji-039-fc'));
  if r = 'ok' and (select status from public.brief_custom where pasangan_id = fc) = 'pratinjau' then
    lulus := lulus + 1; lap := lap || E'ok     pemilik platform memindah status ke pratinjau\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  admin_custom_status: %s\n', r); end if;
  r := pg_temp.sebagai(owner, format('select public.admin_custom_status(%L, %L, %L)', fc, 'pratinjau', 'javascript:alert(1)'));
  if r <> 'ok' then lulus := lulus + 1; lap := lap || E'ok     alamat pratinjau selain https ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pratinjau javascript: diterima\n'; end if;

  r := pg_temp.sebagai(u2, format('insert into public.revisi_custom (pasangan_id, isi, status, komit) values (%L, %L, %L, %L)', fc, 'Nama lebih besar', 'selesai', 'abcdef1'));
  if r = 'ok' and (select status || coalesce(komit, '-') from public.revisi_custom where pasangan_id = fc) = 'baru-'
     and (select status from public.brief_custom where pasangan_id = fc) = 'revisi' then
    lulus := lulus + 1; lap := lap || E'ok     revisi baru: status dari pasangan diabaikan, brief pindah ke revisi\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  revisi: %s\n', r); end if;
  r := pg_temp.sebagai(u1, format('insert into public.revisi_custom (pasangan_id, isi) values (%L, %L)', ps, 'x'));
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     revisi ditolak untuk paket bukan Full Custom\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  revisi paket biasa: %s\n', r); end if;
  r := pg_temp.sebagai(u2, format('update public.revisi_custom set komit = %L where pasangan_id = %L', 'abcdef1', fc));
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     pasangan tidak bisa menandai revisi selesai\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  komit oleh pasangan: %s\n', r); end if;

  r := pg_temp.sebagai(owner, format('select public.admin_revisi_selesai(array(select id from public.revisi_custom where pasangan_id = %L), %L)', fc, 'ABCDEF1234'));
  if r = 'ok' and (select status || ' ' || komit from public.revisi_custom where pasangan_id = fc) = 'selesai abcdef1234' then
    lulus := lulus + 1; lap := lap || E'ok     pemilik platform menandai revisi selesai dengan hash komit\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  revisi selesai: %s\n', r); end if;
  r := pg_temp.sebagai(u2, format('delete from public.revisi_custom where pasangan_id = %L', fc));
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     revisi yang selesai tidak bisa dihapus pasangan\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  hapus revisi selesai: %s\n', r); end if;

  -- ---------- 6. antrean, isi khusus, tema ----------
  r := pg_temp.sebagai(u2, 'select * from public.admin_custom_antrean()');
  if r = '42501' then lulus := lulus + 1; lap := lap || E'ok     antrean hanya untuk pemilik platform\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  antrean oleh pasangan: %s\n', r); end if;
  r := pg_temp.sebagai(owner, format('select public.admin_khusus(%L, %L)', fc, '{"kutipan":"Bersama"}'));
  n := 0; if r = 'ok' then n := 1; end if;
  r := pg_temp.sebagai(owner, format('select public.admin_khusus(%L, %L)', fc, '[1,2]'));
  d := public.undangan_isi('uji-039-fc');
  if n = 1 and r <> 'ok' and d->'khusus'->>'kutipan' = 'Bersama' and public.undangan_isi('uji-039-lain')->'khusus' = '{}'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     isi khusus: objek tersimpan dan dikirim undangan_isi, larik ditolak\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  khusus: %s %s\n', r, d->'khusus'); end if;
  r := pg_temp.sebagai(owner, format('select public.admin_tema(%L, %L)', fc, 'custom/teras-jati'));
  if r = 'ok' and (select tema from public.pasangan where id = fc) = 'custom/teras-jati' then
    lulus := lulus + 1; lap := lap || E'ok     pemilik platform memasang tema custom\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  admin_tema: %s\n', r); end if;
  r := pg_temp.sebagai(u2, format('update public.pasangan set tema = %L, tema_setel = %L where id = %L', 'kisah', '{}', fc));
  if r = 'ok' then lulus := lulus + 1; lap := lap || E'ok     pasangan boleh melepas tema custom ke katalog\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  lepas tema custom: %s\n', r); end if;

  if has_table_privilege('anon', 'public.brief_custom', 'select') or has_table_privilege('anon', 'public.revisi_custom', 'insert')
     or has_function_privilege('anon', 'public.admin_custom_antrean()', 'execute') then
    gagal := gagal + 1; lap := lap || E'GAGAL  anon bisa menyentuh Full Custom\n';
  else lulus := lulus + 1; lap := lap || E'ok     anon tidak bisa menyentuh tabel dan RPC Full Custom\n'; end if;

  raise exception E'\n===== LAPORAN UJI 039 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
