-- Uji migrasi 026: satu latar per babak, dan foto selamat saat babaknya
-- dihapus. Seluruhnya di dalam satu transaksi yang DIBATALKAN oleh raise
-- di akhir.
do $$
declare
  ps    uuid;
  a1    uuid;
  a2    uuid;
  f1    uuid;
  f2    uuid;
  f3    uuid;
  f4    uuid;
  lap   text := '';
  lulus int  := 0;
  gagal int  := 0;
  n     int;
  b     boolean;

begin
  insert into public.pasangan (slug, status, terbit) values ('uji-latar-026', 'draf', false)
  returning id into ps;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas)
  values (ps, 1, 'Akad', 'Sabtu', '08.00', 'akad') returning id into a1;
  insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas)
  values (ps, 2, 'Resepsi', 'Sabtu', '11.00', 'resepsi') returning id into a2;

  insert into public.foto (pasangan_id, jalur, acara_id) values (ps, 'uji026/1.jpg', a1) returning id into f1;
  insert into public.foto (pasangan_id, jalur, acara_id) values (ps, 'uji026/2.jpg', a1) returning id into f2;
  insert into public.foto (pasangan_id, jalur, acara_id) values (ps, 'uji026/3.jpg', a2) returning id into f3;
  insert into public.foto (pasangan_id, jalur)           values (ps, 'uji026/4.jpg')     returning id into f4;

  -- 1. menyalakan latar pertama
  update public.foto set latar = true where id = f1;
  select count(*) into n from public.foto where acara_id = a1 and latar;
  if n = 1 then lulus := lulus + 1; lap := lap || E'ok     latar pertama menyala\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  %s latar di babak 1\n', n); end if;

  -- 2. menyalakan yang kedua mematikan yang pertama
  update public.foto set latar = true where id = f2;
  select latar into b from public.foto where id = f1;
  select count(*) into n from public.foto where acara_id = a1 and latar;
  if not b and n = 1 then lulus := lulus + 1; lap := lap || E'ok     latar baru menggantikan yang lama\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  babak 1 punya %s latar sesudah ganti\n', n); end if;

  -- 3. babak lain tidak terganggu
  update public.foto set latar = true where id = f3;
  select latar into b from public.foto where id = f2;
  if b then lulus := lulus + 1; lap := lap || E'ok     latar babak 2 tidak mematikan babak 1\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  latar babak 2 mematikan latar babak 1\n'; end if;

  -- 4. memindah foto berlatar ke babak lain = mengambil alih latar di sana
  update public.foto set acara_id = a1, latar = true where id = f3;
  select count(*) into n from public.foto where acara_id = a1 and latar;
  select latar into b from public.foto where id = f2;
  if n = 1 and not b then lulus := lulus + 1; lap := lap || E'ok     foto yang dipindah membawa latarnya\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  babak 1 punya %s latar sesudah pindah\n', n); end if;

  -- 5. latar tanpa babak tidak disimpan
  update public.foto set latar = true where id = f4;
  select latar into b from public.foto where id = f4;
  if not b then lulus := lulus + 1; lap := lap || E'ok     latar tanpa babak dimatikan\n';
  else gagal := gagal + 1; lap := lap || E'GAGAL  foto tanpa babak tersimpan sebagai latar\n'; end if;

  -- 6. menghapus babak tidak menghapus fotonya
  delete from public.acara where id = a1;
  select count(*) into n from public.foto where pasangan_id = ps;
  if n = 4 then lulus := lulus + 1; lap := lap || E'ok     foto tetap ada sesudah babaknya dihapus\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  tinggal %s dari 4 foto\n', n); end if;
  select count(*) into n from public.foto where pasangan_id = ps and acara_id is null;
  if n = 4 then lulus := lulus + 1; lap := lap || E'ok     foto babak terhapus kembali jadi foto lepas\n';
  else gagal := gagal + 1; lap := lap || format(E'GAGAL  %s foto lepas, seharusnya 4 (tiga dari babak 1, satu memang lepas)\n', n); end if;

  raise exception E'\n===== LAPORAN UJI 026 =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
