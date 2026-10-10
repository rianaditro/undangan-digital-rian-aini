-- Uji migrasi 030: admin_* tertutup untuk anon, batas ucapan_tulis sama
-- dengan tabel, RPC bertoken yang sudah tidak dipakai benar-benar hilang.
-- Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise di akhir.
do $$
declare
  r     record;
  n     int := 0;
  ok    boolean;
  kode  text;
  lap   text := '';
  lulus int  := 0;
  gagal int  := 0;
begin
  -- ---------- 1. admin_*: anon tidak, authenticated ya ----------
  for r in
    select p.oid::regprocedure f,
           has_function_privilege('anon', p.oid, 'execute') anon,
           has_function_privilege('authenticated', p.oid, 'execute') auth
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%'
       and p.proname <> 'admin_pertama'
  loop
    n := n + 1;
    if r.anon or not r.auth then
      gagal := gagal + 1;
      lap := lap || format(E'GAGAL  %s: anon=%s authenticated=%s\n', r.f, r.anon, r.auth);
    end if;
  end loop;
  -- 7 dari 020/023; migrasi sesudahnya boleh menambah, dan yang baru
  -- ikut diperiksa dengan aturan yang sama.
  if n >= 7 and gagal = 0 then
    lulus := lulus + 1; lap := lap || format(E'ok     semua %s admin_* tertutup untuk anon, terbuka untuk authenticated\n', n);
  elsif n < 7 then
    gagal := gagal + 1; lap := lap || format(E'GAGAL  diharapkan sedikitnya 7 fungsi admin_*, ada %s\n', n);
  end if;

  -- ---------- 2. ucapan_tulis: batasnya sendiri, bukan batasan tabel ----------
  insert into public.pasangan (slug, status, terbit) values ('uji-tutup-030', 'aktif', true);
  begin
    perform public.ucapan_tulis('uji-tutup-030', repeat('n', 41), 'Hadir', 'Selamat', null);
    ok := false; kode := 'diterima';
  exception when others then kode := sqlstate; ok := sqlstate = '22001'; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     nama 41 huruf ditolak ucapan_tulis sendiri (22001), bukan batasan tabel\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  nama 41 huruf: %s\n', kode); end if;

  begin
    perform public.ucapan_tulis('uji-tutup-030', repeat('n', 40), 'Hadir', repeat('p', 500), null);
    ok := true;
  exception when others then ok := false; kode := sqlstate || ' ' || sqlerrm; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     tepat 40/500 huruf diterima\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  40/500 ditolak: %s\n', kode); end if;

  begin
    perform public.ucapan_tulis('uji-tutup-030', 'Budi', 'Hadir', repeat('p', 501), null);
    ok := false; kode := 'diterima';
  exception when others then kode := sqlstate; ok := sqlstate = '22001'; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     ucapan 501 huruf ditolak dengan pesan yang rapi\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  ucapan 501 huruf: %s\n', kode); end if;

  -- ---------- 3. RPC bertoken yang tidak dipakai sudah hilang ----------
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('silsilah_daftar','silsilah_simpan','silsilah_hapus','foto_daftar','foto_ubah','panitia_pasangan_penuh');
  if n = 0 then lulus := lulus + 1; lap := lap || E'ok     enam RPC bertoken yang tidak dipakai sudah dibuang\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  masih ada %s RPC bertoken lama\n', n); end if;

  -- ---------- 4. RPC panitia yang dipakai /kirim tetap ada ----------
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('panitia_masuk','panitia_daftar','panitia_tambah','panitia_tandai','panitia_hapus',
                     'ucapan_daftar','ucapan_balas','ucapan_tampil','rekap_daftar','rekap_ringkas');
  if n = 10 then lulus := lulus + 1; lap := lap || E'ok     RPC panitia yang masih dipakai /kirim tidak tersentuh\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  RPC panitia tinggal %s dari 10\n', n); end if;

  raise exception E'\n===== LAPORAN UJI 030 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
