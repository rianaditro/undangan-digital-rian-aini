-- 026 — foto tahu ia milik babak yang mana.
--
-- Langkah 2 dari docs/kenangan.md.
--
-- Halaman kenangan menyusun babaknya dari baris `acara` (migrasi 025).
-- Supaya tiap babak punya wajah, tiap foto boleh menyebut acara mana
-- yang dipotretnya.
--
-- Dua hal yang sengaja TIDAK dilakukan:
--
-- · Tidak ada tabel baru untuk klip. Klip selalu punya poster, dan
--   poster itu sebuah foto — jadi klip nanti (langkah 5) cuma menambah
--   kolom di sini. Satu tabel, satu urutan, satu galeri, satu RLS.
-- · acara_id boleh kosong, dan itu keadaan yang wajar, bukan data yang
--   belum lengkap. Foto tanpa babak tetap masuk galeri. Kalau dibuat
--   wajib, foto yang lupa dilabeli akan hilang dari halaman — dan orang
--   yang mengunggah 80 foto sekaligus pasti lupa melabeli sebagian.
alter table public.foto
  add column if not exists acara_id uuid references public.acara (id) on delete set null,
  add column if not exists latar    boolean not null default false;

comment on column public.foto.acara_id is 'Babak yang dipotret; kosong = galeri saja';
comment on column public.foto.latar    is 'Dipakai sebagai latar babaknya di halaman kenangan';

create index if not exists foto_acara_idx on public.foto (acara_id, urutan);

-- `on delete set null`, bukan cascade: menghapus satu acara berarti
-- babaknya hilang dari halaman, BUKAN fotonya ikut terhapus dari bucket.
-- Fotonya kembali jadi foto lepas dan tetap ada di galeri.

-- ---------------------------------------------------------------------------
-- Satu latar per babak
-- ---------------------------------------------------------------------------
-- Dijaga di database, bukan di halaman. Panel 9 nanti menyalakan `latar`
-- lewat satu permintaan, dan kalau yang lama harus dimatikan lebih dulu
-- oleh peramban, satu permintaan yang gagal di tengah meninggalkan dua
-- latar — atau nol. Pemicu ini membuat "menyalakan yang baru" sekaligus
-- berarti "mematikan yang lama", dalam satu transaksi.
create or replace function public._foto_satu_latar()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.latar and new.acara_id is not null then
    update public.foto
       set latar = false
     where pasangan_id = new.pasangan_id
       and acara_id    = new.acara_id
       and id         <> new.id
       and latar;
  end if;

  -- Latar tanpa babak tidak punya arti: tidak ada tempat untuk
  -- memasangnya. Dibiarkan menyala, ia jadi keadaan yang tidak pernah
  -- terlihat dan tidak pernah bisa dimatikan dari panel.
  if new.latar and new.acara_id is null then
    new.latar := false;
  end if;

  return new;
end $$;

drop trigger if exists foto_satu_latar on public.foto;
create trigger foto_satu_latar
  before insert or update of latar, acara_id on public.foto
  for each row execute function public._foto_satu_latar();

revoke all on function public._foto_satu_latar() from public, anon, authenticated;
