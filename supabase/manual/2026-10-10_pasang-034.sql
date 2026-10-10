-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- Migrasi 034 (potongan foto untuk layar HP), persis seperti berkasnya
-- di supabase/migrations/, dibungkus satu transaksi.
--
--   · foto.fokus_x, foto.fokus_y, foto.zum (bawaan: tengah, tanpa zum)
--   · terimakasih_isi mengirim potongannya
--
-- Hanya menambah: aman dijalankan SEBELUM PR-nya di-merge. Tidak ada
-- fungsi edge yang perlu di-deploy ulang.
--
-- Yang benar: "Success. No rows returned".

begin;

-- 034 — potongan foto untuk layar HP.
--
-- Revisi tampilan (10 Oktober): foto harus bisa diatur supaya pas di
-- layar HP. Bab kenangan memenuhi satu layar tegak, jadi yang perlu
-- dipilih pasangan adalah JENDELA tegak di dalam fotonya — bukan berkas
-- baru. Potongan disimpan sebagai data, bukan dipotong dari berkasnya:
--
--   fokus_x, fokus_y   titik yang dijaga tetap terlihat (0–100 %), dipakai
--                      sebagai object-position dan transform-origin
--   zum                perbesaran 1–3 di sekitar titik itu
--
-- Berkas asli tidak pernah diubah, jadi potongan bisa diatur ulang kapan
-- saja, berlaku juga untuk video, dan di layar lebar titik yang sama
-- tetap jadi pusatnya. Hanya menambah; halaman lama mengabaikan kunci
-- barunya.

alter table public.foto
  add column if not exists fokus_x real not null default 50,
  add column if not exists fokus_y real not null default 50,
  add column if not exists zum     real not null default 1;

alter table public.foto drop constraint if exists foto_potong_check;
alter table public.foto add  constraint foto_potong_check
  check (fokus_x between 0 and 100 and fokus_y between 0 and 100 and zum between 1 and 3);

comment on column public.foto.fokus_x is 'Titik fokus mendatar (%) — object-position untuk layar HP';
comment on column public.foto.fokus_y is 'Titik fokus tegak (%)';
comment on column public.foto.zum     is 'Perbesaran 1–3 di sekitar titik fokus';

-- ---------------------------------------------------------------------------
-- _terimakasih_bangun — foto[] membawa potongannya
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
        'zum',        f.zum)
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

insert into supabase_migrations.schema_migrations (version, name)
values ('20261010000004', 'foto_potong')
on conflict (version) do nothing;

commit;
