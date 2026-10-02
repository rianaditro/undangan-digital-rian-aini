-- Uji migrasi 022: undangan_tamu() harus terkunci per pasangan.
-- Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise di akhir.
do $$
declare
  p1        uuid;
  p2        uuid;
  t1        uuid;
  t2        uuid;
  lap       text := '';
  lulus     int  := 0;
  gagal     int  := 0;
  n         int;
  r         record;
  v_nama    text;
  v_pihak   text;

  procedure_ada int;

  -- cek
  function_ok boolean;
begin
  select id into p1 from public.pasangan where slug = 'rian-aini';
  if p1 is null then raise exception 'pasangan rian-aini tidak ada'; end if;

  -- ---------- siapkan pasangan kedua sungguhan ----------
  insert into public.pasangan (slug, status, terbit, kota)
  values ('budi-sari', 'aktif', true, 'Jepara')
  returning id into p2;

  insert into public.tamu (pasangan_id, nama, slug, pihak)
  values (p2, 'Ibu Rahayu (tamu Budi & Sari)', 'bapak-ahmad', 'keluarga-pria')
  returning id into t2;

  -- tamu pasangan 1 dengan slug yang SAMA
  select id into t1 from public.tamu where pasangan_id = p1 and slug = 'bapak-ahmad';
  if t1 is null then
    insert into public.tamu (pasangan_id, nama, slug, pihak)
    values (p1, 'Bapak Ahmad (tamu Rian)', 'bapak-ahmad', 'keluarga-wanita')
    returning id into t1;
  end if;

  -- prasyarat: dua baris, slug sama, pasangan beda
  select count(*) into n from public.tamu where slug = 'bapak-ahmad';
  if n <> 2 then
    gagal := gagal + 1;
    lap := lap || format(E'GAGAL  prasyarat: harus 2 tamu ber-slug bapak-ahmad, ada %s\n', n);
  else
    lulus := lulus + 1;
    lap := lap || E'ok     prasyarat: dua pasangan sama-sama punya tamu "bapak-ahmad"\n';
  end if;

  -- ---------- panggil sebagai anon, persis seperti halaman undangan ----------
  execute 'set local role anon';

  -- 1. undangan pasangan 1 dapat tamu pasangan 1
  select u.nama, u.pihak into v_nama, v_pihak
    from public.undangan_tamu('bapak-ahmad', 'rian-aini') u;
  if v_nama = 'Bapak Ahmad (tamu Rian)' and v_pihak = 'keluarga-wanita' then
    lulus := lulus + 1;
    lap := lap || E'ok     rian-aini  -> tamu sendiri\n';
  else
    gagal := gagal + 1;
    lap := lap || format(E'GAGAL  rian-aini  -> %s / %s\n', coalesce(v_nama,'(kosong)'), coalesce(v_pihak,'-'));
  end if;

  -- 2. undangan pasangan 2 dapat tamu pasangan 2
  v_nama := null; v_pihak := null;
  select u.nama, u.pihak into v_nama, v_pihak
    from public.undangan_tamu('bapak-ahmad', 'budi-sari') u;
  if v_nama = 'Ibu Rahayu (tamu Budi & Sari)' and v_pihak = 'keluarga-pria' then
    lulus := lulus + 1;
    lap := lap || E'ok     budi-sari  -> tamu sendiri\n';
  else
    gagal := gagal + 1;
    lap := lap || format(E'GAGAL  budi-sari  -> %s / %s\n', coalesce(v_nama,'(kosong)'), coalesce(v_pihak,'-'));
  end if;

  -- 3. slug pasangan karangan -> KOSONG (bukan tamu siapa pun)
  select count(*) into n from public.undangan_tamu('bapak-ahmad', 'pasangan-karangan') u;
  if n = 0 then
    lulus := lulus + 1;
    lap := lap || E'ok     pasangan karangan -> 0 baris\n';
  else
    gagal := gagal + 1;
    lap := lap || format(E'GAGAL  pasangan karangan -> %s baris (BOCOR)\n', n);
  end if;

  -- 4. slug pasangan null / kosong -> KOSONG
  select count(*) into n from public.undangan_tamu('bapak-ahmad', null) u;
  if n = 0 then lulus := lulus + 1; lap := lap || E'ok     p_pasangan null -> 0 baris\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  p_pasangan null -> %s baris\n', n); end if;

  select count(*) into n from public.undangan_tamu('bapak-ahmad', '') u;
  if n = 0 then lulus := lulus + 1; lap := lap || E'ok     p_pasangan kosong -> 0 baris\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  p_pasangan kosong -> %s baris\n', n); end if;

  -- 5. spasi + huruf besar dinormalkan di dua-duanya
  v_nama := null;
  select u.nama into v_nama from public.undangan_tamu('  BAPAK-AHMAD ', ' Rian-Aini ') u;
  if v_nama = 'Bapak Ahmad (tamu Rian)' then
    lulus := lulus + 1; lap := lap || E'ok     spasi/huruf besar dinormalkan\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  normalisasi -> %s\n', coalesce(v_nama,'(kosong)'));
  end if;

  -- 6. slug tamu karangan -> kosong, bukan tamu pertama yang kebetulan ada
  select count(*) into n from public.undangan_tamu('tamu-karangan-xyz', 'rian-aini') u;
  if n = 0 then lulus := lulus + 1; lap := lap || E'ok     slug tamu karangan -> 0 baris\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  slug tamu karangan -> %s baris\n', n); end if;

  reset role;

  -- 7. tanda tangan satu argumen sudah TIDAK ADA
  select count(*) into procedure_ada
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'undangan_tamu'
     and p.pronargs = 1;
  if procedure_ada = 0 then
    lulus := lulus + 1; lap := lap || E'ok     undangan_tamu(text) satu argumen sudah dibuang\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  undangan_tamu(text) satu argumen MASIH ADA\n';
  end if;

  -- 8. memanggilnya benar-benar galat (bukan cuma hilang dari katalog)
  function_ok := false;
  begin
    execute $q$ select * from public.undangan_tamu('bapak-ahmad') $q$;
    function_ok := true;
  exception when undefined_function then
    function_ok := false;
  end;
  if not function_ok then
    lulus := lulus + 1; lap := lap || E'ok     panggilan satu argumen -> undefined_function\n';
  else
    gagal := gagal + 1; lap := lap || E'GAGAL  panggilan satu argumen MASIH BERHASIL\n';
  end if;

  -- 9. anon masih boleh eksekusi tanda tangan baru (sudah terbukti di 1-6),
  --    dan anon TETAP tidak boleh membaca tabel tamu langsung
  execute 'set local role anon';
  function_ok := false;
  begin
    execute 'select count(*) from public.tamu' into n;
    function_ok := (n > 0);
  exception when insufficient_privilege then
    function_ok := false;
  end;
  reset role;
  if not function_ok then
    lulus := lulus + 1; lap := lap || E'ok     anon tetap tidak bisa baca tabel tamu langsung\n';
  else
    gagal := gagal + 1; lap := lap || format(E'GAGAL  anon membaca %s baris tamu langsung\n', n);
  end if;

  raise exception E'\n===== LAPORAN UJI 022 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
