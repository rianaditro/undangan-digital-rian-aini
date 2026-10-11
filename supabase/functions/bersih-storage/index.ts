// bersih-storage — alat sekali-pakai: membuang salinan foto di Supabase
// Storage yang SUDAH ada di R2 (Worker /media/*).
//
// Untuk setiap berkas di bucket `foto`:
//   1. HEAD <MEDIA_ASAL>/media/<jalur>. Worker menyalin berkas yang belum
//      ada di R2 dari Supabase pada saat itu juga (cloudflare/media.js),
//      jadi yang belum pernah dibuka ikut tersalin di sini.
//   2. Hanya kalau Worker menjawab 200 DAN ukurannya sama persis dengan
//      di Supabase, salinan Supabase dihapus. Selain itu dibiarkan.
//
// Bawaannya cuma laporan. Menghapus sungguhan: ?jalankan=1.
// Hanya dengan kunci service role (Supabase → Edge Functions →
// bersih-storage → Test, role service_role): anon key yang tertanam di
// halaman publik tidak cukup.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MEDIA_ASAL = (Deno.env.get('MEDIA_ASAL') ?? 'https://mengundang.id').replace(/\/$/, '');
const SERVIS = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function jawab(isi: unknown, status = 200) {
  return new Response(JSON.stringify(isi, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

// Kunci servis bisa datang sebagai JWT lama atau kunci sb_secret_ baru;
// yang diterima hanya yang sama dengan milik fungsi ini sendiri, atau JWT
// yang role-nya service_role.
function servis(req: Request): boolean {
  const t = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
         || (req.headers.get('apikey') ?? '').trim();
  if (!t) return false;
  if (SERVIS && t === SERVIS) return true;
  try {
    const isi = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return isi.role === 'service_role';
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (!servis(req)) return jawab({ pesan: 'Hanya dengan kunci service role' }, 403);
  const jalankan = new URL(req.url).searchParams.get('jalankan') === '1';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVIS, { auth: { persistSession: false } });

  // Daftar berkas: dua tingkat (folder pasangan → berkas).
  const { data: folder, error } = await db.storage.from('foto').list('', { limit: 1000 });
  if (error) return jawab({ pesan: 'Gagal membaca bucket', error }, 500);
  const berkas: { jalur: string; bita: number }[] = [];
  for (const f of folder ?? []) {
    if (f.id) { berkas.push({ jalur: f.name, bita: Number(f.metadata?.size ?? -1) }); continue; }
    const { data: isi } = await db.storage.from('foto').list(f.name, { limit: 1000 });
    for (const x of isi ?? []) berkas.push({ jalur: `${f.name}/${x.name}`, bita: Number(x.metadata?.size ?? -1) });
  }

  const hasil: any[] = [];
  for (const b of berkas) {
    let status = 0, bitaR2 = -1;
    try {
      const r = await fetch(`${MEDIA_ASAL}/media/${b.jalur}`, { method: 'HEAD' });
      status = r.status; bitaR2 = Number(r.headers.get('content-length') ?? -1);
    } catch (e) { status = -1; }
    const aman = status === 200 && bitaR2 === b.bita && b.bita > 0;
    hasil.push({ jalur: b.jalur, bita: b.bita, r2: status, bita_r2: bitaR2, aman });
  }

  const aman = hasil.filter(h => h.aman).map(h => h.jalur);
  let terhapus: string[] = [];
  if (jalankan && aman.length) {
    for (let i = 0; i < aman.length; i += 100) {
      const { data, error: e } = await db.storage.from('foto').remove(aman.slice(i, i + 100));
      if (e) return jawab({ pesan: 'Gagal menghapus', e, terhapus }, 500);
      terhapus = terhapus.concat((data ?? []).map((d: any) => d.name));
    }
  }
  return jawab({
    mode: jalankan ? 'HAPUS' : 'laporan saja (tambahkan ?jalankan=1 untuk menghapus)',
    jumlah: hasil.length, aman_dihapus: aman.length, terhapus: terhapus.length,
    tidak_aman: hasil.filter(h => !h.aman),
  });
});
