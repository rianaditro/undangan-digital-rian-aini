-- 009 — Penyimpanan foto acara. Tahap 1a dari docs/rencana-rilis.md.
--
-- Dua keputusan yang perlu dicatat, karena keduanya tidak jelas dari kodenya.
--
-- SATU: bucket-nya publik. Foto acara memang dibuat untuk dilihat orang
-- banyak — halaman /terimakasih justru disebar sebagai bahan jualan. Bucket
-- privat plus signed URL bisa saja, tapi URL-nya kedaluwarsa, jadi link yang
-- sudah diteruskan orang mati sendiri dan CDN tidak bisa menyimpannya.
-- Gantinya: nama berkasnya uuid acak, tidak bisa ditebak. Konsekuensi yang
-- harus disadari — sekali sebuah URL foto bocor, ia tetap bisa dibuka
-- walaupun pasangannya belum terbit atau fotonya disembunyikan. Untuk foto
-- resepsi itu risiko yang wajar; jangan pakai bucket ini untuk apa pun yang
-- lebih peka.
--
-- DUA: peramban sama sekali tidak boleh menulis ke bucket ini.
-- storage.objects sengaja dibiarkan tanpa satu pun policy, jadi anon maupun
-- authenticated ditolak secara bawaan. Alasannya: peramban cuma memegang
-- anon key dan token panitia, sementara RLS storage hanya bisa melihat
-- auth.role() — ia tidak punya cara memeriksa token kita. Kalau anon
-- diizinkan menulis, siapa pun di internet bisa menitipkan berkas di sini.
-- Jalan masuk satu-satunya adalah edge function `foto-unggah`, yang
-- memeriksa token lebih dulu lalu menulis dengan service_role.
--
-- Ini sekaligus server API sendiri yang pertama, sesuai arah yang sudah
-- diputuskan di docs/arsitektur.md.

create table if not exists public.foto (
  id           uuid primary key default gen_random_uuid(),
  pasangan_id  uuid not null references public.pasangan (id) on delete cascade,
  jalur        text not null unique,
  jalur_kecil  text,
  lebar        int,
  tinggi       int,
  bita         int,
  urutan       int  not null default 0,
  keterangan   text,
  tampil       boolean not null default true,
  diunggah     timestamptz not null default now()
);

comment on column public.foto.jalur       is 'Letak berkas di bucket foto, mis. {pasangan_id}/{uuid}.webp';
comment on column public.foto.jalur_kecil is 'Versi thumbnail untuk grid';
comment on column public.foto.lebar       is 'Dipakai halaman untuk memesan ruang sebelum gambar turun, supaya tata letak tidak melompat';
comment on column public.foto.bita        is 'Ukuran berkas, untuk memantau kuota';

create index if not exists foto_pasangan_urutan_idx
  on public.foto (pasangan_id, urutan, diunggah);

alter table public.foto enable row level security;

drop policy if exists "foto panitia" on public.foto;
create policy "foto panitia" on public.foto
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()))
  with check (pasangan_id in (select public.pasangan_saya()));

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', true, 2097152, array['image/webp','image/jpeg'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Batas 2 MB itu jaring pengaman, bukan target. Peramban sudah mengecilkan
-- gambar ke sekitar 200 KB lewat assets/gambar.js sebelum mengunggah; batas
-- ini cuma menahan berkas mentah 8 MB langsung dari kamera kalau suatu saat
-- ada jalur unggah yang lupa memanggil pengecilnya.

-- ---------------------------------------------------------------------------
-- Jalur token
-- ---------------------------------------------------------------------------

-- Dipakai edge function untuk menukar token jadi pasangan_id. Sengaja
-- menuntut token bercakupan penuh: foto acara itu urusan pengantin, bukan
-- per pihak, jadi pemegang link keluarga tidak boleh mengunggah.
create or replace function public.panitia_pasangan_penuh(p_token text)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  if a.pihak is not null then
    raise exception 'Link ini tidak berhak mengubah foto acara'
      using errcode = '42501';
  end if;
  return a.pasangan_id;
end $$;

revoke all on function public.panitia_pasangan_penuh(text) from public, anon, authenticated;
grant execute on function public.panitia_pasangan_penuh(text) to service_role;

-- Daftar foto untuk halaman pengelola. Memuat yang disembunyikan juga.
create or replace function public.foto_daftar(p_token text)
returns table (
  id uuid, jalur text, jalur_kecil text, lebar int, tinggi int,
  bita int, urutan int, keterangan text, tampil boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  if a.pihak is not null then
    raise exception 'Link ini tidak berhak melihat foto acara'
      using errcode = '42501';
  end if;
  return query
    select f.id, f.jalur, f.jalur_kecil, f.lebar, f.tinggi,
           f.bita, f.urutan, f.keterangan, f.tampil
      from public.foto f
     where f.pasangan_id = a.pasangan_id
     order by f.urutan, f.diunggah;
end $$;

-- Satu RPC untuk semua penyuntingan ringan. Nilai null berarti "jangan
-- diubah", jadi pemanggil boleh mengirim satu kolom saja.
create or replace function public.foto_ubah(
  p_token text, p_id uuid,
  p_urutan int default null,
  p_keterangan text default null,
  p_tampil boolean default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  if a.pihak is not null then
    raise exception 'Link ini tidak berhak mengubah foto acara'
      using errcode = '42501';
  end if;
  update public.foto f
     set urutan     = coalesce(p_urutan, f.urutan),
         keterangan = coalesce(p_keterangan, f.keterangan),
         tampil     = coalesce(p_tampil, f.tampil)
   where f.id = p_id
     and f.pasangan_id = a.pasangan_id;
  if not found then
    raise exception 'Foto tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

grant execute on function public.foto_daftar(text)                       to anon, authenticated;
grant execute on function public.foto_ubah(text, uuid, int, text, boolean) to anon, authenticated;
