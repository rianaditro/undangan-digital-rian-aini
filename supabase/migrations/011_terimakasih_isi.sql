-- 011 — terimakasih_isi(slug). Tahap 1c dari docs/rencana-rilis.md.
--
-- Satu panggilan untuk seluruh isi halaman terima kasih: nama pengantin,
-- foto, ucapan berikut balasannya. Digabung jadi satu supaya halaman publik
-- tidak perlu diberi izin membaca tabel mana pun secara langsung.
--
-- PENTING — fungsi ini `security definer`, jadi ia berjalan sebagai
-- pemiliknya dan RLS tidak berlaku di dalamnya. Artinya saringan `tampil`
-- di bawah adalah satu-satunya yang menahan foto dan ucapan yang
-- disembunyikan. Kalau salah satunya lupa ditulis, justru halaman publik
-- inilah yang membocorkan apa yang sengaja disembunyikan lewat
-- ucapan_tampil() dan foto_ubah(). Jangan hapus `and f.tampil` maupun
-- `and u.tampil`.
--
-- Pasangan yang belum terbit dijawab { aktif: false } tanpa isi apa pun,
-- sepola dengan undangan_isi().

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
