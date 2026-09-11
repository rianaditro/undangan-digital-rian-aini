-- ============================================================
--  FASE 0 — langkah 4: RLS tabel penyewa + pengganti varian.js
--
--  Tabel di migrasi 002 sempat dibuat tanpa RLS. Itu kelalaian:
--  anon bisa membaca seluruh daftar pasangan beserta tanggal acara
--  dan reseller-nya. Ditutup di sini.
-- ============================================================

alter table public.pasangan       enable row level security;
alter table public.mempelai       enable row level security;
alter table public.tempat         enable row level security;
alter table public.acara          enable row level security;
alter table public.dompet         enable row level security;
alter table public.pihak          enable row level security;
alter table public.slug_terlarang enable row level security;

-- Hanya panitia/admin yang login. Tamu TIDAK pernah membaca tabel ini
-- langsung — semuanya lewat RPC undangan_isi di bawah.
do $$
declare t text;
begin
  foreach t in array array['pasangan','mempelai','tempat','acara','dompet','pihak']
  loop
    execute format('drop policy if exists %I on public.%I', t || ' panitia', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || ' panitia', t);
  end loop;
end $$;

-- Daftar slug terlarang memang publik: dibaca saat memeriksa
-- ketersediaan slug. Tidak ada yang rahasia di sini.
drop policy if exists "slug terlarang baca" on public.slug_terlarang;
create policy "slug terlarang baca" on public.slug_terlarang
  for select to anon, authenticated using (true);

-- ============================================================
--  Pengganti assets/varian.js: seluruh isi undangan satu pasangan
--  dalam satu panggilan. Inilah yang mengubah konfigurasi jadi data.
--
--  Hanya melayani pasangan yang sudah terbit dan masih berlaku.
--  Yang belum terbit hanya menjawab "tidak aktif" — tahapannya
--  bukan urusan dunia luar. Nomor telepon tamu tidak pernah lewat
--  sini.
-- ============================================================
create or replace function public.undangan_isi(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ps    public.pasangan;
  hasil jsonb;
begin
  select * into ps from public.pasangan
   where slug = lower(trim(p_slug)) limit 1;

  if ps.id is null then
    return null;
  end if;

  if not ps.terbit or ps.status not in ('aktif','lewat','arsip') then
    return jsonb_build_object('slug', ps.slug, 'aktif', false);
  end if;

  select jsonb_build_object(
    'slug', ps.slug, 'aktif', true, 'status', ps.status, 'tema', ps.tema,
    'canonical_host', ps.canonical_host, 'tanggal_acara', ps.tanggal_acara,

    'mempelai', (
      select jsonb_object_agg(m.sisi, jsonb_build_object(
        'panggilan', m.panggilan, 'lengkap', m.lengkap, 'peran', m.peran,
        'anak', m.anak, 'ayah', m.ayah, 'ayahKet', m.ayah_ket,
        'ibu', m.ibu, 'ibuKet', m.ibu_ket))
        from public.mempelai m where m.pasangan_id = ps.id),

    'tempat', (
      select jsonb_object_agg(t.kode, jsonb_build_object(
        'nama', t.nama, 'alamat', t.alamat,
        'ringkas', t.ringkas, 'maps', t.maps))
        from public.tempat t where t.pasangan_id = ps.id),

    'acara', (
      select jsonb_agg(jsonb_build_object(
        'nama', a.nama, 'tanggal', a.tanggal, 'jam', a.jam,
        'ringkas', a.ringkas, 'mulai', a.mulai,
        -- kode tempat, bukan id: acara yang terkunci menyebut tempatnya,
        -- yang kosong mengikuti pihak tamu
        'tempat', (select tt.kode from public.tempat tt where tt.id = a.tempat_id))
        order by a.urutan)
        from public.acara a where a.pasangan_id = ps.id),

    'dompet', (
      select jsonb_object_agg(d.kode, jsonb_build_object(
        'bank', d.bank, 'nomor', d.nomor, 'an', d.atas_nama))
        from public.dompet d where d.pasangan_id = ps.id),

    'pihak', (
      select jsonb_object_agg(ph.kode, jsonb_build_object(
        'label', ph.label, 'kode', ph.kode_pendek, 'sisi', ph.sisi,
        'ttdNama', ph.urutan_nama, 'dompet', ph.urutan_dompet,
        'ttdLabel', ph.ttd_label, 'ttdSub', ph.ttd_sub))
        from public.pihak ph where ph.pasangan_id = ps.id)
  ) into hasil;

  return hasil;
end $$;

revoke all on function public.undangan_isi(text) from public;
grant execute on function public.undangan_isi(text) to anon, authenticated;
