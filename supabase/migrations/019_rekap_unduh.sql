-- 019 — rekap_unduh(): seluruh sumbangan untuk diunduh jadi Excel.
--
-- Kenapa tidak memakai rekap_daftar yang sudah ada: fungsi itu dipagari
-- 200 baris dan ikut saringan yang sedang aktif di layar. Keduanya benar
-- untuk mengetik rekap di HP, dan keduanya salah untuk berkas unduhan —
-- unduhan yang diam-diam terpotong di baris ke-200 lebih buruk daripada
-- tidak ada unduhan sama sekali, karena tidak ada yang tahu.
--
-- Jadi tidak ada batas di sini. Jumlah barisnya sudah dibatasi kenyataan:
-- satu baris per pemberian, dan pemberian tidak mungkin lebih banyak dari
-- orang yang datang.
--
-- Satu baris per PEMBERIAN, bukan per tamu. Tamu yang memberi dua kali —
-- amplop dan rokok — muncul dua baris, dan itu memang yang dibutuhkan
-- spreadsheet: tiap baris satu hal yang bisa dijumlahkan.
--
-- Tamu yang datang tapi tidak memberi apa-apa tidak muncul di sini. Ini
-- daftar sumbangan, bukan daftar hadir; angka kehadiran ada di
-- rekap_ringkas() dan masuk lembar Ringkasan.
--
-- Urutannya kelompok dulu, baru nama. Satu keluarga jadi berdampingan di
-- spreadsheet tanpa perlu disortir lagi — persis alasan kelompok itu ada.

create or replace function public.rekap_unduh(p_token text default null)
returns table (
  nama     text,
  pihak    text,
  telepon  text,
  alamat   text,
  kelompok text,
  relasi   text,
  datang   boolean,
  berkat   text,
  jenis    text,
  nominal  bigint,
  jumlah   numeric,
  satuan   text,
  barang   text,
  catatan  text,
  dicatat  timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := public._pasangan_pengelola(p_token);

  return query
    select t.nama, t.pihak, t.telepon, t.alamat, t.kelompok, t.relasi,
           t.datang, coalesce(k.status, 'belum') as berkat,
           g.jenis, g.nominal, g.jumlah, g.satuan, g.barang, g.catatan,
           g.dicatat
      from public.pemberian g
      join public.tamu t on t.id = g.tamu_id
      left join public.pengiriman k on k.tamu_id = t.id and k.jenis = 'berkat'
     where t.pasangan_id = pid
     order by (t.kelompok is null), lower(t.kelompok), t.nama, g.dicatat;
end $$;

grant execute on function public.rekap_unduh(text) to anon, authenticated;
