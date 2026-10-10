-- 013 — Kolom `kota`.
--
-- Baris penutup undangan berbunyi "Jepara · 15 September 2026". Tanggalnya
-- sudah ada di acara, tapi nama kotanya selama ini cuma tertulis di
-- index.html dan tidak pernah diperbarui oleh kode mana pun — satu-satunya
-- isi undangan yang luput waktu semuanya dipindah ke database.
--
-- Bisa saja ditebak dari `tempat.alamat`, tapi menebak nama kota dari
-- potongan alamat bebas itu rapuh. Satu kolom lebih jujur.

alter table public.pasangan
  add column if not exists kota text;

comment on column public.pasangan.kota is
  'Kota untuk baris penutup undangan, mis. "Jepara"';

update public.pasangan
   set kota = 'Jepara'
 where slug = 'rian-aini' and kota is null;

-- undangan_isi ikut menyertakan `kota`. Isi fungsinya sama persis dengan
-- migrasi 012, hanya bertambah satu baris — ditulis utuh karena
-- `create or replace` memang mengganti seluruh badan fungsinya.
-- Lihat 012 untuk penjelasan bagian-bagian lainnya.
