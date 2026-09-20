-- 016 — rekap sesudah acara. Tahap 4 (bagian kedua) dari docs/rencana-rilis.md.
--
-- Yang diminta: "si pengantin rekap tamu ini kirim uang, gula apa rokok".
-- Jadi ini pengetikan PASCA-acara oleh pengantin, bukan aplikasi meja
-- penerima tamu. Tidak ada mode offline, tidak ada sinkronisasi, tidak ada
-- peran petugas baru — cuma satu daftar tamu yang bisa dicari dan dua hal
-- yang ditempelkan padanya: `tamu.datang` dan baris `pemberian`.
--
-- Kedua tabelnya sudah ada sejak migrasi 004 dan masih kosong; yang belum
-- ada cuma jalan masuknya.
--
-- ---------------------------------------------------------------------------
-- Kenapa lewat RPC, bukan REST biasa
-- ---------------------------------------------------------------------------
-- Halaman /kirim punya dua jalur masuk: link rahasia (?t=…) yang cuma
-- memegang anon key, dan login email. Jalur pertama tidak punya JWT sama
-- sekali, jadi RLS tidak bisa menyaring apa-apa untuknya — satu-satunya
-- cara adalah fungsi security definer yang menukar token jadi pasangan_id
-- di sisi server. Supaya panel rekapnya tidak perlu ditulis dua kali,
-- resolusi penyewa dijadikan satu helper yang menerima kedua jalur.
--
-- ---------------------------------------------------------------------------
-- Kenapa cakupan penuh saja
-- ---------------------------------------------------------------------------
-- Token per-pihak (link untuk keluarga) ditolak di sini. Rekap memuat
-- jumlah amplop; itu bukan angka yang pantas dipegang siapa pun selain
-- pengantin, sekalipun ia cuma melihat tamu dari pihaknya sendiri.

-- ---------------------------------------------------------------------------
-- Resolusi penyewa: token panitia ATAU pemilik yang sudah masuk
-- ---------------------------------------------------------------------------
create or replace function public._pasangan_pengelola(p_token text)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare milik uuid[];
begin
  if nullif(btrim(coalesce(p_token, '')), '') is not null then
    return (public._panitia_penuh(p_token)).pasangan_id;
  end if;

  select array_agg(s) into milik from public.pasangan_saya() s;

  if milik is null or array_length(milik, 1) = 0 then
    raise exception 'Perlu masuk sebagai pemilik, atau memakai link panitia bercakupan penuh'
      using errcode = '42501';
  end if;

  -- Hari ini tiap akun memegang tepat satu pasangan. Kalau suatu saat
  -- tidak lagi begitu, memilih "yang pertama" berarti menebak — dan
  -- menebak di fungsi yang menulis amplop orang bukan pilihan.
  if array_length(milik, 1) > 1 then
    raise exception 'Akun ini memegang lebih dari satu pasangan; sebutkan yang mana lewat link panitia'
      using errcode = '22023';
  end if;

  return milik[1];
end $$;

revoke all on function public._pasangan_pengelola(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ringkasan
-- ---------------------------------------------------------------------------
-- Semua angkanya dihitung saat diminta. Tidak ada kolom total yang
-- disimpan: total yang disimpan adalah sumber kebenaran kedua, dan sumber
-- kebenaran kedua selalu berakhir berbeda dari yang pertama.
create or replace function public.rekap_ringkas(p_token text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  return (
    with t as (
      select tm.id, tm.datang
        from public.tamu tm
       where tm.pasangan_id = pid
    ), g as (
      select p.tamu_id, p.jenis, p.nominal
        from public.pemberian p
        join t on t.id = p.tamu_id
    )
    select jsonb_build_object(
      'tamu',    (select count(*) from t),
      'datang',  (select count(*) from t where t.datang is true),
      'tidak',   (select count(*) from t where t.datang is false),
      'belum',   (select count(*) from t where t.datang is null),
      'pemberi', (select count(distinct g.tamu_id) from g),
      'uang',    (select coalesce(sum(g.nominal), 0)
                    from g where g.jenis in ('uang','transfer')),
      'barang',  (select count(*)
                    from g where g.jenis in ('barang','tenaga'))));
end $$;

-- ---------------------------------------------------------------------------
-- Daftar tamu untuk rekap — dicari, bukan digulir
-- ---------------------------------------------------------------------------
-- 436 tamu pada pasangan pertama saja. Menurunkan semuanya sekali jalan
-- lalu menyaring di peramban berarti HP murah memegang seluruh daftar
-- berikut pemberiannya; pencarian di server lebih murah untuk keduanya.
create or replace function public.rekap_daftar(
  p_token text default null,
  p_cari  text default null,
  p_saring text default null,     -- '', 'belum', 'datang', 'tidak', 'memberi'
  p_batas int default 40)
returns table (
  id uuid, nama text, pihak text, telepon text,
  datang boolean, pemberian jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  pid   uuid;
  q     text;
  batas int;
begin
  pid := public._pasangan_pengelola(p_token);

  -- `%` dan `_` dalam ketikan orang adalah huruf, bukan pola.
  q := nullif(btrim(coalesce(p_cari, '')), '');
  if q is not null then
    q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  batas := least(greatest(coalesce(p_batas, 40), 1), 200);

  return query
    select t.id, t.nama, t.pihak, t.telepon, t.datang,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',      g.id,
                      'jenis',   g.jenis,
                      'nominal', g.nominal,
                      'barang',  g.barang,
                      'catatan', g.catatan)
                    order by g.dicatat)
               from public.pemberian g
              where g.tamu_id = t.id), '[]'::jsonb)
      from public.tamu t
     where t.pasangan_id = pid
       and (q is null or t.nama ilike q or coalesce(t.telepon,'') ilike q)
       and (coalesce(p_saring, '') = ''
            or (p_saring = 'belum'   and t.datang is null)
            or (p_saring = 'datang'  and t.datang is true)
            or (p_saring = 'tidak'   and t.datang is false)
            or (p_saring = 'memberi' and exists (
                  select 1 from public.pemberian g2 where g2.tamu_id = t.id)))
     order by t.nama
     limit batas;
end $$;

-- ---------------------------------------------------------------------------
-- Tandai kehadiran
-- ---------------------------------------------------------------------------
-- Tiga keadaan, bukan dua: null = belum ditanyakan. Tanpa keadaan ketiga,
-- "belum sempat dicek" dan "tidak datang" jadi satu angka, dan rekap
-- setengah jadi terlihat seperti rekap yang sudah selesai.
create or replace function public.tamu_datang(
  p_token text, p_tamu_id uuid, p_datang boolean)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  update public.tamu t
     set datang = p_datang
   where t.id = p_tamu_id
     and t.pasangan_id = pid;

  if not found then
    raise exception 'Tamu tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Catat pemberian
-- ---------------------------------------------------------------------------
-- p_id null = baris baru, p_id terisi = mengubah baris yang ada.
--
-- Kehadiran sengaja TIDAK ikut diubah di sini. Transfer datang dari orang
-- yang justru tidak bisa hadir; menyimpulkan "memberi berarti datang"
-- akan mengisi angka kehadiran dengan tebakan.
create or replace function public.pemberian_simpan(
  p_token   text,
  p_id      uuid default null,
  p_tamu_id uuid default null,
  p_jenis   text default null,
  p_nominal bigint default null,
  p_barang  text default null,
  p_catatan text default null)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  pid     uuid;
  v_tamu  uuid;
  v_jenis text;
  v_nom   bigint;
  v_brg   text;
  v_cat   text;
  hasil   uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  v_jenis := lower(btrim(coalesce(p_jenis, '')));
  if v_jenis not in ('uang','transfer','barang','tenaga') then
    raise exception 'Jenis pemberian tidak dikenal' using errcode = '22023';
  end if;

  -- Tamu tujuan diperiksa lebih dulu, termasuk saat mengubah: tanpa ini
  -- pemegang token satu pasangan bisa memindahkan amplop ke tamu
  -- pasangan lain kalau ia menebak id yang benar.
  if p_id is null then
    v_tamu := p_tamu_id;
  else
    select g.tamu_id into v_tamu
      from public.pemberian g
      join public.tamu t on t.id = g.tamu_id
     where g.id = p_id and t.pasangan_id = pid;
    if v_tamu is null then
      raise exception 'Catatan pemberian tidak ditemukan' using errcode = 'P0002';
    end if;
    if p_tamu_id is not null then v_tamu := p_tamu_id; end if;
  end if;

  perform 1 from public.tamu t where t.id = v_tamu and t.pasangan_id = pid;
  if not found then
    raise exception 'Tamu tidak ditemukan' using errcode = 'P0002';
  end if;

  v_brg := nullif(btrim(coalesce(p_barang, '')), '');
  v_cat := nullif(btrim(coalesce(p_catatan, '')), '');

  if v_jenis in ('uang','transfer') then
    v_nom := p_nominal;
    if v_nom is null or v_nom < 0 then
      raise exception 'Nominal amplop harus diisi angka tidak negatif'
        using errcode = '22023';
    end if;
    -- Batas waras. Yang dijaga bukan kecurangan, tapi jari yang kelebihan
    -- nol — satu baris salah ketik cukup untuk membuat seluruh total
    -- tidak berarti apa-apa.
    if v_nom > 1000000000 then
      raise exception 'Nominal di luar batas wajar, periksa lagi angkanya'
        using errcode = '22023';
    end if;
    -- Barang dikosongkan supaya "total uang" tetap berarti jumlah uang.
    -- Amplop yang datang bersama gula dicatat dua baris, bukan satu baris
    -- bercabang.
    v_brg := null;
  else
    -- Taksiran harga barang tidak disimpan. Begitu nominal boleh diisi di
    -- baris barang, total uang berubah jadi campuran uang dan tebakan.
    v_nom := null;
    if v_jenis = 'barang' and v_brg is null then
      raise exception 'Sebutkan barangnya' using errcode = '22023';
    end if;
  end if;

  if v_brg is not null then v_brg := left(v_brg, 120); end if;
  if v_cat is not null then v_cat := left(v_cat, 280); end if;

  if p_id is null then
    insert into public.pemberian (tamu_id, jenis, nominal, barang, catatan)
    values (v_tamu, v_jenis, v_nom, v_brg, v_cat)
    returning id into hasil;
  else
    update public.pemberian g
       set tamu_id = v_tamu, jenis = v_jenis, nominal = v_nom,
           barang  = v_brg,  catatan = v_cat
     where g.id = p_id
     returning g.id into hasil;
    if hasil is null then
      raise exception 'Catatan pemberian tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;

  return hasil;
end $$;

create or replace function public.pemberian_hapus(p_token text, p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  delete from public.pemberian g
   using public.tamu t
   where g.id = p_id
     and t.id = g.tamu_id
     and t.pasangan_id = pid;

  if not found then
    raise exception 'Catatan pemberian tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

grant execute on function public.rekap_ringkas(text)                          to anon, authenticated;
grant execute on function public.rekap_daftar(text, text, text, int)          to anon, authenticated;
grant execute on function public.tamu_datang(text, uuid, boolean)             to anon, authenticated;
grant execute on function public.pemberian_simpan(text, uuid, uuid, text, bigint, text, text) to anon, authenticated;
grant execute on function public.pemberian_hapus(text, uuid)                  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Angka kehadiran di halaman terima kasih
-- ---------------------------------------------------------------------------
-- Yang boleh lewat cuma SATU angka: berapa orang yang tercatat hadir.
-- Nominal amplop, nama pemberi, dan daftar barang tidak pernah keluar dari
-- balik token. Kalau baris ini suatu saat diperluas, ingat bahwa fungsi
-- ini `security definer` dan dipanggil oleh anon — apa pun yang ditulis
-- di sini langsung jadi milik publik.
--
-- Angkanya tidak muncul sampai pengantin benar-benar menandai kehadiran,
-- jadi halaman pasangan yang belum merekap tidak menampilkan "0 hadir".
create or replace function public.terimakasih_isi(p_slug text)
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
    'slug',          ps.slug,
    'aktif',         true,
    'tanggal_acara', ps.tanggal_acara,

    'hadir', (
      select nullif(count(*), 0)
        from public.tamu t
       where t.pasangan_id = ps.id
         and t.datang is true),

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan,
        'lengkap',   m.lengkap))
        from public.mempelai m where m.pasangan_id = ps.id),

    'foto', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jalur',      f.jalur,
        'kecil',      f.jalur_kecil,
        'lebar',      f.lebar,
        'tinggi',     f.tinggi,
        'keterangan', f.keterangan)
        order by f.urutan, f.diunggah), '[]'::jsonb)
        from public.foto f
       where f.pasangan_id = ps.id
         and f.tampil),

    'ucapan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nama',    u.nama,
        'hadir',   u.hadir,
        'pesan',   u.pesan,
        'waktu',   u.created_at,
        'balasan', u.balasan,
        'dibalas', u.dibalas_pada)
        order by u.created_at desc), '[]'::jsonb)
        from public.ucapan u
       where u.pasangan_id = ps.id
         and u.tampil)
  ) into hasil;

  return hasil;
end $$;

grant execute on function public.terimakasih_isi(text) to anon, authenticated;
