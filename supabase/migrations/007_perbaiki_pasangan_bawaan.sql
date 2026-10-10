-- 007 — pasangan_bawaan() harus security definer.
--
-- Fungsi ini dipakai sebagai DEFAULT kolom pasangan_id di tamu, pengiriman,
-- ucapan, dan panitia_akses (migrasi 004). Isinya membaca tabel `pasangan`.
--
-- Migrasi 005 memasang RLS pada `pasangan`, dan sejak itu anon tidak boleh
-- membacanya. Karena fungsinya security INVOKER, ia ikut berjalan sebagai
-- anon — jadi `select id from public.pasangan ...` mengembalikan NULL, bukan
-- id pasangan. Akibatnya setiap ucapan yang ditulis tamu (satu-satunya jalur
-- yang menulis langsung sebagai anon, tanpa RPC) tersimpan dengan
-- pasangan_id NULL alias tidak bertuan.
--
-- Belum ada barisnya yang rusak: 19 ucapan yang ada semuanya ditulis sebelum
-- 005 diterapkan. Tapi tamu baru akan menulis begitu undangannya beredar,
-- jadi ini ditutup sekarang.
--
-- Jalur panitia tidak terkena karena panitia_tambah sudah security definer.
--
-- Sekalian memasang search_path tetap, sesuai lint 0011: begitu sebuah fungsi
-- jadi security definer, search_path yang bisa diubah pemanggil berubah dari
-- kerapian jadi jalan masuk.

create or replace function public.pasangan_bawaan()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.pasangan order by dibuat limit 1;
$$;

-- Jaring pengaman kalau sempat ada baris tak bertuan yang lolos.
update public.ucapan      set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
update public.tamu        set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
update public.pengiriman  set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
