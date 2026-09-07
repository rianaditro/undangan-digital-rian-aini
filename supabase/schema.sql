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

-- Policy dari skema versi pertama. Namanya menyesatkan (mengatur ucapan,
-- bukan tabel tamu) dan yang INSERT tidak membatasi panjang. Policy
-- permissive digabung dengan OR, jadi kalau dibiarkan hidup ia akan
-- meniadakan validasi panjang di bawah.
drop policy if exists "tamu boleh membaca" on public.ucapan;
drop policy if exists "tamu boleh menulis" on public.ucapan;

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
--  AKSES PANITIA LEWAT LINK RAHASIA, TANPA LOGIN
--
--  Bapak, ibu, dan mertua enggan mengurus akun, jadi tiap pihak
--  dapat satu link berisi token. Tanpa login, halaman hanya
--  memegang anon key — dan anon tidak boleh menyentuh tabel tamu
--  sama sekali. Karena itu semua lewat RPC di bawah: token
--  diperiksa di sisi server, lalu hasilnya dibatasi ke pihak
--  milik token itu. Pembatasannya mengikat di API, bukan cuma
--  di tampilan.
-- ============================================================

create table if not exists public.panitia_akses (
  id               uuid primary key default gen_random_uuid(),
  nama             text not null,
  token            text not null,
  pihak            text,          -- null = boleh melihat semua pihak
  aktif            boolean not null default true,
  dibuat           timestamptz not null default now(),
  terakhir_dipakai timestamptz
);

create unique index if not exists panitia_akses_token_idx on public.panitia_akses (token);

alter table public.panitia_akses drop constraint if exists panitia_akses_pihak_check;
alter table public.panitia_akses add  constraint panitia_akses_pihak_check
  check (pihak is null or pihak in ('pria','wanita','keluarga-pria','keluarga-wanita'));

alter table public.panitia_akses enable row level security;

drop policy if exists "akses panitia" on public.panitia_akses;
create policy "akses panitia" on public.panitia_akses
  for all to authenticated using (true) with check (true);

-- Penerjemah token. TIDAK diberikan ke anon; hanya dipakai di dalam
-- RPC lain yang juga security definer.
create or replace function public._panitia(p_token text)
returns public.panitia_akses
language plpgsql stable security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  select * into a from public.panitia_akses
   where token = p_token and aktif limit 1;
  if a.id is null then
    raise exception 'Link tidak dikenal atau sudah dinonaktifkan'
      using errcode = '28000';
  end if;
  return a;
end $$;

revoke all on function public._panitia(text) from public, anon, authenticated;

create or replace function public.panitia_masuk(p_token text)
returns table (nama text, pihak text)
language plpgsql volatile security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  update public.panitia_akses set terakhir_dipakai = now() where id = a.id;
  return query select a.nama, a.pihak;
end $$;

create or replace function public.panitia_daftar(p_token text)
returns table (
  id uuid, nama text, slug text, telepon text, pihak text,
  undangan text, berkat text
)
language plpgsql stable security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  return query
    select t.id, t.nama, t.slug, t.telepon, t.pihak,
           coalesce(u.status, 'belum') as undangan,
           coalesce(b.status, 'belum') as berkat
      from public.tamu t
      left join public.pengiriman u on u.tamu_id = t.id and u.jenis = 'undangan'
      left join public.pengiriman b on b.tamu_id = t.id and b.jenis = 'berkat'
     where a.pihak is null or t.pihak = a.pihak
     order by t.nama;
end $$;

-- p_baris: [{"nama":"...","slug":"...","telepon":"..."}]
-- Rujukan tabel diberi alias: nama parameter keluaran (id, slug)
-- bertabrakan dengan kolom tabel di dalam badan fungsi.
create or replace function public.panitia_tambah(p_token text, p_baris jsonb)
returns table (id uuid, nama text, slug text, telepon text, pihak text,
               undangan text, berkat text)
language plpgsql volatile security definer set search_path = public as $$
declare
  a       public.panitia_akses;
  baris   jsonb;
  v_pihak text;
  v_slug  text;
  v_dasar text;
  n       int;
  baru    uuid[] := '{}';
  id_baru uuid;
begin
  a := public._panitia(p_token);

  for baris in select * from jsonb_array_elements(p_baris) loop
    -- token bercakupan penuh boleh menyebut pihak; yang lain dipaksa
    v_pihak := coalesce(a.pihak, baris->>'pihak', 'keluarga-wanita');

    v_dasar := coalesce(nullif(baris->>'slug', ''), 'tamu');
    v_slug  := v_dasar;
    n := 2;
    while exists (select 1 from public.tamu tt where tt.slug = v_slug) loop
      v_slug := v_dasar || '-' || n;
      n := n + 1;
    end loop;

    insert into public.tamu as t (nama, slug, telepon, pihak)
    values (baris->>'nama', v_slug, nullif(baris->>'telepon',''), v_pihak)
    returning t.id into id_baru;

    baru := baru || id_baru;
  end loop;

  return query
    select t.id, t.nama, t.slug, t.telepon, t.pihak,
           'belum'::text, 'belum'::text
      from public.tamu t
     where t.id = any(baru)
     order by t.nama;
end $$;

create or replace function public.panitia_tandai(
  p_token text, p_tamu_id uuid, p_jenis text, p_status text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);

  if p_jenis not in ('undangan','berkat') then
    raise exception 'Jenis pengiriman tidak dikenal';
  end if;
  if p_status not in ('belum','terkirim','gagal') then
    raise exception 'Status tidak dikenal';
  end if;

  if not exists (
    select 1 from public.tamu t
     where t.id = p_tamu_id and (a.pihak is null or t.pihak = a.pihak)
  ) then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;

  insert into public.pengiriman (tamu_id, jenis, status, waktu)
  values (p_tamu_id, p_jenis, p_status,
          case when p_status = 'terkirim' then now() else null end)
  on conflict (tamu_id, jenis) do update
    set status = excluded.status, waktu = excluded.waktu;
end $$;

create or replace function public.panitia_hapus(p_token text, p_tamu_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  delete from public.tamu t
   where t.id = p_tamu_id and (a.pihak is null or t.pihak = a.pihak);
  if not found then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;
end $$;

create or replace function public.panitia_ubah_pihak(
  p_token text, p_tamu_id uuid, p_pihak text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);

  -- yang bercakupan sempit akan memindahkan tamu keluar dari
  -- jangkauannya sendiri, dan tidak akan bisa menariknya kembali
  if a.pihak is not null then
    raise exception 'Link ini hanya untuk satu pihak, jadi pihak tamu tidak bisa diubah'
      using errcode = '42501';
  end if;

  if p_pihak not in ('pria','wanita','keluarga-pria','keluarga-wanita') then
    raise exception 'Pihak tidak dikenal';
  end if;

  update public.tamu t set pihak = p_pihak where t.id = p_tamu_id;
  if not found then
    raise exception 'Tamu tidak ditemukan' using errcode = '42501';
  end if;
end $$;

create or replace function public.panitia_ubah_nama(
  p_token text, p_tamu_id uuid, p_nama text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  a      public.panitia_akses;
  bersih text;
begin
  a := public._panitia(p_token);

  bersih := regexp_replace(trim(coalesce(p_nama, '')), '\s+', ' ', 'g');
  if char_length(bersih) < 1 or char_length(bersih) > 80 then
    raise exception 'Nama harus 1 sampai 80 karakter';
  end if;

  -- slug sengaja TIDAK ikut berubah: link tamu mungkin sudah tersebar
  -- di grup WhatsApp dan tidak bisa ditarik kembali
  update public.tamu t
     set nama = bersih
   where t.id = p_tamu_id
     and (a.pihak is null or t.pihak = a.pihak);

  if not found then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;
end $$;

grant execute on function public.panitia_masuk(text)                     to anon, authenticated;
grant execute on function public.panitia_daftar(text)                    to anon, authenticated;
grant execute on function public.panitia_tambah(text, jsonb)             to anon, authenticated;
grant execute on function public.panitia_tandai(text, uuid, text, text)  to anon, authenticated;
grant execute on function public.panitia_hapus(text, uuid)               to anon, authenticated;
grant execute on function public.panitia_ubah_pihak(text, uuid, text)    to anon, authenticated;
grant execute on function public.panitia_ubah_nama(text, uuid, text)     to anon, authenticated;

-- Membuat kelima link. Jalankan sekali, lalu salin tokennya.
--
--   insert into public.panitia_akses (nama, token, pihak) values
--     ('Rian & ''Aini (semua pihak)', encode(gen_random_bytes(24),'hex'), null),
--     ('Pengantin Pria — Rian',       encode(gen_random_bytes(24),'hex'), 'pria'),
--     ('Pengantin Wanita — ''Aini',   encode(gen_random_bytes(24),'hex'), 'wanita'),
--     ('Keluarga Pihak Pria',         encode(gen_random_bytes(24),'hex'), 'keluarga-pria'),
--     ('Keluarga Pihak Wanita',       encode(gen_random_bytes(24),'hex'), 'keluarga-wanita');
--
--   select nama, coalesce(pihak,'(semua)') as cakupan, token
--     from public.panitia_akses order by dibuat;
--
-- Mengganti token yang bocor — link lama langsung mati:
--
--   update public.panitia_akses
--      set token = encode(gen_random_bytes(24),'hex')
--    where nama = 'Keluarga Pihak Pria';
--
-- Mematikan satu link tanpa menghapusnya:
--
--   update public.panitia_akses set aktif = false where nama = '...';

-- ============================================================
--  SETELAH MENJALANKAN FILE INI
--  1. Authentication → Users → Add user: isi email & sandi
--     panitia. Itu yang dipakai login di /kirim.
--  2. Authentication → Sign In / Providers → matikan
--     "Allow new users to sign up", supaya tidak ada yang bisa
--     mendaftar sendiri dan ikut membaca daftar tamu.
-- ============================================================
