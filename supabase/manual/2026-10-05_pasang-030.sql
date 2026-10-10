-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- Migrasi 030 (Fase 3: menutup pintu yang tidak lagi dipakai), persis
-- seperti berkasnya di supabase/migrations/, dibungkus satu transaksi.
--
--   · fungsi admin_* tidak lagi bisa dipanggil tamu tanpa login
--   · ucapan_tulis membatasi 40/500 huruf, sama dengan formulirnya
--   · enam RPC bertoken yang tidak dipanggil siapa pun lagi dibuang
--
-- Undangan dan /kirim di main tidak memanggil satu pun yang dibuang —
-- diperiksa uji/db/kompat.mjs. Link panitia yang beredar tetap jalan.
--
-- Yang benar: "Success. No rows returned".

begin;

-- 030 — Fase 3: menutup pintu yang tidak lagi dipakai.
--
-- Tiga hal, semuanya diperiksa terhadap halaman di `main` DAN di cabang
-- platform oleh uji/db/kompat.mjs sebelum ditulis:
--
-- 1. Fungsi admin_* tidak lagi bisa dipanggil anon.
--    Isinya sudah menjaga diri lewat _admin_wajib(), jadi tidak ada yang
--    bocor selama ini. Tapi pertahanan berlapis: pintu yang tidak pernah
--    dipakai anon tidak perlu terbuka untuk anon. /admin memanggilnya
--    sesudah login, sebagai authenticated.
--
-- 2. ucapan_tulis membatasi 40/500 huruf, sama dengan tabel dan formulir.
--
-- 3. Enam RPC bertoken yang tidak dipanggil siapa pun lagi dibuang:
--      silsilah_daftar, silsilah_simpan, silsilah_hapus
--        → editor silsilah pindah ke /dasbor (REST + RLS pemilik)
--      foto_daftar, foto_ubah
--        → pustaka foto pindah ke /dasbor sejak langkah 2 kenangan
--      panitia_pasangan_penuh
--        → hanya dipakai jalan token foto-unggah, yang ditutup di v5
--    Ini langkah "buang belakangan" dari aturan kompatibilitas: tidak
--    satu pun dipanggil halaman di main maupun di cabang ini, dan tidak
--    ada fungsi SQL lain yang memanggilnya. Link panitia yang beredar
--    tidak terpengaruh — /kirim memakai RPC panitia_* yang lain.

-- ---------------------------------------------------------------------------
-- 1. admin_*
-- ---------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('admin_daftar', 'admin_token', 'admin_token_ganti', 'admin_status',
                         'admin_hapus_kosong', 'admin_slug_dipakai', 'admin_paket')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. ucapan_tulis — batas sama dengan tabel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ucapan_tulis(p_slug text, p_nama text, p_hadir text, p_pesan text, p_pihak text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  ps    public.pasangan;
  nama  text;
  pesan text;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(coalesce(p_slug, ''))) limit 1;

  if ps.id is null or not ps.terbit then
    raise exception 'Undangan tidak ditemukan' using errcode = 'P0002';
  end if;

  nama  := btrim(coalesce(p_nama, ''));
  pesan := btrim(coalesce(p_pesan, ''));

  -- 40 dan 500: sama dengan batasan tabel ucapan dan maxlength formulir.
  -- Dulu 60/800 di sini, sehingga 41-60 huruf lolos pemeriksaan ini lalu
  -- jatuh di batasan tabel dengan galat mentah.
  if char_length(nama) < 1 or char_length(nama) > 40 then
    raise exception 'Nama harus 1 sampai 40 huruf' using errcode = '22001';
  end if;
  if char_length(pesan) < 1 or char_length(pesan) > 500 then
    raise exception 'Ucapan harus 1 sampai 500 huruf' using errcode = '22001';
  end if;
  if coalesce(p_hadir,'') not in ('Hadir','Belum pasti','Tidak hadir') then
    raise exception 'Konfirmasi kehadiran tidak dikenal' using errcode = '22023';
  end if;

  insert into public.ucapan (pasangan_id, nama, hadir, pesan, pihak)
  values (ps.id, nama, p_hadir, pesan,
          (select ph.kode from public.pihak ph
            where ph.pasangan_id = ps.id and ph.kode = p_pihak));
end $function$;

-- ---------------------------------------------------------------------------
-- 3. RPC bertoken yang tidak dipakai lagi
-- ---------------------------------------------------------------------------
drop function if exists public.silsilah_daftar(text);
drop function if exists public.silsilah_simpan(text, uuid, text, text, text, text, integer, boolean);
drop function if exists public.silsilah_hapus(text, uuid);
drop function if exists public.foto_daftar(text);
drop function if exists public.foto_ubah(text, uuid, integer, text, boolean);
drop function if exists public.panitia_pasangan_penuh(text);

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000005', 'tutup_pintu')
on conflict (version) do nothing;

commit;
