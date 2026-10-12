-- 036 — bab "Di balik layar" (behind the scene) di halaman kenangan.
--
-- Bab media biasa dengan kunci 'bts': foto persiapan — rias, gaun,
-- dekorasi yang dipasang, tawa gugup sebelum acara. Seperti bab media
-- lain, ia hanya muncul kalau ada fotonya (atau pasangan menulisinya),
-- jadi pasangan yang tidak mau cukup tidak memberi bab ini pada foto
-- apa pun, atau mematikannya di dasbor.
--
-- Hanya melebarkan dua daftar kunci; fungsi terimakasih_* tidak berubah
-- karena keduanya sudah meneruskan foto.bagian dan kenangan_blok apa
-- adanya. Halaman lama mengabaikan bab yang tidak dikenalnya.

alter table public.foto drop constraint if exists foto_bagian_check;
alter table public.foto add  constraint foto_bagian_check
  check (bagian is null or bagian in
    ('sampul','pria','wanita','bts','kedatangan','sungkem','keluarga','tamu','berdua'));

alter table public.kenangan_blok drop constraint if exists kenangan_blok_kunci_check;
alter table public.kenangan_blok add constraint kenangan_blok_kunci_check check (kunci in (
  'sampul','pembuka','angka','galeri','ucapan','penutup',
  'pria','wanita','bts','kedatangan','sungkem','keluarga','tamu','berdua','vendor'));
