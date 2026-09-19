-- 012 — Melengkapi resolusi penyewa, dan mengunci penulisan ucapan.
-- Tahap 2 dari docs/rencana-rilis.md.
--
-- Tiga hal.
--
-- SATU — `pihak_bawaan`. Halaman undangan perlu tahu varian mana yang
-- dipakai kalau link tamu tidak menyebut `?p=`. Selama ini nilainya
-- hardcode di assets/varian.js (`PIHAK_BAWAAN = 'keluarga-wanita'`).
-- Begitu isinya pindah ke database, nilai ini ikut pindah.
--
-- DUA — `urutan` pada tiap pihak. VARIAN di varian.js menyimpan urutan
-- kartu mempelai sebagai array, mis. ['wanita','pria']. Nilainya selalu
-- "sisi tamu dulu, lawannya belakangan", jadi bisa diturunkan dari `sisi`
-- dan tidak perlu kolom sendiri. Diturunkan di sini, bukan di peramban,
-- supaya jawaban undangan_isi() lengkap menjelaskan dirinya.
--
-- TIGA — menutup lubang yang ditinggalkan migrasi 010. Waktu itu policy
-- INSERT `ucapan` sudah dilarang mengisi `balasan`, tapi `pasangan_id`
-- masih terbuka: secara teori sebuah tulisan bisa dititipkan ke pasangan
-- lain. Menutupnya perlu server tahu tulisan ini untuk siapa, dan itu
-- baru mungkin sekarang setelah ada resolusi penyewa. Caranya: tamu tidak
-- lagi menulis langsung ke tabel, melainkan lewat ucapan_tulis(slug, …)
-- yang menetapkan pasangan_id sendiri dari slug. Policy INSERT langsung
-- dicabut sekalian — sesudah ini tidak ada lagi jalan menulis ke `ucapan`
-- selain lewat fungsi itu.

-- ---------------------------------------------------------------------------
-- 1 · pihak bawaan
-- ---------------------------------------------------------------------------

alter table public.pasangan
  add column if not exists pihak_bawaan text;

comment on column public.pasangan.pihak_bawaan is
  'Kode pihak yang dipakai bila link tamu tidak menyebut ?p=';

update public.pasangan p
   set pihak_bawaan = 'keluarga-wanita'
 where p.slug = 'rian-aini'
   and p.pihak_bawaan is null;

-- ---------------------------------------------------------------------------
-- 2 · undangan_isi menyertakan pihak_bawaan dan urutan
-- ---------------------------------------------------------------------------

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
    'pihak_bawaan', ps.pihak_bawaan,

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
        'ttdLabel', ph.ttd_label, 'ttdSub', ph.ttd_sub,
        -- Urutan kartu mempelai: sisi tamu lebih dulu, lawannya belakangan.
        'urutan', case when ph.sisi = 'pria'
                       then jsonb_build_array('pria','wanita')
                       else jsonb_build_array('wanita','pria') end))
        from public.pihak ph where ph.pasangan_id = ps.id)
  ) into hasil;

  return hasil;
end $$;

grant execute on function public.undangan_isi(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · ucapan hanya boleh masuk lewat fungsi
-- ---------------------------------------------------------------------------

create or replace function public.ucapan_tulis(
  p_slug text, p_nama text, p_hadir text, p_pesan text,
  p_pihak text default null)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
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

  -- pasangan_id ditetapkan di sini, bukan diterima dari peramban. Itu
  -- seluruh alasan fungsi ini ada.
  insert into public.ucapan (pasangan_id, nama, hadir, pesan, pihak)
  values (ps.id, nama, p_hadir, pesan,
          (select ph.kode from public.pihak ph
            where ph.pasangan_id = ps.id and ph.kode = p_pihak));
end $$;

grant execute on function public.ucapan_tulis(text, text, text, text, text)
  to anon, authenticated;

-- Jalan menulis langsung dicabut. Sesudah ini satu-satunya pintu masuk
-- ucapan adalah ucapan_tulis() di atas.
drop policy if exists "ucapan tulis publik" on public.ucapan;
