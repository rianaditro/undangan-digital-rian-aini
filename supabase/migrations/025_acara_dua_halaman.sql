-- 025 — satu daftar acara, dua halaman yang membacanya.
--
-- Langkah 1 dari docs/kenangan.md.
--
-- Halaman kenangan (/terimakasih) menyusun babak-babaknya dari baris
-- `acara` yang SUDAH diketik pasangan untuk undangannya. Bukan daftar
-- kedua: kalau jam resepsi diperbaiki, kedua halaman ikut berubah, dan
-- tidak mungkin melenceng.
--
-- Rancangan awalnya menetapkan empat babak tetap — akad, resepsi,
-- salam-salaman, tutup. Itu salah untuk platform: ada siraman, ada
-- midodareni, ada yang akadnya di KUA dan resepsinya dua kali di dua
-- kota. Empat babak tetap sama saja dengan memaksakan satu pernikahan
-- ke semua orang.
--
-- Yang ditambahkan cuma dua penanda: satu baris acara boleh muncul di
-- undangan, di kenangan, atau di dua-duanya.
--
--   · "Salam-salaman 14.00" — tidak perlu ada di undangan, tapi itu
--     babak yang paling banyak fotonya.
--   · "Ngunduh mantu" yang batal — dimatikan dari kenangan tanpa
--     dihapus, supaya kalau jadi tinggal dinyalakan lagi.

alter table public.acara
  add column if not exists di_undangan    boolean not null default true,
  add column if not exists di_terimakasih boolean not null default true,
  add column if not exists kenangan_teks  text;

comment on column public.acara.di_undangan    is 'Tampil di halaman undangan';
comment on column public.acara.di_terimakasih is 'Tampil sebagai babak di halaman kenangan';
comment on column public.acara.kenangan_teks  is 'Satu kalimat di babak ini; kosong = halaman memakai bawaan';

-- ---------------------------------------------------------------------------
-- undangan_isi — menyaring acara yang dimatikan
-- ---------------------------------------------------------------------------
-- Badan fungsi ini sebelumnya HANYA hidup di database. Salinan terakhir
-- di repo ada di migrasi 012 (2256 bita), sementara yang berlaku 4022
-- bita — migrasi `kota` dan `silsilah_di_undangan_isi` mengubahnya
-- langsung tanpa berkasnya ikut diperbarui. Ini kejadian kedua sesudah
-- pasangan_siapkan (lihat migrasi 023), dan dampaknya sama: database
-- tidak bisa dibangun ulang dari berkas migrasi.
--
-- Jadi seluruh badannya ditulis lengkap di sini, bukan cuma bagian yang
-- berubah. Satu-satunya perubahan isi: `and a.di_undangan` di bagian
-- 'acara'.
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

grant execute on function public.undangan_isi(text) to anon, authenticated;
