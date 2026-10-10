-- Tiruan sekecil mungkin dari permukaan Supabase yang dipakai migrasi.
--
-- Bukan Supabase. Cuma cukup untuk membangun ulang skema dari berkas
-- migrasi di Postgres biasa, lalu menjalankan uji SQL terhadapnya —
-- pengganti database staging selama proyek masih di paket gratis.
--
-- Yang ditiru diukur dari migrasinya sendiri (grep auth., storage.,
-- extensions., dan peran), bukan dari dokumentasi Supabase. Kalau migrasi
-- baru memakai sesuatu yang belum ada di sini, pembangunannya gagal keras
-- — dan itu memang yang diinginkan.

-- ---------- peran ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

-- Default privileges Supabase: tabel dan fungsi baru di public langsung
-- bisa dipakai ketiga peran. Ini yang membuat `revoke from public` saja
-- tidak cukup di migrasi 023 — tanpa meniru ini, uji lokal akan lebih
-- aman daripada produksi, dan justru jenis lubang itu yang lolos.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------- extensions ----------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------- auth ----------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
  email varchar(255), encrypted_password varchar(255), email_confirmed_at timestamptz,
  invited_at timestamptz, confirmation_token varchar(255), confirmation_sent_at timestamptz,
  recovery_token varchar(255), recovery_sent_at timestamptz, email_change_token_new varchar(255),
  email_change varchar(255), email_change_sent_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
  created_at timestamptz, updated_at timestamptz, phone text default null,
  phone_confirmed_at timestamptz, phone_change text default '', phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '', email_change_confirm_status smallint default 0,
  banned_until timestamptz, reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz, is_sso_user boolean not null default false,
  deleted_at timestamptz, is_anonymous boolean not null default false
);

create table if not exists auth.identities (
  provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, email text,
  id uuid primary key default gen_random_uuid()
);

-- auth.uid() dan auth.role() membaca klaim JWT yang di Supabase dipasang
-- PostgREST. Di sini uji memasangnya sendiri lewat set_config.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true),
                  current_setting('request.jwt.claims', true)::jsonb ->> 'role')
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- ---------- storage ----------
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
