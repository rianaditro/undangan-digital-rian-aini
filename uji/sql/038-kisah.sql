-- Uji migrasi 038: kisah. Dibatalkan di akhir.
do $$
declare
  ps uuid; lain uuid; f1 uuid; f2 uuid; fl uuid; d jsonb; ok boolean; lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit) values ('uji-kisah-038', 'aktif', true) returning id into ps;
  insert into public.pasangan (slug, status, terbit) values ('uji-kisah-lain', 'aktif', true) returning id into lain;

  d := public.undangan_isi('uji-kisah-038');
  if d->'kisah' = '[]'::jsonb and d->>'pembuka' = 'islam' then
    lulus := lulus + 1; lap := lap || E'ok     tanpa bab: larik kosong; kunci 037 tetap\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  kosong: %s\n', d->'kisah'); end if;

  insert into public.foto (pasangan_id, jalur, lebar, tinggi) values (ps, 'u038/a.webp', 800, 1000) returning id into f1;
  insert into public.foto (pasangan_id, jalur, lebar, tinggi, tampil) values (ps, 'u038/b.webp', 800, 1000, false) returning id into f2;
  insert into public.foto (pasangan_id, jalur) values (lain, 'u038/lain.webp') returning id into fl;

  insert into public.kisah (pasangan_id, urutan, tahun, judul, teks, foto_id) values
    (ps, 2, '2023', 'Lamaran', 'Keluarga bertemu.', null),
    (ps, 1, '2015', 'Pertama bertemu', '  ', f1),
    (ps, 3, null, 'Menikah', null, f2);

  d := public.undangan_isi('uji-kisah-038');
  if jsonb_array_length(d->'kisah') = 3 and d->'kisah'->0->>'judul' = 'Pertama bertemu'
     and d->'kisah'->0->'foto'->>'jalur' = 'u038/a.webp' and d->'kisah'->0->'teks' = 'null'::jsonb
     and d->'kisah'->1->>'judul' = 'Lamaran' then
    lulus := lulus + 1; lap := lap || E'ok     bab berurutan, foto ikut, teks kosong jadi null\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi: %s\n', d->'kisah'); end if;

  if d->'kisah'->2->'foto' = 'null'::jsonb and d->'kisah'->2->'tahun' = 'null'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     foto yang disembunyikan tidak tampil di bab\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  foto tersembunyi: %s\n', d->'kisah'->2); end if;

  ok := false;
  begin insert into public.kisah (pasangan_id, judul, foto_id) values (ps, 'Curang', fl);
  exception when insufficient_privilege then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     foto pasangan lain ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  foto pasangan lain diterima\n'; end if;

  ok := false;
  begin insert into public.kisah (pasangan_id, judul, teks) values (ps, 'Panjang', repeat('x', 281));
  exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     teks lebih dari 280 huruf ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  teks panjang diterima\n'; end if;

  delete from public.foto where id = f1;
  if (select count(*) from public.kisah where pasangan_id = ps) = 3
     and (select foto_id from public.kisah where pasangan_id = ps and judul = 'Pertama bertemu') is null then
    lulus := lulus + 1; lap := lap || E'ok     menghapus foto tidak menghapus babnya\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  hapus foto\n'; end if;

  if has_table_privilege('anon', 'public.kisah', 'select') then
    gagal := gagal + 1; lap := lap || E'GAGAL  anon bisa membaca tabel kisah\n';
  else lulus := lulus + 1; lap := lap || E'ok     anon tidak bisa menyentuh tabel kisah\n'; end if;

  raise exception E'\n===== LAPORAN UJI 038 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
