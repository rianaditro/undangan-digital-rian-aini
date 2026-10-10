-- Uji migrasi 033: bab cerita (foto.bagian), video, vendor, bucket.
-- Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise di akhir.
do $$
declare
  ps    uuid;
  lain  uuid;
  a1    uuid;
  f1    uuid;
  f2    uuid;
  f3    uuid;
  u1    uuid := gen_random_uuid();
  u2    uuid := gen_random_uuid();
  d     jsonb;
  n     int;
  ok    boolean;
  lap   text := '';
  lulus int  := 0;
  gagal int  := 0;
begin
  insert into public.pasangan (slug, status, terbit, kenangan_terbit) values ('uji-cerita-033', 'aktif', true, true)
  returning id into ps;
  insert into public.pasangan (slug, status, terbit) values ('uji-cerita-lain', 'aktif', true) returning id into lain;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas) values (ps, 1, 'Akad', 'Sabtu', '08.00', 'akad')
  returning id into a1;
  insert into auth.users (id, email) values (u1, 'u1@uji.invalid'), (u2, 'u2@uji.invalid');
  insert into public.pemilik (user_id, pasangan_id) values (u1, ps), (u2, lain);

  -- ---------- 1. bagian dan acara tidak bisa sekaligus ----------
  ok := false;
  begin
    insert into public.foto (pasangan_id, jalur, acara_id, bagian) values (ps, 'u033/x.webp', a1, 'keluarga');
  exception when check_violation then ok := true; end;
  begin
    insert into public.foto (pasangan_id, jalur, bagian) values (ps, 'u033/y.webp', 'iklan');
    ok := false;
  exception when check_violation then null; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     satu berkas di satu tempat; bagian di luar daftar ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  batasan bagian\n'; end if;

  -- ---------- 2. latar satu per bagian ----------
  insert into public.foto (pasangan_id, jalur, bagian, urutan, latar) values (ps, 'u033/k1.webp', 'keluarga', 1, true) returning id into f1;
  insert into public.foto (pasangan_id, jalur, bagian, urutan, latar) values (ps, 'u033/k2.webp', 'keluarga', 2, true) returning id into f2;
  insert into public.foto (pasangan_id, jalur, jalur_kecil, bagian, urutan, jenis, durasi_ms)
    values (ps, 'u033/v1.mp4', 'u033/v1-poster.webp', 'berdua', 3, 'video', 4200) returning id into f3;
  if not (select latar from public.foto where id = f1) and (select latar from public.foto where id = f2) then
    lulus := lulus + 1; lap := lap || E'ok     latar baru di bagian yang sama mematikan latar lama\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  latar per bagian\n';
  end if;

  ok := false;
  begin
    insert into public.foto (pasangan_id, jalur, jenis) values (ps, 'u033/z.gif', 'gif');
  exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     jenis hanya foto atau video\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  jenis gif diterima\n'; end if;

  -- ---------- 3. vendor ----------
  insert into public.kenangan_vendor (pasangan_id, urutan, peran, nama, tautan) values
    (ps, 2, 'Fotografer', 'Lensa Jepara', '@lensajepara'),
    (ps, 1, 'Dekorasi',   'Sekar Dekor',  'https://sekar.example');
  ok := false;
  begin
    insert into public.kenangan_vendor (pasangan_id, peran, nama, tautan) values (ps, 'MUA', 'X', 'javascript:alert(1)');
  exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     tautan vendor hanya https:// atau @akun\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  tautan javascript: diterima\n'; end if;

  -- ---------- 4. terimakasih_isi ----------
  d := public.terimakasih_isi('uji-cerita-033');
  if jsonb_array_length(d->'vendor') = 2 and d->'vendor'->0->>'nama' = 'Sekar Dekor'
     and d->'vendor'->1->>'tautan' = '@lensajepara' then
    lulus := lulus + 1; lap := lap || E'ok     vendor terkirim berurutan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  vendor: %s\n', d->'vendor');
  end if;

  select count(*) into n from jsonb_array_elements(d->'foto') x
   where x->>'bagian' = 'keluarga';
  if n = 2 and (select x->>'jalur' from jsonb_array_elements(d->'foto') x where x->>'bagian' = 'keluarga' limit 1) = 'u033/k2.webp'
     and exists (select 1 from jsonb_array_elements(d->'foto') x
                  where x->>'jenis' = 'video' and x->>'kecil' = 'u033/v1-poster.webp' and (x->>'durasi_ms')::int = 4200) then
    lulus := lulus + 1; lap := lap || E'ok     foto[] membawa jenis, bagian, poster video; latar pertama di babnya\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  foto[]: %s\n', d->'foto');
  end if;

  if d ?& array['slug','aktif','tanggal_acara','hadir','mempelai','foto','babak','blok','angka','ucapan'] then
    lulus := lulus + 1; lap := lap || E'ok     semua kunci lama tetap ada untuk halaman versi lama\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  kunci lama hilang\n';
  end if;

  -- video tidak pernah jadi babak.latar lama (halaman lama memasangnya sebagai <img>)
  insert into public.foto (pasangan_id, jalur, acara_id, jenis, urutan, latar) values (ps, 'u033/akad.mp4', a1, 'video', 0, true);
  d := public.terimakasih_isi('uji-cerita-033');
  if (d->'babak'->0->'latar') = 'null'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     video tidak dipasang sebagai latar gambar untuk halaman lama\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  latar lama: %s\n', d->'babak'->0->'latar');
  end if;

  -- ---------- 5. kunci blok baru ----------
  insert into public.kenangan_blok (pasangan_id, kunci, judul) values (ps, 'sungkem', 'Sungkem'), (ps, 'vendor', 'Terima Kasih Kepada');
  d := public.terimakasih_isi('uji-cerita-033');
  if d->'blok'->'sungkem'->>'judul' = 'Sungkem' and d->'blok' ? 'vendor' then
    lulus := lulus + 1; lap := lap || E'ok     kenangan_blok menerima kunci bab baru\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  kunci bab baru\n';
  end if;

  -- ---------- 6. RLS vendor ----------
  execute 'set local role anon';
  ok := false;
  begin
    execute 'select count(*) from public.kenangan_vendor' into n;
  exception when insufficient_privilege then ok := true; end;
  reset role;
  perform set_config('request.jwt.claim.sub', u2::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.kenangan_vendor' into n;
  begin
    execute format('insert into public.kenangan_vendor (pasangan_id, peran, nama) values (%L, %L, %L)', ps, 'A', 'B');
    ok := false;
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  execute format('insert into public.kenangan_vendor (pasangan_id, peran, nama) values (%L, %L, %L)', ps, 'MUA', 'Ayu');
  reset role;
  if ok and n = 0 and (select count(*) from public.kenangan_vendor where pasangan_id = ps) = 3 then
    lulus := lulus + 1; lap := lap || E'ok     vendor: anon ditolak, pemilik lain 0 baris & tidak bisa menulis, pemilik sendiri bisa\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  RLS vendor: ok=%s n=%s\n', ok, n);
  end if;

  -- ---------- 7. bucket menerima video ----------
  if (select 'video/mp4' = any(allowed_mime_types) and file_size_limit = 20971520 from storage.buckets where id = 'foto') then
    lulus := lulus + 1; lap := lap || E'ok     bucket foto menerima video sampai 20 MB\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  bucket\n';
  end if;

  raise exception E'\n===== LAPORAN UJI 033 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
