-- 022 — undangan_tamu() tidak menyaring pasangan.
--
--   select t.nama, t.pihak from public.tamu t
--    where t.slug = lower(trim(p_slug)) limit 1;
--
-- Slug tamu TIDAK unik secara global — sejak migrasi 004 indeksnya
-- `(pasangan_id, slug)`. Dua pasangan boleh sama-sama punya tamu
-- `bapak-ahmad`, dan memang akan: nama seperti itu ada di hampir setiap
-- daftar tamu di Indonesia. `limit 1` lalu memilih baris mana saja yang
-- kebetulan lebih dulu.
--
-- Dibuktikan dengan pasangan kedua sungguhan: permintaan dari undangan
-- Rian & 'Aini dijawab "Ibu Rahayu (tamu Budi & Sari)" berikut
-- pihak `keluarga-pria`.
--
-- Akibatnya bukan cuma nama yang salah di sampul. `pihak` ikut salah,
-- dan pihak menentukan alamat acara, urutan nama, dan NOMOR DOMPET yang
-- ditampilkan. Tamu bisa diarahkan ke rumah yang salah dan mengirim uang
-- ke rekening yang salah.
--
-- Ini lubang ketiga dari keluarga yang sama — sesudah panitia_* (017)
-- dan buku tamu (021). Semuanya lahir sebelum tabel punya `pasangan_id`,
-- dan semuanya terlewat waktu kolom itu ditambahkan di migrasi 004.
-- Sesudah ini, tidak ada lagi fungsi publik yang membaca `tamu` tanpa
-- menyebut pasangannya.

-- Tanda tangan lama dibuang, bukan dibiarkan berdampingan. Dibiarkan,
-- ia tetap jadi jalan yang lebih mudah dipanggil — dan jalan yang lebih
-- mudah itu justru yang bocor.
--
-- Halaman lama yang masih tersimpan di cache akan menerima galat dan
-- sudah menanganinya: index.html memakai .catch() dan jatuh ke nama dari
-- alamat. Gagal jadi nama seadanya jauh lebih baik daripada berhasil
-- jadi nama orang lain.
drop function if exists public.undangan_tamu(text);

create or replace function public.undangan_tamu(p_slug text, p_pasangan text)
returns table (nama text, pihak text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.nama, t.pihak
    from public.tamu t
    join public.pasangan p on p.id = t.pasangan_id
   where t.slug = lower(btrim(coalesce(p_slug, '')))
     and p.slug = lower(btrim(coalesce(p_pasangan, '')))
   limit 1;
$$;

grant execute on function public.undangan_tamu(text, text) to anon, authenticated;
