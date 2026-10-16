-- 039 — Full Custom (docs/halaman-khusus.md, tahap K2), dan pintu
-- pasangan yang selama ini terlalu lebar.
--
--   SATU   paket ketiga: full_custom (subdomain, seperti premium);
--          slug 'custom' dan 'media' milik platform
--   DUA    kolom yang hanya boleh diubah pemilik platform
--   TIGA   pasangan.khusus — isi khusus halaman custom, tanpa migrasi lagi
--   EMPAT  brief_custom + revisi_custom — brief desain dan catatan revisi,
--          ditulis pasangan di dasbor, dikerjakan pemilik
--   LIMA   RPC pemilik: antrean, status, revisi selesai, isi khusus, tema
--   ENAM   undangan_isi membawa `khusus`
--
-- Hanya menambah. Halaman di main tidak memakai satu pun yang baru, dan
-- semua yang dulu boleh dikerjakan dasbor di main tetap boleh (uji
-- 039-full-custom.sql memeriksa keduanya).

-- ===========================================================================
-- SATU — paket full_custom
-- ===========================================================================
-- Pemicu alamat (023, _pasangan_sah) memperlakukan semua yang bukan
-- 'standar' sebagai subdomain, jadi tidak perlu diubah.
alter table public.pasangan drop constraint if exists pasangan_paket_check;
alter table public.pasangan
  add constraint pasangan_paket_check check (paket in ('premium','standar','full_custom'));

create or replace function public.admin_paket(p_pasangan_id uuid, p_paket text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  if p_paket not in ('premium','standar','full_custom') then
    raise exception 'Paket tidak dikenal' using errcode = '22023';
  end if;
  update public.pasangan set paket = p_paket where id = p_pasangan_id;
  if not found then
    raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.admin_paket(uuid, text) from public, anon;
grant execute on function public.admin_paket(uuid, text) to authenticated;

-- pasangan_siapkan: badan lengkap dari 023, satu-satunya perubahan daftar
-- paket yang diterima.
create or replace function public.pasangan_siapkan(
  p_slug    text,
  p_email   text,
  p_pria    text,
  p_wanita  text,
  p_tanggal date default null,
  p_kota    text default null,
  p_paket   text default 'standar'
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  pid     uuid;
  uid     uuid;
  v_slug  text;
  v_paket text;
begin
  v_slug  := lower(btrim(coalesce(p_slug, '')));
  v_paket := lower(btrim(coalesce(p_paket, 'standar')));

  if v_paket not in ('premium','standar','full_custom') then
    raise exception 'Paket "%" tidak dikenal', v_paket using errcode = '22023';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Slug hanya boleh huruf kecil, angka, dan tanda hubung' using errcode = '22023';
  end if;
  if exists (select 1 from public.slug_terlarang t where t.slug = v_slug) then
    raise exception 'Slug ini tidak boleh dipakai' using errcode = '22023';
  end if;
  if exists (select 1 from public.pasangan p where p.slug = v_slug) then
    raise exception 'Slug % sudah dipakai pasangan lain', v_slug using errcode = '23505';
  end if;

  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(p_email));
  if uid is null then
    raise exception 'Belum ada akun dengan email %. Buat dulu di Authentication → Users.', p_email
      using errcode = 'P0002';
  end if;

  insert into public.pasangan (slug, paket, status, terbit, tanggal_acara, kota, pihak_bawaan)
  values (v_slug, v_paket, 'draf', false, p_tanggal, p_kota, 'keluarga-wanita')
  returning id into pid;

  insert into public.pemilik (user_id, pasangan_id) values (uid, pid);

  insert into public.mempelai (pasangan_id, sisi, panggilan, lengkap, peran, anak)
  values (pid, 'pria',   upper(btrim(p_pria)),   upper(btrim(p_pria)),   'Mempelai Pria',   'Putra dari'),
         (pid, 'wanita', upper(btrim(p_wanita)), upper(btrim(p_wanita)), 'Mempelai Wanita', 'Putri dari');

  insert into public.tempat (pasangan_id, kode, nama, alamat, ringkas, maps)
  values (pid, 'wanita', 'Kediaman Mempelai Putri', '', '', ''),
         (pid, 'pria',   'Kediaman Mempelai Putra', '', '', '');

  insert into public.pihak (pasangan_id, kode, kode_pendek, label, sisi, ttd_label, ttd_sub)
  values (pid, 'pria',            'p',  'Pengantin Pria',       'pria',   'Kami yang berbahagia', 'Beserta Keluarga'),
         (pid, 'wanita',          'w',  'Pengantin Wanita',     'wanita', 'Kami yang berbahagia', 'Beserta Keluarga'),
         (pid, 'keluarga-pria',   'kp', 'Keluarga Pihak Pria',  'pria',   'Hormat kami',          'Beserta Keluarga Besar'),
         (pid, 'keluarga-wanita', 'kw', 'Keluarga Pihak Wanita','wanita', 'Hormat kami',          'Beserta Keluarga Besar');

  insert into public.panitia_akses (pasangan_id, nama, token, pihak, aktif)
  values (pid, 'Pengantin (semua pihak)', encode(extensions.gen_random_bytes(24),'hex'), null,              true),
         (pid, 'Pengantin Pria',          encode(extensions.gen_random_bytes(24),'hex'), 'pria',            true),
         (pid, 'Pengantin Wanita',        encode(extensions.gen_random_bytes(24),'hex'), 'wanita',          true),
         (pid, 'Keluarga Pihak Pria',     encode(extensions.gen_random_bytes(24),'hex'), 'keluarga-pria',   true),
         (pid, 'Keluarga Pihak Wanita',   encode(extensions.gen_random_bytes(24),'hex'), 'keluarga-wanita', true);

  return pid;
end $$;
-- Hak akses persis seperti 023: service_role saja (lihat catatan di sana
-- tentang default privileges Supabase).
revoke all on function public.pasangan_siapkan(text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.pasangan_siapkan(text, text, text, text, date, text, text)
  to service_role;

-- /custom/<kode>/ adalah folder halaman custom (K4) dan /media/ tempat
-- foto: keduanya milik platform di domain bersama, jadi tidak boleh jadi
-- slug pasangan (mengundang.id/custom/… akan menimpa salah satunya).
insert into public.slug_terlarang (slug) values ('custom'), ('media')
on conflict do nothing;

-- ===========================================================================
-- TIGA — pasangan.khusus (didahulukan: pemicu DUA menjaganya)
-- ===========================================================================
-- Isi aneh yang dibutuhkan halaman custom (kutipan, lirik, "10 hal tentang
-- kami", tautan siaran): satu kolom untuk selamanya. Bentuknya ditentukan
-- halaman custom-nya sendiri dan dicatat di manifestnya (isi_khusus).
-- Diisi pemilik platform lewat admin_khusus(), bukan pasangan.
alter table public.pasangan
  add column if not exists khusus jsonb not null default '{}'::jsonb;
alter table public.pasangan drop constraint if exists pasangan_khusus_check;
alter table public.pasangan
  add constraint pasangan_khusus_check
  check (jsonb_typeof(khusus) = 'object' and pg_column_size(khusus) <= 20000);

-- ===========================================================================
-- DUA — kolom yang hanya boleh diubah pemilik platform
-- ===========================================================================
-- Kebijakan "pasangan panitia" (006) membuka SELURUH baris pasangan untuk
-- pemiliknya, termasuk kolom yang dibayar: pasangan yang login bisa,
-- lewat REST dengan anon key yang ada di setiap halaman, menaikkan
-- paketnya sendiri, memperpanjang masa_aktif, menunda hapus_pada,
-- melepas diri dari reseller, atau memasang tema custom milik pasangan
-- lain. Dasbor tidak pernah melakukannya — tapi dasbor bukan satu-satunya
-- yang bisa memanggil REST.
--
-- Pemicu ini hanya berlaku untuk peran `authenticated` yang langsung
-- menulis tabel (REST). RPC security definer (pemilik platform, admin
-- reseller, pasangan_siapkan) berjalan sebagai pemilik fungsi, dan edge
-- function sebagai service_role — keduanya tidak tersentuh. Pemilik
-- platform yang menulis lewat REST juga dibiarkan (is_admin()).
--
-- Yang tetap boleh, karena dasbor (di main maupun di cabang) memakainya:
-- tanggal_acara, kota, tema (katalog), tema_setel, pihak_bawaan, pembuka,
-- kenangan_terbit, terbit, dan status bolak-balik draf ↔ aktif
-- (tombol Terbitkan).
create or replace function public._pasangan_jaga_kolom()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user <> 'authenticated' or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Undangan hanya bisa dihapus pemilik platform' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.slug is distinct from old.slug
     or new.paket is distinct from old.paket or new.canonical_host is distinct from old.canonical_host
     or new.masa_aktif is distinct from old.masa_aktif or new.hapus_pada is distinct from old.hapus_pada
     or new.reseller_id is distinct from old.reseller_id or new.dibuat is distinct from old.dibuat
     or new.khusus is distinct from old.khusus then
    raise exception 'Kolom ini hanya bisa diubah pemilik platform' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draf','aktif') and new.status in ('draf','aktif')) then
    raise exception 'Status ini hanya bisa diubah pemilik platform' using errcode = '42501';
  end if;
  -- Tema custom dibeli (harga Full Custom), jadi tidak bisa dipasang
  -- sendiri. Melepasnya ke tema katalog boleh.
  if new.tema is distinct from old.tema and new.tema like 'custom/%' then
    raise exception 'Tema custom dipasang oleh pemilik platform' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._pasangan_jaga_kolom() from public, anon, authenticated;

-- Namanya mendahului pasangan_sah secara abjad, jadi pemicu ini melihat
-- nilai yang dikirim, sebelum pasangan_sah menormalkannya.
drop trigger if exists pasangan_jaga_kolom on public.pasangan;
create trigger pasangan_jaga_kolom
  before update or delete on public.pasangan
  for each row execute function public._pasangan_jaga_kolom();

-- ===========================================================================
-- EMPAT — brief_custom dan revisi_custom
-- ===========================================================================
-- Satu brief per pasangan. Isinya jsonb karena bentuknya akan berubah
-- selagi paketnya dijual (titik awal, referensi, warna, suasana, yang
-- tidak diinginkan, foto acuan); yang pasti dipakai untuk mengurutkan
-- dan menjaga (status, tenggat) jadi kolom.
--
--   baru → dikerjakan → pratinjau → revisi → … → terbit
--
-- Status diubah pemilik platform. Catatan revisi baru dari pasangan
-- memindahkan brief yang sedang `pratinjau`/`terbit` ke `revisi`
-- dengan sendirinya — supaya antrean pemilik tidak bergantung pada
-- pasangan memberi kabar lewat WhatsApp.
create table if not exists public.brief_custom (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null unique references public.pasangan (id) on delete cascade,
  isi         jsonb not null default '{}'::jsonb
              check (jsonb_typeof(isi) = 'object' and pg_column_size(isi) <= 20000),
  tenggat     date,
  status      text not null default 'baru'
              check (status in ('baru','dikerjakan','pratinjau','revisi','terbit')),
  pratinjau   text check (pratinjau is null or pratinjau ~ '^https://[^\s<>"'']+$'),
  dibuat      timestamptz not null default now(),
  diubah      timestamptz not null default now()
);
comment on table public.brief_custom is 'Brief desain Full Custom, satu per pasangan (docs/halaman-khusus.md 7.1)';

create table if not exists public.revisi_custom (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  isi         text not null check (char_length(btrim(isi)) between 1 and 2000),
  status      text not null default 'baru' check (status in ('baru','selesai')),
  komit       text check (komit is null or komit ~ '^[0-9a-f]{7,40}$'),
  dibuat      timestamptz not null default now(),
  selesai     timestamptz
);
comment on table public.revisi_custom is 'Satu permintaan revisi Full Custom per baris (docs/halaman-khusus.md 7.3)';
create index if not exists revisi_custom_pasangan_idx on public.revisi_custom (pasangan_id, dibuat);

-- Paket diperiksa di database, bukan hanya disembunyikan di dasbor.
-- Dipanggil kebijakan RLS sebagai `authenticated`, jadi bukan fungsi
-- "_" dalaman; ia hanya menjawab untuk undangan milik pemanggil sendiri
-- (pola yang sama dengan pasangan_saya), sehingga tidak membocorkan
-- paket undangan orang lain.
create or replace function public.full_custom_saya(p_pasangan uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.pasangan p
                  where p.id = p_pasangan and p.paket = 'full_custom'
                    and p.id in (select public.pasangan_saya()))
$$;
revoke all on function public.full_custom_saya(uuid) from public, anon;
grant execute on function public.full_custom_saya(uuid) to authenticated;

alter table public.brief_custom  enable row level security;
alter table public.revisi_custom enable row level security;
revoke all on public.brief_custom, public.revisi_custom from anon;

drop policy if exists "brief pemilik" on public.brief_custom;
create policy "brief pemilik" on public.brief_custom
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()) or public.is_admin())
  with check ((pasangan_id in (select public.pasangan_saya()) and public.full_custom_saya(pasangan_id))
              or public.is_admin());

drop policy if exists "revisi pemilik" on public.revisi_custom;
create policy "revisi pemilik" on public.revisi_custom
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()) or public.is_admin())
  with check ((pasangan_id in (select public.pasangan_saya()) and public.full_custom_saya(pasangan_id))
              or public.is_admin());

-- Pasangan menulis isinya; status, alamat pratinjau, dan hash komit
-- milik pemilik platform. Catatan yang sudah selesai tidak diubah atau
-- dihapus lagi — itu riwayat.
create or replace function public._brief_jaga()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.diubah := now();
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'baru'; new.pratinjau := null;
    elsif new.status is distinct from old.status or new.pratinjau is distinct from old.pratinjau
          or new.pasangan_id is distinct from old.pasangan_id then
      raise exception 'Status brief diubah pemilik platform' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._brief_jaga() from public, anon, authenticated;
drop trigger if exists brief_jaga on public.brief_custom;
create trigger brief_jaga before insert or update on public.brief_custom
  for each row execute function public._brief_jaga();

create or replace function public._revisi_jaga()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'baru'; new.komit := null; new.selesai := null;
    elsif old.status = 'selesai' then
      raise exception 'Revisi yang sudah selesai tidak bisa diubah' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (new.status is distinct from old.status or new.komit is distinct from old.komit
          or new.selesai is distinct from old.selesai or new.pasangan_id is distinct from old.pasangan_id) then
      raise exception 'Status revisi diubah pemilik platform' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public._revisi_jaga() from public, anon, authenticated;
drop trigger if exists revisi_jaga on public.revisi_custom;
create trigger revisi_jaga before insert or update or delete on public.revisi_custom
  for each row execute function public._revisi_jaga();

create or replace function public._revisi_buka_brief()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.brief_custom set status = 'revisi'
   where pasangan_id = new.pasangan_id and status in ('pratinjau','terbit');
  return new;
end $$;
revoke all on function public._revisi_buka_brief() from public, anon, authenticated;
drop trigger if exists revisi_buka_brief on public.revisi_custom;
create trigger revisi_buka_brief after insert on public.revisi_custom
  for each row execute function public._revisi_buka_brief();

-- ===========================================================================
-- LIMA — RPC pemilik platform
-- ===========================================================================
-- Antrean: semua pasangan Full Custom, dengan atau tanpa brief, yang
-- acaranya paling dekat paling atas (7.1).
create or replace function public.admin_custom_antrean()
returns table (pasangan_id uuid, slug text, terbit boolean, tanggal_acara date, tema text,
               khusus jsonb, brief_id uuid, status text, isi jsonb, tenggat date, pratinjau text,
               diubah timestamptz, revisi_baru bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return query
    select p.id, p.slug, p.terbit, p.tanggal_acara, p.tema, p.khusus,
           b.id, b.status, b.isi, b.tenggat, b.pratinjau, b.diubah,
           (select count(*) from public.revisi_custom r where r.pasangan_id = p.id and r.status = 'baru')
      from public.pasangan p
      left join public.brief_custom b on b.pasangan_id = p.id
     where p.paket = 'full_custom'
     order by p.tanggal_acara nulls last, p.slug;
end $$;

create or replace function public.admin_custom_status(p_pasangan uuid, p_status text, p_pratinjau text default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  insert into public.brief_custom (pasangan_id, status, pratinjau)
  values (p_pasangan, p_status, nullif(btrim(coalesce(p_pratinjau, '')), ''))
  on conflict (pasangan_id) do update
     set status = excluded.status,
         pratinjau = coalesce(excluded.pratinjau, public.brief_custom.pratinjau);
end $$;

create or replace function public.admin_revisi_selesai(p_ids uuid[], p_komit text)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform public._admin_wajib();
  update public.revisi_custom
     set status = 'selesai', komit = nullif(lower(btrim(coalesce(p_komit, ''))), ''), selesai = now()
   where id = any (p_ids) and status = 'baru';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_khusus(p_pasangan uuid, p_isi jsonb)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' then
    raise exception 'Isi khusus harus objek JSON' using errcode = '22023';
  end if;
  update public.pasangan set khusus = p_isi where id = p_pasangan;
  if not found then raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002'; end if;
end $$;

-- Memasang tema (custom atau katalog) untuk pasangan. Setelan tema lama
-- tidak berarti apa-apa di tema baru, sama seperti di dasbor.
create or replace function public.admin_tema(p_pasangan uuid, p_tema text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  update public.pasangan set tema = lower(btrim(p_tema)), tema_setel = '{}'::jsonb where id = p_pasangan;
  if not found then raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002'; end if;
end $$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('admin_custom_antrean', 'admin_custom_status', 'admin_revisi_selesai',
                         'admin_khusus', 'admin_tema')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ===========================================================================
-- ENAM — undangan_isi membawa `khusus`
-- ===========================================================================
-- Badan lengkap dari 038; satu-satunya perubahan satu kunci sesudah
-- 'kisah'.
create or replace function public.undangan_isi(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
    'slug', ps.slug, 'aktif', true, 'status', ps.status, 'tema', ps.tema,
    'tema_setel', ps.tema_setel,
    'pembuka', ps.pembuka,
    'kisah', public._undangan_kisah(ps.id),
    'khusus', ps.khusus,
    'foto', public._undangan_foto(ps.id),
    'canonical_host', ps.canonical_host, 'tanggal_acara', ps.tanggal_acara,
    'pihak_bawaan', ps.pihak_bawaan, 'kota', ps.kota,

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan, 'lengkap', m.lengkap, 'peran', m.peran,
        'anak', m.anak,
        'ayah',    (select s.nama from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ayah' order by s.urutan limit 1),
        'ayahKet', (select s.keterangan from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ayah' order by s.urutan limit 1),
        'ibu',     (select s.nama from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ibu' order by s.urutan limit 1),
        'ibuKet',  (select s.keterangan from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ibu' order by s.urutan limit 1)))
        from public.mempelai m where m.pasangan_id = ps.id),

    'silsilah', (
      select jsonb_object_agg(x.sisi, x.daftar) from (
        select s.sisi, jsonb_agg(jsonb_build_object(
                 'peran', s.peran, 'nama', s.nama, 'keterangan', s.keterangan,
                 'foto', s.foto_jalur, 'kecil', s.foto_kecil,
                 'lebar', s.lebar, 'tinggi', s.tinggi)
                 order by s.urutan, s.peran) as daftar
          from public.silsilah s
         where s.pasangan_id = ps.id and s.tampil
         group by s.sisi) x),

    'tempat', (
      select jsonb_object_agg(t.kode, jsonb_build_object(
        'nama', t.nama, 'alamat', t.alamat,
        'ringkas', t.ringkas, 'maps', t.maps))
        from public.tempat t where t.pasangan_id = ps.id),

    'acara', (
      select jsonb_agg(jsonb_build_object(
        'nama', a.nama, 'tanggal', a.tanggal, 'jam', a.jam,
        'ringkas', a.ringkas, 'mulai', a.mulai,
        'tempat', (select tt.kode from public.tempat tt where tt.id = a.tempat_id))
        order by a.urutan)
        from public.acara a where a.pasangan_id = ps.id and a.di_undangan),

    'dompet', (
      select jsonb_object_agg(d.kode, jsonb_build_object(
        'bank', d.bank, 'nomor', d.nomor, 'an', d.atas_nama))
        from public.dompet d where d.pasangan_id = ps.id),

    'pihak', (
      select jsonb_object_agg(ph.kode, jsonb_build_object(
        'label', ph.label, 'kode', ph.kode_pendek, 'sisi', ph.sisi,
        'ttdLabel', ph.ttd_label, 'ttdSub', ph.ttd_sub,
        'urutan', case when ph.sisi = 'pria'
                       then jsonb_build_array('pria','wanita')
                       else jsonb_build_array('wanita','pria') end,
        'ttdNama', jsonb_build_array(
          (select m.panggilan from public.mempelai m
            where m.pasangan_id = ps.id and m.sisi = ph.sisi),
          (select m.panggilan from public.mempelai m
            where m.pasangan_id = ps.id and m.sisi <> ph.sisi)),
        'dompet', coalesce((
          select jsonb_agg(d.kode order by (d.sisi is distinct from ph.sisi), d.kode)
            from public.dompet d where d.pasangan_id = ps.id), '[]'::jsonb)))
        from public.pihak ph where ph.pasangan_id = ps.id)
  ) into hasil;

  return hasil;
end $$;
