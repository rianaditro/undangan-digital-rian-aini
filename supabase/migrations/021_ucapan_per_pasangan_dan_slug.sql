-- 021 — dua lubang lintas penyewa yang tersisa.
--
-- ---------------------------------------------------------------------------
-- SATU — buku tamu bocor antar pasangan
-- ---------------------------------------------------------------------------
-- Kebijakan `ucapan baca publik` berbunyi `using (tampil)` saja, tanpa
-- `pasangan_id`. Halaman undangan pun membacanya begitu saja:
--
--   /rest/v1/ucapan?select=nama,hadir,pesan,created_at&order=…
--
-- Tidak ada satu pun saringan pasangan di kedua sisi. Akibatnya buku tamu
-- pasangan A memuat ucapan pasangan B — dan sebaliknya.
--
-- Dibuktikan lewat pasangan kedua sungguhan di transaksi yang di-rollback:
-- anon membaca 30 baris padahal pasangan pertama cuma punya 29, dan baris
-- ke-30 itu tulisan tamu pasangan kedua.
--
-- Ini beda kelas dari lubang panitia di migrasi 017. Yang itu butuh token
-- pasangan lain; yang ini terbuka dari halaman undangan mana pun, oleh
-- siapa pun, tanpa modal apa-apa. Dan yang bocor adalah tulisan tamu —
-- orang yang tidak pernah menyetujui apa pun kepada platform ini.
--
-- Obatnya sepola dengan yang sudah dipakai di tempat lain: satu fungsi
-- yang menyaring lewat slug, lalu jalan langsung ke tabelnya ditutup —
-- persis cara migrasi 012 menutup jalan MENULIS ke tabel yang sama.

create or replace function public.ucapan_publik(p_slug text)
returns table (nama text, hadir text, pesan text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return query
    select u.nama, u.hadir, u.pesan, u.created_at
      from public.ucapan u
      join public.pasangan p on p.id = u.pasangan_id
     where p.slug = lower(btrim(coalesce(p_slug, '')))
       -- `tampil` adalah satu-satunya yang menahan ucapan yang sengaja
       -- disembunyikan lewat ucapan_tampil(). Fungsi ini security definer;
       -- menghapus baris ini berarti halaman publik sendiri yang
       -- membocorkan apa yang sengaja disembunyikan.
       and u.tampil
     order by u.created_at desc
     limit 200;
end $$;

grant execute on function public.ucapan_publik(text) to anon, authenticated;

-- Jalan baca langsung ditutup untuk anon. Yang tersisa cuma lewat fungsi
-- di atas (undangan) dan terimakasih_isi() (halaman terima kasih) —
-- keduanya menyaring slug.
drop policy if exists "ucapan baca publik" on public.ucapan;

-- Pemilik tetap boleh membaca ucapannya sendiri lewat REST biasa,
-- termasuk yang disembunyikan — itu miliknya.
drop policy if exists "ucapan baca pemilik" on public.ucapan;
create policy "ucapan baca pemilik" on public.ucapan
  for select to authenticated
  using (pasangan_id in (select public.pasangan_saya()));

-- ---------------------------------------------------------------------------
-- DUA — slug_terlarang ada sejak migrasi 002, tapi tidak ada yang menegakkannya
-- ---------------------------------------------------------------------------
-- Dua puluh baris tersimpan rapi dan tidak pernah dilihat siapa pun:
-- tidak ada foreign key, tidak ada check, dan pasangan_siapkan() tidak
-- memeriksanya. Sebuah pasangan bisa mengambil slug `admin` atau `kirim`,
-- dan undangannya lalu tertimpa halaman platform — atau sebaliknya.
--
-- Empat yang jelas kurang, karena halamannya lahir sesudah migrasi 002:
insert into public.slug_terlarang (slug) values
  ('dasbor'), ('terimakasih'), ('coba'), ('mulai')
on conflict do nothing;

-- Penjaganya ditaruh di trigger, bukan di halaman admin. Halaman bisa
-- ditambah besok — SQL Editor, skrip impor, halaman pendaftaran mandiri —
-- dan tiap tempat baru adalah satu tempat lagi yang bisa lupa memeriksa.
-- Di trigger, semua jalan lewat pintu yang sama.
create or replace function public._pasangan_slug_sah()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.slug := lower(btrim(coalesce(new.slug, '')));

  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(new.slug) < 3 or char_length(new.slug) > 40 then
    raise exception 'Slug "%" tidak sah: hanya huruf kecil, angka, dan tanda hubung, 3–40 huruf', new.slug
      using errcode = '22023';
  end if;

  if exists (select 1 from public.slug_terlarang s where s.slug = new.slug) then
    raise exception 'Slug "%" dipakai halaman platform, pilih yang lain', new.slug
      using errcode = '22023';
  end if;

  return new;
end $$;

drop trigger if exists pasangan_slug_sah on public.pasangan;
create trigger pasangan_slug_sah
  before insert or update of slug on public.pasangan
  for each row execute function public._pasangan_slug_sah();
