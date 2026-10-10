-- Uji migrasi 029: gerbang terbit halaman kenangan, dan pratinjau pemilik.
-- Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise di akhir.
do $$
declare
  ps    uuid;
  lain  uuid;
  u1    uuid := gen_random_uuid();
  u2    uuid := gen_random_uuid();
  d     jsonb;
  p     jsonb;
  n     int;
  ok    boolean;
  pesan text;
  lap   text := '';
  lulus int  := 0;
  gagal int  := 0;
begin
  insert into public.pasangan (slug, status, terbit) values ('uji-terbit-029', 'aktif', true) returning id into ps;
  insert into public.pasangan (slug, status, terbit) values ('uji-terbit-lain', 'aktif', true) returning id into lain;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas)
  values (ps, 1, 'Akad', 'Sabtu', '08.00', 'akad');
  insert into auth.users (id, email) values (u1, 'u1@uji.invalid'), (u2, 'u2@uji.invalid');
  insert into public.pemilik (user_id, pasangan_id) values (u1, ps), (u2, lain);

  -- ---------- 1. bawaan mati ----------
  if not (select kenangan_terbit from public.pasangan where id = ps) then
    lulus := lulus + 1; lap := lap || E'ok     kenangan_terbit lahir mati\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  kenangan_terbit lahir menyala\n'; end if;

  -- ---------- 2. undangan terbit, kenangan belum: tamu tidak melihat apa-apa ----------
  d := public.terimakasih_isi('uji-terbit-029');
  if d = jsonb_build_object('slug', 'uji-terbit-029', 'aktif', false) then
    lulus := lulus + 1; lap := lap || E'ok     undangan terbit, kenangan belum: {slug, aktif:false}\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  kenangan belum terbit tapi terlihat: %s\n', left(d::text, 120)); end if;

  -- ---------- 3. keduanya terbit ----------
  update public.pasangan set kenangan_terbit = true where id = ps;
  d := public.terimakasih_isi('uji-terbit-029');
  if (d->>'aktif')::boolean and jsonb_array_length(d->'babak') = 1 and not (d ? 'pratinjau') then
    lulus := lulus + 1; lap := lap || E'ok     keduanya terbit: tamu melihat isi, tanpa penanda pratinjau\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  keduanya terbit: %s\n', left(d::text, 120)); end if;

  -- ---------- 4. kenangan menyala, undangan ditarik: tetap tertutup ----------
  update public.pasangan set terbit = false, status = 'draf' where id = ps;
  d := public.terimakasih_isi('uji-terbit-029');
  if d = jsonb_build_object('slug', 'uji-terbit-029', 'aktif', false) then
    lulus := lulus + 1; lap := lap || E'ok     undangan draf menutup kenangan walau saklarnya menyala\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  undangan draf tapi kenangan terlihat\n'; end if;
  update public.pasangan set terbit = true, status = 'aktif', kenangan_terbit = false where id = ps;

  -- ---------- 5. pemilik melihat pratinjau selagi belum terbit ----------
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  execute 'select public.terimakasih_pratinjau($1)' into p using 'uji-terbit-029';
  reset role;
  if (p->>'pratinjau')::boolean and (p->>'aktif')::boolean and jsonb_array_length(p->'babak') = 1
     and (p->>'kenangan_terbit')::boolean = false and (p->>'undangan_terbit')::boolean = true then
    lulus := lulus + 1; lap := lap || E'ok     pemilik: pratinjau utuh selagi kenangan belum terbit, dengan keadaan terbitnya\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  pratinjau pemilik: %s\n', left(coalesce(p::text, 'null'), 160)); end if;

  -- ---------- 6. pratinjau = yang nanti dilihat tamu ----------
  update public.pasangan set kenangan_terbit = true where id = ps;
  d := public.terimakasih_isi('uji-terbit-029');
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  execute 'select public.terimakasih_pratinjau($1)' into p using 'uji-terbit-029';
  reset role;
  if (p - 'pratinjau' - 'undangan_terbit' - 'kenangan_terbit') = d then
    lulus := lulus + 1; lap := lap || E'ok     isi pratinjau sama persis dengan isi untuk tamu\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pratinjau berbeda dari yang dilihat tamu\n'; end if;

  -- ---------- 7. pemilik pasangan lain ditolak, tanpa membedakan ada/tidak ----------
  perform set_config('request.jwt.claim.sub', u2::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    execute 'select public.terimakasih_pratinjau($1)' into p using 'uji-terbit-029';
  exception when insufficient_privilege then ok := true; pesan := sqlerrm; end;
  begin
    execute 'select public.terimakasih_pratinjau($1)' into p using 'tidak-pernah-ada';
    ok := false;
  exception when insufficient_privilege then ok := ok and sqlerrm = pesan; end;
  reset role;
  if ok then lulus := lulus + 1; lap := lap || E'ok     pratinjau milik orang lain ditolak, sama dengan slug yang tidak ada\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pratinjau pasangan lain bocor atau pesannya membedakan\n'; end if;

  -- ---------- 8. anon tidak bisa memanggil pratinjau ----------
  if not has_function_privilege('anon', 'public.terimakasih_pratinjau(text)', 'execute')
     and has_function_privilege('authenticated', 'public.terimakasih_pratinjau(text)', 'execute')
     and has_function_privilege('anon', 'public.terimakasih_isi(text)', 'execute') then
    lulus := lulus + 1; lap := lap || E'ok     pratinjau hanya untuk authenticated; pintu tamu tetap untuk anon\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  hak eksekusi pratinjau/isi salah\n'; end if;

  -- ---------- 9. saklar dipegang pemilik lewat RLS ----------
  perform set_config('request.jwt.claim.sub', u2::text, true);
  execute 'set local role authenticated';
  execute format('update public.pasangan set kenangan_terbit = false where id = %L', ps);
  get diagnostics n = row_count;
  reset role;
  ok := (select kenangan_terbit from public.pasangan where id = ps);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  execute 'set local role authenticated';
  execute format('update public.pasangan set kenangan_terbit = false where id = %L', ps);
  reset role;
  if n = 0 and ok and not (select kenangan_terbit from public.pasangan where id = ps) then
    lulus := lulus + 1; lap := lap || E'ok     pemilik lain tidak bisa mematikan saklar; pemiliknya bisa\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  saklar: pemilik lain mengubah %s baris\n', n); end if;

  raise exception E'\n===== LAPORAN UJI 029 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
