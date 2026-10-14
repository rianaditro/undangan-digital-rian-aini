-- Tempel SELURUH isi berkas ini di SQL editor Supabase, lalu Run.
-- Proyek: mavjlhlyrtacxleulbom
--
-- PERBAIKAN KEAMANAN — boleh dijalankan SEKARANG, sebelum migrasi 036–039
-- dan sebelum cabang mana pun di-merge.
--
-- Kebijakan "pasangan panitia" (006) membuka seluruh baris pasangan untuk
-- pengantin yang login. Lewat REST (anon key ada di setiap halaman),
-- pengantin bisa menaikkan paketnya sendiri, memperpanjang masa_aktif,
-- menunda hapus_pada, melepas reseller_id, mengganti slug, atau
-- menghapus undangannya. Dasbor tidak pernah melakukannya, tapi siapa
-- pun yang punya akun bisa.
--
-- Pemicu ini menolak perubahan itu untuk peran `authenticated` yang
-- bukan pemilik platform. Yang dipakai dasbor di main tetap boleh:
-- tanggal_acara, kota, tema, pihak_bawaan, kenangan_terbit, dan
-- terbit/tarik (status draf ↔ aktif). RPC pemilik/admin dan edge function
-- tidak tersentuh (berjalan sebagai pemilik fungsi / service_role).
--
-- Ini bagian DUA dari migrasi 039 tanpa kolom `khusus` (yang baru ada di
-- 039). Saat 039 dijalankan nanti, fungsinya diganti versi lengkap.
--
-- Yang benar: "Success. No rows returned".

begin;

create or replace function public._pasangan_jaga_kolom()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user <> 'authenticated' or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Undangan hanya bisa dihapus pemilik platform' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.slug is distinct from old.slug
     or new.paket is distinct from old.paket or new.canonical_host is distinct from old.canonical_host
     or new.masa_aktif is distinct from old.masa_aktif or new.hapus_pada is distinct from old.hapus_pada
     or new.reseller_id is distinct from old.reseller_id or new.dibuat is distinct from old.dibuat then
    raise exception 'Kolom ini hanya bisa diubah pemilik platform' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('draf','aktif') and new.status in ('draf','aktif')) then
    raise exception 'Status ini hanya bisa diubah pemilik platform' using errcode = '42501';
  end if;
  if new.tema is distinct from old.tema and new.tema like 'custom/%' then
    raise exception 'Tema custom dipasang oleh pemilik platform' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._pasangan_jaga_kolom() from public, anon, authenticated;

drop trigger if exists pasangan_jaga_kolom on public.pasangan;
create trigger pasangan_jaga_kolom
  before update or delete on public.pasangan
  for each row execute function public._pasangan_jaga_kolom();

commit;
