-- 006 — Pemilik: siapa pemegang akun yang boleh membaca data pasangan mana.
--
-- Latar belakang. Sampai migrasi 005, seluruh kebijakan RLS untuk peran
-- `authenticated` berbunyi `using (true)`. Artinya: siapa pun yang berhasil
-- memegang JWT boleh membaca seluruh isi tabel. Selama "Allow new users to
-- sign up" di Supabase masih menyala, siapa pun di internet bisa mendaftar
-- sendiri, langsung naik ke peran `authenticated`, lalu membaca 680 baris
-- `tamu` lengkap dengan nomor teleponnya. Itu lubang yang nyata.
--
-- Saat migrasi ini ditulis, `auth.users` berisi NOL baris — panitia semuanya
-- masuk lewat link bertoken, bukan email. Jadi tidak ada satu pun pemakai sah
-- di jalur `authenticated`, dan menutupnya tidak memutus akses siapa pun.
--
-- Sesudah ini, memegang akun saja tidak cukup: baris di `pemilik` yang
-- menentukan. Tabelnya sengaja dibiarkan kosong.
--
-- Idempoten, aman dijalankan berulang kali.

create table if not exists public.pemilik (
  user_id     uuid not null references auth.users (id)      on delete cascade,
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  dibuat      timestamptz not null default now(),
  primary key (user_id, pasangan_id)
);

alter table public.pemilik enable row level security;

-- security definer supaya kebijakan di bawah bisa membaca `pemilik` tanpa
-- memicu RLS `pemilik` itu sendiri (yang akan jadi rekursi tak berujung).
create or replace function public.pasangan_saya()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pasangan_id from public.pemilik where user_id = auth.uid()
$$;

revoke all on function public.pasangan_saya() from public;
grant execute on function public.pasangan_saya() to authenticated;

-- Pemegang akun boleh melihat keanggotaannya sendiri, tidak boleh menambahnya.
drop policy if exists "pemilik baca sendiri" on public.pemilik;
create policy "pemilik baca sendiri" on public.pemilik
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Kebijakan per penyewa. Pola yang sama untuk sembilan tabel ber-pasangan_id.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'mempelai','tempat','acara','dompet','pihak',
    'tamu','pengiriman','panitia_akses'
  ] loop
    -- Nama kebijakan lama tidak selalu sepadan dengan nama tabelnya
    -- (panitia_akses memakai "akses panitia"). Kebijakan permissive itu
    -- ber-OR, jadi satu saja yang tertinggal membatalkan seluruh saringan
    -- di bawah — karena itu keduanya dibuang.
    execute format('drop policy if exists %I on public.%I', t || ' panitia', t);
    execute format('drop policy if exists %I on public.%I',
                   replace(t, 'panitia_', '') || ' panitia', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using      (pasangan_id in (select public.pasangan_saya()))
        with check (pasangan_id in (select public.pasangan_saya()))
    $f$, t || ' panitia', t);
  end loop;
end $$;

-- `pasangan` disaring lewat kunci primernya sendiri.
drop policy if exists "pasangan panitia" on public.pasangan;
create policy "pasangan panitia" on public.pasangan
  for all to authenticated
  using      (id in (select public.pasangan_saya()))
  with check (id in (select public.pasangan_saya()));

-- `pemberian` tidak memegang pasangan_id; ia menumpang lewat tamu.
drop policy if exists "pemberian panitia" on public.pemberian;
create policy "pemberian panitia" on public.pemberian
  for all to authenticated
  using (exists (
    select 1 from public.tamu t
    where t.id = pemberian.tamu_id
      and t.pasangan_id in (select public.pasangan_saya())
  ))
  with check (exists (
    select 1 from public.tamu t
    where t.id = pemberian.tamu_id
      and t.pasangan_id in (select public.pasangan_saya())
  ));

-- `ucapan` memang dibaca dan ditulis publik — dua kebijakan itu dibiarkan.
-- Yang disaring hanya penghapusannya.
drop policy if exists "ucapan hapus panitia" on public.ucapan;
create policy "ucapan hapus panitia" on public.ucapan
  for delete to authenticated
  using (pasangan_id in (select public.pasangan_saya()));

-- ---------------------------------------------------------------------------
-- Memberi akses email ke satu akun. Jalankan HANYA bila memang mau memakai
-- jalur login email; tanpa ini, akun yang baru dibuat tidak melihat apa pun.
--
--   insert into public.pemilik (user_id, pasangan_id)
--   select u.id, public.pasangan_bawaan()
--     from auth.users u
--    where u.email = 'ganti@dengan-email-panitia'
--   on conflict do nothing;
--
-- Mencabutnya kembali:
--
--   delete from public.pemilik p using auth.users u
--    where p.user_id = u.id and u.email = 'ganti@dengan-email-panitia';
-- ---------------------------------------------------------------------------
