-- Uji migrasi 028: babak dan blok di terimakasih_isi, dan kenangan_blok
-- terkunci per pemilik. Seluruhnya di dalam satu transaksi yang
-- DIBATALKAN oleh raise di akhir — aman dijalankan di produksi.
do $$
declare
  ps    uuid;
  lain  uuid;
  draf  uuid;
  a1    uuid;
  a2    uuid;
  a3    uuid;
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
  -- ---------- data ----------
  insert into public.pasangan (slug, status, terbit) values ('uji-kenangan-028', 'aktif', true)
  returning id into ps;
  insert into public.pasangan (slug, status, terbit) values ('uji-kenangan-lain', 'aktif', true)
  returning id into lain;
  insert into public.pasangan (slug, status, terbit) values ('uji-kenangan-draf', 'draf', false)
  returning id into draf;

  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas, kenangan_teks)
  values (ps, 2, 'Resepsi', 'Sabtu', '11.00', 'resepsi', '  ') returning id into a2;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas, kenangan_teks)
  values (ps, 1, 'Akad', 'Sabtu', '08.00', 'akad', 'Pagi yang hening.') returning id into a1;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas, di_terimakasih)
  values (ps, 3, 'Ngunduh mantu', 'Minggu', '10.00', 'ngunduh', false) returning id into a3;

  insert into public.foto (pasangan_id, jalur, acara_id, urutan) values (ps, 'uji028/1.webp', a1, 2) returning id into f1;
  insert into public.foto (pasangan_id, jalur, acara_id, urutan) values (ps, 'uji028/2.webp', a1, 1) returning id into f2;
  insert into public.foto (pasangan_id, jalur, acara_id, urutan, tampil) values (ps, 'uji028/3.webp', a1, 0, false) returning id into f3;
  -- Foto tersembunyi ditandai latar: ia tetap tidak boleh muncul.
  update public.foto set latar = true where id = f3;

  insert into auth.users (id, email) values (u1, 'u1@uji.invalid'), (u2, 'u2@uji.invalid');
  insert into public.pemilik (user_id, pasangan_id) values (u1, ps), (u2, lain);

  -- ---------- 1. babak: hanya yang dicentang, urutan hari itu ----------
  d := public.terimakasih_isi('uji-kenangan-028');
  if jsonb_array_length(d->'babak') = 2
     and d->'babak'->0->>'nama' = 'Akad' and d->'babak'->1->>'nama' = 'Resepsi' then
    lulus := lulus + 1; lap := lap || E'ok     babak = acara yang dicentang, urut menurut kotak 3\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  babak: %s\n', d->'babak');
  end if;

  -- ---------- 2. kalimat babak; spasi saja = kosong ----------
  if d->'babak'->0->>'teks' = 'Pagi yang hening.' and (d->'babak'->1->'teks') = 'null'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     kalimat babak terkirim, kalimat kosong jadi null\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  teks babak: %s / %s\n', d->'babak'->0->'teks', d->'babak'->1->'teks');
  end if;

  -- ---------- 3. latar bawaan = foto pertama yang tampil ----------
  if d->'babak'->0->'latar'->>'jalur' = 'uji028/2.webp' then
    lulus := lulus + 1; lap := lap || E'ok     tanpa pilihan, latarnya foto pertama babak itu\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  latar bawaan: %s\n', d->'babak'->0->'latar');
  end if;

  -- ---------- 4. foto tersembunyi tidak pernah keluar ----------
  if position('uji028/3.webp' in d::text) = 0 and (d->'babak'->0->>'jumlah_foto')::int = 2 then
    lulus := lulus + 1; lap := lap || E'ok     foto tersembunyi tidak keluar, juga yang ditandai latar\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  foto tersembunyi bocor ke jawaban\n';
  end if;

  -- ---------- 5. latar pilihan menang ----------
  update public.foto set latar = true where id = f1;
  d := public.terimakasih_isi('uji-kenangan-028');
  if d->'babak'->0->'latar'->>'jalur' = 'uji028/1.webp' then
    lulus := lulus + 1; lap := lap || E'ok     latar yang dipilih menggantikan bawaan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  latar pilihan: %s\n', d->'babak'->0->'latar');
  end if;

  -- ---------- 6. babak tanpa foto ----------
  if (d->'babak'->1->'latar') = 'null'::jsonb and (d->'babak'->1->>'jumlah_foto')::int = 0 then
    lulus := lulus + 1; lap := lap || E'ok     babak tanpa foto: latar null, halaman menggambar kartu teks\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  babak kosong: %s\n', d->'babak'->1);
  end if;

  -- ---------- 7. angka: nol jadi null ----------
  if (d->'angka'->'ucapan') = 'null'::jsonb and (d->'angka'->'hadir') = 'null'::jsonb
     and (d->'angka'->>'foto')::int = 2 and (d->'angka'->>'babak')::int = 2 then
    lulus := lulus + 1; lap := lap || E'ok     angka: yang nol dikirim null, sisanya dihitung\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  angka: %s\n', d->'angka');
  end if;

  -- ---------- 8. blok: kosong = bawaan; yang disimpan terkirim rapi ----------
  if d->'blok' = '{}'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     tanpa baris kenangan_blok, blok = {} (halaman pakai bawaan)\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  blok bawaan: %s\n', d->'blok');
  end if;
  insert into public.kenangan_blok (pasangan_id, kunci, tampil, judul, teks)
  values (ps, 'galeri', false, '  Arsip  ', '   ');
  d := public.terimakasih_isi('uji-kenangan-028');
  if d->'blok'->'galeri' = '{"tampil": false, "judul": "Arsip", "teks": null}'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     blok tersimpan terkirim, spasi dirapikan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  blok tersimpan: %s\n', d->'blok');
  end if;

  -- ---------- 9. kunci lama tetap ada ----------
  if d ?& array['slug','aktif','tanggal_acara','hadir','mempelai','foto','ucapan'] then
    lulus := lulus + 1; lap := lap || E'ok     semua kunci jawaban lama tetap ada\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  ada kunci lama yang hilang\n';
  end if;

  -- ---------- 10. pasangan draf tidak membocorkan apa pun ----------
  d := public.terimakasih_isi('uji-kenangan-draf');
  if d = jsonb_build_object('slug', 'uji-kenangan-draf', 'aktif', false) then
    lulus := lulus + 1; lap := lap || E'ok     undangan draf: cuma {slug, aktif:false}\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  draf: %s\n', d);
  end if;

  -- ---------- 11. batasan ----------
  ok := false;
  begin
    insert into public.kenangan_blok (pasangan_id, kunci) values (ps, 'iklan');
  exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     kunci di luar daftar ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  kunci "iklan" diterima\n'; end if;

  ok := false;
  begin
    update public.acara set kenangan_teks = repeat('x', 201) where id = a1;
  exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     kalimat babak lebih dari 200 huruf ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  kalimat 201 huruf diterima\n'; end if;

  -- ---------- 12. anon tidak menyentuh tabelnya ----------
  execute 'set local role anon';
  ok := false;
  begin
    execute 'select count(*) from public.kenangan_blok' into n;
  exception when insufficient_privilege then ok := true; end;
  reset role;
  if ok then lulus := lulus + 1; lap := lap || E'ok     anon tidak punya hak apa pun atas kenangan_blok\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  anon membaca %s baris kenangan_blok\n', n); end if;

  -- ---------- 13. pemilik lain tidak melihat dan tidak bisa menulis ----------
  perform set_config('request.jwt.claim.sub', u2::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.kenangan_blok' into n;
  ok := false;
  begin
    execute format('insert into public.kenangan_blok (pasangan_id, kunci) values (%L, %L)', ps, 'sampul');
  exception when insufficient_privilege then ok := true; end;
  reset role;
  if n = 0 and ok then
    lulus := lulus + 1; lap := lap || E'ok     pemilik pasangan lain: 0 baris terlihat, menulis ditolak RLS\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  pemilik lain melihat %s baris / menulis %s\n', n, case when ok then 'ditolak' else 'DITERIMA' end);
  end if;

  -- ---------- 14. pemilik sendiri bisa upsert seperti panel 9 ----------
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  execute format($q$insert into public.kenangan_blok (pasangan_id, kunci, judul)
                   values (%L, 'galeri', 'Dokumentasi')
                   on conflict (pasangan_id, kunci) do update set judul = excluded.judul, tampil = true$q$, ps);
  execute 'select count(*) from public.kenangan_blok' into n;
  reset role;
  d := public.terimakasih_isi('uji-kenangan-028');
  if n = 1 and d->'blok'->'galeri'->>'judul' = 'Dokumentasi' and (d->'blok'->'galeri'->>'tampil')::boolean then
    lulus := lulus + 1; lap := lap || E'ok     pemilik menyimpan bloknya sendiri lewat upsert\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  upsert pemilik: %s baris, %s\n', n, d->'blok');
  end if;

  raise exception E'\n===== LAPORAN UJI 028 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
