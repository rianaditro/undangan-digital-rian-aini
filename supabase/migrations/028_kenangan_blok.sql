-- 028 — halaman kenangan bisa disusun pasangan.
--
-- Langkah 3 dari docs/kenangan.md. Dua hal:
--
--   1. kenangan_blok: blok rangka mana yang tampil, dan teksnya.
--   2. terimakasih_isi() mengirim babak — baris `acara` yang dicentang
--      "jadi babak di halaman kenangan" — lengkap dengan latarnya.
--
-- Hanya menambah. Tanda tangan terimakasih_isi(text) tidak berubah, dan
-- semua kunci jawaban lamanya tetap ada dengan bentuk yang sama; yang
-- baru cuma kunci tambahan. `main` tidak memanggil fungsi ini sama
-- sekali, tapi aturannya tetap: tambah dulu, buang belakangan.

-- ---------------------------------------------------------------------------
-- kenangan_blok
-- ---------------------------------------------------------------------------
-- Baris yang tidak ada = blok itu memakai bawaannya (tampil, teks bawaan
-- halaman). Jadi pasangan yang tidak pernah membuka panel 9 tetap
-- mendapat halaman utuh, dan tabel ini tidak perlu disemai.
--
-- Urutan blok sengaja TIDAK disimpan. Sampul selalu pertama, penutup
-- selalu terakhir, ucapan selalu sesudah momen — galeri sebelum pembuka
-- itu halaman rusak, dan tidak ada gunanya menyediakan tombol untuk
-- merusak. Yang bisa dilakukan pasangan: mematikan blok, dan mengganti
-- tulisannya.
create table if not exists public.kenangan_blok (
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  kunci       text not null
              check (kunci in ('sampul', 'pembuka', 'angka', 'galeri', 'ucapan', 'penutup')),
  tampil      boolean not null default true,
  judul       text check (judul is null or char_length(judul) <= 80),
  teks        text check (teks  is null or char_length(teks)  <= 600),
  diubah      timestamptz not null default now(),
  primary key (pasangan_id, kunci)
);

comment on table public.kenangan_blok is
  'Blok rangka halaman kenangan per pasangan. Baris tidak ada = bawaan.';

alter table public.kenangan_blok enable row level security;

-- Sama dengan tabel milik pasangan lain sejak 006: pemilik menulis
-- langsung lewat REST, disaring pasangan_saya().
drop policy if exists "kenangan_blok panitia" on public.kenangan_blok;
create policy "kenangan_blok panitia" on public.kenangan_blok
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()))
  with check (pasangan_id in (select public.pasangan_saya()));

-- Default privileges Supabase memberi anon semua hak atas tabel baru.
-- RLS tanpa kebijakan anon memang sudah menolak, tapi tamu tidak punya
-- urusan apa pun dengan tabel ini; ia membacanya lewat terimakasih_isi.
revoke all on public.kenangan_blok from anon;

-- Satu kalimat per babak. Batasnya longgar untuk satu kalimat panjang,
-- ketat untuk paragraf yang akan menutupi fotonya.
alter table public.acara drop constraint if exists acara_kenangan_teks_panjang;
alter table public.acara add constraint acara_kenangan_teks_panjang
  check (kenangan_teks is null or char_length(kenangan_teks) <= 200);

-- ---------------------------------------------------------------------------
-- terimakasih_isi — sekarang dengan babak dan blok
-- ---------------------------------------------------------------------------
-- Kunci baru:
--
--   babak  [{id, nama, tanggal, jam, teks, latar, jumlah_foto}]
--          urutannya urutan acara di kotak 3 — urutan hari itu.
--          latar = foto yang ditandai latar; kalau tidak ada yang
--          ditandai, foto pertama babak itu; kalau babaknya tidak punya
--          foto, null dan halamannya menggambar kartu teks.
--   blok   {kunci: {tampil, judul, teks}} — hanya yang pernah disimpan
--   angka  {hadir, ucapan, foto, babak} — nol dikirim sebagai null,
--          seperti `hadir` sejak 016, supaya halaman tidak memajang
--          "0 ucapan"
--
-- Foto yang disembunyikan (tampil = false) tidak pernah keluar dari
-- fungsi ini, juga tidak sebagai latar.
create or replace function public.terimakasih_isi(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  ps    public.pasangan;
  hasil jsonb;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(coalesce(p_slug, ''))) limit 1;

  if ps.id is null then
    return null;
  end if;

  if not ps.terbit or ps.status not in ('aktif','lewat','arsip') then
    return jsonb_build_object('slug', ps.slug, 'aktif', false);
  end if;

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
  ) into hasil;

  return hasil;
end $$;

-- create or replace mempertahankan hak yang sudah ada; ditulis lagi
-- supaya berkas ini bisa dibaca tanpa membuka 011.
grant execute on function public.terimakasih_isi(text) to anon, authenticated;
