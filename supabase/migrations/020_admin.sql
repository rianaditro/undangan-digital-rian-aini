-- 020 — meja admin: siapa yang boleh membuka pasangan baru.
--
-- Sampai sekarang membuka klien baru berarti membuka SQL Editor Supabase
-- dan memanggil pasangan_siapkan() dengan tangan. Itu cukup untuk satu
-- pasangan; untuk "tinggal marketing" ia justru penghalangnya, karena
-- tiap klien baru berarti Anda yang mengetik.
--
-- ---------------------------------------------------------------------------
-- Kenapa tabel admin, bukan satu kata sandi rahasia
-- ---------------------------------------------------------------------------
-- Kata sandi bersama harus ditaruh di suatu tempat yang bisa dibaca
-- halaman, dan begitu ia bocor tidak ada cara tahu siapa yang memakainya.
-- Keanggotaan lewat baris tabel memakai akun yang sudah ada: yang
-- menentukan bukan rahasia yang beredar, tapi siapa yang sedang masuk.
-- Mencabutnya pun satu DELETE.
--
-- ---------------------------------------------------------------------------
-- Telur dan ayam
-- ---------------------------------------------------------------------------
-- Admin pertama tidak bisa dibuat dari halaman admin. Sekali saja, lewat
-- Supabase:
--
--   1. Authentication → Users → Add user (email + kata sandi)
--   2. SQL Editor:
--        insert into public.admin (user_id, nama)
--        select id, 'Rian' from auth.users where email = 'anda@contoh.com';
--
-- Sesudah itu /admin bisa dipakai, dan admin berikutnya ditambahkan dari
-- SQL yang sama. Sengaja tidak ada tombol "jadikan admin" di halaman:
-- pintu yang bisa menambah pemegang kuncinya sendiri adalah pintu yang
-- paling mahal kalau salah.

create table if not exists public.admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nama    text,
  dibuat  timestamptz not null default now()
);

alter table public.admin enable row level security;

-- Admin boleh melihat barisnya sendiri; menambah atau menghapus tidak
-- lewat sini sama sekali.
drop policy if exists "admin baca sendiri" on public.admin;
create policy "admin baca sendiri" on public.admin
  for select to authenticated
  using (user_id = auth.uid());

-- security definer supaya fungsi di bawah bisa membaca `admin` tanpa
-- memicu RLS tabel itu sendiri.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin a where a.user_id = auth.uid())
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public._admin_wajib()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Halaman ini hanya untuk admin' using errcode = '42501';
  end if;
end $$;

revoke all on function public._admin_wajib() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daftar pasangan
-- ---------------------------------------------------------------------------
-- Angka-angkanya dihitung saat diminta. Tidak ada kolom ringkasan yang
-- disimpan: ringkasan yang disimpan adalah sumber kebenaran kedua, dan
-- sumber kebenaran kedua selalu berakhir berbeda dari yang pertama.
create or replace function public.admin_daftar()
returns table (
  id uuid, slug text, status text, terbit boolean, paket text, tema text,
  tanggal_acara date, kota text, canonical_host text, dibuat timestamptz,
  pria text, wanita text, pemilik text,
  tamu int, undangan int, ucapan int, foto int, pemberian int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return query
    select p.id, p.slug, p.status, p.terbit, p.paket, p.tema,
           p.tanggal_acara, p.kota, p.canonical_host, p.dibuat,
           (select m.panggilan from public.mempelai m
             where m.pasangan_id = p.id and m.sisi = 'pria'),
           (select m.panggilan from public.mempelai m
             where m.pasangan_id = p.id and m.sisi = 'wanita'),
           (select string_agg(u.email, ', ')
              from public.pemilik k join auth.users u on u.id = k.user_id
             where k.pasangan_id = p.id),
           (select count(*)::int from public.tamu t where t.pasangan_id = p.id),
           (select count(*)::int from public.pengiriman g
             where g.pasangan_id = p.id and g.jenis = 'undangan' and g.status = 'terkirim'),
           (select count(*)::int from public.ucapan c where c.pasangan_id = p.id),
           (select count(*)::int from public.foto f where f.pasangan_id = p.id),
           (select count(*)::int from public.pemberian b
              join public.tamu t2 on t2.id = b.tamu_id
             where t2.pasangan_id = p.id)
      from public.pasangan p
     order by p.dibuat desc;
end $$;

-- ---------------------------------------------------------------------------
-- Link panitia satu pasangan
-- ---------------------------------------------------------------------------
-- Tokennya memang ditampilkan utuh — itu gunanya halaman ini. Yang
-- menjaga bukan token yang disembunyikan, tapi is_admin() di depannya.
create or replace function public.admin_token(p_pasangan_id uuid)
returns table (id uuid, nama text, token text, pihak text, aktif boolean,
               terakhir_dipakai timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return query
    select a.id, a.nama, a.token, a.pihak, a.aktif, a.terakhir_dipakai
      from public.panitia_akses a
     where a.pasangan_id = p_pasangan_id
     order by (a.pihak is not null), a.pihak;
end $$;

-- Mengganti token yang bocor tanpa mengganggu yang lain.
create or replace function public.admin_token_ganti(p_id uuid)
returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare baru text;
begin
  perform public._admin_wajib();
  -- gen_random_bytes tinggal di skema `extensions`, sementara search_path
  -- fungsi ini sengaja dikunci; skemanya disebut penuh
  baru := encode(extensions.gen_random_bytes(24), 'hex');
  update public.panitia_akses set token = baru, terakhir_dipakai = null
   where id = p_id;
  if not found then
    raise exception 'Link panitia tidak ditemukan' using errcode = 'P0002';
  end if;
  return baru;
end $$;

-- ---------------------------------------------------------------------------
-- Status pasangan
-- ---------------------------------------------------------------------------
create or replace function public.admin_status(p_pasangan_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  if p_status not in ('draf','aktif','lewat','arsip') then
    raise exception 'Status tidak dikenal' using errcode = '22023';
  end if;
  update public.pasangan set status = p_status where id = p_pasangan_id;
  if not found then
    raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Membatalkan pasangan yang baru saja salah dibuat
-- ---------------------------------------------------------------------------
-- HANYA yang masih kosong. Begitu sudah ada tamu, ucapan, foto, atau
-- pemberian, pasangan itu memuat pekerjaan orang dan tulisan tamunya —
-- dan satu tombol yang bisa menghapus semua itu adalah tombol yang cepat
-- atau lambat tertekan. Yang sudah berisi diarsipkan, bukan dihapus.
create or replace function public.admin_hapus_kosong(p_pasangan_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform public._admin_wajib();

  select (select count(*) from public.tamu   t where t.pasangan_id = p_pasangan_id)
       + (select count(*) from public.ucapan u where u.pasangan_id = p_pasangan_id)
       + (select count(*) from public.foto   f where f.pasangan_id = p_pasangan_id)
    into n;

  if n > 0 then
    raise exception 'Pasangan ini sudah berisi % baris data; arsipkan saja, jangan dihapus', n
      using errcode = '42501';
  end if;

  delete from public.pasangan where id = p_pasangan_id;
  if not found then
    raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Slug: dipakai halaman admin untuk memberi tahu sebelum menyimpan
-- ---------------------------------------------------------------------------
create or replace function public.admin_slug_dipakai(p_slug text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return exists (select 1 from public.pasangan p
                  where p.slug = lower(btrim(coalesce(p_slug, ''))));
end $$;

grant execute on function public.admin_daftar()                      to authenticated;
grant execute on function public.admin_token(uuid)                   to authenticated;
grant execute on function public.admin_token_ganti(uuid)             to authenticated;
grant execute on function public.admin_status(uuid, text)            to authenticated;
grant execute on function public.admin_hapus_kosong(uuid)            to authenticated;
grant execute on function public.admin_slug_dipakai(text)            to authenticated;
