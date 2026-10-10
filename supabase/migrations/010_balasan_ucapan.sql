-- 010 — Balasan ucapan. Tahap 1b dari docs/rencana-rilis.md.
--
-- Menambah tiga kolom ke `ucapan`, lalu menutup dua lubang yang selama ini
-- tidak berbahaya tapi jadi berbahaya begitu kolomnya ada.
--
-- LUBANG PERTAMA — tamu bisa mengarang balasan. Policy INSERT lama hanya
-- memeriksa panjang `nama` dan `pesan`. Ia tidak membatasi kolom mana saja
-- yang boleh diisi, jadi siapa pun bisa POST ke /rest/v1/ucapan sambil
-- menyertakan `balasan`, dan halaman terima kasih akan menayangkannya
-- seolah-olah itu tulisan pengantin. Sekarang `balasan` dan `dibalas_pada`
-- wajib kosong pada setiap tulisan tamu; mengisinya hanya bisa lewat RPC
-- yang memeriksa token.
--
-- LUBANG KEDUA — "sembunyikan" yang tidak menyembunyikan. Policy SELECT
-- lama berbunyi `using (true)`, jadi anon boleh membaca seluruh baris.
-- Kalau kolom `tampil` cuma disaring di halaman, ucapan yang disembunyikan
-- tetap terbaca oleh siapa pun yang memanggil REST langsung — padahal
-- alasan menyembunyikannya biasanya justru karena isinya tidak pantas.
-- Saringannya dipindah ke policy, supaya mengikat di server.
--
-- Halaman undangan yang sedang hidup tidak terpengaruh: ia membaca dengan
-- select=nama,hadir,pesan,created_at (tidak menyentuh kolom baru) dan
-- mengirim tanpa menyebut `balasan`. Seluruh 29 ucapan yang sudah ada
-- ber-`tampil` true karena itu nilai bawaannya.

alter table public.ucapan
  add column if not exists balasan      text,
  add column if not exists dibalas_pada timestamptz,
  add column if not exists tampil       boolean not null default true;

comment on column public.ucapan.balasan is 'Balasan pengantin. Hanya bisa diisi lewat ucapan_balas().';
comment on column public.ucapan.tampil  is 'Tampil di halaman terima kasih dan buku ucapan. Disaring di policy, bukan di halaman.';

alter table public.ucapan drop constraint if exists ucapan_balasan_panjang;
alter table public.ucapan add  constraint ucapan_balasan_panjang
  check (balasan is null or char_length(balasan) between 1 and 800);

create index if not exists ucapan_pasangan_tampil_idx
  on public.ucapan (pasangan_id, tampil, created_at desc);

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------

drop policy if exists "ucapan baca publik" on public.ucapan;
create policy "ucapan baca publik" on public.ucapan
  for select to anon, authenticated
  using (tampil);

drop policy if exists "ucapan tulis publik" on public.ucapan;
create policy "ucapan tulis publik" on public.ucapan
  for insert to anon, authenticated
  with check (
        char_length(nama)  between 1 and 60
    and char_length(pesan) between 1 and 800
    and balasan      is null
    and dibalas_pada is null
  );

-- Catatan yang belum selesai: `pasangan_id` masih belum dikunci di sini,
-- jadi secara teori sebuah tulisan bisa dititipkan ke pasangan lain.
-- Sekarang belum berakibat apa-apa karena baru ada satu pasangan, dan
-- menguncinya benar-benar butuh halaman tahu ia sedang menulis untuk siapa
-- — itu resolusi penyewa, tahap 2. Jangan lupa.

-- ---------------------------------------------------------------------------
-- Penjaga cakupan penuh, dijadikan satu
-- ---------------------------------------------------------------------------

-- Sebelum ini pemeriksaan "token harus bercakupan penuh" disalin di tiap
-- fungsi. Baru tiga salinan dan sudah terasa; dengan enam salinan cepat
-- atau lambat ada satu yang tertinggal waktu aturannya berubah, dan satu
-- yang tertinggal sudah cukup untuk membuka pintu. Jadi dijadikan satu.
create or replace function public._panitia_penuh(p_token text)
returns public.panitia_akses
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  if a.pihak is not null then
    raise exception 'Link ini hanya untuk satu pihak, tidak berhak mengubah isi halaman'
      using errcode = '42501';
  end if;
  return a;
end $$;

revoke all on function public._panitia_penuh(text) from public, anon, authenticated;

-- Ditulis ulang supaya ikut memakai penjaga tunggal di atas.
create or replace function public.panitia_pasangan_penuh(p_token text)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return (public._panitia_penuh(p_token)).pasangan_id;
end $$;

revoke all on function public.panitia_pasangan_penuh(text) from public, anon, authenticated;
grant execute on function public.panitia_pasangan_penuh(text) to service_role;

create or replace function public.foto_daftar(p_token text)
returns table (
  id uuid, jalur text, jalur_kecil text, lebar int, tinggi int,
  bita int, urutan int, keterangan text, tampil boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
  return query
    select f.id, f.jalur, f.jalur_kecil, f.lebar, f.tinggi,
           f.bita, f.urutan, f.keterangan, f.tampil
      from public.foto f
     where f.pasangan_id = a.pasangan_id
     order by f.urutan, f.diunggah;
end $$;

create or replace function public.foto_ubah(
  p_token text, p_id uuid,
  p_urutan int default null,
  p_keterangan text default null,
  p_tampil boolean default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
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

-- ---------------------------------------------------------------------------
-- Ucapan: daftar, balas, sembunyikan
-- ---------------------------------------------------------------------------

-- Daftar untuk pengelola. Ini satu-satunya cara melihat ucapan yang
-- disembunyikan, karena policy SELECT sekarang menyaringnya.
create or replace function public.ucapan_daftar(p_token text)
returns table (
  id bigint, nama text, hadir text, pesan text, pihak text,
  balasan text, dibalas_pada timestamptz, tampil boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
  return query
    select u.id, u.nama, u.hadir, u.pesan, u.pihak,
           u.balasan, u.dibalas_pada, u.tampil, u.created_at
      from public.ucapan u
     where u.pasangan_id = a.pasangan_id
     order by u.created_at desc;
end $$;

-- Teks kosong atau null berarti membatalkan balasan, bukan menyimpan
-- balasan kosong — supaya yang salah kirim bisa menariknya kembali.
create or replace function public.ucapan_balas(p_token text, p_id bigint, p_teks text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses; t text;
begin
  a := public._panitia_penuh(p_token);
  t := nullif(btrim(coalesce(p_teks, '')), '');

  if t is not null and char_length(t) > 800 then
    raise exception 'Balasan terlalu panjang, maksimal 800 huruf'
      using errcode = '22001';
  end if;

  update public.ucapan u
     set balasan      = t,
         dibalas_pada = case when t is null then null else now() end
   where u.id = p_id
     and u.pasangan_id = a.pasangan_id;

  if not found then
    raise exception 'Ucapan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.ucapan_tampil(p_token text, p_id bigint, p_tampil boolean)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
  update public.ucapan u
     set tampil = coalesce(p_tampil, true)
   where u.id = p_id
     and u.pasangan_id = a.pasangan_id;
  if not found then
    raise exception 'Ucapan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

grant execute on function public.ucapan_daftar(text)                to anon, authenticated;
grant execute on function public.ucapan_balas(text, bigint, text)   to anon, authenticated;
grant execute on function public.ucapan_tampil(text, bigint, boolean) to anon, authenticated;
