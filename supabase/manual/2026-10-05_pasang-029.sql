-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- Migrasi 029 (saklar terbit halaman kenangan + pratinjau pemilik),
-- persis seperti berkasnya di supabase/migrations/, dibungkus satu
-- transaksi: kalau satu baris gagal, tidak ada yang berubah sama sekali.
--
-- Yang berubah untuk tamu: halaman kenangan (/terimakasih) kini tertutup
-- sampai pasangannya menyalakan saklar di dasbor kotak 10 — termasuk
-- Rian & 'Aini. Undangan di main tidak terpengaruh; ia tidak memanggil
-- fungsi-fungsi ini.
--
-- Yang benar: "Success. No rows returned".

begin;

-- 029 — saklar terbit halaman kenangan, dan pratinjau untuk pemiliknya.
--
-- Langkah 4 dari docs/kenangan.md.
--
-- Undangan dan halaman kenangan terbit sendiri-sendiri. Undangan terbit
-- berminggu-minggu sebelum acara; halaman kenangan baru pantas dibuka
-- sesudah foto-fotonya masuk dan babaknya disusun. Satu saklar untuk
-- keduanya berarti tamu yang membuka /terimakasih sehari sebelum akad
-- melihat halaman "kenangan" berisi kartu teks kosong.
--
-- Isi halamannya dibangun di SATU fungsi dalam, _terimakasih_bangun.
-- Dua pintu memanggilnya:
--
--   terimakasih_isi(slug)        tamu, anon. Terbuka hanya kalau undangan
--                                terbit DAN kenangan_terbit.
--   terimakasih_pratinjau(slug)  pemilik yang login. Terbuka selalu,
--                                selama pasangan itu miliknya.
--
-- Dua salinan isi akan berakhir dengan pratinjau yang memperlihatkan
-- sesuatu yang tidak akan dilihat tamu — persis yang tidak boleh
-- terjadi pada pratinjau.
--
-- Tanda tangan terimakasih_isi(text) tidak berubah dan kunci jawabannya
-- sama. Yang berubah: pasangan yang belum menyalakan kenangan_terbit
-- mendapat {slug, aktif:false}. `main` tidak memanggil fungsi ini.

alter table public.pasangan
  add column if not exists kenangan_terbit boolean not null default false;

comment on column public.pasangan.kenangan_terbit is
  'Halaman kenangan (/terimakasih) terbuka untuk tamu. Terpisah dari terbit (undangan).';

-- ---------------------------------------------------------------------------
-- _terimakasih_bangun — satu-satunya tempat isi halaman disusun
-- ---------------------------------------------------------------------------
-- Tanpa gerbang apa pun: penjaganya dua pembungkus di bawah. Karena itu
-- ia ditutup dari semua peran (uji 023-hak-fungsi memeriksa semua fungsi
-- berawalan garis bawah).
create or replace function public._terimakasih_bangun(ps public.pasangan)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'slug',          ps.slug,
    'aktif',         true,
    'tanggal_acara', ps.tanggal_acara,

    'hadir', (
      select nullif(count(*), 0)
        from public.tamu t
       where t.pasangan_id = ps.id
         and t.datang is true),

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan,
        'lengkap',   m.lengkap))
        from public.mempelai m where m.pasangan_id = ps.id),

    'foto', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jalur',      f.jalur,
        'kecil',      f.jalur_kecil,
        'lebar',      f.lebar,
        'tinggi',     f.tinggi,
        'keterangan', f.keterangan,
        'acara_id',   f.acara_id)
        order by f.urutan, f.diunggah), '[]'::jsonb)
        from public.foto f
       where f.pasangan_id = ps.id
         and f.tampil),

    'babak', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',          a.id,
        'nama',        a.nama,
        'tanggal',     a.tanggal,
        'jam',         a.jam,
        'teks',        nullif(btrim(coalesce(a.kenangan_teks, '')), ''),
        'jumlah_foto', (select count(*) from public.foto f
                         where f.pasangan_id = ps.id and f.acara_id = a.id and f.tampil),
        'latar', (
          select jsonb_build_object(
            'jalur',      f.jalur,
            'kecil',      f.jalur_kecil,
            'lebar',      f.lebar,
            'tinggi',     f.tinggi,
            'keterangan', f.keterangan)
            from public.foto f
           where f.pasangan_id = ps.id
             and f.acara_id = a.id
             and f.tampil
           order by f.latar desc, f.urutan, f.diunggah
           limit 1))
        order by a.urutan), '[]'::jsonb)
        from public.acara a
       where a.pasangan_id = ps.id
         and a.di_terimakasih),

    'blok', (
      select coalesce(jsonb_object_agg(b.kunci, jsonb_build_object(
        'tampil', b.tampil,
        'judul',  nullif(btrim(coalesce(b.judul, '')), ''),
        'teks',   nullif(btrim(coalesce(b.teks,  '')), ''))), '{}'::jsonb)
        from public.kenangan_blok b
       where b.pasangan_id = ps.id),

    'angka', jsonb_build_object(
      'hadir',  (select nullif(count(*), 0) from public.tamu t
                  where t.pasangan_id = ps.id and t.datang is true),
      'ucapan', (select nullif(count(*), 0) from public.ucapan u
                  where u.pasangan_id = ps.id and u.tampil),
      'foto',   (select nullif(count(*), 0) from public.foto f
                  where f.pasangan_id = ps.id and f.tampil),
      'babak',  (select nullif(count(*), 0) from public.acara a
                  where a.pasangan_id = ps.id and a.di_terimakasih)),

    'ucapan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nama',    u.nama,
        'hadir',   u.hadir,
        'pesan',   u.pesan,
        'waktu',   u.created_at,
        'balasan', u.balasan,
        'dibalas', u.dibalas_pada)
        order by u.created_at desc), '[]'::jsonb)
        from public.ucapan u
       where u.pasangan_id = ps.id
         and u.tampil)
  )
$$;

revoke all on function public._terimakasih_bangun(public.pasangan) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- terimakasih_isi — pintu tamu
-- ---------------------------------------------------------------------------
create or replace function public.terimakasih_isi(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  ps public.pasangan;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(coalesce(p_slug, ''))) limit 1;

  if ps.id is null then
    return null;
  end if;

  -- Tidak membedakan "undangan draf" dari "kenangan belum terbit":
  -- tamu tidak perlu tahu yang mana, dan jawaban yang sama untuk
  -- keduanya tidak membocorkan keadaan pasangan.
  if not ps.terbit or ps.status not in ('aktif','lewat','arsip') or not ps.kenangan_terbit then
    return jsonb_build_object('slug', ps.slug, 'aktif', false);
  end if;

  return public._terimakasih_bangun(ps);
end $$;

grant execute on function public.terimakasih_isi(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- terimakasih_pratinjau — pintu pemilik
-- ---------------------------------------------------------------------------
-- Pemilik ditentukan pasangan_saya() — tabel `pemilik`, bukan siapa pun
-- yang berhasil login. Dua penanda tambahan memberi tahu halaman apa
-- yang SEKARANG dilihat tamu, supaya pita pratinjaunya bisa jujur.
create or replace function public.terimakasih_pratinjau(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  ps public.pasangan;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(coalesce(p_slug, '')))
     and id in (select public.pasangan_saya())
   limit 1;

  if ps.id is null then
    -- Sama untuk "tidak ada" dan "bukan milik Anda": slug orang lain
    -- tidak bisa dipakai untuk menebak pasangan mana yang ada.
    raise exception 'Bukan undangan Anda' using errcode = '42501';
  end if;

  return public._terimakasih_bangun(ps) || jsonb_build_object(
    'pratinjau',       true,
    'undangan_terbit', ps.terbit and ps.status in ('aktif','lewat','arsip'),
    'kenangan_terbit', ps.kenangan_terbit);
end $$;

revoke all on function public.terimakasih_pratinjau(text) from public, anon;
grant execute on function public.terimakasih_pratinjau(text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261005000004', 'kenangan_terbit')
on conflict (version) do nothing;

commit;
