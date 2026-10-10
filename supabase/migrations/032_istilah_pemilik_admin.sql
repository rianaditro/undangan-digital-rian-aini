-- 032 — istilah: Pemilik dan Admin.
--
-- Dua peran platform saja, dan namanya diganti mengikuti cara pemilik
-- platform menyebutnya:
--
--   Pemilik   pemilik platform — tabel `admin`, peran 'owner'
--             halaman /pemilik (dulu /admin)
--   Admin     mitra penjual — tabel `reseller` (migrasi 031)
--             halaman /admin (dulu /reseller, dialihkan lewat _redirects)
--
-- Peran "admin" staf dari 031 dihapus: hanya pemilik yang bisa masuk ke
-- /pemilik. Nama tabel dan fungsi di database TIDAK diganti — mengganti
-- nama berarti mematahkan halaman yang sedang tayang di tengah-tengah
-- penggantian. Yang berubah hanya pesan yang terbaca orang.
--
-- Hanya menambah dan mengganti pesan. admin_admin(), admin_admin_cabut(),
-- dan admin_peran() masih dipanggil halaman di main sampai PR ini
-- di-merge; ketiganya dibuang di migrasi berikutnya, sesuai aturan
-- "tambah dulu, buang belakangan".

-- Staf yang mungkin sempat dibuat (di produksi: tidak ada) dicabut, dan
-- tabel admin sejak sekarang hanya berisi pemilik.
delete from public.admin where peran <> 'owner';
alter table public.admin drop constraint if exists admin_peran_check;
alter table public.admin add constraint admin_peran_check check (peran = 'owner');
alter table public.admin alter column peran set default 'owner';

-- /pemilik milik platform
insert into public.slug_terlarang (slug) values ('pemilik')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Pesan
-- ---------------------------------------------------------------------------
create or replace function public._admin_wajib()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Halaman ini hanya untuk pemilik platform' using errcode = '42501';
  end if;
end $$;
revoke all on function public._admin_wajib() from public, anon, authenticated;

create or replace function public._owner_wajib()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_owner() then
    raise exception 'Hanya pemilik platform yang boleh melakukan ini' using errcode = '42501';
  end if;
end $$;
revoke all on function public._owner_wajib() from public, anon, authenticated;

create or replace function public._reseller_saya()
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rid uuid;
begin
  select r.id into rid from public.reseller r where r.user_id = auth.uid() and r.aktif;
  if rid is null then
    raise exception 'Halaman ini hanya untuk admin mengundang.id' using errcode = '42501';
  end if;
  return rid;
end $$;
revoke all on function public._reseller_saya() from public, anon, authenticated;

create or replace function public.admin_pesan(
  p_reseller_kode text, p_pria text, p_wanita text, p_slug text, p_paket text default 'standar',
  p_tanggal date default null, p_kota text default null, p_email text default null,
  p_catatan text default null)
returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  rid uuid;
begin
  perform public._admin_wajib();
  if nullif(btrim(coalesce(p_reseller_kode, '')), '') is not null then
    select r.id into rid from public.reseller r where r.kode = lower(btrim(p_reseller_kode));
    if rid is null then
      raise exception 'Kode admin "%" tidak ada', p_reseller_kode using errcode = 'P0002';
    end if;
  end if;
  return public._pesanan_buat(rid, p_pria, p_wanita, p_slug, p_paket, p_tanggal, p_kota, p_email, p_catatan);
end $$;
revoke all on function public.admin_pesan(text, text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.admin_pesan(text, text, text, text, text, date, text, text, text) to authenticated;
