-- Uji migrasi 031: reseller, pesanan, pencairan, kunjungan, owner/admin.
-- Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise di
-- akhir — aman dijalankan di produksi.
do $$
declare
  u_owner uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_r1    uuid := gen_random_uuid();
  u_r2    uuid := gen_random_uuid();
  u_klien uuid := gen_random_uuid();
  r1      uuid;
  r2      uuid;
  n1      bigint;
  n2      bigint;
  sid     uuid;
  pid     uuid;
  ps      public.pasangan;
  d       jsonb;
  b       boolean;
  n       int;
  ok      boolean;
  lap     text := '';
  kode_galat text;
  lulus   int  := 0;
  gagal   int  := 0;
begin
  -- ---------- data ----------
  delete from public.admin;   -- uji berdiri sendiri, tidak bergantung admin yang ada
  insert into auth.users (id, email) values
    (u_owner, 'owner@uji.invalid'), (u_admin, 'admin@uji.invalid'),
    (u_r1, 'r1@uji.invalid'), (u_r2, 'r2@uji.invalid'), (u_klien, 'klien@uji.invalid');
  -- Sejak 032 hanya pemilik (owner) yang ada di tabel admin; u_admin
  -- tinggal akun biasa yang dipakai sebagai "siapa yang mengonfirmasi".
  insert into public.admin (user_id, nama, peran) values (u_owner, 'Owner', 'owner');
  insert into public.reseller (user_id, kode, nama) values (u_r1, '123', 'Percetakan A') returning id into r1;
  insert into public.reseller (user_id, kode, nama, aktif) values (u_r2, 'wo', 'WO B', true) returning id into r2;

  -- ---------- 1. kunjungan ----------
  b := public.kunjungan_catat('999', 'pengunjung-satu', '/mulai');
  ok := not b;
  b := public.kunjungan_catat('123', 'pengunjung-satu', '/mulai');
  ok := ok and b;
  perform public.kunjungan_catat('123', 'pengunjung-satu', '/mulai');
  perform public.kunjungan_catat(' 123 ', 'pengunjung-dua', '/');
  perform public.kunjungan_catat('123', 'X;drop', '/');
  select count(*) into n from public.kunjungan where reseller_id = r1;
  if ok and n = 2 then
    lulus := lulus + 1; lap := lap || E'ok     kunjungan: kode asing ditolak, pengunjung sama sehari = satu, id aneh diabaikan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  kunjungan: ok=%s n=%s\n', ok, n);
  end if;

  execute 'set local role anon';
  ok := public.kunjungan_catat('wo', 'pengunjung-anon', '/mulai');
  ok := false;
  begin
    execute 'select count(*) from public.kunjungan' into n;
  exception when insufficient_privilege then ok := true; end;
  reset role;
  if ok then lulus := lulus + 1; lap := lap || E'ok     anon boleh mencatat kunjungan, tidak boleh membaca tabelnya\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  anon membaca tabel kunjungan\n'; end if;

  -- ---------- 2. reseller mencatat pesanan ----------
  perform set_config('request.jwt.claim.sub', u_r1::text, true);
  execute 'set local role authenticated';
  n1 := public.reseller_pesan('Budi', 'Sari', 'budi-sari', 'premium', '2027-01-10', 'Jepara', 'Klien@Uji.Invalid', null);
  ok := false;
  begin
    perform public.reseller_pesan('Budi', 'Sari', 'budi-sari', 'standar', null, null, 'x@uji.invalid', null);
  exception when unique_violation then ok := true; end;
  begin
    perform public.reseller_pesan('A', 'B', 'admin', 'standar', null, null, 'x@uji.invalid', null);
    ok := false;
  exception when invalid_parameter_value then null; end;
  n2 := public.reseller_pesan('Dodi', 'Rina', 'dodi-rina', 'standar', null, null, 'dodi@uji.invalid', null);
  reset role;
  if n1 is not null and ok then
    lulus := lulus + 1; lap := lap || E'ok     reseller mencatat pesanan; slug kembar dan slug platform ditolak\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  reseller_pesan n1=%s ok=%s\n', n1, ok);
  end if;

  select * into ps from public.pasangan where slug = 'budi-sari';
  if ps.id is null and (select email_klien from public.pesanan where nomor = n1) = 'klien@uji.invalid' then
    lulus := lulus + 1; lap := lap || E'ok     pesanan belum membuat pasangan; email dirapikan huruf kecil\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  pasangan terbuat sebelum lunas, atau email tidak dirapikan\n';
  end if;

  -- ---------- 3. bukan reseller / anon ----------
  ok := false;
  perform set_config('request.jwt.claim.sub', u_klien::text, true);
  execute 'set local role authenticated';
  begin
    perform public.reseller_pesanan();
  exception when insufficient_privilege then ok := true; end;
  reset role;
  b := false;
  execute 'set local role anon';
  begin
    perform public.reseller_pesan('A', 'B', 'a-b-c', 'standar', null, null, 'x@uji.invalid', null);
  exception when insufficient_privilege then b := true; end;
  reset role;
  if ok and b then lulus := lulus + 1; lap := lap || E'ok     akun biasa dan anon tidak bisa memakai fungsi reseller\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  pintu reseller: biasa=%s anon=%s\n', ok, b); end if;

  -- reseller lain tidak melihat pesanan r1
  perform set_config('request.jwt.claim.sub', u_r2::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.reseller_pesanan();
  ok := false;
  begin
    perform public.admin_pesanan();
  exception when insufficient_privilege then ok := true; end;
  reset role;
  if n = 0 and ok then lulus := lulus + 1; lap := lap || E'ok     reseller lain: 0 pesanan terlihat, admin_pesanan ditolak\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  reseller lain melihat %s pesanan / admin %s\n', n, ok); end if;

  -- ---------- 4. konfirmasi lunas ----------
  select id into sid from public.pesanan where nomor = n1;
  ok := false;
  begin
    perform public.pesanan_lunaskan(sid, 100000, 150000, u_admin);
  exception when invalid_parameter_value then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     komisi melebihi nominal ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  komisi > nominal diterima\n'; end if;

  insert into auth.users (id, email) values (gen_random_uuid(), 'klien@uji.invalid')
    on conflict do nothing;
  pid := public.pesanan_lunaskan(sid, 159000, 65000, u_admin);
  select * into ps from public.pasangan where id = pid;
  if ps.status = 'aktif' and ps.reseller_id = r1 and ps.canonical_host = 'budi-sari.mengundang.id'
     and exists (select 1 from public.pemilik k join auth.users u on u.id = k.user_id
                  where k.pasangan_id = pid and u.email = 'klien@uji.invalid')
     and (select status from public.pesanan where id = sid) = 'lunas' then
    lulus := lulus + 1; lap := lap || E'ok     lunas: pasangan langsung aktif, milik klien, tercatat milik reseller 123\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  lunas: status=%s reseller=%s host=%s\n', ps.status, ps.reseller_id, ps.canonical_host);
  end if;

  ok := false;
  begin
    perform public.pesanan_lunaskan(sid, 159000, 65000, u_admin);
  exception when invalid_parameter_value then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     pesanan yang sudah lunas tidak bisa dilunaskan dua kali\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  lunas dua kali\n'; end if;

  ok := false;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  begin
    perform public.pesanan_lunaskan(sid, 1, 0, u_owner);
  exception when insufficient_privilege then ok := true; end;
  reset role;
  if ok then lulus := lulus + 1; lap := lap || E'ok     pesanan_lunaskan hanya untuk edge function, owner pun tidak langsung\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pesanan_lunaskan bisa dipanggil authenticated\n'; end if;

  -- ---------- 5. angka reseller ----------
  perform set_config('request.jwt.claim.sub', u_r1::text, true);
  execute 'set local role authenticated';
  d := public.reseller_saya();
  select count(*) into n from public.reseller_pesanan() x where x.status = 'lunas' and x.canonical_host = 'budi-sari.mengundang.id' and not x.cair;
  reset role;
  if (d->>'pengunjung')::int = 2 and (d->>'pesanan')::int = 2 and (d->>'lunas')::int = 1
     and (d->>'komisi_tertahan')::int = 65000 and (d->>'komisi_cair')::int = 0 and n = 1 then
    lulus := lulus + 1; lap := lap || E'ok     reseller_saya: 2 pengunjung, 2 pesanan, 1 lunas, 65.000 tertahan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  reseller_saya: %s / n=%s\n', d, n);
  end if;

  -- ---------- 6. pencairan ----------
  perform set_config('request.jwt.claim.sub', u_r1::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.admin_pencairan_catat(r1, 'TRX-123');
  exception when insufficient_privilege then ok := true; end;
  b := false;
  begin
    perform public.admin_reseller();
  exception when insufficient_privilege then b := true; end;
  reset role;
  if ok and b then lulus := lulus + 1; lap := lap || E'ok     admin (mitra) tidak bisa mencairkan komisinya sendiri atau melihat admin lain\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  mitra: pencairan ditolak=%s, daftar ditolak=%s\n', ok, b); end if;

  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  execute 'set local role authenticated';
  d := public.admin_pencairan_catat(r1, 'TRX-123', 'transfer BCA');
  ok := false;
  begin
    perform public.admin_pencairan_catat(r1, 'TRX-124');
  exception when invalid_parameter_value then ok := true; end;
  reset role;
  if (d->>'nominal')::int = 65000 and (d->>'jumlah_pesanan')::int = 1 and ok then
    lulus := lulus + 1; lap := lap || E'ok     owner mencairkan 65.000 (1 pesanan); kedua kali tanpa sisa ditolak\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  pencairan: %s / kedua ditolak=%s\n', d, ok);
  end if;

  perform set_config('request.jwt.claim.sub', u_r1::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.reseller_pesanan() x where x.cair and x.pencairan_ref = 'TRX-123';
  d := public.reseller_saya();
  reset role;
  if n = 1 and (d->>'komisi_cair')::int = 65000 and (d->>'komisi_tertahan')::int = 0 then
    lulus := lulus + 1; lap := lap || E'ok     reseller melihat pesanannya cair dengan ref TRX-123\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  sesudah cair: n=%s %s\n', n, d);
  end if;

  -- ---------- 7. reseller membatalkan pesanannya sendiri ----------
  perform set_config('request.jwt.claim.sub', u_r1::text, true);
  execute 'set local role authenticated';
  perform public.reseller_batal(n2);
  ok := false;
  begin
    perform public.reseller_batal(n1);   -- sudah lunas
  exception when invalid_parameter_value then ok := true; end;
  n2 := public.reseller_pesan('Dodi', 'Rina', 'dodi-rina', 'standar', null, null, 'dodi@uji.invalid', null);
  reset role;
  if ok and n2 is not null then lulus := lulus + 1; lap := lap || E'ok     batal hanya untuk yang menunggu; slug-nya bebas lagi\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pembatalan reseller\n'; end if;

  -- ---------- 8. hanya pemilik di tabel admin (032) ----------
  ok := false;
  begin
    insert into public.admin (user_id, nama, peran) values (u_admin, 'Staf', 'admin');
  exception when check_violation then ok := true; end;
  b := false;
  begin
    insert into public.pasangan (slug) values ('pemilik');
  exception when invalid_parameter_value then b := true; end;
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_admin_cabut(u_owner);
    ok := false;
  exception when invalid_parameter_value then null; end;
  reset role;
  if ok and b then
    lulus := lulus + 1; lap := lap || E'ok     peran staf ditolak; pemilik tidak bisa dicabut; slug "pemilik" milik platform\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  032: ok=%s slug=%s\n', ok, b);
  end if;

  perform set_config('request.jwt.claim.sub', u_klien::text, true);
  execute 'set local role authenticated';
  kode_galat := '';
  begin
    perform public.reseller_saya();
  exception when insufficient_privilege then get stacked diagnostics kode_galat = message_text; end;
  reset role;
  if kode_galat = 'Halaman ini hanya untuk admin mengundang.id' then
    lulus := lulus + 1; lap := lap || E'ok     pesan untuk yang bukan admin memakai istilah baru\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  pesan: %s\n', kode_galat);
  end if;

  -- ---------- 9. penjualan langsung tanpa komisi ----------
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  execute 'set local role authenticated';
  n1 := public.admin_pesan(null, 'Eko', 'Fitri', 'eko-fitri', 'standar', null, null, 'klien@uji.invalid', null);
  reset role;
  select id into sid from public.pesanan where nomor = n1;
  ok := false;
  begin
    perform public.pesanan_lunaskan(sid, 69000, 30000, u_owner);
  exception when invalid_parameter_value then ok := true; end;
  pid := public.pesanan_lunaskan(sid, 69000, 0, u_owner);
  if ok and (select reseller_id from public.pasangan where id = pid) is null then
    lulus := lulus + 1; lap := lap || E'ok     penjualan langsung: komisi harus 0, pasangan tanpa reseller\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  penjualan langsung\n';
  end if;

  raise exception E'\n===== LAPORAN UJI 031 + 032 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
