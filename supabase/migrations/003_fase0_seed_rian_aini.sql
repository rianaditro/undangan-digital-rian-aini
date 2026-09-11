-- ============================================================
--  FASE 0 — langkah 2: Rian & 'Aini jadi pasangan pertama
--  Nilainya dipindahkan apa adanya dari assets/varian.js.
-- ============================================================

insert into public.pasangan
  (slug, canonical_host, paket, status, terbit, tanggal_acara, masa_aktif, hapus_pada, tema)
values
  ('rian-aini', 'rian-aini.mengundang.id', 'lengkap', 'aktif', true,
   date '2026-09-15', date '2027-09-15', date '2027-12-14', 'ukir-jepara')
on conflict (slug) do nothing;

insert into public.mempelai (pasangan_id, sisi, panggilan, lengkap, peran, anak, ayah, ayah_ket, ibu, ibu_ket)
select p.id, v.* from public.pasangan p cross join (values
  ('pria',   'RIAN',   'RIAN ADI SAPUTRO',       'Mempelai Pria',   'Putra dari',
   'Bapak Joko Sudarno', '(Alm)', 'Ibu Sri Kanah',  '(Almh)'),
  ('wanita', '''AINI', 'NURUL ZAKIYATUL ''AINI', 'Mempelai Wanita', 'Putri dari',
   'Bapak Surahmad',     '',      'Ibu Robi''atun', '(Almh)')
) as v(sisi, panggilan, lengkap, peran, anak, ayah, ayah_ket, ibu, ibu_ket)
where p.slug = 'rian-aini'
on conflict (pasangan_id, sisi) do nothing;

insert into public.tempat (pasangan_id, kode, nama, alamat, ringkas, maps)
select p.id, v.* from public.pasangan p cross join (values
  ('wanita', 'Kediaman Mempelai Putri',
   'Jalan Pesajen RT 03 / RW 04, Demaan, Jepara, Jawa Tengah',
   'Jl. Pesajen RT 03/04, Demaan, Jepara',
   'https://maps.app.goo.gl/xSdwqbrQoHadeU2A6'),
  ('pria',   'Kediaman Mempelai Putra',
   'Jalan Pesajen RT 01 / RW 04, Demaan, Jepara, Jawa Tengah',
   'Jl. Pesajen RT 01/04, Demaan, Jepara',
   'https://goo.gl/maps/HbCrjVDvgopegQHW8')
) as v(kode, nama, alamat, ringkas, maps)
where p.slug = 'rian-aini'
on conflict (pasangan_id, kode) do nothing;

-- Akad dikunci ke tempat sisi wanita; resepsi dibiarkan kosong supaya
-- mengikuti pihak tamunya.
insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas, mulai, tempat_id)
select p.id, 1, 'Akad Nikah', 'Selasa, 15 September 2026', 'Pukul 13.00 WIB',
       'Akad 13.00 WIB', timestamptz '2026-09-15 13:00:00+07',
       (select t.id from public.tempat t where t.pasangan_id = p.id and t.kode = 'wanita')
  from public.pasangan p where p.slug = 'rian-aini'
   and not exists (select 1 from public.acara a where a.pasangan_id = p.id and a.urutan = 1);

insert into public.acara (pasangan_id, urutan, nama, tanggal, jam, ringkas, mulai, tempat_id)
select p.id, 2, 'Resepsi', 'Selasa, 15 September 2026', 'Pukul 16.00 WIB — selesai',
       'Resepsi 16.00 WIB', timestamptz '2026-09-15 16:00:00+07', null
  from public.pasangan p where p.slug = 'rian-aini'
   and not exists (select 1 from public.acara a where a.pasangan_id = p.id and a.urutan = 2);

insert into public.dompet (pasangan_id, kode, bank, nomor, atas_nama)
select p.id, v.* from public.pasangan p cross join (values
  ('rian', 'SeaBank', '901316451657', 'a.n. Rian Adi Saputro'),
  ('aini', 'DANA',    '085727641452', 'a.n. Nurul Zakiyatul ''Aini')
) as v(kode, bank, nomor, atas_nama)
where p.slug = 'rian-aini'
on conflict (pasangan_id, kode) do nothing;

insert into public.pihak
  (pasangan_id, kode, kode_pendek, label, sisi, urutan_nama, urutan_dompet, ttd_label, ttd_sub)
select p.id, v.* from public.pasangan p cross join (values
  ('pria',            'p',  'Pengantin Pria',        'pria',
   array['RIAN','''AINI'], array['rian','aini'],
   'Kami yang berbahagia', 'Beserta Keluarga'),
  ('keluarga-pria',   'kp', 'Keluarga Pihak Pria',   'pria',
   array['RIAN','''AINI'], array['rian','aini'],
   'Hormat kami', 'Beserta Keluarga Besar Bapak Joko Sudarno (Alm) & Ibu Sri Kanah (Almh)'),
  ('wanita',          'w',  'Pengantin Wanita',      'wanita',
   array['''AINI','RIAN'], array['aini','rian'],
   'Kami yang berbahagia', 'Beserta Keluarga'),
  ('keluarga-wanita', 'kw', 'Keluarga Pihak Wanita', 'wanita',
   array['''AINI','RIAN'], array['aini','rian'],
   'Hormat kami', 'Beserta Keluarga Besar Bapak Surahmad & Ibu Robi''atun (Almh)')
) as v(kode, kode_pendek, label, sisi, urutan_nama, urutan_dompet, ttd_label, ttd_sub)
where p.slug = 'rian-aini'
on conflict (pasangan_id, kode) do nothing;
