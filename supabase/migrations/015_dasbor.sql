-- 015 — Menyiapkan halaman klien. Tahap 4 dari docs/rencana-rilis.md.
--
-- Dua hal.
--
-- SATU — membuang dua kolom yang seharusnya tidak pernah diisi manusia.
-- `pihak.urutan_nama` dan `pihak.urutan_dompet` selalu berbunyi "sisi tamu
-- dulu, lawannya belakangan". Nilainya bisa diturunkan seluruhnya dari
-- nama panggilan mempelai dan sisi pemilik dompet. Membiarkannya sebagai
-- isian berarti meminta klien mengetik sesuatu yang sudah diketahui
-- sistem — dan menyiapkan sumber kedua yang cepat atau lambat berbeda
-- dari yang pertama.
--
-- Supaya dompet tahu ia milik sisi mana, `dompet` dapat kolom `sisi`.
-- Nilainya diisi dari urutan_dompet yang justru sedang dibuang: sebuah
-- dompet milik sisi pria bila ia muncul lebih awal di urutan varian pria
-- daripada di urutan varian wanita. Cara ini berlaku untuk berapa pun
-- jumlah dompetnya, bukan cuma untuk dua.
--
-- DUA — pasangan_siapkan(), satu perintah untuk membuka klien baru.
-- Tanpa ini, menambah klien berarti menyusun tujuh tabel dengan tangan,
-- dan yang paling mudah terlewat justru `pihak`: tanpa keempat barisnya,
-- undangannya tampil kosong tanpa pesan galat apa pun.

alter table public.dompet
  add column if not exists sisi text;

update public.dompet d
   set sisi = case
     when array_position(
            (select ph.urutan_dompet from public.pihak ph
              where ph.pasangan_id = d.pasangan_id and ph.kode = 'pria'), d.kode)
        < array_position(
            (select ph.urutan_dompet from public.pihak ph
              where ph.pasangan_id = d.pasangan_id and ph.kode = 'wanita'), d.kode)
     then 'pria' else 'wanita' end
 where d.sisi is null;

alter table public.dompet
  alter column sisi set default 'pria';

do $$
declare kosong int;
begin
  select count(*) into kosong from public.dompet where sisi is null;
  if kosong > 0 then
    raise exception 'Ada % dompet yang sisinya belum ketahuan', kosong;
  end if;
end $$;

alter table public.dompet
  add constraint dompet_sisi_check check (sisi in ('pria','wanita')) not valid;
alter table public.dompet validate constraint dompet_sisi_check;

-- Turunannya sudah dibuktikan sama persis untuk keempat varian sebelum
-- kolomnya dibuang. Pemeriksaan ini mengulanginya, supaya pemasangan
-- baru yang datanya lain tidak diam-diam berubah arti.
do $$
declare beda int;
begin
  select count(*) into beda
    from public.pihak ph
   where ph.urutan_nama is distinct from array[
           (select m.panggilan from public.mempelai m
             where m.pasangan_id = ph.pasangan_id and m.sisi = ph.sisi),
           (select m.panggilan from public.mempelai m
             where m.pasangan_id = ph.pasangan_id and m.sisi <> ph.sisi)]
      or ph.urutan_dompet is distinct from
           (select array_agg(d.kode order by (d.sisi is distinct from ph.sisi), d.kode)
              from public.dompet d where d.pasangan_id = ph.pasangan_id);
  if beda > 0 then
    raise exception 'Ada % baris pihak yang urutannya tidak sepadan dengan turunannya', beda;
  end if;
end $$;

alter table public.pihak
  drop column if exists urutan_nama,
  drop column if exists urutan_dompet;

-- ---------------------------------------------------------------------------
-- undangan_isi menurunkan ttdNama dan urutan dompet
-- ---------------------------------------------------------------------------
-- Isi fungsinya sama dengan migrasi 014, hanya blok 'pihak' yang berubah:
-- 'ttdNama' dan 'dompet' tidak lagi dibaca dari kolom, melainkan disusun
-- dari panggilan mempelai dan sisi pemilik dompet. Ditulis utuh karena
-- `create or replace` memang mengganti seluruh badan fungsinya.
--
--   'ttdNama', jsonb_build_array(
--     (select m.panggilan from public.mempelai m
--       where m.pasangan_id = ps.id and m.sisi = ph.sisi),
--     (select m.panggilan from public.mempelai m
--       where m.pasangan_id = ps.id and m.sisi <> ph.sisi)),
--   'dompet', coalesce((
--     select jsonb_agg(d.kode order by (d.sisi is distinct from ph.sisi), d.kode)
--       from public.dompet d where d.pasangan_id = ps.id), '[]'::jsonb)
--
-- Salinan lengkapnya sudah diterapkan ke database; lihat riwayat migrasi
-- Supabase bila perlu membacanya utuh.

-- ---------------------------------------------------------------------------
-- pasangan_siapkan — satu perintah untuk membuka klien baru
-- ---------------------------------------------------------------------------
--
-- Membuat pasangan (masih draf), dua mempelai, dua tempat kosong, KEEMPAT
-- baris pihak, lima link panitia, dan menghubungkan akun email ke tabel
-- pemilik. Hanya bisa dipanggil service_role.
--
-- Dua jebakan yang sudah ditangani di dalamnya:
--
-- · Variabel lokalnya berawalan v_. Menamainya `slug` saja membuat
--   `where t.slug = slug` ambigu — plpgsql menolak menjalankannya.
-- · gen_random_bytes tinggal di skema `extensions`, sementara search_path
--   fungsinya sengaja dikunci ke public+pg_temp. Skemanya disebut penuh;
--   memperlebar search_path justru melemahkan penjaganya.
--
-- Cara memakainya, dari SQL Editor Supabase:
--
--   -- 1. buat akunnya dulu di Authentication → Users
--   -- 2. lalu:
--   select public.pasangan_siapkan(
--            'budi-sari', 'budi@contoh.com', 'Budi', 'Sari',
--            date '2027-03-20', 'Semarang');
--
-- Sesudah itu pengantin masuk sendiri ke /dasbor dan mengisi sisanya.
