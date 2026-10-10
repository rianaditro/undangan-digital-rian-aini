-- 017 — menutup lubang lintas penyewa di keluarga fungsi panitia_*.
--
-- Fungsi-fungsi ini lahir di migrasi 002, waktu tabel `tamu` belum punya
-- `pasangan_id` sama sekali. Waktu kolom itu ditambahkan di migrasi 004,
-- kebijakan RLS ikut diperbarui — tapi fungsi `security definer` ini
-- TIDAK, dan security definer berarti RLS tidak berlaku di dalamnya.
-- Jadi saringannya tetap seperti dulu: cuma `pihak`, tanpa `pasangan_id`.
--
-- Akibatnya, dibuktikan lewat pasangan kedua sungguhan di transaksi yang
-- di-rollback:
--
--   panitia_daftar     token pasangan A menampilkan tamu pasangan B
--   panitia_ubah_nama  token pasangan A mengganti nama tamu pasangan B
--   panitia_hapus      token pasangan A MENGHAPUS tamu pasangan B
--   panitia_ubah_pihak sama, tanpa saringan sama sekali
--   panitia_tambah     tamu baru memakai pasangan_bawaan(), bukan
--                      pasangan pemilik token — jadi tamu pasangan B
--                      mendarat di daftar pasangan A
--
-- Hari ini belum ada yang bocor karena barisnya cuma satu pasangan. Itu
-- bukan pengaman, itu kebetulan — dan kebetulan itu berakhir pada hari
-- pasangan kedua dibuat.
--
-- Yang ditambahkan cuma satu hal di tiap fungsi: `pasangan_id` ikut
-- disaring. Tidak ada perubahan perilaku untuk pemakai yang sah.

-- ---------------------------------------------------------------------------
create or replace function public.panitia_daftar(p_token text)
returns table (id uuid, nama text, slug text, telepon text, pihak text,
               undangan text, berkat text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
     where t.pasangan_id = a.pasangan_id
       and (a.pihak is null or t.pihak = a.pihak)
     order by t.nama;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.panitia_tandai(
  p_token text, p_tamu_id uuid, p_jenis text, p_status text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);

  if p_jenis not in ('undangan','berkat') then
    raise exception 'Jenis pengiriman tidak dikenal' using errcode = '22023';
  end if;
  if p_status not in ('belum','terkirim','gagal') then
    raise exception 'Status tidak dikenal' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tamu t
     where t.id = p_tamu_id
       and t.pasangan_id = a.pasangan_id
       and (a.pihak is null or t.pihak = a.pihak)
  ) then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;

  insert into public.pengiriman (tamu_id, jenis, status, waktu, pasangan_id)
  values (p_tamu_id, p_jenis, p_status,
          case when p_status = 'terkirim' then now() else null end,
          a.pasangan_id)
  on conflict (tamu_id, jenis) do update
    set status = excluded.status, waktu = excluded.waktu;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.panitia_hapus(p_token text, p_tamu_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);
  delete from public.tamu t
   where t.id = p_tamu_id
     and t.pasangan_id = a.pasangan_id
     and (a.pihak is null or t.pihak = a.pihak);
  if not found then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.panitia_ubah_nama(
  p_token text, p_tamu_id uuid, p_nama text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  a      public.panitia_akses;
  bersih text;
begin
  a := public._panitia(p_token);

  bersih := regexp_replace(trim(coalesce(p_nama, '')), '\s+', ' ', 'g');
  if char_length(bersih) < 1 or char_length(bersih) > 80 then
    raise exception 'Nama harus 1 sampai 80 karakter' using errcode = '22001';
  end if;

  -- slug sengaja TIDAK ikut berubah: link tamu mungkin sudah tersebar
  -- di grup WhatsApp dan tidak bisa ditarik kembali
  update public.tamu t
     set nama = bersih
   where t.id = p_tamu_id
     and t.pasangan_id = a.pasangan_id
     and (a.pihak is null or t.pihak = a.pihak);

  if not found then
    raise exception 'Tamu tidak ada dalam cakupan link ini' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.panitia_ubah_pihak(
  p_token text, p_tamu_id uuid, p_pihak text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);

  if a.pihak is not null then
    raise exception 'Link ini hanya untuk satu pihak, jadi pihak tamu tidak bisa diubah'
      using errcode = '42501';
  end if;

  if p_pihak not in ('pria','wanita','keluarga-pria','keluarga-wanita') then
    raise exception 'Pihak tidak dikenal' using errcode = '22023';
  end if;

  update public.tamu t set pihak = p_pihak
   where t.id = p_tamu_id and t.pasangan_id = a.pasangan_id;
  if not found then
    raise exception 'Tamu tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- panitia_tambah: dua perbaikan sekaligus.
--
-- 1. `pasangan_id` diisi dari token, bukan dibiarkan jatuh ke
--    pasangan_bawaan(). Sebelumnya tamu pasangan kedua mendarat di
--    daftar pasangan pertama — dan pemiliknya tidak akan pernah tahu,
--    karena daftarnya sendiri juga tidak menyaring pasangan.
--
-- 2. Keunikan slug diperiksa DALAM pasangan, sepadan dengan indeks
--    `tamu_slug_pasangan_idx` dari migrasi 004. Yang lama memeriksa
--    seluruh tabel, jadi "bapak-ahmad" milik pasangan lain memaksa tamu
--    ini jadi "bapak-ahmad-2" tanpa alasan — dan link tamunya jadi
--    lebih jelek untuk masalah yang tidak ada.
create or replace function public.panitia_tambah(p_token text, p_baris jsonb)
returns table (id uuid, nama text, slug text, telepon text, pihak text,
               undangan text, berkat text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
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
    while exists (
      select 1 from public.tamu tt
       where tt.slug = v_slug and tt.pasangan_id = a.pasangan_id
    ) loop
      v_slug := v_dasar || '-' || n;
      n := n + 1;
    end loop;

    insert into public.tamu as t (nama, slug, telepon, pihak, pasangan_id)
    values (baris->>'nama', v_slug, nullif(baris->>'telepon',''), v_pihak,
            a.pasangan_id)
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
