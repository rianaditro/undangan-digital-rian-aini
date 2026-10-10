// drive-impor — membaca folder Google Drive yang dibagikan pasangan.
//
// Fotografer biasanya menyerahkan hasilnya sebagai folder Drive. Fungsi
// ini TIDAK menyimpan apa pun: ia cuma
//
//   GET ?folder=<link atau id>  → daftar foto/video di folder itu (dan
//                                  subfoldernya, dua tingkat)
//   GET ?unduh=<id berkas>      → isi satu berkas, diteruskan apa adanya
//
// Dasbor yang mengecilkan foto dan memotret poster video, lalu
// mengunggahnya lewat foto-unggah seperti berkas dari HP. Jadi batas
// jumlah, batas ukuran, bab, dan potongan berlaku sama persis, dan
// halaman kenangan tidak pernah bergantung pada Drive sesudah diimpor.
//
// Kenapa lewat sini, bukan langsung dari peramban ke Google: kunci API
// tidak boleh sampai ke peramban, dan unduhan Drive tidak membawa CORS.
//
// Hanya pemilik undangan yang login yang boleh memakai fungsi ini,
// supaya ia tidak jadi proksi unduh terbuka untuk siapa saja.
//
// Folder harus dibagikan "Siapa saja yang memiliki link"; folder pribadi
// memang tidak terbaca dengan kunci API, dan pesannya mengatakan itu.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DRIVE = Deno.env.get('DRIVE_API') ?? 'https://www.googleapis.com/drive/v3';
const BATAS_JUMLAH       = 100;              // sama dengan foto-unggah
const BATAS_JUMLAH_VIDEO = 12;
const BATAS_DAFTAR       = 500;              // berkas per folder yang didaftar
const BATAS_UNDUH_FOTO   = 40 * 1024 * 1024; // foto kamera besar; dikecilkan di dasbor
const BATAS_UNDUH_VIDEO  = 20 * 1024 * 1024; // sama dengan batas video foto-unggah
const FOLDER = 'application/vnd.google-apps.folder';
const BOLEH  = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|webm|quicktime))$/;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jawab(isi: unknown, status = 200) {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Link folder datang dalam banyak bentuk: /drive/folders/ID,
// /drive/u/0/folders/ID?usp=sharing, open?id=ID, atau id saja.
function idDrive(nilai: string): string | null {
  const t = (nilai ?? '').trim();
  const m = t.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
         || t.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || t.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : null;
}

// Pemilik, dan pasangan mana yang sedang diurusnya — aturan yang sama
// dengan foto-unggah.
async function siapa(db: any, req: Request): Promise<[string | null, Response | null]> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return [null, jawab({ pesan: 'Belum masuk' }, 401)];
  const { data: sesi, error } = await db.auth.getUser(jwt);
  if (error || !sesi?.user) return [null, jawab({ pesan: 'Sesi tidak sah' }, 401)];

  const { data: milik } = await db.from('pemilik').select('pasangan_id').eq('user_id', sesi.user.id);
  const daftar: string[] = (milik ?? []).map((m: any) => m.pasangan_id);
  if (!daftar.length) return [null, jawab({ pesan: 'Akun ini belum dihubungkan ke undangan mana pun' }, 403)];

  const diminta = new URL(req.url).searchParams.get('pasangan');
  if (diminta) {
    if (!daftar.includes(diminta)) return [null, jawab({ pesan: 'Bukan undangan Anda' }, 403)];
    return [diminta, null];
  }
  if (daftar.length > 1) return [null, jawab({ pesan: 'Akun ini memegang beberapa undangan; sebutkan yang mana' }, 409)];
  return [daftar[0], null];
}

async function drive(jalur: string, kunci: string, cari: Record<string, string> = {}) {
  const u = new URL(DRIVE + jalur);
  for (const [k, v] of Object.entries(cari)) u.searchParams.set(k, v);
  u.searchParams.set('key', kunci);
  u.searchParams.set('supportsAllDrives', 'true');
  return await fetch(u);
}

// Pesan Google diterjemahkan ke yang bisa ditindaklanjuti pasangan.
async function salahDrive(r: Response, apa: string) {
  let alasan = '';
  try { alasan = (await r.json())?.error?.errors?.[0]?.reason ?? ''; } catch { /* bukan json */ }
  if (r.status === 404) {
    return jawab({ pesan: `${apa} tidak ditemukan. Pastikan linknya benar dan dibagikan "Siapa saja yang memiliki link".` }, 404);
  }
  if (r.status === 403 && /rateLimit|userRateLimit|quota/i.test(alasan)) {
    return jawab({ pesan: 'Google sedang membatasi akses. Coba lagi beberapa menit lagi.' }, 429);
  }
  if (r.status === 403 || r.status === 401) {
    return jawab({ pesan: `${apa} belum bisa dibaca. Ubah aksesnya jadi "Siapa saja yang memiliki link".` }, 403);
  }
  console.error('drive gagal', r.status, alasan);
  return jawab({ pesan: 'Google Drive tidak menjawab. Coba lagi.' }, 502);
}

const MEDAN = 'nextPageToken,files(id,name,mimeType,size,thumbnailLink,'
  + 'imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height,durationMillis))';

async function daftar(db: any, pasanganId: string, nilai: string, kunci: string) {
  const id = idDrive(nilai);
  if (!id) return jawab({ pesan: 'Itu bukan link folder Google Drive' }, 400);

  const r = await drive(`/files/${id}`, kunci, { fields: 'id,name,mimeType' });
  if (!r.ok) return await salahDrive(r, 'Folder');
  const akar = await r.json();
  if (akar.mimeType !== FOLDER) return jawab({ pesan: 'Link ini menuju satu berkas, bukan folder. Bagikan foldernya.' }, 400);

  // Telusur melebar, dua tingkat subfolder: fotografer sering memisah
  // "Akad", "Resepsi", "Keluarga" jadi folder sendiri.
  const antre: { id: string; sub: string; tingkat: number }[] = [{ id, sub: '', tingkat: 0 }];
  const berkas: any[] = [];
  let terpotong = false;
  while (antre.length) {
    const f = antre.shift()!;
    let halaman: string | undefined;
    do {
      const cari: Record<string, string> = {
        q: `'${f.id}' in parents and trashed = false`,
        fields: MEDAN, pageSize: '1000', orderBy: 'folder,name_natural',
        includeItemsFromAllDrives: 'true',
      };
      if (halaman) cari.pageToken = halaman;
      const rr = await drive('/files', kunci, cari);
      if (!rr.ok) return await salahDrive(rr, 'Isi folder');
      const isi = await rr.json();
      for (const x of isi.files ?? []) {
        if (x.mimeType === FOLDER) {
          if (f.tingkat < 2) antre.push({ id: x.id, sub: f.sub ? `${f.sub} / ${x.name}` : x.name, tingkat: f.tingkat + 1 });
          continue;
        }
        if (!BOLEH.test(x.mimeType)) continue;
        if (berkas.length >= BATAS_DAFTAR) { terpotong = true; continue; }
        const m = x.imageMediaMetadata ?? x.videoMediaMetadata ?? {};
        // Foto kamera yang diputar 90°/270° menukar lebar dan tinggi.
        const putar = x.imageMediaMetadata?.rotation === 1 || x.imageMediaMetadata?.rotation === 3;
        berkas.push({
          id: x.id,
          nama: x.name,
          jenis: x.mimeType,
          bita: x.size ? Number(x.size) : null,
          lebar:  (putar ? m.height : m.width) ?? null,
          tinggi: (putar ? m.width : m.height) ?? null,
          durasi_ms: x.videoMediaMetadata?.durationMillis ? Number(x.videoMediaMetadata.durationMillis) : null,
          kecil: x.thumbnailLink ?? null,
          sub: f.sub,
        });
      }
      halaman = isi.nextPageToken;
    } while (halaman);
  }

  const [{ count: terpakai }, { count: video }] = await Promise.all([
    db.from('foto').select('id', { count: 'exact', head: true }).eq('pasangan_id', pasanganId),
    db.from('foto').select('id', { count: 'exact', head: true }).eq('pasangan_id', pasanganId).eq('jenis', 'video'),
  ]);

  return jawab({
    folder: { id, nama: akar.name },
    berkas, terpotong,
    terpakai: terpakai ?? 0, batas: BATAS_JUMLAH,
    terpakai_video: video ?? 0, batas_video: BATAS_JUMLAH_VIDEO,
  });
}

async function unduh(nilai: string, kunci: string) {
  const id = idDrive(nilai);
  if (!id) return jawab({ pesan: 'id berkas tidak sah' }, 400);

  // Jenis dan ukuran diperiksa dari metadata SEBELUM mengunduh: fungsi
  // ini tidak boleh jadi jalan mengunduh berkas apa saja sebesar apa saja.
  const r = await drive(`/files/${id}`, kunci, { fields: 'id,name,mimeType,size' });
  if (!r.ok) return await salahDrive(r, 'Berkas');
  const meta = await r.json();
  if (!BOLEH.test(meta.mimeType)) return jawab({ pesan: `Jenis ${meta.mimeType} tidak diimpor` }, 415);
  const video = meta.mimeType.startsWith('video/');
  const batas = video ? BATAS_UNDUH_VIDEO : BATAS_UNDUH_FOTO;
  if (Number(meta.size ?? 0) > batas) {
    return jawab({ pesan: video ? 'Video lebih dari 20 MB' : 'Foto lebih dari 40 MB' }, 413);
  }

  const isi = await drive(`/files/${id}`, kunci, { alt: 'media' });
  if (!isi.ok || !isi.body) return await salahDrive(isi, 'Berkas');
  return new Response(isi.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': meta.mimeType,
      // Tanpa Content-Length dari metadata: kalau angkanya meleset dari
      // isi yang sungguh mengalir, sambungannya diputus di tengah.
      'Cache-Control': 'private, no-store',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return jawab({ pesan: 'Metode tidak didukung' }, 405);

  const kunci = Deno.env.get('GOOGLE_API_KEY');
  if (!kunci) return jawab({ pesan: 'Impor Google Drive belum disiapkan pengelola (kunci API belum dipasang)' }, 503);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
                         { auth: { persistSession: false } });
  const [pasanganId, tolakan] = await siapa(db, req);
  if (tolakan) return tolakan;

  const u = new URL(req.url);
  try {
    if (u.searchParams.has('folder')) return await daftar(db, pasanganId!, u.searchParams.get('folder')!, kunci);
    if (u.searchParams.has('unduh'))  return await unduh(u.searchParams.get('unduh')!, kunci);
    return jawab({ pesan: 'Sebutkan folder atau unduh' }, 400);
  } catch (e) {
    console.error('drive-impor gagal:', e);
    return jawab({ pesan: 'Gagal membaca Google Drive' }, 500);
  }
});
