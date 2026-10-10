-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- Migrasi 031 (reseller), persis seperti berkasnya di
-- supabase/migrations/, dibungkus satu transaksi.
--
--   · admin pertama yang sudah ada menjadi owner
--   · tabel reseller, pesanan, pencairan, kunjungan — tertutup untuk
--     REST, hanya lewat fungsi
--   · fungsi reseller_* untuk /reseller, admin_* baru untuk /admin,
--     kunjungan_catat untuk halaman depan (?r=kode)
--   · slug "reseller" dilarang untuk pasangan
--
-- Hanya menambah. Undangan, /kirim, /dasbor, dan /admin yang sekarang
-- tayang tidak memanggil apa pun yang berubah.
--
-- Yang benar: "Success. No rows returned".

begin;

-- 031 — reseller: pesanan, komisi, pencairan, kunjungan; owner dan admin.
--
-- Alurnya:
--
--   reseller mencatat pesanan (data klien)      → status 'menunggu'
--   owner/admin menerima pembayaran, konfirmasi → status 'lunas'
--        edge function admin-pasangan membuat akun klien (undangan
--        lewat email kalau SMTP siap), lalu pesanan_lunaskan() membuat
--        pasangannya — langsung 'aktif', siap diisi di /dasbor
--   owner mentransfer komisi beberapa pesanan sekaligus
--        → satu baris `pencairan` dengan nomor transaksi bank-nya;
--          pesanan-pesanan itu sekarang 'cair' di halaman reseller
--
-- Uang tetap satu pembayaran: klien membayar ke pemilik platform, dan
-- komisi reseller dicatat di sini lalu dibayar manual. Harga dan komisi
-- belum ditetapkan, jadi keduanya diisi per pesanan saat konfirmasi,
-- bukan dari tabel harga.
--
-- Pengunjung yang datang lewat mengundang.id/?r=<kode> dicatat per
-- reseller, per hari, per peramban — cukup untuk menghitung konversi
-- (pesanan lunas ÷ pengunjung unik) tanpa menyimpan apa pun tentang
-- orangnya.
--
-- Reseller TIDAK PERNAH melihat data tamu, RSVP, ucapan, atau amplop
-- kliennya. Semua yang ia lihat datang dari fungsi reseller_* di bawah,
-- dan tidak satu pun menyentuh tabel-tabel itu.

-- ---------------------------------------------------------------------------
-- Owner dan admin
-- ---------------------------------------------------------------------------
-- Sampai 020 semua admin setara, dan sengaja tidak ada tombol "jadikan
-- admin". Sekarang ada: tapi hanya owner yang memegangnya, dan owner
-- sendiri tetap dibuat lewat SQL. Admin pertama yang sudah ada otomatis
-- menjadi owner.
alter table public.admin add column if not exists peran text not null default 'admin';
alter table public.admin drop constraint if exists admin_peran_check;
alter table public.admin add constraint admin_peran_check check (peran in ('owner','admin'));
update public.admin set peran = 'owner'
 where user_id = (select a.user_id from public.admin a order by a.dibuat limit 1)
   and not exists (select 1 from public.admin where peran = 'owner');

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin a where a.user_id = auth.uid() and a.peran = 'owner')
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create or replace function public._owner_wajib()
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_owner() then
    raise exception 'Hanya owner yang boleh melakukan ini' using errcode = '42501';
  end if;
end $$;
revoke all on function public._owner_wajib() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
create table if not exists public.reseller (
  id       uuid primary key default gen_random_uuid(),
  -- restrict, bukan cascade: menghapus akunnya tidak boleh ikut
  -- menghapus riwayat penjualan dan komisinya.
  user_id  uuid not null unique references auth.users(id) on delete restrict,
  kode     text not null unique check (kode ~ '^[a-z0-9]{2,20}$'),
  nama     text not null check (char_length(nama) between 1 and 80),
  kontak   text check (kontak is null or char_length(kontak) <= 40),
  rekening text check (rekening is null or char_length(rekening) <= 200),
  aktif    boolean not null default true,
  dibuat   timestamptz not null default now()
);

create table if not exists public.pencairan (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller(id) on delete restrict,
  nominal     integer not null check (nominal >= 0),
  ref         text not null check (char_length(btrim(ref)) between 1 and 80),
  catatan     text check (catatan is null or char_length(catatan) <= 300),
  dibuat      timestamptz not null default now(),
  dibuat_oleh uuid references auth.users(id) on delete set null
);

create table if not exists public.pesanan (
  id            uuid primary key default gen_random_uuid(),
  nomor         bigint generated always as identity unique,
  -- null = penjualan langsung, tanpa reseller
  reseller_id   uuid references public.reseller(id) on delete restrict,
  status        text not null default 'menunggu' check (status in ('menunggu','lunas','batal')),
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  paket         text not null default 'standar' check (paket in ('standar','premium')),
  pria          text not null check (char_length(pria) between 1 and 40),
  wanita        text not null check (char_length(wanita) between 1 and 40),
  tanggal       date,
  kota          text check (kota is null or char_length(kota) <= 40),
  email_klien   text not null check (email_klien ~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  catatan       text check (catatan is null or char_length(catatan) <= 300),
  nominal       integer check (nominal is null or nominal >= 0),
  komisi        integer check (komisi is null or komisi >= 0),
  pasangan_id   uuid references public.pasangan(id) on delete set null,
  pencairan_id  uuid references public.pencairan(id) on delete set null,
  dibuat        timestamptz not null default now(),
  dibuat_oleh   uuid references auth.users(id) on delete set null,
  dikonfirmasi  timestamptz,
  dikonfirmasi_oleh uuid references auth.users(id) on delete set null,
  constraint pesanan_lunas_lengkap check (
    status <> 'lunas' or (nominal is not null and komisi is not null and dikonfirmasi is not null)),
  constraint pesanan_cair_lunas check (pencairan_id is null or status = 'lunas'),
  constraint pesanan_komisi_wajar check (komisi is null or nominal is null or komisi <= nominal)
);

-- Satu slug hanya boleh dipesan sekali selama masih menunggu; sesudah
-- lunas, slug-nya milik pasangan dan dijaga tabel itu sendiri.
create unique index if not exists pesanan_slug_menunggu
  on public.pesanan (slug) where status = 'menunggu';
create index if not exists pesanan_reseller on public.pesanan (reseller_id, status);

create table if not exists public.kunjungan (
  reseller_id uuid not null references public.reseller(id) on delete cascade,
  hari        date not null default current_date,
  -- acak dari peramban (localStorage), bukan IP dan bukan sidik jari
  pengunjung  text not null check (pengunjung ~ '^[a-z0-9-]{8,40}$'),
  jalur       text check (jalur is null or char_length(jalur) <= 120),
  primary key (reseller_id, hari, pengunjung)
);

-- pasangan.reseller_id sudah ada sejak 002, tanpa kunci asing karena
-- tabelnya belum ada. Sekarang ada.
alter table public.pasangan drop constraint if exists pasangan_reseller_fk;
alter table public.pasangan add constraint pasangan_reseller_fk
  foreign key (reseller_id) references public.reseller(id) on delete restrict;

-- Semua lewat fungsi di bawah. Tidak ada kebijakan RLS sama sekali,
-- jadi REST langsung ke tabel-tabel ini menghasilkan nol baris untuk
-- siapa pun selain service_role.
alter table public.reseller  enable row level security;
alter table public.pencairan enable row level security;
alter table public.pesanan   enable row level security;
alter table public.kunjungan enable row level security;
revoke all on public.reseller, public.pencairan, public.pesanan, public.kunjungan from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kunjungan — dipanggil halaman depan, tanpa login
-- ---------------------------------------------------------------------------
-- Mengembalikan true kalau kodenya milik reseller aktif, supaya halaman
-- tahu apakah kode itu pantas diingat dan disebut di pesan WhatsApp.
-- Satu baris per reseller per hari per peramban: memanggil berulang kali
-- tidak menggelembungkan angka.
create or replace function public.kunjungan_catat(p_kode text, p_pengunjung text, p_jalur text default null)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  rid uuid;
begin
  select r.id into rid from public.reseller r
   where r.kode = lower(btrim(coalesce(p_kode, ''))) and r.aktif;
  if rid is null then return false; end if;
  if coalesce(p_pengunjung, '') !~ '^[a-z0-9-]{8,40}$' then return true; end if;

  insert into public.kunjungan (reseller_id, pengunjung, jalur)
  values (rid, p_pengunjung, left(p_jalur, 120))
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.kunjungan_catat(text, text, text) from public;
grant execute on function public.kunjungan_catat(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pesanan — dibuat reseller atau admin
-- ---------------------------------------------------------------------------
create or replace function public._pesanan_buat(
  p_reseller uuid, p_pria text, p_wanita text, p_slug text, p_paket text,
  p_tanggal date, p_kota text, p_email text, p_catatan text)
returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  n      bigint;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 40 then
    raise exception 'Slug hanya huruf kecil, angka, dan tanda hubung (3–40 huruf)' using errcode = '22023';
  end if;
  if exists (select 1 from public.slug_terlarang t where t.slug = v_slug) then
    raise exception 'Slug "%" dipakai halaman platform, pilih yang lain', v_slug using errcode = '22023';
  end if;
  if exists (select 1 from public.pasangan p where p.slug = v_slug)
     or exists (select 1 from public.pesanan s where s.slug = v_slug and s.status = 'menunggu') then
    raise exception 'Slug "%" sudah dipakai', v_slug using errcode = '23505';
  end if;

  insert into public.pesanan (reseller_id, slug, paket, pria, wanita, tanggal, kota,
                              email_klien, catatan, dibuat_oleh)
  values (p_reseller, v_slug, lower(btrim(coalesce(p_paket, 'standar'))),
          btrim(p_pria), btrim(p_wanita), p_tanggal, nullif(btrim(coalesce(p_kota, '')), ''),
          lower(btrim(p_email)), nullif(btrim(coalesce(p_catatan, '')), ''), auth.uid())
  returning nomor into n;
  return n;
end $$;
revoke all on function public._pesanan_buat(uuid, text, text, text, text, date, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sisi reseller
-- ---------------------------------------------------------------------------
create or replace function public._reseller_saya()
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rid uuid;
begin
  select r.id into rid from public.reseller r where r.user_id = auth.uid() and r.aktif;
  if rid is null then
    raise exception 'Halaman ini hanya untuk reseller' using errcode = '42501';
  end if;
  return rid;
end $$;
revoke all on function public._reseller_saya() from public, anon, authenticated;

create or replace function public.is_reseller()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.reseller r where r.user_id = auth.uid() and r.aktif)
$$;
revoke all on function public.is_reseller() from public, anon;
grant execute on function public.is_reseller() to authenticated;

create or replace function public.reseller_saya()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rid uuid := public._reseller_saya();
  hasil jsonb;
begin
  select jsonb_build_object(
    'kode', r.kode, 'nama', r.nama, 'rekening', r.rekening,
    'pengunjung',     (select count(*) from public.kunjungan k where k.reseller_id = rid),
    'pengunjung_30h', (select count(*) from public.kunjungan k where k.reseller_id = rid
                         and k.hari > current_date - 30),
    'pesanan',        (select count(*) from public.pesanan s where s.reseller_id = rid and s.status <> 'batal'),
    'lunas',          (select count(*) from public.pesanan s where s.reseller_id = rid and s.status = 'lunas'),
    'komisi_total',   (select coalesce(sum(s.komisi), 0) from public.pesanan s
                        where s.reseller_id = rid and s.status = 'lunas'),
    'komisi_cair',    (select coalesce(sum(s.komisi), 0) from public.pesanan s
                        where s.reseller_id = rid and s.status = 'lunas' and s.pencairan_id is not null),
    'komisi_tertahan',(select coalesce(sum(s.komisi), 0) from public.pesanan s
                        where s.reseller_id = rid and s.status = 'lunas' and s.pencairan_id is null))
  into hasil
  from public.reseller r where r.id = rid;
  return hasil;
end $$;
revoke all on function public.reseller_saya() from public, anon;
grant execute on function public.reseller_saya() to authenticated;

-- Pesanan milik reseller ini. Yang keluar hanya yang ia ketik sendiri
-- ditambah status dan alamat undangannya — tidak ada angka tamu.
create or replace function public.reseller_pesanan()
returns table (nomor bigint, status text, pria text, wanita text, slug text, paket text,
               tanggal date, email_klien text, dibuat timestamptz, dikonfirmasi timestamptz,
               komisi integer, cair boolean, pencairan_ref text, pencairan_tanggal timestamptz,
               canonical_host text, terbit boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rid uuid := public._reseller_saya();
begin
  return query
    select s.nomor, s.status, s.pria, s.wanita, s.slug, s.paket, s.tanggal, s.email_klien,
           s.dibuat, s.dikonfirmasi, s.komisi, s.pencairan_id is not null,
           c.ref, c.dibuat, p.canonical_host, p.terbit
      from public.pesanan s
      left join public.pencairan c on c.id = s.pencairan_id
      left join public.pasangan  p on p.id = s.pasangan_id
     where s.reseller_id = rid
     order by s.dibuat desc;
end $$;
revoke all on function public.reseller_pesanan() from public, anon;
grant execute on function public.reseller_pesanan() to authenticated;

create or replace function public.reseller_pencairan()
returns table (dibuat timestamptz, nominal integer, ref text, catatan text, jumlah_pesanan int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rid uuid := public._reseller_saya();
begin
  return query
    select c.dibuat, c.nominal, c.ref, c.catatan,
           (select count(*)::int from public.pesanan s where s.pencairan_id = c.id)
      from public.pencairan c
     where c.reseller_id = rid
     order by c.dibuat desc;
end $$;
revoke all on function public.reseller_pencairan() from public, anon;
grant execute on function public.reseller_pencairan() to authenticated;

create or replace function public.reseller_pesan(
  p_pria text, p_wanita text, p_slug text, p_paket text default 'standar',
  p_tanggal date default null, p_kota text default null, p_email text default null,
  p_catatan text default null)
returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return public._pesanan_buat(public._reseller_saya(), p_pria, p_wanita, p_slug, p_paket,
                              p_tanggal, p_kota, p_email, p_catatan);
end $$;
revoke all on function public.reseller_pesan(text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.reseller_pesan(text, text, text, text, date, text, text, text) to authenticated;

create or replace function public.reseller_batal(p_nomor bigint)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  rid uuid := public._reseller_saya();
begin
  update public.pesanan set status = 'batal'
   where nomor = p_nomor and reseller_id = rid and status = 'menunggu';
  if not found then
    raise exception 'Pesanan itu tidak bisa dibatalkan' using errcode = '22023';
  end if;
end $$;
revoke all on function public.reseller_batal(bigint) from public, anon;
grant execute on function public.reseller_batal(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Sisi admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_peran()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.peran from public.admin a where a.user_id = auth.uid()
$$;
revoke all on function public.admin_peran() from public, anon;
grant execute on function public.admin_peran() to authenticated;

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
      raise exception 'Kode reseller "%" tidak ada', p_reseller_kode using errcode = 'P0002';
    end if;
  end if;
  return public._pesanan_buat(rid, p_pria, p_wanita, p_slug, p_paket, p_tanggal, p_kota, p_email, p_catatan);
end $$;
revoke all on function public.admin_pesan(text, text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.admin_pesan(text, text, text, text, text, date, text, text, text) to authenticated;

create or replace function public.admin_pesanan()
returns table (id uuid, nomor bigint, status text, reseller_kode text, reseller_nama text,
               pria text, wanita text, slug text, paket text, tanggal date, kota text,
               email_klien text, catatan text, nominal integer, komisi integer, cair boolean,
               pencairan_ref text, dibuat timestamptz, dikonfirmasi timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return query
    select s.id, s.nomor, s.status, r.kode, r.nama, s.pria, s.wanita, s.slug, s.paket,
           s.tanggal, s.kota, s.email_klien, s.catatan, s.nominal, s.komisi,
           s.pencairan_id is not null, c.ref, s.dibuat, s.dikonfirmasi
      from public.pesanan s
      left join public.reseller  r on r.id = s.reseller_id
      left join public.pencairan c on c.id = s.pencairan_id
     order by (s.status = 'menunggu') desc, s.dibuat desc;
end $$;
revoke all on function public.admin_pesanan() from public, anon;
grant execute on function public.admin_pesanan() to authenticated;

create or replace function public.admin_pesanan_batal(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  update public.pesanan set status = 'batal' where id = p_id and status = 'menunggu';
  if not found then
    raise exception 'Hanya pesanan yang masih menunggu yang bisa dibatalkan' using errcode = '22023';
  end if;
end $$;
revoke all on function public.admin_pesanan_batal(uuid) from public, anon;
grant execute on function public.admin_pesanan_batal(uuid) to authenticated;

-- Dipanggil edge function SESUDAH akun klien ada. Satu transaksi:
-- pasangan dibuat lewat pasangan_siapkan() (mempelai, tempat, pihak,
-- token panitia, pemilik), lalu langsung 'aktif' dan dicatat sebagai
-- penjualan reseller-nya.
create or replace function public.pesanan_lunaskan(
  p_id uuid, p_nominal integer, p_komisi integer, p_oleh uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s   public.pesanan;
  pid uuid;
begin
  select * into s from public.pesanan where id = p_id for update;
  if s.id is null then
    raise exception 'Pesanan tidak ada' using errcode = 'P0002';
  end if;
  if s.status <> 'menunggu' then
    raise exception 'Pesanan #% sudah %', s.nomor, s.status using errcode = '22023';
  end if;
  if p_nominal is null or p_nominal < 0 or p_komisi is null or p_komisi < 0 or p_komisi > p_nominal then
    raise exception 'Nominal dan komisi harus diisi, dan komisi tidak boleh melebihi nominal'
      using errcode = '22023';
  end if;
  if s.reseller_id is null and p_komisi <> 0 then
    raise exception 'Penjualan langsung tidak punya komisi' using errcode = '22023';
  end if;

  pid := public.pasangan_siapkan(s.slug, s.email_klien, s.pria, s.wanita, s.tanggal, s.kota, s.paket);
  update public.pasangan set status = 'aktif', reseller_id = s.reseller_id where id = pid;

  update public.pesanan
     set status = 'lunas', nominal = p_nominal, komisi = p_komisi, pasangan_id = pid,
         dikonfirmasi = now(), dikonfirmasi_oleh = p_oleh
   where id = p_id;
  return pid;
end $$;
revoke all on function public.pesanan_lunaskan(uuid, integer, integer, uuid) from public, anon, authenticated;

-- Statistik per reseller: yang dilihat owner untuk menilai siapa yang
-- konversinya tinggi.
create or replace function public.admin_reseller()
returns table (id uuid, kode text, nama text, kontak text, rekening text, aktif boolean,
               email text, dibuat timestamptz,
               pengunjung int, pengunjung_30h int, pesanan int, lunas int,
               omzet bigint, komisi_total bigint, komisi_cair bigint, komisi_tertahan bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  return query
    select r.id, r.kode, r.nama, r.kontak, r.rekening, r.aktif, u.email::text, r.dibuat,
           (select count(*)::int from public.kunjungan k where k.reseller_id = r.id),
           (select count(*)::int from public.kunjungan k where k.reseller_id = r.id
              and k.hari > current_date - 30),
           (select count(*)::int from public.pesanan s where s.reseller_id = r.id and s.status <> 'batal'),
           (select count(*)::int from public.pesanan s where s.reseller_id = r.id and s.status = 'lunas'),
           (select coalesce(sum(s.nominal), 0)::bigint from public.pesanan s
             where s.reseller_id = r.id and s.status = 'lunas'),
           (select coalesce(sum(s.komisi), 0)::bigint from public.pesanan s
             where s.reseller_id = r.id and s.status = 'lunas'),
           (select coalesce(sum(s.komisi), 0)::bigint from public.pesanan s
             where s.reseller_id = r.id and s.status = 'lunas' and s.pencairan_id is not null),
           (select coalesce(sum(s.komisi), 0)::bigint from public.pesanan s
             where s.reseller_id = r.id and s.status = 'lunas' and s.pencairan_id is null)
      from public.reseller r
      left join auth.users u on u.id = r.user_id
     order by r.dibuat;
end $$;
revoke all on function public.admin_reseller() from public, anon;
grant execute on function public.admin_reseller() to authenticated;

create or replace function public.admin_reseller_aktif(p_id uuid, p_aktif boolean)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._owner_wajib();
  update public.reseller set aktif = p_aktif where id = p_id;
end $$;
revoke all on function public.admin_reseller_aktif(uuid, boolean) from public, anon;
grant execute on function public.admin_reseller_aktif(uuid, boolean) to authenticated;

-- Satu transfer ke rekening reseller, mencakup semua komisi lunas yang
-- belum cair saat itu. Nomor transaksi bank-nya yang dilihat reseller.
create or replace function public.admin_pencairan_catat(p_reseller uuid, p_ref text, p_catatan text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  cid   uuid;
  total integer;
  n     integer;
begin
  perform public._owner_wajib();
  if nullif(btrim(coalesce(p_ref, '')), '') is null then
    raise exception 'Nomor transaksi transfer harus diisi' using errcode = '22023';
  end if;

  select coalesce(sum(s.komisi), 0), count(*) into total, n
    from public.pesanan s
   where s.reseller_id = p_reseller and s.status = 'lunas' and s.pencairan_id is null;
  if n = 0 then
    raise exception 'Tidak ada komisi yang menunggu dicairkan' using errcode = '22023';
  end if;

  insert into public.pencairan (reseller_id, nominal, ref, catatan, dibuat_oleh)
  values (p_reseller, total, btrim(p_ref), nullif(btrim(coalesce(p_catatan, '')), ''), auth.uid())
  returning id into cid;

  update public.pesanan set pencairan_id = cid
   where reseller_id = p_reseller and status = 'lunas' and pencairan_id is null;

  return jsonb_build_object('nominal', total, 'jumlah_pesanan', n);
end $$;
revoke all on function public.admin_pencairan_catat(uuid, text, text) from public, anon;
grant execute on function public.admin_pencairan_catat(uuid, text, text) to authenticated;

create or replace function public.admin_admin()
returns table (user_id uuid, email text, nama text, peran text, dibuat timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._owner_wajib();
  return query
    select a.user_id, u.email::text, a.nama, a.peran, a.dibuat
      from public.admin a left join auth.users u on u.id = a.user_id
     order by a.dibuat;
end $$;
revoke all on function public.admin_admin() from public, anon;
grant execute on function public.admin_admin() to authenticated;

-- Owner tidak bisa dicabut dari sini, termasuk dirinya sendiri.
create or replace function public.admin_admin_cabut(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._owner_wajib();
  delete from public.admin where user_id = p_user and peran = 'admin';
  if not found then
    raise exception 'Hanya admin biasa yang bisa dicabut' using errcode = '22023';
  end if;
end $$;
revoke all on function public.admin_admin_cabut(uuid) from public, anon;
grant execute on function public.admin_admin_cabut(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- /reseller milik platform
-- ---------------------------------------------------------------------------
-- Tanpa ini pasangan bernama "reseller" bisa dibuat, dan
-- mengundang.id/reseller jadi rebutan antara halaman dan undangannya.
insert into public.slug_terlarang (slug) values ('reseller')
on conflict do nothing;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261010000001', 'reseller')
on conflict (version) do nothing;

commit;
