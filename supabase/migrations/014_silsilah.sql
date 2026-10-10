-- 014 — Silsilah keluarga. Tahap 3d dari docs/rencana-rilis.md.
--
-- Dua keputusan yang menentukan bentuk tabel ini.
--
-- BUKAN POHON SUNGGUHAN. Undangan pernikahan menampilkan dua generasi,
-- bukan silsilah marga. Maka tidak ada kolom induk, tidak ada rujukan ke
-- diri sendiri, tidak ada kedalaman — cuma daftar datar per sisi dengan
-- urutan. Pohon sungguhan itu kerja berlipat untuk tampilan yang justru
-- lebih buruk dibaca di layar selebar 400px.
--
-- SATU SUMBER, BUKAN DUA. `mempelai` sudah menyimpan ayah dan ibu, dan
-- nilainya dipakai di kartu mempelai. Kalau silsilah menyimpannya lagi,
-- cepat atau lambat keduanya berbeda dan tidak ada yang tahu mana yang
-- benar. Jadi nilainya DIPINDAH ke sini, kolom lamanya dibuang, dan
-- undangan_isi() menurunkan kembali `ayah`/`ibu` dari tabel ini.
-- Bentuk jawaban untuk halaman tidak berubah sama sekali — yang berubah
-- cuma dari mana nilainya berasal.

create table if not exists public.silsilah (
  id          uuid primary key default gen_random_uuid(),
  pasangan_id uuid not null references public.pasangan (id) on delete cascade,
  sisi        text not null check (sisi in ('pria','wanita')),
  urutan      int  not null default 0,
  peran       text not null,
  nama        text not null,
  keterangan  text,
  foto_jalur  text,
  foto_kecil  text,
  lebar       int,
  tinggi      int,
  tampil      boolean not null default true
);

comment on table  public.silsilah        is 'Dua generasi per sisi, daftar datar. Bukan pohon.';
comment on column public.silsilah.peran  is 'Ayah, Ibu, Kakek, Nenek, …';
comment on column public.silsilah.keterangan is '(Alm), (Almh), atau kosong';

create index if not exists silsilah_pasangan_idx
  on public.silsilah (pasangan_id, sisi, urutan);

alter table public.silsilah enable row level security;

drop policy if exists "silsilah panitia" on public.silsilah;
create policy "silsilah panitia" on public.silsilah
  for all to authenticated
  using      (pasangan_id in (select public.pasangan_saya()))
  with check (pasangan_id in (select public.pasangan_saya()));

-- ---------------------------------------------------------------------------
-- Pindahkan orang tua dari `mempelai`
-- ---------------------------------------------------------------------------

insert into public.silsilah (pasangan_id, sisi, urutan, peran, nama, keterangan)
select m.pasangan_id, m.sisi, 1, 'Ayah', m.ayah, nullif(btrim(m.ayah_ket), '')
  from public.mempelai m
 where coalesce(btrim(m.ayah), '') <> ''
   and not exists (select 1 from public.silsilah s
                    where s.pasangan_id = m.pasangan_id and s.sisi = m.sisi and s.peran = 'Ayah');

insert into public.silsilah (pasangan_id, sisi, urutan, peran, nama, keterangan)
select m.pasangan_id, m.sisi, 2, 'Ibu', m.ibu, nullif(btrim(m.ibu_ket), '')
  from public.mempelai m
 where coalesce(btrim(m.ibu), '') <> ''
   and not exists (select 1 from public.silsilah s
                    where s.pasangan_id = m.pasangan_id and s.sisi = m.sisi and s.peran = 'Ibu');

-- Jangan buang kolom lamanya sebelum benar-benar yakin isinya sudah
-- pindah. Kalau ada satu saja yang tertinggal, migrasinya berhenti di
-- sini dengan kolom lama masih utuh.
do $$
declare tertinggal int;
begin
  select count(*) into tertinggal
    from public.mempelai m
   where (coalesce(btrim(m.ayah),'') <> '' and not exists (
            select 1 from public.silsilah s
             where s.pasangan_id=m.pasangan_id and s.sisi=m.sisi and s.peran='Ayah'))
      or (coalesce(btrim(m.ibu),'')  <> '' and not exists (
            select 1 from public.silsilah s
             where s.pasangan_id=m.pasangan_id and s.sisi=m.sisi and s.peran='Ibu'));
  if tertinggal > 0 then
    raise exception 'Ada % baris mempelai yang orang tuanya belum pindah ke silsilah', tertinggal;
  end if;
end $$;

alter table public.mempelai
  drop column if exists ayah,
  drop column if exists ayah_ket,
  drop column if exists ibu,
  drop column if exists ibu_ket;

-- ---------------------------------------------------------------------------
-- RPC pengelola
-- ---------------------------------------------------------------------------

create or replace function public.silsilah_daftar(p_token text)
returns table (
  id uuid, sisi text, urutan int, peran text, nama text, keterangan text,
  foto_jalur text, foto_kecil text, lebar int, tinggi int, tampil boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a public.panitia_akses;
begin
  a := public._panitia_penuh(p_token);
  return query
    select s.id, s.sisi, s.urutan, s.peran, s.nama, s.keterangan,
           s.foto_jalur, s.foto_kecil, s.lebar, s.tinggi, s.tampil
      from public.silsilah s
     where s.pasangan_id = a.pasangan_id
     order by s.sisi, s.urutan, s.peran;
end $$;

-- p_id null berarti menambah baris baru.
create or replace function public.silsilah_simpan(
  p_token text, p_id uuid, p_sisi text, p_peran text, p_nama text,
  p_keterangan text default null, p_urutan int default null,
  p_tampil boolean default null)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
-- Variabel lokal sengaja diberi awalan v_: memberinya nama yang sama
-- dengan nama kolom membuat `set peran = peran` jadi ambigu, dan yang
-- seperti itu diam-diam berubah arti tergantung setelan peramban SQL.
declare a public.panitia_akses; hasil uuid; v_nama text; v_peran text;
begin
  a := public._panitia_penuh(p_token);

  v_nama  := btrim(coalesce(p_nama, ''));
  v_peran := btrim(coalesce(p_peran, ''));
  if v_nama = '' or char_length(v_nama) > 80 then
    raise exception 'Nama harus 1 sampai 80 huruf' using errcode = '22001';
  end if;
  if v_peran = '' or char_length(v_peran) > 40 then
    raise exception 'Peran harus 1 sampai 40 huruf' using errcode = '22001';
  end if;
  if p_sisi not in ('pria','wanita') then
    raise exception 'Sisi harus pria atau wanita' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.silsilah (pasangan_id, sisi, urutan, peran, nama, keterangan)
    values (a.pasangan_id, p_sisi,
            coalesce(p_urutan, (select coalesce(max(s.urutan),0)+1 from public.silsilah s
                                 where s.pasangan_id=a.pasangan_id and s.sisi=p_sisi)),
            v_peran, v_nama, nullif(btrim(coalesce(p_keterangan,'')),''))
    returning id into hasil;
  else
    update public.silsilah s
       set sisi       = p_sisi,
           peran      = v_peran,
           nama       = v_nama,
           keterangan = nullif(btrim(coalesce(p_keterangan,'')),''),
           urutan     = coalesce(p_urutan, s.urutan),
           tampil     = coalesce(p_tampil, s.tampil)
     where s.id = p_id and s.pasangan_id = a.pasangan_id
    returning s.id into hasil;
    if hasil is null then
      raise exception 'Baris silsilah tidak ditemukan' using errcode = 'P0002';
    end if;
  end if;

  return hasil;
end $$;

grant execute on function public.silsilah_daftar(text) to anon, authenticated;
grant execute on function public.silsilah_simpan(text, uuid, text, text, text, text, int, boolean)
  to anon, authenticated;
