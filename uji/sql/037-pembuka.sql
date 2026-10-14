-- Uji migrasi 037: pembuka menurut agama. Dibatalkan di akhir.
do $$
declare
  ps uuid; d jsonb; ok boolean; lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit) values ('uji-pembuka-037', 'aktif', true) returning id into ps;

  d := public.undangan_isi('uji-pembuka-037');
  if d->>'pembuka' = 'islam' then
    lulus := lulus + 1; lap := lap || E'ok     bawaan islam: pasangan lama tidak berubah\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  bawaan: %s\n', d->>'pembuka'); end if;

  update public.pasangan set pembuka = 'hindu' where id = ps;
  d := public.undangan_isi('uji-pembuka-037');
  if d->>'pembuka' = 'hindu' and d ? 'foto' and d ? 'tema_setel' and d ? 'dompet' then
    lulus := lulus + 1; lap := lap || E'ok     pembuka sampai ke undangan_isi; kunci 036 tetap\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi: %s\n', d); end if;

  ok := false;
  begin update public.pasangan set pembuka = 'lain' where id = ps; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     pembuka di luar daftar ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  pembuka sembarang diterima\n'; end if;

  raise exception E'\n===== LAPORAN UJI 037 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
