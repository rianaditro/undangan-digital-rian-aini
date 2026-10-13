-- Uji migrasi 036: peran foto di undangan, setelan tema. Dibatalkan di akhir.
do $$
declare
  ps uuid; f1 uuid; f2 uuid; f3 uuid; v1 uuid; d jsonb; ok boolean;
  lap text := ''; lulus int := 0; gagal int := 0;
begin
  insert into public.pasangan (slug, status, terbit, kenangan_terbit)
    values ('uji-tema-036', 'aktif', true, true) returning id into ps;

  d := public.undangan_isi('uji-tema-036');
  if d->'foto' = '{"sampul": null, "pria": null, "wanita": null, "galeri": []}'::jsonb
     and d->'tema_setel' = '{}'::jsonb then
    lulus := lulus + 1; lap := lap || E'ok     tanpa foto: bentuk tetap, setelan kosong\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  bentuk kosong: %s %s\n', d->'foto', d->'tema_setel'); end if;

  insert into public.foto (pasangan_id, jalur, lebar, tinggi, urutan)
    values (ps, 'u036/a.webp', 1000, 1500, 1) returning id into f1;
  insert into public.foto (pasangan_id, jalur, lebar, tinggi, urutan)
    values (ps, 'u036/b.webp', 1500, 1000, 2) returning id into f2;
  insert into public.foto (pasangan_id, jalur, lebar, tinggi, urutan)
    values (ps, 'u036/c.webp', 1500, 1000, 3) returning id into f3;

  d := public.undangan_isi('uji-tema-036');
  if d->'foto'->'sampul' = 'null'::jsonb and jsonb_array_length(d->'foto'->'galeri') = 0 then
    lulus := lulus + 1; lap := lap || E'ok     foto tanpa peran tidak tampil di undangan\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  bawaan peran: %s\n', d->'foto'); end if;

  update public.foto set peran = 'sampul' where id = f1;
  update public.foto set peran = 'sampul' where id = f2;
  if (select count(*) from public.foto where pasangan_id = ps and peran = 'sampul') = 1
     and (select peran from public.foto where id = f2) = 'sampul'
     and (select peran from public.foto where id = f1) is null then
    lulus := lulus + 1; lap := lap || E'ok     satu sampul: yang baru menggantikan yang lama\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  dua sampul\n'; end if;

  update public.foto set peran = 'galeri' where id in (f1, f3);
  update public.foto set peran = 'pria', fokus_x = 30 where id = f2;
  d := public.undangan_isi('uji-tema-036');
  if d->'foto'->'pria'->>'jalur' = 'u036/b.webp'
     and (d->'foto'->'pria'->>'fokus_x')::numeric = 30
     and d->'foto'->'galeri'->0->>'jalur' = 'u036/a.webp'
     and d->'foto'->'galeri'->1->>'jalur' = 'u036/c.webp' then
    lulus := lulus + 1; lap := lap || E'ok     potret + galeri berurutan, membawa potongan\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  isi foto: %s\n', d->'foto'); end if;

  update public.foto set tampil = false where id = f3;
  d := public.undangan_isi('uji-tema-036');
  if jsonb_array_length(d->'foto'->'galeri') = 1 then
    lulus := lulus + 1; lap := lap || E'ok     foto disembunyikan tidak tampil di galeri\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  foto tersembunyi bocor\n'; end if;

  ok := false;
  begin update public.foto set peran = 'latar' where id = f1; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     peran sembarang ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  peran sembarang diterima\n'; end if;

  insert into public.foto (pasangan_id, jalur, jenis) values (ps, 'u036/v.mp4', 'video') returning id into v1;
  ok := false;
  begin update public.foto set peran = 'galeri' where id = v1; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     video tidak bisa berperan di undangan\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  video diterima sebagai galeri\n'; end if;

  update public.pasangan set tema_setel = '{"palet":"sogan","huruf":"keraton"}' where id = ps;
  d := public.undangan_isi('uji-tema-036');
  if d->'tema_setel'->>'palet' = 'sogan'
     and public.terimakasih_isi('uji-tema-036')->'tema_setel'->>'huruf' = 'keraton'
     and public.terimakasih_isi('uji-tema-036')->>'tema' = 'ukir-jepara' then
    lulus := lulus + 1; lap := lap || E'ok     setelan & tema sampai ke undangan dan terima kasih\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  setelan: %s\n', d->'tema_setel'); end if;

  ok := false;
  begin update public.pasangan set tema_setel = '[]' where id = ps; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     setelan harus objek\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  setelan larik diterima\n'; end if;

  update public.pasangan set tema = 'custom/teras-jati' where id = ps;
  ok := false;
  begin update public.pasangan set tema = '../dasbor' where id = ps; exception when check_violation then ok := true; end;
  if ok then lulus := lulus + 1; lap := lap || E'ok     nama tema: custom/<kode> boleh, jalur keluar folder ditolak\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  nama tema ../ diterima\n'; end if;

  d := public.undangan_isi('uji-tema-036');
  if d ? 'dompet' and d ? 'pihak' and d ? 'acara' and d ? 'silsilah' then
    lulus := lulus + 1; lap := lap || E'ok     kunci lama undangan_isi tetap ada\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  kunci lama hilang\n'; end if;

  raise exception E'\n===== LAPORAN UJI 036 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n', lap, lulus, gagal;
end $$;
