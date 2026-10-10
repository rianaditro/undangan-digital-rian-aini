-- Uji migrasi 035: mode tampil per foto. Dibatalkan di akhir.
do $$
declare
  ps uuid; f1 uuid; d jsonb; ok boolean; lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit, kenangan_terbit) values ('uji-tampilan-035', 'aktif', true, true) returning id into ps;
  insert into public.foto (pasangan_id, jalur, bagian, lebar, tinggi) values (ps, 'u035/a.webp', 'keluarga', 1504, 1004) returning id into f1;

  if (select tampilan is null from public.foto where id = f1) then
    lulus := lulus + 1; lap := lap || E'ok     bawaan: null (otomatis dari ukuran)\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  bawaan tampilan\n'; end if;

  ok := false;
  begin update public.foto set tampilan = 'lebar' where id = f1; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     hanya isi atau utuh\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  tampilan sembarang diterima\n'; end if;

  update public.foto set tampilan = 'isi' where id = f1;
  d := public.terimakasih_isi('uji-tampilan-035');
  if d->'foto'->0->>'tampilan' = 'isi' and (d->'foto'->0->>'zum')::numeric = 1 and d ? 'vendor' then
    lulus := lulus + 1; lap := lap || E'ok     terimakasih_isi mengirim tampilan; kunci 034 tetap\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi: %s\n', d->'foto'); end if;

  raise exception E'\n===== LAPORAN UJI 035 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
