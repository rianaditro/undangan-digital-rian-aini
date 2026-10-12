-- Uji migrasi 036: bab "Di balik layar". Dibatalkan di akhir.
do $$
declare
  ps uuid; f1 uuid; d jsonb; ok boolean; lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit, kenangan_terbit) values ('uji-bts-036', 'aktif', true, true) returning id into ps;
  insert into public.foto (pasangan_id, jalur, bagian, latar) values (ps, 'u036/a.webp', 'bts', true) returning id into f1;
  insert into public.kenangan_blok (pasangan_id, kunci, judul) values (ps, 'bts', 'Sebelum Pintu Dibuka');

  d := public.terimakasih_isi('uji-bts-036');
  if d->'foto'->0->>'bagian' = 'bts' and (d->'foto'->0->>'latar')::boolean and d->'blok'->'bts'->>'judul' = 'Sebelum Pintu Dibuka' then
    lulus := lulus + 1; lap := lap || E'ok     foto dan blok bts diterima dan dikirim terimakasih_isi\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi: %s / %s\n', d->'foto', d->'blok'); end if;

  ok := false;
  begin insert into public.foto (pasangan_id, jalur, bagian) values (ps, 'u036/b.webp', 'persiapan'); exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     bagian sembarang tetap ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  bagian sembarang diterima\n'; end if;

  raise exception E'\n===== LAPORAN UJI 036 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
