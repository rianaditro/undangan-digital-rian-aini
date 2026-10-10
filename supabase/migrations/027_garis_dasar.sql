-- Garis dasar: repo disamakan dengan produksi.
--
-- Audit 3 Oktober 2026 membandingkan setiap fungsi di skema public pada
-- database produksi dengan hasil membangun ulang semua migrasi di
-- Postgres lokal (uji/db). Empat puluh empat sama persis. Sisanya:
--
--   silsilah_hapus     ada di produksi, tidak ada di berkas migrasi mana
--                      pun — pernah dijalankan langsung lewat konsol.
--   admin_token_ganti  isi berbeda hanya di komentar dan spasi; versi
--   silsilah_simpan    produksi yang menang, karena produksilah yang
--   ucapan_publik      sudah berjalan dan diuji tamu sungguhan.
--   ucapan_tulis
--
-- Isi di bawah adalah keluaran pg_get_functiondef dari produksi, tanpa
-- diubah satu huruf pun. Dijalankan di produksi, migrasi ini tidak
-- mengubah apa-apa; dijalankan di database yang dibangun dari repo, ia
-- membuat keduanya identik. Mulai dari sini, perbedaan berarti ada yang
-- mengubah produksi tanpa migrasi — dan uji/db/banding.sh akan
-- menangkapnya.
--
-- Satu lagi, di tabel: ucapan sudah ada di produksi sebelum migrasi
-- pertama ditulis, dan 001 membuatnya dengan `create table if not exists`
-- — di produksi baris itu tidak berbuat apa-apa, jadi bentuk aslinya tidak
-- pernah tercatat. Bentuk aslinya: id bigint identity (bukan uuid; lihat
-- ucapan_balas(p_id bigint)), hadir wajib, dan tiga batasan panjang/isi
-- yang sama dengan maxlength formulir buku tamu (40 dan 500). Blok di
-- bawah hanya berjalan di database yang dibangun dari repo, tempat tabel
-- ini masih kosong; di produksi id-nya sudah bigint dan blok dilewati.
--
-- Hak eksekusi sengaja tidak disentuh: produksi memakai hak bawaan
-- Supabase untuk kelima fungsi ini (semuanya menjaga dirinya sendiri
-- lewat token panitia, _admin_wajib, atau status terbit pasangan).

-- ---------- silsilah_hapus ----------
CREATE OR REPLACE FUNCTION public.silsilah_hapus(p_token text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
  delete from public.silsilah s where s.id = p_id and s.pasangan_id = a.pasangan_id;
  if not found then
    raise exception 'Baris silsilah tidak ditemukan' using errcode = 'P0002';
  end if;
end $function$;

-- ---------- admin_token_ganti ----------
CREATE OR REPLACE FUNCTION public.admin_token_ganti(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare baru text;
begin
  perform public._admin_wajib();
  baru := encode(extensions.gen_random_bytes(24), 'hex');
  update public.panitia_akses set token = baru, terakhir_dipakai = null
   where id = p_id;
  if not found then
    raise exception 'Link panitia tidak ditemukan' using errcode = 'P0002';
  end if;
  return baru;
end $function$;

-- ---------- silsilah_simpan ----------
CREATE OR REPLACE FUNCTION public.silsilah_simpan(p_token text, p_id uuid, p_sisi text, p_peran text, p_nama text, p_keterangan text DEFAULT NULL::text, p_urutan integer DEFAULT NULL::integer, p_tampil boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.panitia_akses; hasil uuid; v_nama text; v_peran text;
begin
  a := public._panitia_penuh(p_token);

  v_nama  := btrim(coalesce(p_nama, ''));
  v_peran := btrim(coalesce(p_peran, ''));
  if v_nama = '' or char_length(v_nama) > 80 then
    raise exception 'Nama harus 1 sampai 80 huruf' using errcode = '22001';
  end if;
  if v_peran = '' or char_length(v_peran) > 40 then
    raise exception 'Peran harus 1 sampai 40 huruf' using errcode = '22001';
  end if;
  if p_sisi not in ('pria','wanita') then
    raise exception 'Sisi harus pria atau wanita' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.silsilah (pasangan_id, sisi, urutan, peran, nama, keterangan)
    values (a.pasangan_id, p_sisi,
            coalesce(p_urutan, (select coalesce(max(s.urutan),0)+1 from public.silsilah s
                                 where s.pasangan_id=a.pasangan_id and s.sisi=p_sisi)),
            v_peran, v_nama, nullif(btrim(coalesce(p_keterangan,'')),''))
    returning id into hasil;
  else
    update public.silsilah s
       set sisi       = p_sisi,
           peran      = v_peran,
           nama       = v_nama,
           keterangan = nullif(btrim(coalesce(p_keterangan,'')),''),
           urutan     = coalesce(p_urutan, s.urutan),
           tampil     = coalesce(p_tampil, s.tampil)
     where s.id = p_id and s.pasangan_id = a.pasangan_id
    returning s.id into hasil;
    if hasil is null then
      raise exception 'Baris silsilah tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;

  return hasil;
end $function$;

-- ---------- ucapan_publik ----------
CREATE OR REPLACE FUNCTION public.ucapan_publik(p_slug text)
 RETURNS TABLE(nama text, hadir text, pesan text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return query
    select u.nama, u.hadir, u.pesan, u.created_at
      from public.ucapan u
      join public.pasangan p on p.id = u.pasangan_id
     where p.slug = lower(btrim(coalesce(p_slug, '')))
       -- `tampil` satu-satunya yang menahan ucapan yang sengaja
       -- disembunyikan; fungsi ini security definer.
       and u.tampil
     order by u.created_at desc
     limit 200;
end $function$;

-- ---------- ucapan_tulis ----------
CREATE OR REPLACE FUNCTION public.ucapan_tulis(p_slug text, p_nama text, p_hadir text, p_pesan text, p_pihak text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  ps    public.pasangan;
  nama  text;
  pesan text;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(coalesce(p_slug, ''))) limit 1;

  if ps.id is null or not ps.terbit then
    raise exception 'Undangan tidak ditemukan' using errcode = 'P0002';
  end if;

  nama  := btrim(coalesce(p_nama, ''));
  pesan := btrim(coalesce(p_pesan, ''));

  if char_length(nama) < 1 or char_length(nama) > 60 then
    raise exception 'Nama harus 1 sampai 60 huruf' using errcode = '22001';
  end if;
  if char_length(pesan) < 1 or char_length(pesan) > 800 then
    raise exception 'Ucapan harus 1 sampai 800 huruf' using errcode = '22001';
  end if;
  if coalesce(p_hadir,'') not in ('Hadir','Belum pasti','Tidak hadir') then
    raise exception 'Konfirmasi kehadiran tidak dikenal' using errcode = '22023';
  end if;

  insert into public.ucapan (pasangan_id, nama, hadir, pesan, pihak)
  values (ps.id, nama, p_hadir, pesan,
          (select ph.kode from public.pihak ph
            where ph.pasangan_id = ps.id and ph.kode = p_pihak));
end $function$;

-- ---------- ucapan: bentuk tabel di produksi ----------
do $$
begin
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.ucapan'::regclass and attname = 'id') = 'uuid' then
    alter table public.ucapan drop column id;
    alter table public.ucapan add column id bigint generated always as identity;
    alter table public.ucapan add constraint ucapan_pkey primary key (id);
    alter table public.ucapan alter column hadir set not null;
    alter table public.ucapan add constraint ucapan_nama_check
      check (char_length(nama) >= 1 and char_length(nama) <= 40);
    alter table public.ucapan add constraint ucapan_pesan_check
      check (char_length(pesan) >= 1 and char_length(pesan) <= 500);
    alter table public.ucapan add constraint ucapan_hadir_check
      check (hadir = any (array['Hadir', 'Belum pasti', 'Tidak hadir']));
  end if;
end $$;
