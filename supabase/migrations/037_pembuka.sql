-- 037 — teks pembuka undangan menurut agama pasangan.
--
-- Sampai sekarang basmalah, "Walimatul 'Ursy", Ar-Rum 21, salam, dan doa
-- di halaman undangan tertulis tetap untuk pasangan muslim — di semua
-- tema. Pasangan Hindu di Adat Bali, atau pasangan Kristen/Katolik di
-- tema mana pun, membutuhkan pembuka lain (docs/rencana-tema.md, bagian 4).
--
--   pasangan.pembuka  'islam' (bawaan) | 'kristen' | 'katolik' | 'hindu'
--                     | 'buddha' | 'umum' (tanpa teks keagamaan)
--
-- Teksnya sendiri tidak disimpan di sini: ia milik platform
-- (assets/varian.js → MENGUNDANG.PEMBUKA), satu salinan untuk semua
-- pasangan, dan bisa diperbaiki tanpa migrasi. Bawaan 'islam' membuat
-- setiap pasangan yang sudah ada tetap persis seperti sekarang.
--
-- Hanya menambah; halaman lama mengabaikan kunci barunya.

alter table public.pasangan add column if not exists pembuka text not null default 'islam';
alter table public.pasangan drop constraint if exists pasangan_pembuka_check;
alter table public.pasangan add  constraint pasangan_pembuka_check
  check (pembuka in ('islam','kristen','katolik','hindu','buddha','umum'));
comment on column public.pasangan.pembuka is 'Teks pembuka undangan menurut agama; teksnya di assets/varian.js';

-- ---------------------------------------------------------------------------
-- undangan_isi — kunci baru: pembuka
-- ---------------------------------------------------------------------------
-- Badan lengkap dari 036; satu-satunya perubahan satu kunci sesudah
-- 'tema_setel'.
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
    'pembuka', ps.pembuka,
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
