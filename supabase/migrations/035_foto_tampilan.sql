-- 035 — mode tampil per foto: isi layar atau tampil utuh.
--
-- Foto landscape (rombongan keluarga, foto bersama) yang dipaksa mengisi
-- layar HP tegak kehilangan separuh orangnya. Mode "tampil utuh"
-- menampilkannya utuh selebar layar, dengan foto yang sama — buram dan
-- gelap — mengisi sisa layar. Dipilih PER FOTO, bukan per bab: satu bab
-- boleh mencampur foto potret dan landscape, dan ukuran bab tidak pernah
-- berubah saat foto bergilir.
--
--   tampilan  'isi'  isi layar (potongan 034 berlaku)
--             'utuh' tampil utuh
--             null   otomatis dari ukuran foto: landscape → utuh,
--                    selain itu → isi
--
-- Hanya menambah; halaman lama mengabaikan kunci barunya.

alter table public.foto add column if not exists tampilan text;
alter table public.foto drop constraint if exists foto_tampilan_check;
alter table public.foto add  constraint foto_tampilan_check check (tampilan is null or tampilan in ('isi','utuh'));
comment on column public.foto.tampilan is 'isi = isi layar, utuh = tampil utuh, null = otomatis dari ukuran';

-- ---------------------------------------------------------------------------
-- _terimakasih_bangun — foto[] membawa tampilannya
-- ---------------------------------------------------------------------------
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
    'kota',          ps.kota,

    'hadir', (
      select nullif(count(*), 0)
        from public.tamu t
       where t.pasangan_id = ps.id
         and t.datang is true),

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan,
        'lengkap',   m.lengkap,
        'anak',      m.anak,
        -- orang tua tinggal di silsilah sejak 014
        'ayah', (select s.nama from public.silsilah s
                  where s.pasangan_id = ps.id and s.sisi = m.sisi and s.peran = 'Ayah' and s.tampil
                  order by s.urutan limit 1),
        'ibu',  (select s.nama from public.silsilah s
                  where s.pasangan_id = ps.id and s.sisi = m.sisi and s.peran = 'Ibu' and s.tampil
                  order by s.urutan limit 1)))
        from public.mempelai m where m.pasangan_id = ps.id),

    -- Urutan: latar dulu (pembuka giliran), lalu urutan pustaka.
    'foto', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',         f.id,
        'jenis',      f.jenis,
        'jalur',      f.jalur,
        'kecil',      f.jalur_kecil,
        'lebar',      f.lebar,
        'tinggi',     f.tinggi,
        'durasi_ms',  f.durasi_ms,
        'keterangan', f.keterangan,
        'acara_id',   f.acara_id,
        'bagian',     f.bagian,
        'latar',      f.latar,
        'fokus_x',    f.fokus_x,
        'fokus_y',    f.fokus_y,
        'zum',        f.zum,
        'tampilan',   f.tampilan)
        order by f.latar desc, f.urutan, f.diunggah), '[]'::jsonb)
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
             and f.jenis = 'foto'
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

    'vendor', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'peran',  v.peran,
        'nama',   v.nama,
        'tautan', v.tautan)
        order by v.urutan, v.dibuat), '[]'::jsonb)
        from public.kenangan_vendor v
       where v.pasangan_id = ps.id),

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
