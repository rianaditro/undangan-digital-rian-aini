-- Uji hak eksekusi: fungsi dalaman tidak boleh dijalankan dari peramban.
--
-- Supabase memberi EXECUTE ke anon dan authenticated untuk setiap fungsi
-- baru di public (default privileges), jadi `revoke ... from public` saja
-- tidak menutup apa-apa. Itu yang lolos di 023: pasangan_siapkan versi
-- tujuh argumen sempat bisa dipanggil anon. Uji ini membaca katalog, jadi
-- fungsi baru yang lupa dicabut haknya ikut tertangkap tanpa perlu
-- didaftarkan di sini.
--
-- Hanya membaca. Tetap diakhiri raise supaya bentuknya sama dengan uji
-- lain dan aman dijalankan di produksi.
do $$
declare
  lap   text := '';
  lulus int  := 0;
  gagal int  := 0;
  r     record;
begin
  for r in
    select p.oid::regprocedure as f,
           has_function_privilege('anon', p.oid, 'execute')          as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like '\_%'
            or p.proname in ('pasangan_siapkan', 'admin_pertama', 'panitia_pasangan_penuh'))
     order by 1::text
  loop
    if r.anon or r.auth then
      gagal := gagal + 1;
      lap := lap || format(E'GAGAL  %s bisa dijalankan%s%s\n', r.f,
                           case when r.anon then ' anon' else '' end,
                           case when r.auth then ' authenticated' else '' end);
    else
      lulus := lulus + 1;
      lap := lap || format(E'ok     %s tertutup\n', r.f);
    end if;
  end loop;

  if lulus + gagal = 0 then
    gagal := 1; lap := E'GAGAL  tidak ada fungsi yang diperiksa — saringannya salah\n';
  end if;

  raise exception E'\n===== LAPORAN UJI HAK FUNGSI =====\n%\nLULUS %  GAGAL %\n(transaksi dibatalkan)\n',
    lap, lulus, gagal;
end $$;
