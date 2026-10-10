// /media/* — foto dan video pasangan, disimpan di Cloudflare R2.
//
// Kenapa di sini dan bukan di Supabase Storage: kuota gratis Supabase
// 1 GB simpanan dan 5 GB egress per bulan, sementara R2 10 GB simpanan
// dan egress-nya tidak dihitung. Satu halaman kenangan berisi video bisa
// puluhan MB per tamu.
//
// Alamatnya relatif (/media/<pasangan>/<uuid>.webp) dan dilayani di
// setiap host Worker ini — mengundang.id, subdomain pasangan,
// workers.dev — jadi halaman dan dasbor tidak butuh CORS. Cache edge
// dipakai bersama semua host: kuncinya selalu mengundang.id.
//
//   GET/HEAD  baca. Kalau belum ada di R2, diambil SEKALI dari Supabase
//             Storage (berkas lama, atau unggahan lewat jalan lama) lalu
//             disalin ke R2. Tidak perlu skrip pindahan.
//   PUT       tulis, hanya dengan tiket dari foto-unggah
//   DELETE    hapus, hanya dengan tiket dari foto-unggah
//
// Tiket = HMAC-SHA256 dengan MEDIA_KUNCI (rahasia yang sama dipasang di
// Worker dan di fungsi foto-unggah) atas
//
//     aksi \n kunci \n jenis \n batas-bita \n kedaluwarsa(detik unix)
//
// Semua pemeriksaan sungguhan — pemilik, kuota, jenis, ukuran — tetap di
// foto-unggah; Worker cuma memastikan tiketnya asli, belum kedaluwarsa,
// dan isinya sesuai yang ditandatangani.

export const POLA_KUNCI = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(-kecil)?\.(webp|jpg|png|mp4|webm)$/;
const ASAL_CACHE = 'https://mengundang.id/media/';
const SETAHUN = 'public, max-age=31536000, immutable';
const JENIS_DARI_EKS = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', webm: 'video/webm' };

const enk = new TextEncoder();

export async function tandatangan(rahasia, aksi, kunci, jenis, batas, kedaluwarsa) {
  const k = await crypto.subtle.importKey('raw', enk.encode(rahasia), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enk.encode([aksi, kunci, jenis, batas, kedaluwarsa].join('\n')));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Perbandingan waktu-tetap: tanda yang hampir benar tidak boleh lebih
// cepat ditolak daripada yang salah total.
function sama(a, b) {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

function teks(pesan, status, tambahan = {}) {
  return new Response(JSON.stringify({ pesan }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...tambahan },
  });
}

async function tiketSah(request, env, aksi, kunci, jenis) {
  if (!env.MEDIA_KUNCI) return [false, teks('Penyimpanan media belum disiapkan', 503)];
  const tanda = request.headers.get('x-media-tanda') || '';
  const batas = request.headers.get('x-media-batas') || '';
  const kedaluwarsa = request.headers.get('x-media-kedaluwarsa') || '';
  if (!tanda || !/^\d+$/.test(batas) || !/^\d+$/.test(kedaluwarsa)) return [false, teks('Tiket tidak ada', 401)];
  if (Number(kedaluwarsa) < Date.now() / 1000) return [false, teks('Tiket sudah kedaluwarsa', 401)];
  const harus = await tandatangan(env.MEDIA_KUNCI, aksi, kunci, jenis, batas, kedaluwarsa);
  if (!sama(tanda, harus)) return [false, teks('Tiket tidak sah', 403)];
  return [true, Number(batas)];
}

function kepalaObjek(obj, jenisCadangan) {
  const h = new Headers();
  if (obj.writeHttpMetadata) obj.writeHttpMetadata(h);
  if (!h.get('Content-Type')) h.set('Content-Type', jenisCadangan);
  h.set('Cache-Control', SETAHUN);
  h.set('Accept-Ranges', 'bytes');
  if (obj.httpEtag) h.set('ETag', obj.httpEtag);
  h.set('Access-Control-Allow-Origin', '*');
  return h;
}

// Berkas yang belum ada di R2: ambil dari Supabase Storage, simpan, layani.
async function salinDariSupabase(env, kunci) {
  if (!env.SUPABASE_FOTO) return null;
  const r = await fetch(env.SUPABASE_FOTO + kunci);
  if (!r.ok) return null;
  const jenis = r.headers.get('Content-Type') || JENIS_DARI_EKS[kunci.split('.').pop()];
  const isi = await r.arrayBuffer();
  await env.MEDIA.put(kunci, isi, { httpMetadata: { contentType: jenis, cacheControl: SETAHUN } });
  return await env.MEDIA.get(kunci);
}

export async function layaniMedia(request, env, ctx) {
  const url = new URL(request.url);
  const kunci = decodeURIComponent(url.pathname.slice('/media/'.length));
  if (!POLA_KUNCI.test(kunci)) return teks('Tidak ditemukan', 404);
  if (!env.MEDIA) return teks('Penyimpanan media belum disiapkan', 503);
  const jenisEks = JENIS_DARI_EKS[kunci.split('.').pop()];
  const m = request.method;

  if (m === 'PUT') {
    const jenis = request.headers.get('Content-Type') || '';
    // Jenis harus cocok dengan ekstensi kuncinya: tidak ada .webp yang
    // diam-diam berisi HTML.
    if (jenis !== jenisEks) return teks('Jenis berkas tidak cocok', 415);
    const [ok, batasAtauGalat] = await tiketSah(request, env, 'unggah', kunci, jenis);
    if (!ok) return batasAtauGalat;
    const panjang = Number(request.headers.get('Content-Length') || NaN);
    if (!Number.isFinite(panjang)) return teks('Ukuran berkas tidak disebut', 411);
    if (panjang > batasAtauGalat) return teks('Berkas lebih besar dari izinnya', 413);
    // Satu kunci ditulis sekali: tiket yang bocor tidak bisa dipakai
    // menimpa berkas yang sudah tampil. (Kuncinya uuid baru per tiket,
    // jadi balapan dua penulis untuk kunci yang sama tidak terjadi.)
    if (await env.MEDIA.head(kunci)) return teks('Berkas sudah ada', 409);
    const tulis = await env.MEDIA.put(kunci, request.body, {
      httpMetadata: { contentType: jenis, cacheControl: SETAHUN },
    });
    return new Response(JSON.stringify({ kunci, bita: tulis.size }), {
      status: 201, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  if (m === 'DELETE') {
    const [ok, galat] = await tiketSah(request, env, 'hapus', kunci, '');
    if (!ok) return galat;
    await env.MEDIA.delete(kunci);
    if (typeof caches !== 'undefined') ctx?.waitUntil?.(caches.default.delete(ASAL_CACHE + kunci));
    return new Response(null, { status: 204 });
  }

  if (m === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD',
      'Access-Control-Allow-Headers': 'range', 'Access-Control-Max-Age': '86400' } });
  }
  if (m !== 'GET' && m !== 'HEAD') return teks('Metode tidak didukung', 405);

  if (m === 'HEAD') {
    let obj = await env.MEDIA.head(kunci);
    if (!obj) obj = await salinDariSupabase(env, kunci);
    if (!obj) return new Response(null, { status: 404 });
    const h = kepalaObjek(obj, jenisEks);
    h.set('Content-Length', String(obj.size));
    return new Response(null, { status: 200, headers: h });
  }

  // GET dengan Range (video yang digulir): langsung ke R2, tanpa cache.
  const rentang = request.headers.get('Range');
  if (rentang) {
    let obj = await env.MEDIA.get(kunci, { range: request.headers });
    if (!obj) { await salinDariSupabase(env, kunci); obj = await env.MEDIA.get(kunci, { range: request.headers }); }
    if (!obj) return teks('Tidak ditemukan', 404);
    const h = kepalaObjek(obj, jenisEks);
    if (obj.range && 'offset' in obj.range) {
      const awal = obj.range.offset, panjang = obj.range.length ?? (obj.size - awal);
      h.set('Content-Range', `bytes ${awal}-${awal + panjang - 1}/${obj.size}`);
      h.set('Content-Length', String(panjang));
      return new Response(obj.body, { status: 206, headers: h });
    }
    return new Response(obj.body, { status: 200, headers: h });
  }

  // GET utuh: cache edge dulu (satu kunci untuk semua host), lalu R2.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const kunciCache = new Request(ASAL_CACHE + kunci);
  if (cache) {
    const ada = await cache.match(kunciCache);
    if (ada) return ada;
  }
  let obj = await env.MEDIA.get(kunci);
  if (!obj) obj = await salinDariSupabase(env, kunci);
  if (!obj) return teks('Tidak ditemukan', 404, { 'Cache-Control': 'public, max-age=60' });
  const h = kepalaObjek(obj, jenisEks);
  h.set('Content-Length', String(obj.size));
  const jawaban = new Response(obj.body, { status: 200, headers: h });
  if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(kunciCache, jawaban.clone()));
  return jawaban;
}
