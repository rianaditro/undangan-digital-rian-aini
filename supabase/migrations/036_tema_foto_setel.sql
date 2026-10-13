-- 036 — tema bisa membaca foto prewed, dan menyimpan setelannya.
--
-- Tahap A dari docs/rencana-tema.md.
--
-- Sampai sekarang halaman undangan tidak menampilkan satu pun foto dari
-- pustaka; pustaka cuma dipakai halaman kenangan. Tema-tema baru
-- (docs/riset-tema-prewed.md) hidup dari foto prewed, jadi foto perlu
-- tahu PERANNYA di undangan:
--
--   foto.peran   'sampul'  latar sampul           satu per pasangan
--                'pria'    potret mempelai pria   satu per pasangan
--                'wanita'  potret mempelai wanita satu per pasangan
--                'galeri'  galeri undangan        berapa pun
--                null      tidak tampil di undangan (bawaan)
--
-- Bawaan null, bukan 'galeri': pustaka berisi juga foto sesudah acara,
-- dan foto resepsi tidak boleh tiba-tiba muncul di undangan yang belum
-- selesai disebar.
--
--   pasangan.tema_setel  jsonb  pilihan per tema: {"palet": "...",
--                               "huruf": "...", ...}. Isinya divalidasi
--                               halaman terhadap tema/<kode>/tema.json,
--                               BUKAN di sini — tema baru tidak boleh
--                               butuh migrasi.
--
-- Halaman terima kasih ikut tema undangannya (keputusan 12 Okt), jadi
-- _terimakasih_bangun juga mengirim tema dan setelannya.
--
-- Hanya menambah; halaman lama mengabaikan kunci barunya.

alter table public.foto add column if not exists peran text;
alter table public.foto drop constraint if exists foto_peran_check;
alter table public.foto add  constraint foto_peran_check
  check (peran is null or peran in ('sampul','pria','wanita','galeri'));
-- Video tidak punya tempat di undangan: sampul dan potret adalah gambar
-- diam, dan undangan dibuka di HP murah dengan kuota terbatas.
alter table public.foto drop constraint if exists foto_peran_foto;
alter table public.foto add  constraint foto_peran_foto
  check (peran is null or jenis = 'foto');
comment on column public.foto.peran is 'Peran di halaman undangan: sampul, pria, wanita, galeri; null = tidak tampil di undangan';

create index if not exists foto_peran_idx on public.foto (pasangan_id, peran) where peran is not null;

alter table public.pasangan add column if not exists tema_setel jsonb not null default '{}'::jsonb;
alter table public.pasangan drop constraint if exists pasangan_tema_setel_objek;
alter table public.pasangan add  constraint pasangan_tema_setel_objek
  check (jsonb_typeof(tema_setel) = 'object');
comment on column public.pasangan.tema_setel is 'Setelan tema: palet, huruf, dan setelan khas tema; divalidasi halaman terhadap tema.json';

-- Nama tema dipakai halaman sebagai bagian alamat berkas
-- (/tema/<nama>/gaya.css). Dibatasi di sini supaya tidak ada nilai yang
-- bisa keluar dari folder tema. custom/<kode> untuk tema Full Custom
-- (docs/halaman-khusus.md).
alter table public.pasangan drop constraint if exists pasangan_tema_check;
alter table public.pasangan add  constraint pasangan_tema_check
  check (tema ~ '^(custom/)?[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------------------------------------------------------------------------
-- Satu sampul, satu potret per sisi
-- ---------------------------------------------------------------------------
-- Pola yang sama dengan _foto_satu_latar (026): menyalakan yang baru
-- sekaligus mematikan yang lama, dalam satu transaksi. Dasbor cukup
-- mengirim satu PATCH.
create or replace function public._foto_satu_peran()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.peran in ('sampul','pria','wanita') then
    update public.foto
       set peran = null
     where pasangan_id = new.pasangan_id
       and peran       = new.peran
       and id         <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists foto_satu_peran on public.foto;
create trigger foto_satu_peran
  before insert or update of peran on public.foto
  for each row execute function public._foto_satu_peran();

revoke all on function public._foto_satu_peran() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- _undangan_foto — foto yang tampil di undangan
-- ---------------------------------------------------------------------------
-- Bentuknya tetap walau kosong: {"sampul": null, "pria": null,
-- "wanita": null, "galeri": []}. Halaman tidak perlu menebak kunci mana
-- yang ada.
create or replace function public._undangan_foto(p_pasangan uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with f as (
    select f.*, jsonb_build_object(
             'jalur',      f.jalur,
             'kecil',      f.jalur_kecil,
             'lebar',      f.lebar,
             'tinggi',     f.tinggi,
             'keterangan', f.keterangan,
             'fokus_x',    f.fokus_x,
             'fokus_y',    f.fokus_y,
             'zum',        f.zum,
             'tampilan',   f.tampilan) as j
      from public.foto f
     where f.pasangan_id = p_pasangan
       and f.tampil
       and f.jenis = 'foto'
       and f.peran is not null)
  select jsonb_build_object(
    'sampul', (select j from f where peran = 'sampul' limit 1),
    'pria',   (select j from f where peran = 'pria'   limit 1),
    'wanita', (select j from f where peran = 'wanita' limit 1),
    'galeri', coalesce((select jsonb_agg(j order by urutan, diunggah)
                          from f where peran = 'galeri'), '[]'::jsonb))
$$;

revoke all on function public._undangan_foto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- undangan_isi — kunci baru: tema_setel, foto
-- ---------------------------------------------------------------------------
-- Badan lengkap dari 025, seperti aturan di sana: database harus bisa
-- dibangun ulang dari berkas migrasi. Satu-satunya perubahan: dua kunci
-- sesudah 'tema'.
create or replace function public.undangan_isi(p_slug text)
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
    'slug', ps.slug, 'aktif', true, 'status', ps.status, 'tema', ps.tema,
    'tema_setel', ps.tema_setel,
    'foto', public._undangan_foto(ps.id),
    'canonical_host', ps.canonical_host, 'tanggal_acara', ps.tanggal_acara,
    'pihak_bawaan', ps.pihak_bawaan, 'kota', ps.kota,

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan, 'lengkap', m.lengkap, 'peran', m.peran,
        'anak', m.anak,
        'ayah',    (select s.nama from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ayah' order by s.urutan limit 1),
        'ayahKet', (select s.keterangan from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ayah' order by s.urutan limit 1),
        'ibu',     (select s.nama from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ibu' order by s.urutan limit 1),
        'ibuKet',  (select s.keterangan from public.silsilah s
                     where s.pasangan_id = ps.id and s.sisi = m.sisi
                       and s.peran = 'Ibu' order by s.urutan limit 1)))
        from public.mempelai m where m.pasangan_id = ps.id),

    'silsilah', (
      select jsonb_object_agg(x.sisi, x.daftar) from (
        select s.sisi, jsonb_agg(jsonb_build_object(
                 'peran', s.peran, 'nama', s.nama, 'keterangan', s.keterangan,
                 'foto', s.foto_jalur, 'kecil', s.foto_kecil,
                 'lebar', s.lebar, 'tinggi', s.tinggi)
                 order by s.urutan, s.peran) as daftar
          from public.silsilah s
         where s.pasangan_id = ps.id and s.tampil
         group by s.sisi) x),

    'tempat', (
      select jsonb_object_agg(t.kode, jsonb_build_object(
        'nama', t.nama, 'alamat', t.alamat,
        'ringkas', t.ringkas, 'maps', t.maps))
        from public.tempat t where t.pasangan_id = ps.id),

    'acara', (
      select jsonb_agg(jsonb_build_object(
        'nama', a.nama, 'tanggal', a.tanggal, 'jam', a.jam,
        'ringkas', a.ringkas, 'mulai', a.mulai,
        'tempat', (select tt.kode from public.tempat tt where tt.id = a.tempat_id))
        order by a.urutan)
        from public.acara a where a.pasangan_id = ps.id and a.di_undangan),

    'dompet', (
      select jsonb_object_agg(d.kode, jsonb_build_object(
        'bank', d.bank, 'nomor', d.nomor, 'an', d.atas_nama))
        from public.dompet d where d.pasangan_id = ps.id),

    -- ttdNama dan dompet DITURUNKAN, bukan disimpan. Keduanya selalu
    -- berbunyi "sisi tamu dulu, lawannya belakangan", jadi menyimpannya
    -- berarti menyiapkan sumber kedua yang cepat atau lambat berbeda.
    'pihak', (
      select jsonb_object_agg(ph.kode, jsonb_build_object(
        'label', ph.label, 'kode', ph.kode_pendek, 'sisi', ph.sisi,
        'ttdLabel', ph.ttd_label, 'ttdSub', ph.ttd_sub,
        'urutan', case when ph.sisi = 'pria'
                       then jsonb_build_array('pria','wanita')
                       else jsonb_build_array('wanita','pria') end,
        'ttdNama', jsonb_build_array(
          (select m.panggilan from public.mempelai m
            where m.pasangan_id = ps.id and m.sisi = ph.sisi),
          (select m.panggilan from public.mempelai m
            where m.pasangan_id = ps.id and m.sisi <> ph.sisi)),
        'dompet', coalesce((
          select jsonb_agg(d.kode order by (d.sisi is distinct from ph.sisi), d.kode)
            from public.dompet d where d.pasangan_id = ps.id), '[]'::jsonb)))
        from public.pihak ph where ph.pasangan_id = ps.id)
  ) into hasil;

  return hasil;
end $$;

-- ---------------------------------------------------------------------------
-- _terimakasih_bangun — kunci baru: tema, tema_setel
-- ---------------------------------------------------------------------------
-- Badan lengkap dari 035; satu-satunya perubahan dua kunci sesudah 'kota'.
create or replace function public._terimakasih_bangun(ps public.pasangan)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'slug',          ps.slug,
    'aktif',         true,
    'tanggal_acara', ps.tanggal_acara,
    'kota',          ps.kota,
    'tema',          ps.tema,
    'tema_setel',    ps.tema_setel,

    'hadir', (
      select nullif(count(*), 0)
        from public.tamu t
       where t.pasangan_id = ps.id
         and t.datang is true),

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan,
        'lengkap',   m.lengkap,
        'anak',      m.anak,
        -- orang tua tinggal di silsilah sejak 014
        'ayah', (select s.nama from public.silsilah s
                  where s.pasangan_id = ps.id and s.sisi = m.sisi and s.peran = 'Ayah' and s.tampil
                  order by s.urutan limit 1),
        'ibu',  (select s.nama from public.silsilah s
                  where s.pasangan_id = ps.id and s.sisi = m.sisi and s.peran = 'Ibu' and s.tampil
                  order by s.urutan limit 1)))
        from public.mempelai m where m.pasangan_id = ps.id),

    -- Urutan: latar dulu (pembuka giliran), lalu urutan pustaka.
    'foto', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',         f.id,
        'jenis',      f.jenis,
        'jalur',      f.jalur,
        'kecil',      f.jalur_kecil,
        'lebar',      f.lebar,
        'tinggi',     f.tinggi,
        'durasi_ms',  f.durasi_ms,
        'keterangan', f.keterangan,
        'acara_id',   f.acara_id,
        'bagian',     f.bagian,
        'latar',      f.latar,
        'fokus_x',    f.fokus_x,
        'fokus_y',    f.fokus_y,
        'zum',        f.zum,
        'tampilan',   f.tampilan)
        order by f.latar desc, f.urutan, f.diunggah), '[]'::jsonb)
        from public.foto f
       where f.pasangan_id = ps.id
         and f.tampil),

    'babak', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',          a.id,
        'nama',        a.nama,
        'tanggal',     a.tanggal,
        'jam',         a.jam,
        'teks',        nullif(btrim(coalesce(a.kenangan_teks, '')), ''),
        'jumlah_foto', (select count(*) from public.foto f
                         where f.pasangan_id = ps.id and f.acara_id = a.id and f.tampil),
        'latar', (
          select jsonb_build_object(
            'jalur',      f.jalur,
            'kecil',      f.jalur_kecil,
            'lebar',      f.lebar,
            'tinggi',     f.tinggi,
            'keterangan', f.keterangan)
            from public.foto f
           where f.pasangan_id = ps.id
             and f.acara_id = a.id
             and f.tampil
             and f.jenis = 'foto'
           order by f.latar desc, f.urutan, f.diunggah
           limit 1))
        order by a.urutan), '[]'::jsonb)
        from public.acara a
       where a.pasangan_id = ps.id
         and a.di_terimakasih),

    'blok', (
      select coalesce(jsonb_object_agg(b.kunci, jsonb_build_object(
        'tampil', b.tampil,
        'judul',  nullif(btrim(coalesce(b.judul, '')), ''),
        'teks',   nullif(btrim(coalesce(b.teks,  '')), ''))), '{}'::jsonb)
        from public.kenangan_blok b
       where b.pasangan_id = ps.id),

    'vendor', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'peran',  v.peran,
        'nama',   v.nama,
        'tautan', v.tautan)
        order by v.urutan, v.dibuat), '[]'::jsonb)
        from public.kenangan_vendor v
       where v.pasangan_id = ps.id),

    'angka', jsonb_build_object(
      'hadir',  (select nullif(count(*), 0) from public.tamu t
                  where t.pasangan_id = ps.id and t.datang is true),
      'ucapan', (select nullif(count(*), 0) from public.ucapan u
                  where u.pasangan_id = ps.id and u.tampil),
      'foto',   (select nullif(count(*), 0) from public.foto f
                  where f.pasangan_id = ps.id and f.tampil),
      'babak',  (select nullif(count(*), 0) from public.acara a
                  where a.pasangan_id = ps.id and a.di_terimakasih)),

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
  )
$$;

revoke all on function public._terimakasih_bangun(public.pasangan) from public, anon, authenticated;
