-- ============================================================
--  FASE 0 — langkah 3: pasangan_id masuk ke tabel yang hidup
--
--  BATASAN: undangan Rian & 'Aini sedang berjalan. Frontend yang
--  sudah ter-deploy TIDAK boleh rusak. Karena itu tiap kolom baru
--  diberi nilai bawaan yang menunjuk ke pasangan pertama — INSERT
--  dari halaman lama yang tidak menyebut pasangan_id tetap mendarat
--  di tempat yang benar.
-- ============================================================

-- Bawaan lewat fungsi, bukan konstanta, supaya migrasi ini tetap
-- benar di database mana pun.
create or replace function public.pasangan_bawaan()
returns uuid language sql stable as $$
  select id from public.pasangan order by dibuat limit 1;
$$;

alter table public.tamu          add column if not exists pasangan_id uuid;
alter table public.pengiriman    add column if not exists pasangan_id uuid;
alter table public.ucapan        add column if not exists pasangan_id uuid;
alter table public.panitia_akses add column if not exists pasangan_id uuid;

update public.tamu          set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
update public.pengiriman    set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
update public.ucapan        set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;
update public.panitia_akses set pasangan_id = public.pasangan_bawaan() where pasangan_id is null;

alter table public.tamu          alter column pasangan_id set default public.pasangan_bawaan();
alter table public.pengiriman    alter column pasangan_id set default public.pasangan_bawaan();
alter table public.ucapan        alter column pasangan_id set default public.pasangan_bawaan();
alter table public.panitia_akses alter column pasangan_id set default public.pasangan_bawaan();

alter table public.tamu          alter column pasangan_id set not null;
alter table public.pengiriman    alter column pasangan_id set not null;
alter table public.panitia_akses alter column pasangan_id set not null;
-- ucapan sengaja boleh kosong: ada baris dari sebelum platform

alter table public.tamu          drop constraint if exists tamu_pasangan_fk;
alter table public.tamu          add  constraint tamu_pasangan_fk
  foreign key (pasangan_id) references public.pasangan(id) on delete cascade;
alter table public.pengiriman    drop constraint if exists pengiriman_pasangan_fk;
alter table public.pengiriman    add  constraint pengiriman_pasangan_fk
  foreign key (pasangan_id) references public.pasangan(id) on delete cascade;
alter table public.ucapan        drop constraint if exists ucapan_pasangan_fk;
alter table public.ucapan        add  constraint ucapan_pasangan_fk
  foreign key (pasangan_id) references public.pasangan(id) on delete cascade;
alter table public.panitia_akses drop constraint if exists panitia_akses_pasangan_fk;
alter table public.panitia_akses add  constraint panitia_akses_pasangan_fk
  foreign key (pasangan_id) references public.pasangan(id) on delete cascade;

create index if not exists tamu_pasangan_idx       on public.tamu (pasangan_id);
create index if not exists pengiriman_pasangan_idx on public.pengiriman (pasangan_id);
create index if not exists ucapan_pasangan_idx     on public.ucapan (pasangan_id);
create index if not exists akses_pasangan_idx      on public.panitia_akses (pasangan_id);

-- Slug tamu hanya unik DALAM satu pasangan. Pelonggaran, bukan
-- pengetatan, jadi tidak ada baris yang jadi melanggar.
drop index if exists public.tamu_slug_idx;
create unique index if not exists tamu_slug_pasangan_idx
  on public.tamu (pasangan_id, slug);

-- Rekap setelah acara (alur 1.16): pengantin mengetik siapa datang
-- dan siapa memberi apa. Tidak butuh sinkronisasi offline.
alter table public.tamu add column if not exists datang boolean;

create table if not exists public.pemberian (
  id      uuid primary key default gen_random_uuid(),
  tamu_id uuid not null references public.tamu(id) on delete cascade,
  jenis   text not null check (jenis in ('uang','transfer','barang','tenaga')),
  nominal bigint,
  barang  text,
  catatan text,
  -- selalu kosong di fase 1; disiapkan supaya buku paralel di fase 3
  -- tidak perlu migrasi data
  buku_id uuid,
  dicatat timestamptz not null default now()
);

create index if not exists pemberian_tamu_idx on public.pemberian (tamu_id);

alter table public.pemberian enable row level security;
drop policy if exists "pemberian panitia" on public.pemberian;
create policy "pemberian panitia" on public.pemberian
  for all to authenticated using (true) with check (true);
