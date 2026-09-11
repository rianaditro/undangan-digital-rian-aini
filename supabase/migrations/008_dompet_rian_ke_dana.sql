-- 008 — Dompet Rian: SeaBank diganti DANA.
--
-- Migrasi 003 menyeed dompet dengan `on conflict do nothing`, jadi mengubah
-- nilai di 003 saja tidak mengubah baris yang sudah telanjur ada. Perubahan
-- nilainya perlu update tersendiri, dan inilah tempatnya.
--
-- Nilai di sini harus selalu sepadan dengan DOMPET di assets/varian.js.
-- Selama frontend masih membaca varian.js, berkas itu yang menentukan apa
-- yang dilihat tamu; tabel ini baru mengambil alih setelah halaman dipindah
-- ke undangan_isi(). Kalau keduanya berbeda, nomor lama akan hidup lagi
-- diam-diam saat perpindahan itu.

update public.dompet d
   set bank = 'DANA', nomor = '085330794639'
  from public.pasangan p
 where d.pasangan_id = p.id
   and p.slug = 'rian-aini'
   and d.kode = 'rian';
