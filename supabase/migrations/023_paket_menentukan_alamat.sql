-- 023 — paket menentukan bentuk alamat undangan.
--
--   premium : rian-aini.mengundang.id/bapak-ahmad     (subdomain sendiri)
--   standar : mengundang.id/rian-aini/bapak-ahmad     (jalur di domain bersama)
--
-- Sampai sekarang pasangan_siapkan() memberi SETIAP pasangan
-- `slug || '.mengundang.id'`, tanpa peduli paketnya. Akibatnya bukan
-- cuma alamat yang salah tulis: linkTamu() mengutamakan canonical_host,
-- jadi tautan yang disebar ke ratusan tamu menunjuk ke subdomain yang
-- tidak punya DNS dan tidak punya sertifikat. Yang dilihat tamu bukan
-- undangan, tapi peringatan keamanan peramban.
--
-- Karena itu canonical_host tidak lagi diisi dengan tangan di satu
-- tempat dan dipercaya di tempat lain. Ia diturunkan dari paket oleh
-- pemicu di bawah, dan pemicu itu satu-satunya yang boleh menuliskannya
-- untuk host turunan slug.

-- ---------------------------------------------------------------------------
-- SATU — dua nama paket, dan cuma dua
-- ---------------------------------------------------------------------------
-- Kolomnya sudah ada sejak migrasi 002 dengan bawaan 'lengkap', tanpa
-- check, dan sampai hari ini tidak ada satu pun kode yang membacanya.
-- Sekarang ia menentukan alamat, jadi isinya harus terbatas.
--
-- 'lengkap' yang lama dipetakan ke premium: satu-satunya baris yang
-- memakainya, Rian & 'Aini, memang sudah berjalan di subdomain sendiri
-- dan tautannya sudah tersebar. Memetakannya ke standar berarti
-- mematikan alamat yang sudah dipegang tamu.
update public.pasangan set paket = 'premium' where paket <> 'standar';

alter table public.pasangan alter column paket set default 'standar';

alter table public.pasangan drop constraint if exists pasangan_paket_check;
alter table public.pasangan
  add constraint pasangan_paket_check check (paket in ('premium','standar'));

-- ---------------------------------------------------------------------------
-- DUA — satu pemicu untuk slug DAN alamat
-- ---------------------------------------------------------------------------
-- Dulu penjaga slug berdiri sendiri (_pasangan_slug_sah, migrasi 021).
-- Menambah penjaga alamat di sebelahnya berarti dua pemicu BEFORE di
-- tabel yang sama, dan Postgres menjalankannya berurutan menurut NAMA —
-- `pasangan_alamat_sah` jalan lebih dulu dari `pasangan_slug_sah`, jadi
-- host diturunkan dari slug yang belum dirapikan. Jebakan seperti itu
-- tidak kelihatan sampai ada yang mengetik "Rian-Aini" dengan huruf
-- besar. Jadi keduanya digabung jadi satu fungsi, satu pemicu, urutan
-- yang tidak bisa salah.
drop trigger  if exists pasangan_slug_sah on public.pasangan;
drop function if exists public._pasangan_slug_sah();

create or replace function public._pasangan_sah()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  host_turunan text;
begin
  new.slug  := lower(btrim(coalesce(new.slug, '')));
  new.paket := lower(btrim(coalesce(new.paket, 'standar')));

  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(new.slug) < 3 or char_length(new.slug) > 40 then
    raise exception 'Slug "%" tidak sah: hanya huruf kecil, angka, dan tanda hubung, 3–40 huruf', new.slug
      using errcode = '22023';
  end if;

  if exists (select 1 from public.slug_terlarang s where s.slug = new.slug) then
    raise exception 'Slug "%" dipakai halaman platform, pilih yang lain', new.slug
      using errcode = '22023';
  end if;

  host_turunan := new.slug || '.mengundang.id';

  if new.paket = 'standar' then
    -- Tidak ada subdomain untuk dipakai. Dibiarkan terisi, halaman
    -- undangan akan menyebarkan alamat yang sertifikatnya tidak ada.
    new.canonical_host := null;

  else
    if nullif(btrim(coalesce(new.canonical_host, '')), '') is null then
      new.canonical_host := host_turunan;
    end if;

    -- Slug berganti sementara host lamanya masih turunan slug lama:
    -- host ikut pindah, kalau tidak pasangan ini tinggal di alamat
    -- bekas namanya sendiri. Domain sendiri — apa pun yang bukan di
    -- bawah mengundang.id — tidak disentuh; itu milik kliennya.
    if tg_op = 'UPDATE'
       and new.slug is distinct from old.slug
       and old.canonical_host = old.slug || '.mengundang.id' then
      new.canonical_host := host_turunan;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists pasangan_sah on public.pasangan;
create trigger pasangan_sah
  before insert or update of slug, paket, canonical_host on public.pasangan
  for each row execute function public._pasangan_sah();

-- Baris yang sudah ada dilewatkan sekali supaya keadaannya sesuai
-- aturan baru — update kolom paket ke nilainya sendiri memicu pemicu.
update public.pasangan set paket = paket;

-- ---------------------------------------------------------------------------
-- TIGA — pasangan_siapkan() menerima paket
-- ---------------------------------------------------------------------------
-- Badan fungsi ini sebelumnya cuma hidup di database: migrasi 015 di
-- repo memuat dokumentasinya saja, tanpa SQL-nya. Dituliskan lengkap di
-- sini supaya database bisa dibangun ulang dari berkas migrasi.
--
-- Tanda tangan lama dibuang, tidak dibiarkan berdampingan: dengan
-- p_paket yang punya nilai bawaan, panggilan berargumen enam jadi
-- ambigu antara keduanya dan Postgres menolaknya.
drop function if exists public.pasangan_siapkan(text, text, text, text, date, text);

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

  if v_paket not in ('premium','standar') then
    raise exception 'Paket "%" tidak dikenal', v_paket using errcode = '22023';
  end if;

  -- Slug diperiksa dua kali: di sini supaya pesannya jelas sebelum
  -- apa pun dibuat, dan lagi di pemicu supaya jalan lain tidak
  -- kecolongan.
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

  -- canonical_host sengaja TIDAK disebut: pemicu pasangan_sah yang
  -- menurunkannya dari paket. Disebut di sini juga, nilainya jadi dua
  -- sumber dan cepat atau lambat keduanya beda.
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

  -- pgcrypto tinggal di skema `extensions`, dan search_path fungsi ini
  -- sengaja dikunci ke public+pg_temp. Menyebut skemanya lebih benar
  -- daripada memperlebar search_path, yang justru melemahkan penjaganya.
  insert into public.panitia_akses (pasangan_id, nama, token, pihak, aktif)
  values (pid, 'Pengantin (semua pihak)', encode(extensions.gen_random_bytes(24),'hex'), null,              true),
         (pid, 'Pengantin Pria',          encode(extensions.gen_random_bytes(24),'hex'), 'pria',            true),
         (pid, 'Pengantin Wanita',        encode(extensions.gen_random_bytes(24),'hex'), 'wanita',          true),
         (pid, 'Keluarga Pihak Pria',     encode(extensions.gen_random_bytes(24),'hex'), 'keluarga-pria',   true),
         (pid, 'Keluarga Pihak Wanita',   encode(extensions.gen_random_bytes(24),'hex'), 'keluarga-wanita', true);

  return pid;
end $$;

-- Hak aksesnya dikembalikan persis seperti tanda tangan lama:
-- {postgres, service_role}, tidak lebih.
--
-- Ini bukan basa-basi, dan `revoke from public` saja TIDAK cukup —
-- saya sempat salah di sini. Fungsi dengan tanda tangan baru lahir
-- dengan hak bawaan skema, dan Supabase memasang `alter default
-- privileges ... grant execute on functions to anon, authenticated,
-- service_role`. Jadi hak anon datang sebagai grant TERSENDIRI, bukan
-- lewat PUBLIC: mencabut PUBLIC meninggalkannya utuh. Sesudah migrasi
-- ini pertama kali dijalankan, anon memang sempat boleh memanggil
-- fungsi yang membuat pasangan, pemilik, dan lima token panitia —
-- dengan anon key yang memang terpasang di setiap halaman.
--
-- Ketiganya disebut satu per satu, dan ada ujinya.
revoke all on function public.pasangan_siapkan(text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.pasangan_siapkan(text, text, text, text, date, text, text)
  to service_role;

-- Fungsi pemicu tidak pernah dipanggil langsung oleh siapa pun.
revoke all on function public._pasangan_sah() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- EMPAT — admin bisa menaikkan atau menurunkan paket
-- ---------------------------------------------------------------------------
-- Pasangan yang naik ke premium dapat subdomainnya saat itu juga; yang
-- turun kehilangan canonical_host dan kembali ke bentuk jalur. Dua-duanya
-- dikerjakan pemicu, jadi di sini tinggal menulis paketnya.
--
-- Yang TIDAK dikerjakan di sini: tautan yang sudah terlanjur disebar ke
-- tamu. Naik atau turun paket mengubah alamat undangan, dan tautan lama
-- berhenti bekerja. Karena itu halaman admin harus memberi tahu, bukan
-- diam-diam menggantinya.
create or replace function public.admin_paket(p_pasangan_id uuid, p_paket text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._admin_wajib();
  if p_paket not in ('premium','standar') then
    raise exception 'Paket tidak dikenal' using errcode = '22023';
  end if;
  update public.pasangan set paket = p_paket where id = p_pasangan_id;
  if not found then
    raise exception 'Pasangan tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

grant execute on function public.admin_paket(uuid, text) to authenticated;
