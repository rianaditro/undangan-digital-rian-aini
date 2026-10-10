-- Uji migrasi 034: potongan foto (fokus + zum). Dibatalkan di akhir.
do $$
declare
  ps uuid; f1 uuid; d jsonb; ok boolean; lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit, kenangan_terbit) values ('uji-potong-034', 'aktif', true, true) returning id into ps;
  insert into public.foto (pasangan_id, jalur, bagian) values (ps, 'u034/a.webp', 'keluarga') returning id into f1;

  if (select fokus_x = 50 and fokus_y = 50 and zum = 1 from public.foto where id = f1) then
    lulus := lulus + 1; lap := lap || E'ok     bawaan: tengah, tanpa perbesaran\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  bawaan potongan\n'; end if;

  ok := true;
  begin update public.foto set zum = 4 where id = f1; ok := false; exception when check_violation then null; end;
  begin update public.foto set fokus_x = -1 where id = f1; ok := false; exception when check_violation then null; end;
  begin update public.foto set fokus_y = 101 where id = f1; ok := false; exception when check_violation then null; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     di luar 0–100 % atau zum di luar 1–3 ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  batas potongan\n'; end if;

  update public.foto set fokus_x = 30, fokus_y = 72.5, zum = 1.4 where id = f1;
  d := public.terimakasih_isi('uji-potong-034');
  if (d->'foto'->0->>'fokus_x')::numeric = 30 and (d->'foto'->0->>'fokus_y')::numeric = 72.5 and (d->'foto'->0->>'zum')::numeric = 1.4
     and d ?& array['vendor','babak','blok','ucapan','mempelai'] then
    lulus := lulus + 1; lap := lap || E'ok     terimakasih_isi mengirim potongan; kunci 033 tetap\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi: %s\n', d->'foto'); end if;

  raise exception E'\n===== LAPORAN UJI 034 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
