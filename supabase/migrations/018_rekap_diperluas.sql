-- 018 — rekap diperluas: kategori pemberian, kelompok keluarga, berkat.
--
-- Tiga hal yang diminta sesudah memakai rekap yang pertama:
--
-- 1. Pemberian bukan cuma "uang atau barang". Rokok punya merek, ada
--    parsel, seserahan, sembako, dan ada yang menyumbang JASA — vendor
--    fotografer, dekorasi. Yang dikirim lewat transfer karena tidak bisa
--    hadir juga bukan hal yang sama dengan amplop di meja.
--
-- 2. Berkat perlu dua keadaan, bukan satu: sudah DIJATAH versus sudah
--    DIBERIKAN. Yang dijatah tapi belum diambil adalah pekerjaan yang
--    belum selesai, dan itu tidak terlihat kalau keadaannya cuma
--    "terkirim atau belum".
--
-- 3. Satu keluarga datang terpencar. Pak Budi menyumbang rokok dan
--    tercatat di baris 10; anaknya datang belakangan dan tercatat di
--    baris 40. Tanpa cara menyatakan "ini satu keluarga", merekapnya
--    berarti bolak-balik sepanjang daftar.
--
-- ---------------------------------------------------------------------------
-- Soal nomor 3: kenapa label teks bebas, dan bagaimana kelemahannya ditambal
-- ---------------------------------------------------------------------------
-- Kelompok disimpan sebagai tulisan bebas di `tamu.kelompok`, bukan tabel
-- rumah tangga tersendiri. Pilihan pemiliknya, dan alasannya masuk akal:
-- paling cepat diketik dan paling mirip cara orang memakai spreadsheet.
--
-- Kelemahannya nyata dan pasti terjadi: "Kel. Budi" dan "Keluarga Budi"
-- jadi dua kelompok berbeda. Tiga penambal, semuanya di sini:
--
--   a. Spasi dirapikan sebelum disimpan (_rapikan_label).
--   b. Label yang secara huruf besar-kecil sama dengan yang sudah ada
--      DIPAKSA memakai ejaan yang sudah ada. Jadi "keluarga budi" yang
--      diketik belakangan menempel ke "Keluarga Budi" yang sudah ada,
--      bukan bikin kelompok kedua.
--   c. kelompok_ganti_nama() membetulkan seluruh anggota sekaligus kalau
--      terlanjur beda — satu tindakan, bukan mengedit satu per satu.
--
-- Yang TIDAK dikerjakan: menebak bahwa "Kel." sama dengan "Keluarga".
-- Tebakan seperti itu benar sembilan dari sepuluh kali, dan yang
-- kesepuluh menggabungkan dua keluarga yang memang berbeda tanpa ada yang
-- sadar.

-- ---------------------------------------------------------------------------
-- Kolom baru
-- ---------------------------------------------------------------------------
alter table public.tamu add column if not exists alamat   text;
alter table public.tamu add column if not exists kelompok text;
alter table public.tamu add column if not exists relasi   text;

create index if not exists tamu_kelompok_idx
  on public.tamu (pasangan_id, kelompok);

-- Kategori pemberian. `barang` dan `tenaga` dipertahankan: keduanya sudah
-- ada sejak migrasi 004 dan `barang` tetap berguna sebagai keranjang
-- untuk yang tidak masuk kategori mana pun.
alter table public.pemberian drop constraint if exists pemberian_jenis_check;
alter table public.pemberian add constraint pemberian_jenis_check
  check (jenis in ('uang','transfer','rokok','gula','sembako','parsel',
                   'seserahan','jasa','barang','tenaga'));

-- "2 slop", "5 kg", "1 paket". Tanpa ini rekap cuma bisa menghitung
-- BARIS, dan enam baris rokok tidak memberi tahu berapa slop.
alter table public.pemberian add column if not exists jumlah numeric(12,2);
alter table public.pemberian add column if not exists satuan text;

alter table public.pemberian drop constraint if exists pemberian_jumlah_check;
alter table public.pemberian add constraint pemberian_jumlah_check
  check (jumlah is null or (jumlah > 0 and jumlah <= 100000));

-- Angka tanpa satuan tidak berarti apa-apa, dan satuan tanpa angka juga
-- tidak. Keduanya datang bersama atau tidak sama sekali.
alter table public.pemberian drop constraint if exists pemberian_satuan_check;
alter table public.pemberian add constraint pemberian_satuan_check
  check ((jumlah is null) = (satuan is null));

-- ---------------------------------------------------------------------------
-- Berkat punya keadaannya sendiri
-- ---------------------------------------------------------------------------
-- `pengiriman` menyimpan dua hal yang sebenarnya berbeda: pengiriman
-- undangan (belum → terkirim) dan penyerahan berkat (belum → dijatah →
-- diberikan). Sampai sekarang keduanya dipaksa memakai daftar status yang
-- sama, jadi "dijatah" tidak punya tempat.
--
-- Barisnya dibereskan lebih dulu, baru aturannya diperketat — urutan
-- sebaliknya akan menolak barisnya sendiri.
update public.pengiriman set status = 'diberikan'
 where jenis = 'berkat' and status = 'terkirim';
update public.pengiriman set status = 'belum'
 where jenis = 'berkat' and status = 'gagal';

alter table public.pengiriman drop constraint if exists pengiriman_status_check;
alter table public.pengiriman add constraint pengiriman_status_check
  check (case jenis
           when 'undangan' then status in ('belum','terkirim','gagal')
           when 'berkat'   then status in ('belum','dijatah','diberikan')
           else false
         end);

-- ---------------------------------------------------------------------------
-- Perapi label
-- ---------------------------------------------------------------------------
create or replace function public._rapikan_label(p text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------------------
-- panitia_tandai: status berkat yang baru
-- ---------------------------------------------------------------------------
-- Dipisah per jenis. Kalau daftarnya digabung jadi satu, "undangan
-- dijatah" dan "berkat gagal" ikut lolos — dua keadaan yang tidak punya
-- arti apa pun, tapi tetap bisa tersimpan dan muncul di rekap.
create or replace function public.panitia_tandai(
  p_token text, p_tamu_id uuid, p_jenis text, p_status text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia(p_token);

  if p_jenis = 'undangan' then
    if p_status not in ('belum','terkirim','gagal') then
      raise exception 'Status undangan tidak dikenal' using errcode = '22023';
    end if;
  elsif p_jenis = 'berkat' then
    if p_status not in ('belum','dijatah','diberikan') then
      raise exception 'Status berkat tidak dikenal' using errcode = '22023';
    end if;
  else
    raise exception 'Jenis pengiriman tidak dikenal' using errcode = '22023';
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
          case when p_status in ('terkirim','diberikan') then now() else null end,
          a.pasangan_id)
  on conflict (tamu_id, jenis) do update
    set status = excluded.status, waktu = excluded.waktu;
end $$;

-- ---------------------------------------------------------------------------
-- Berkat dari halaman rekap
-- ---------------------------------------------------------------------------
-- panitia_tandai butuh token; kotak 6 hidup juga di jalur login email.
-- Jadi berkat punya pintunya sendiri yang memakai penyelesai penyewa
-- milik rekap.
create or replace function public.berkat_tandai(
  p_token text, p_tamu_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  if p_status not in ('belum','dijatah','diberikan') then
    raise exception 'Status berkat tidak dikenal' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tamu t where t.id = p_tamu_id and t.pasangan_id = pid
  ) then
    raise exception 'Tamu tidak ditemukan' using errcode = 'P0002';
  end if;

  insert into public.pengiriman (tamu_id, jenis, status, waktu, pasangan_id)
  values (p_tamu_id, 'berkat', p_status,
          case when p_status = 'diberikan' then now() else null end, pid)
  on conflict (tamu_id, jenis) do update
    set status = excluded.status, waktu = excluded.waktu;
end $$;

-- ---------------------------------------------------------------------------
-- Alamat, kelompok, relasi
-- ---------------------------------------------------------------------------
-- Aturan nilai, dipakai sama untuk ketiga kolom:
--
--   null          jangan sentuh kolom ini
--   ''  (kosong)  kosongkan kolom ini
--
-- Ini perlu karena mengeluarkan orang dari kelompok adalah tindakan yang
-- sah, dan coalesce(p_x, t.x) — pola yang dipakai foto_ubah — tidak
-- punya cara menyatakannya.
-- Tidak mengembalikan apa-apa: halaman memuat ulang daftarnya sesudah
-- menyimpan, dan di situlah ejaan hasil penempelan (b) terlihat. Fungsi
-- ini sempat ditulis `returns table` dengan `return query update` — itu
-- bukan plpgsql yang sah, dan nama kolom keluarannya juga akan menutupi
-- nama kolom tabelnya sendiri di dalam badan fungsi.
create or replace function public.tamu_ubah_rekap(
  p_token    text,
  p_tamu_id  uuid,
  p_alamat   text default null,
  p_kelompok text default null,
  p_relasi   text default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  pid    uuid;
  v_kel  text;
  v_ada  text;
begin
  pid := public._pasangan_pengelola(p_token);

  v_kel := public._rapikan_label(p_kelompok);

  -- Penambal (b): menempel ke ejaan yang sudah dipakai pasangan ini.
  if v_kel is not null then
    select t.kelompok into v_ada
      from public.tamu t
     where t.pasangan_id = pid
       and lower(t.kelompok) = lower(v_kel)
     limit 1;
    if v_ada is not null then v_kel := v_ada; end if;
  end if;

  update public.tamu t set
    alamat   = case when p_alamat   is null then t.alamat
                    else left(public._rapikan_label(p_alamat), 200) end,
    kelompok = case when p_kelompok is null then t.kelompok
                    else left(v_kel, 80) end,
    relasi   = case when p_relasi   is null then t.relasi
                    else left(public._rapikan_label(p_relasi), 40) end
   where t.id = p_tamu_id and t.pasangan_id = pid;

  if not found then
    raise exception 'Tamu tidak ditemukan' using errcode = 'P0002';
  end if;
end $$;

-- Membetulkan ejaan yang terlanjur bercabang, sekali jalan.
create or replace function public.kelompok_ganti_nama(
  p_token text, p_lama text, p_baru text)
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  pid   uuid;
  lama  text;
  baru  text;
  n     int;
begin
  pid  := public._pasangan_pengelola(p_token);
  lama := public._rapikan_label(p_lama);
  baru := public._rapikan_label(p_baru);

  if lama is null then
    raise exception 'Kelompok yang mau diganti harus disebut' using errcode = '22023';
  end if;

  -- baru kosong = bubarkan kelompoknya, anggotanya jadi tanpa kelompok
  update public.tamu t set kelompok = left(baru, 80)
   where t.pasangan_id = pid and lower(t.kelompok) = lower(lama);

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Kelompok tidak ditemukan' using errcode = 'P0002';
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- pemberian_simpan: kategori, jumlah, satuan
-- ---------------------------------------------------------------------------
create or replace function public.pemberian_simpan(
  p_token   text,
  p_id      uuid default null,
  p_tamu_id uuid default null,
  p_jenis   text default null,
  p_nominal bigint default null,
  p_barang  text default null,
  p_catatan text default null,
  p_jumlah  numeric default null,
  p_satuan  text default null)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  pid     uuid;
  v_tamu  uuid;
  v_jenis text;
  v_nom   bigint;
  v_brg   text;
  v_cat   text;
  v_jml   numeric;
  v_sat   text;
  hasil   uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  v_jenis := lower(btrim(coalesce(p_jenis, '')));
  if v_jenis not in ('uang','transfer','rokok','gula','sembako','parsel',
                     'seserahan','jasa','barang','tenaga') then
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

  v_brg := public._rapikan_label(p_barang);
  v_cat := nullif(btrim(coalesce(p_catatan, '')), '');
  v_sat := lower(public._rapikan_label(p_satuan));

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
    -- Uang tidak punya merek dan tidak punya satuan. Amplop yang datang
    -- bersama rokok dicatat dua baris, bukan satu baris bercabang.
    v_brg := null; v_jml := null; v_sat := null;
  else
    -- Taksiran harga barang tidak disimpan. Begitu nominal boleh diisi di
    -- baris barang, total uang berubah jadi campuran uang dan tebakan.
    v_nom := null;
    v_jml := p_jumlah;

    if v_jml is not null and (v_jml <= 0 or v_jml > 100000) then
      raise exception 'Jumlah di luar batas wajar' using errcode = '22023';
    end if;
    -- Keduanya datang bersama atau tidak sama sekali; yang setengah
    -- diisi ditolak di sini, bukan dibiarkan jadi "3" tanpa satuan.
    if (v_jml is null) <> (v_sat is null) then
      raise exception 'Jumlah dan satuan harus diisi berdua, atau tidak sama sekali'
        using errcode = '22023';
    end if;

    -- `barang` adalah tempat merek dan rinciannya: "Djarum Super",
    -- "Parsel buah". Untuk kategori bernama ia boleh kosong — "Gula 5 kg"
    -- sudah cukup jelas. Untuk keranjang `barang` ia wajib, karena tanpa
    -- itu barisnya tidak mengatakan apa-apa.
    if v_jenis = 'barang' and v_brg is null then
      raise exception 'Sebutkan barangnya' using errcode = '22023';
    end if;
  end if;

  if v_brg is not null then v_brg := left(v_brg, 120); end if;
  if v_cat is not null then v_cat := left(v_cat, 280); end if;
  if v_sat is not null then v_sat := left(v_sat, 20);  end if;

  if p_id is null then
    insert into public.pemberian (tamu_id, jenis, nominal, barang, catatan,
                                  jumlah, satuan)
    values (v_tamu, v_jenis, v_nom, v_brg, v_cat, v_jml, v_sat)
    returning id into hasil;
  else
    update public.pemberian g
       set tamu_id = v_tamu, jenis = v_jenis, nominal = v_nom,
           barang  = v_brg,  catatan = v_cat,
           jumlah  = v_jml,  satuan  = v_sat
     where g.id = p_id
     returning g.id into hasil;
    if hasil is null then
      raise exception 'Catatan pemberian tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;

  return hasil;
end $$;

-- Tanda tangan lama (tujuh argumen) ditinggalkan supaya tidak ada dua
-- fungsi bernama sama dengan aturan yang berbeda — salinan seperti itu
-- selalu berakhir beda perilaku dari induknya.
drop function if exists public.pemberian_simpan(text, uuid, uuid, text, bigint, text, text);

-- ---------------------------------------------------------------------------
-- rekap_ringkas: berkat dan rincian per kategori
-- ---------------------------------------------------------------------------
create or replace function public.rekap_ringkas(p_token text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  return (
    with t as (
      select tm.id, tm.datang, tm.kelompok
        from public.tamu tm
       where tm.pasangan_id = pid
    ), g as (
      select p.tamu_id, p.jenis, p.nominal, p.jumlah, p.satuan
        from public.pemberian p
        join t on t.id = p.tamu_id
    ), b as (
      select k.status
        from public.pengiriman k
        join t on t.id = k.tamu_id
       where k.jenis = 'berkat'
    )
    select jsonb_build_object(
      'tamu',      (select count(*) from t),
      'datang',    (select count(*) from t where t.datang is true),
      'tidak',     (select count(*) from t where t.datang is false),
      'belum',     (select count(*) from t where t.datang is null),
      'kelompok',  (select count(distinct lower(t.kelompok)) from t
                     where t.kelompok is not null),
      'pemberi',   (select count(distinct g.tamu_id) from g),
      'uang',      (select coalesce(sum(g.nominal), 0)
                      from g where g.jenis in ('uang','transfer')),
      'barang',    (select count(*)
                      from g where g.jenis not in ('uang','transfer')),
      'berkat_dijatah',   (select count(*) from b where b.status = 'dijatah'),
      'berkat_diberikan', (select count(*) from b where b.status = 'diberikan'),
      -- Rincian per kategori. Yang punya satuan dijumlahkan per satuan —
      -- "rokok 14 slop" dan "rokok 3 bungkus" adalah dua angka, dan
      -- menjumlahkannya jadi 17 akan salah.
      'rinci', (
        select coalesce(jsonb_agg(x order by x->>'jenis', x->>'satuan'), '[]'::jsonb)
          from (
            select jsonb_build_object(
                     'jenis',  g.jenis,
                     'satuan', g.satuan,
                     'jumlah', sum(g.jumlah),
                     'baris',  count(*)) as x
              from g
             where g.jenis not in ('uang','transfer')
             group by g.jenis, g.satuan
          ) s))
  );
end $$;

-- ---------------------------------------------------------------------------
-- rekap_daftar: kolom baru, saringan kelompok, urutan kelompok
-- ---------------------------------------------------------------------------
-- Tanda tangannya bertambah dua argumen. Yang lama dibuang lebih dulu:
-- dibiarkan hidup berdampingan, panggilan berargumen empat cocok ke
-- keduanya dan Postgres menolaknya sebagai ambigu.
drop function if exists public.rekap_daftar(text, text, text, int);

create or replace function public.rekap_daftar(
  p_token    text default null,
  p_cari     text default null,
  p_saring   text default null,   -- '', 'belum','datang','tidak','memberi',
                                  -- 'berkat-belum','berkat-dijatah','tanpa-kelompok'
  p_batas    int  default 40,
  p_kelompok text default null,   -- hanya anggota kelompok ini
  p_urut     text default null)   -- 'nama' (bawaan) atau 'kelompok'
returns table (
  id uuid, nama text, pihak text, telepon text, alamat text,
  kelompok text, relasi text, datang boolean, berkat text, pemberian jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  pid   uuid;
  q     text;
  kel   text;
  batas int;
begin
  pid := public._pasangan_pengelola(p_token);

  -- `%` dan `_` dalam ketikan orang adalah huruf, bukan pola.
  q := public._rapikan_label(p_cari);
  if q is not null then
    q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  kel   := public._rapikan_label(p_kelompok);
  batas := least(greatest(coalesce(p_batas, 40), 1), 200);

  return query
    select t.id, t.nama, t.pihak, t.telepon, t.alamat,
           t.kelompok, t.relasi, t.datang,
           coalesce(k.status, 'belum') as berkat,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',      g.id,
                      'jenis',   g.jenis,
                      'nominal', g.nominal,
                      'barang',  g.barang,
                      'jumlah',  g.jumlah,
                      'satuan',  g.satuan,
                      'catatan', g.catatan)
                    order by g.dicatat)
               from public.pemberian g
              where g.tamu_id = t.id), '[]'::jsonb)
      from public.tamu t
      left join public.pengiriman k on k.tamu_id = t.id and k.jenis = 'berkat'
     where t.pasangan_id = pid
       -- Kelompok ikut dicari. Mengetik "Budi" harus memunculkan seluruh
       -- keluarganya, bukan cuma orang yang namanya Budi — itu justru
       -- keperluan yang melahirkan kelompok.
       and (q is null
            or t.nama ilike q
            or coalesce(t.telepon,'')  ilike q
            or coalesce(t.alamat,'')   ilike q
            or coalesce(t.kelompok,'') ilike q)
       and (kel is null or lower(t.kelompok) = lower(kel))
       and (coalesce(p_saring, '') = ''
            or (p_saring = 'belum'          and t.datang is null)
            or (p_saring = 'datang'         and t.datang is true)
            or (p_saring = 'tidak'          and t.datang is false)
            or (p_saring = 'tanpa-kelompok' and t.kelompok is null)
            or (p_saring = 'berkat-belum'   and coalesce(k.status,'belum') = 'belum')
            or (p_saring = 'berkat-dijatah' and k.status = 'dijatah')
            or (p_saring = 'memberi' and exists (
                  select 1 from public.pemberian g2 where g2.tamu_id = t.id)))
     order by
       case when p_urut = 'kelompok' and t.kelompok is null then 1 else 0 end,
       case when p_urut = 'kelompok' then lower(t.kelompok) end nulls last,
       t.nama
     limit batas;
end $$;

-- ---------------------------------------------------------------------------
-- rekap_kelompok: daftar kelompok berikut isinya
-- ---------------------------------------------------------------------------
-- Dua kegunaan sekaligus: jadi saran ketik di halaman panitia (supaya
-- penambal (b) di atas jarang perlu bekerja), dan jadi jawaban langsung
-- untuk "keluarga Pak Budi menyumbang apa saja" tanpa menggulir daftar.
create or replace function public.rekap_kelompok(p_token text default null)
returns table (kelompok text, anggota int, datang int, uang bigint, barang int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  return query
    select max(t.kelompok)::text as kelompok,
           count(*)::int         as anggota,
           count(*) filter (where t.datang is true)::int as datang,
           coalesce(sum((
             select sum(g.nominal) from public.pemberian g
              where g.tamu_id = t.id and g.jenis in ('uang','transfer')
           )), 0)::bigint        as uang,
           coalesce(sum((
             select count(*) from public.pemberian g
              where g.tamu_id = t.id and g.jenis not in ('uang','transfer')
           )), 0)::int           as barang
      from public.tamu t
     where t.pasangan_id = pid
       and t.kelompok is not null
     group by lower(t.kelompok)
     order by 1;
end $$;

-- ---------------------------------------------------------------------------
grant execute on function public.berkat_tandai(text, uuid, text)          to anon, authenticated;
grant execute on function public.tamu_ubah_rekap(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.kelompok_ganti_nama(text, text, text)    to anon, authenticated;
grant execute on function public.rekap_kelompok(text)                     to anon, authenticated;
grant execute on function public.rekap_ringkas(text)                      to anon, authenticated;
grant execute on function public.rekap_daftar(text, text, text, int, text, text) to anon, authenticated;
grant execute on function public.pemberian_simpan(text, uuid, uuid, text, bigint, text, text, numeric, text) to anon, authenticated;
revoke all on function public._rapikan_label(text) from public, anon, authenticated;
