-- ============================================================
--  Undangan Rian & 'Aini — skema Supabase
--  Jalankan di Supabase → SQL Editor → Run.
--  Aman dijalankan berulang kali (idempoten).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. TAMU — daftar undangan
--    pihak menentukan varian undangan yang dilihat tamu:
--    alamat acara, urutan nama mempelai, dompet digital.
-- ------------------------------------------------------------
create table if not exists public.tamu (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  slug       text not null,
  telepon    text,
  pihak      text not null default 'keluarga-wanita',
  catatan    text,
  created_at timestamptz not null default now()
);

create unique index if not exists tamu_slug_idx on public.tamu (slug);
create index        if not exists tamu_pihak_idx on public.tamu (pihak);
create index        if not exists tamu_telepon_idx on public.tamu (telepon);

alter table public.tamu drop constraint if exists tamu_pihak_check;
alter table public.tamu add  constraint tamu_pihak_check
  check (pihak in ('pria', 'wanita', 'keluarga-pria', 'keluarga-wanita'));

-- ------------------------------------------------------------
-- 2. PENGIRIMAN — dua jalur terpisah, undangan dan berkat.
--    Satu tamu punya paling banyak satu baris per jenis.
-- ------------------------------------------------------------
create table if not exists public.pengiriman (
  id      uuid primary key default gen_random_uuid(),
  tamu_id uuid not null references public.tamu(id) on delete cascade,
  jenis   text not null check (jenis in ('undangan', 'berkat')),
  status  text not null default 'belum' check (status in ('belum', 'terkirim', 'gagal')),
  waktu   timestamptz,
  catatan text,
  unique (tamu_id, jenis)
);

create index if not exists pengiriman_tamu_idx on public.pengiriman (tamu_id);

-- ------------------------------------------------------------
-- 3. UCAPAN — satu kartu ucapan untuk semua varian undangan.
--    Tabel ini mungkin sudah ada dari versi sebelumnya;
--    dua kolom di bawah ditambahkan tanpa merusak isinya.
-- ------------------------------------------------------------
create table if not exists public.ucapan (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  hadir      text,
  pesan      text not null,
  created_at timestamptz not null default now()
);

alter table public.ucapan add column if not exists tamu_id uuid references public.tamu(id) on delete set null;
alter table public.ucapan add column if not exists pihak   text;

create index if not exists ucapan_waktu_idx on public.ucapan (created_at desc);

-- ============================================================
--  ROW LEVEL SECURITY
--  Nomor telepon tamu adalah data pribadi milik orang yang
--  bukan pelanggan kita. Tabel tamu dan pengiriman TIDAK boleh
--  terbaca oleh anon key yang tertanam di halaman undangan.
-- ============================================================

alter table public.tamu       enable row level security;
alter table public.pengiriman enable row level security;
alter table public.ucapan     enable row level security;

-- ---- ucapan: publik boleh baca dan menulis ----
drop policy if exists "ucapan baca publik"  on public.ucapan;
create policy "ucapan baca publik" on public.ucapan
  for select to anon, authenticated using (true);

drop policy if exists "ucapan tulis publik" on public.ucapan;
create policy "ucapan tulis publik" on public.ucapan
  for insert to anon, authenticated
  with check (
    char_length(nama)  between 1 and 60 and
    char_length(pesan) between 1 and 800
  );

-- moderasi: hanya panitia yang login boleh menghapus
drop policy if exists "ucapan hapus panitia" on public.ucapan;
create policy "ucapan hapus panitia" on public.ucapan
  for delete to authenticated using (true);

-- ---- tamu & pengiriman: hanya panitia yang login ----
drop policy if exists "tamu panitia" on public.tamu;
create policy "tamu panitia" on public.tamu
  for all to authenticated using (true) with check (true);

drop policy if exists "pengiriman panitia" on public.pengiriman;
create policy "pengiriman panitia" on public.pengiriman
  for all to authenticated using (true) with check (true);

-- ============================================================
--  RPC — satu-satunya pintu tamu ke tabel tamu.
--  Menerima slug, mengembalikan nama dan pihak saja.
--  Nomor telepon tidak pernah ikut keluar.
-- ============================================================
create or replace function public.undangan_tamu(p_slug text)
returns table (nama text, pihak text)
language sql
stable
security definer
set search_path = public
as $$
  select t.nama, t.pihak
    from public.tamu t
   where t.slug = lower(trim(p_slug))
   limit 1;
$$;

revoke all on function public.undangan_tamu(text) from public;
grant execute on function public.undangan_tamu(text) to anon, authenticated;

-- ============================================================
--  SETELAH MENJALANKAN FILE INI
--  1. Authentication → Users → Add user: isi email & sandi
--     panitia. Itu yang dipakai login di /kirim.
--  2. Authentication → Sign In / Providers → matikan
--     "Allow new users to sign up", supaya tidak ada yang bisa
--     mendaftar sendiri dan ikut membaca daftar tamu.
-- ============================================================
