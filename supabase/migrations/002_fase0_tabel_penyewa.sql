-- ============================================================
--  FASE 0 — langkah 1: tabel penyewa
--  Murni tambahan; tidak menyentuh tabel yang sedang dipakai.
-- ============================================================

create table if not exists public.pasangan (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  canonical_host text,
  paket          text not null default 'lengkap',
  status         text not null default 'draf',
  terbit         boolean not null default false,
  tanggal_acara  date,
  masa_aktif     date,
  hapus_pada     date,          -- retensi: masa aktif + 90 hari
  reseller_id    uuid,
  tema           text not null default 'ukir-jepara',
  dibuat         timestamptz not null default now()
);

create unique index if not exists pasangan_slug_idx on public.pasangan (slug);

alter table public.pasangan drop constraint if exists pasangan_status_check;
alter table public.pasangan add  constraint pasangan_status_check
  check (status in ('draf','menunggu_bayar','aktif','lewat','arsip',
                    'kedaluwarsa','hangus','batal'));

create table if not exists public.slug_terlarang (slug text primary key);

insert into public.slug_terlarang (slug) values
  ('www'),('app'),('api'),('admin'),('login'),('help'),('bantuan'),
  ('blog'),('docs'),('status'),('mail'),('cdn'),('static'),('assets'),
  ('r'),('cari'),('kirim'),('daftar'),('harga'),('tema')
on conflict (slug) do nothing;

create table if not exists public.mempelai (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan(id) on delete cascade,
  sisi        text not null check (sisi in ('pria','wanita')),
  panggilan   text not null,
  lengkap     text not null,
  peran       text not null,
  anak        text not null,
  ayah        text, ayah_ket text,
  ibu         text, ibu_ket  text,
  unique (pasangan_id, sisi)
);

create table if not exists public.tempat (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan(id) on delete cascade,
  kode        text not null,
  nama        text not null,
  alamat      text not null,
  ringkas     text not null,
  maps        text,
  lat numeric, lng numeric,
  unique (pasangan_id, kode)
);

create table if not exists public.acara (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan(id) on delete cascade,
  urutan      int  not null default 1,
  nama        text not null,
  tanggal     text not null,
  jam         text not null,
  ringkas     text not null,
  mulai       timestamptz,
  -- Pelajaran dari akad Rian & 'Aini: satu acara bisa dipaksa ke satu
  -- tempat, lepas dari pihak tamunya. Kosong = ikut pihak tamu.
  tempat_id   uuid references public.tempat(id) on delete set null
);

create index if not exists acara_pasangan_idx on public.acara (pasangan_id, urutan);

create table if not exists public.dompet (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan(id) on delete cascade,
  kode        text not null,
  bank        text not null,
  nomor       text not null,
  atas_nama   text not null,
  unique (pasangan_id, kode)
);

create table if not exists public.pihak (
  id            uuid primary key default gen_random_uuid(),
  pasangan_id   uuid not null references public.pasangan(id) on delete cascade,
  kode          text not null,
  kode_pendek   text not null,
  label         text not null,
  sisi          text not null check (sisi in ('pria','wanita')),
  urutan_nama   text[] not null,
  urutan_dompet text[] not null,
  ttd_label     text not null,
  ttd_sub       text not null,
  unique (pasangan_id, kode),
  unique (pasangan_id, kode_pendek)
);
