-- 038 — kisah: perjalanan pasangan, bab demi bab.
--
-- Tahap H dari docs/rencana-tema.md: tema Kisah ("dari kecil sampai
-- pelaminan"), dan bagian #kisah yang bisa tampil di tema mana pun.
--
--   kisah  satu baris = satu bab: tahun (bebas: "2015", "Ramadan 2023"),
--          judul pendek, satu-dua kalimat, foto opsional dari pustaka.
--
-- Foto TIDAK diunggah ulang: bab menunjuk baris `foto` yang sudah ada
-- (on delete set null — menghapus foto tidak menghapus babnya, bab itu
-- cuma kehilangan gambarnya). Bab tanpa foto itu wajar: tidak semua orang
-- punya foto masa kecil, dan tema menggambarnya sebagai bab teks.
--
-- Pola RLS sama dengan kenangan_vendor (033): pemilik menulis lewat
-- REST, anon tidak bisa menyentuh tabelnya — ia membaca lewat
-- undangan_isi.

create table if not exists public.kisah (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  urutan      integer not null default 0,
  tahun       text check (tahun is null or char_length(btrim(tahun)) between 1 and 30),
  judul       text not null check (char_length(btrim(judul)) between 1 and 60),
  teks        text check (teks is null or char_length(teks) <= 280),
  foto_id     uuid references public.foto (id) on delete set null,
  dibuat      timestamptz not null default now()
);
comment on table  public.kisah       is 'Bab perjalanan pasangan, tampil di bagian #kisah undangan';
comment on column public.kisah.tahun is 'Bebas: 2015, Ramadan 2023, Kelas 2 SMA';
comment on column public.kisah.teks  is 'Satu-dua kalimat; dasbor menyarankan <= 140 huruf';
create index if not exists kisah_pasangan_idx on public.kisah (pasangan_id, urutan);

alter table public.kisah enable row level security;
drop policy if exists "kisah pemilik" on public.kisah;
create policy "kisah pemilik" on public.kisah
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()))
  with check (pasangan_id in (select public.pasangan_saya()));
revoke all on public.kisah from anon;

-- Foto bab harus milik pasangan yang sama. Tanpa ini, satu bab bisa
-- menunjuk foto pasangan lain (id-nya bisa ditebak dari halaman mana
-- pun) dan undangan_isi akan memajangnya.
create or replace function public._kisah_foto_sendiri()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.foto_id is not null and not exists (
       select 1 from public.foto f where f.id = new.foto_id and f.pasangan_id = new.pasangan_id) then
    raise exception 'Foto bab bukan milik undangan ini' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists kisah_foto_sendiri on public.kisah;
create trigger kisah_foto_sendiri
  before insert or update of foto_id, pasangan_id on public.kisah
  for each row execute function public._kisah_foto_sendiri();
revoke all on function public._kisah_foto_sendiri() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- _undangan_kisah — bab untuk undangan_isi
-- ---------------------------------------------------------------------------
create or replace function public._undangan_kisah(p_pasangan uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tahun', nullif(btrim(coalesce(k.tahun, '')), ''),
           'judul', k.judul,
           'teks',  nullif(btrim(coalesce(k.teks, '')), ''),
           'foto',  (select jsonb_build_object(
                       'jalur', f.jalur, 'kecil', f.jalur_kecil, 'lebar', f.lebar, 'tinggi', f.tinggi,
                       'fokus_x', f.fokus_x, 'fokus_y', f.fokus_y, 'zum', f.zum)
                       from public.foto f
                      where f.id = k.foto_id and f.tampil and f.jenis = 'foto'))
           order by k.urutan, k.dibuat), '[]'::jsonb)
    from public.kisah k
   where k.pasangan_id = p_pasangan
$$;
revoke all on function public._undangan_kisah(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- undangan_isi — kunci baru: kisah
-- ---------------------------------------------------------------------------
-- Badan lengkap dari 037; satu-satunya perubahan satu kunci sesudah
-- 'pembuka'.
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
    'kisah', public._undangan_kisah(ps.id),
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
