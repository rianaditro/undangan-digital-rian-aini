-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- Migrasi 033 (halaman kenangan versi 2: cerita, video, vendor), persis
-- seperti berkasnya di supabase/migrations/, dibungkus satu transaksi.
--
--   · foto.jenis (foto/video), foto.durasi_ms, foto.bagian (bab tetap)
--   · kenangan_blok menerima kunci bab baru
--   · tabel kenangan_vendor ("Terima kasih kepada")
--   · bucket foto menerima MP4/WebM sampai 20 MB
--   · terimakasih_isi mengirim kunci baru; semua kunci lama tetap
--
-- Hanya menambah: aman dijalankan SEBELUM PR-nya di-merge. Jalankan
-- SEBELUM foto-unggah versi baru di-deploy (ia menulis kolom baru).
--
-- Yang benar: "Success. No rows returned".

begin;

-- 033 — halaman kenangan versi 2: cerita, video, vendor.
--
-- Revisi desain dari pemilik platform (10 Oktober):
--
--   · halaman bercerita dalam bab berurutan:
--       sampul → pembuka → mempelai pria → mempelai wanita →
--       kedatangan keluarga → babak acara (akad, resepsi, … dari kotak 3)
--       → sungkem → keluarga → para tamu → kami berdua →
--       terima kasih kepada (vendor) → penutup
--   · tiap bab berlatar BANYAK foto/video yang bergiliran
--   · video diterima di samping foto
--   · vendor dan sponsor punya bagian sendiri
--   · blok "Dalam Angka" dihapus dari halaman (kuncinya tetap boleh
--     ada di database supaya baris lama tidak patah)
--
-- Hanya menambah. Halaman kenangan versi lama tetap bisa membaca
-- jawaban terimakasih_isi: semua kunci lamanya tetap ada.

-- ---------------------------------------------------------------------------
-- foto: jenis, durasi, bagian
-- ---------------------------------------------------------------------------
-- `bagian` menaruh satu foto/video di bab yang bukan baris `acara`.
-- Babak acara tetap lewat acara_id; satu berkas hanya di satu tempat.
alter table public.foto
  add column if not exists jenis     text not null default 'foto',
  add column if not exists durasi_ms integer,
  add column if not exists bagian    text;

alter table public.foto drop constraint if exists foto_jenis_check;
alter table public.foto add  constraint foto_jenis_check check (jenis in ('foto','video'));
alter table public.foto drop constraint if exists foto_durasi_check;
alter table public.foto add  constraint foto_durasi_check
  check (durasi_ms is null or durasi_ms between 0 and 600000);
alter table public.foto drop constraint if exists foto_bagian_check;
alter table public.foto add  constraint foto_bagian_check
  check (bagian is null or bagian in
    ('sampul','pria','wanita','kedatangan','sungkem','keluarga','tamu','berdua'));
alter table public.foto drop constraint if exists foto_satu_tempat;
alter table public.foto add  constraint foto_satu_tempat check (bagian is null or acara_id is null);

comment on column public.foto.jenis  is 'foto atau video; jalur_kecil video = posternya';
comment on column public.foto.bagian is 'Bab kenangan yang bukan baris acara; kosong = lewat acara_id atau galeri';

-- Latar = berkas yang membuka giliran bab itu. Satu per babak acara,
-- sekarang juga satu per bagian.
create or replace function public._foto_satu_latar()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.latar and new.acara_id is not null then
    update public.foto
       set latar = false
     where pasangan_id = new.pasangan_id
       and acara_id    = new.acara_id
       and id         <> new.id
       and latar;
  end if;
  if new.latar and new.bagian is not null then
    update public.foto
       set latar = false
     where pasangan_id = new.pasangan_id
       and bagian      = new.bagian
       and id         <> new.id
       and latar;
  end if;
  -- Latar tanpa bab tidak punya tempat dipasang.
  if new.latar and new.acara_id is null and new.bagian is null then
    new.latar := false;
  end if;
  return new;
end $$;

drop trigger if exists foto_satu_latar on public.foto;
create trigger foto_satu_latar
  before insert or update of latar, acara_id, bagian on public.foto
  for each row execute function public._foto_satu_latar();
revoke all on function public._foto_satu_latar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- kenangan_blok: kunci bab baru
-- ---------------------------------------------------------------------------
alter table public.kenangan_blok drop constraint if exists kenangan_blok_kunci_check;
alter table public.kenangan_blok add constraint kenangan_blok_kunci_check check (kunci in (
  'sampul','pembuka','angka','galeri','ucapan','penutup',
  'pria','wanita','kedatangan','sungkem','keluarga','tamu','berdua','vendor'));

-- ---------------------------------------------------------------------------
-- kenangan_vendor
-- ---------------------------------------------------------------------------
create table if not exists public.kenangan_vendor (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  urutan      integer not null default 0,
  peran       text not null check (char_length(btrim(peran)) between 1 and 60),
  nama        text not null check (char_length(btrim(nama))  between 1 and 80),
  -- tautan web (https://…) atau akun Instagram (@nama); halaman yang
  -- mengubah @nama jadi tautan, bukan database
  tautan      text check (tautan is null or (char_length(tautan) <= 200
                and (tautan ~ '^https?://[^\s]+$' or tautan ~ '^@[A-Za-z0-9._]{1,30}$'))),
  dibuat      timestamptz not null default now()
);
create index if not exists kenangan_vendor_pasangan on public.kenangan_vendor (pasangan_id, urutan);

alter table public.kenangan_vendor enable row level security;
drop policy if exists "kenangan_vendor panitia" on public.kenangan_vendor;
create policy "kenangan_vendor panitia" on public.kenangan_vendor
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()))
  with check (pasangan_id in (select public.pasangan_saya()));
revoke all on public.kenangan_vendor from anon;

-- ---------------------------------------------------------------------------
-- Bucket foto menerima video
-- ---------------------------------------------------------------------------
-- Batas bucket naik ke 20 MB; batas per jenis dijaga foto-unggah
-- (foto 2 MB, video 20 MB). Video tidak diubah di peramban — MP4/WebM
-- yang bisa diputar peramban, diperiksa dasbor sebelum dikirim.
update storage.buckets
   set file_size_limit    = 20971520,
       allowed_mime_types = array['image/webp','image/jpeg','video/mp4','video/webm']
 where id = 'foto';

-- ---------------------------------------------------------------------------
-- _terimakasih_bangun — kunci baru: foto[].jenis/bagian/latar, vendor
-- ---------------------------------------------------------------------------
-- Semua kunci lama tetap, dengan bentuk yang sama: halaman versi lama
-- yang masih tersimpan di peramban tamu tetap tergambar.
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
        'latar',      f.latar)
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
values ('20261010000003', 'kenangan_cerita')
on conflict (version) do nothing;

commit;
