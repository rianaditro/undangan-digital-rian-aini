// /media/* di Worker (cloudflare/media.js), dengan R2 tiruan di memori
// dan Supabase Storage tiruan untuk penyalinan malas. Sebagian lewat
// server.mjs (jalur HTTP sungguhan: run_worker_first, isi PUT mengalir),
// sebagian memanggil modulnya langsung.
import http from 'node:http';
import { layaniMedia, tandatangan } from '../cloudflare/media.js';
import { R2Tiruan } from './r2-tiruan.mjs';
import { mulai, MEDIA as MEDIA_SERVER, MEDIA_KUNCI } from './server.mjs';

let lulus = 0, gagal = 0;
const cek = (ok, pesan, k) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}${!ok && k ? '  — ' + k : ''}`); };

const P = '6b161239-b345-4558-9e16-83961276a564';
const K = `${P}/2bcbac88-c8c1-4da4-8dd4-f5426fa5c70c.webp`;
const RAHASIA = 'rahasia-uji';

// Supabase Storage tiruan
let ambilSupabase = 0;
const sb = http.createServer((req, res) => {
  ambilSupabase++;
  if (req.url.endsWith('/lama.webp') || req.url.includes('aaaaaaaa-')) {
    res.writeHead(200, { 'content-type': 'image/webp' }); return res.end(Buffer.from('ISI-LAMA'));
  }
  res.writeHead(404); res.end();
});
await new Promise(r => sb.listen(0, '127.0.0.1', r));
const SUPABASE_FOTO = `http://127.0.0.1:${sb.address().port}/storage/v1/object/public/foto/`;

const r2 = new R2Tiruan();
const env = { MEDIA: r2, MEDIA_KUNCI: RAHASIA, SUPABASE_FOTO };
const ctx = { waitUntil() {} };
const jam = (detik = 600) => String(Math.floor(Date.now() / 1000) + detik);

async function tiket(aksi, kunci, jenis, batas, kd = jam(), rahasia = RAHASIA) {
  return { 'x-media-tanda': await tandatangan(rahasia, aksi, kunci, jenis, String(batas), kd),
           'x-media-batas': String(batas), 'x-media-kedaluwarsa': kd };
}
const minta = (metode, kunci, kepala = {}, badan) => layaniMedia(
  new Request('https://rian-aini.mengundang.id/media/' + kunci, { method: metode, headers: kepala, body: badan }), env, ctx);
const isiWebp = Buffer.from('RIFF....WEBPVP8 ' + 'x'.repeat(1000));

// --- tulis ---
let r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length) }, isiWebp);
cek(r.status === 401, 'PUT tanpa tiket: 401');
r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length),
  ...(await tiket('unggah', K, 'image/webp', 2000, jam(), 'rahasia-lain')) }, isiWebp);
cek(r.status === 403, 'tiket ditandatangani rahasia lain: 403');
r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length),
  ...(await tiket('unggah', K, 'image/webp', 2000, jam(-5))) }, isiWebp);
cek(r.status === 401, 'tiket kedaluwarsa: 401');
r = await minta('PUT', K, { 'content-type': 'text/html', 'content-length': String(isiWebp.length),
  ...(await tiket('unggah', K, 'text/html', 2000)) }, isiWebp);
cek(r.status === 415, '.webp berisi text/html: 415 walau tiketnya cocok');
const t = await tiket('unggah', K, 'image/webp', 2000);
const kunciLain = K.replace('2bcbac88', '3bcbac88');
r = await minta('PUT', kunciLain, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length), ...t }, isiWebp);
cek(r.status === 403, 'tiket untuk satu kunci tidak berlaku di kunci lain');
r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': '5000', ...(await tiket('unggah', K, 'image/webp', 2000)) }, Buffer.alloc(5000));
cek(r.status === 413 && !r2.isi.has(K), 'lebih besar dari batas tiket: 413, tidak tertulis');
r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length), ...t }, isiWebp);
const j = await r.json();
cek(r.status === 201 && j.bita === isiWebp.length && r2.isi.has(K), 'tiket sah: 201, tertulis ke R2 dengan ukurannya');
r = await minta('PUT', K, { 'content-type': 'image/webp', 'content-length': String(isiWebp.length), ...t }, Buffer.from('timpa'));
cek(r.status === 409 && r2.isi.get(K).buf.equals(isiWebp), 'tiket yang sama tidak bisa menimpa berkas yang sudah ada');

// --- baca ---
r = await minta('GET', K);
const badan = Buffer.from(await r.arrayBuffer());
cek(r.status === 200 && badan.equals(isiWebp) && r.headers.get('content-type') === 'image/webp'
    && /max-age=31536000/.test(r.headers.get('cache-control')), 'GET: isi, jenis, cache setahun');
r = await minta('HEAD', K);
cek(r.status === 200 && r.headers.get('content-length') === String(isiWebp.length), 'HEAD: ukuran tanpa isi');
r = await minta('GET', K, { range: 'bytes=0-3' });
cek(r.status === 206 && (await r.text()) === 'RIFF' && r.headers.get('content-range') === `bytes 0-3/${isiWebp.length}`,
    'Range (video digulir): 206 dengan Content-Range', r.headers.get('content-range'));
r = await minta('GET', '../rahasia.txt');
cek(r.status === 404, 'kunci di luar pola: 404 (tidak bisa keluar folder)');
r = await minta('GET', `${P}/00000000-0000-0000-0000-000000000000.webp`);
cek(r.status === 404, 'tidak ada di R2 maupun Supabase: 404');

// --- penyalinan malas dari Supabase ---
const LAMA = `${P}/aaaaaaaa-c8c1-4da4-8dd4-f5426fa5c70c-kecil.webp`;
ambilSupabase = 0;
r = await minta('GET', LAMA);
const r2b = await minta('GET', LAMA);
cek(r.status === 200 && (await r.text()) === 'ISI-LAMA' && r2b.status === 200 && ambilSupabase === 1 && r2.isi.has(LAMA),
    'berkas lama: diambil dari Supabase SEKALI, lalu dilayani dari R2', String(ambilSupabase));

// --- hapus ---
r = await minta('DELETE', K);
cek(r.status === 401 && r2.isi.has(K), 'DELETE tanpa tiket: ditolak');
r = await minta('DELETE', K, await tiket('unggah', K, '', 0));
cek(r.status === 403, 'tiket unggah tidak bisa dipakai menghapus');
r = await minta('DELETE', K, await tiket('hapus', K, '', 0));
cek(r.status === 204 && !r2.isi.has(K), 'tiket hapus: 204, hilang dari R2');

// --- belum disiapkan ---
r = await layaniMedia(new Request('https://x/media/' + LAMA), { MEDIA: r2 }, ctx);
cek(r.status === 200, 'tanpa MEDIA_KUNCI: baca tetap jalan');
r = await layaniMedia(new Request('https://x/media/' + K, { method: 'PUT', headers: { 'content-type': 'image/webp', 'content-length': '3', ...t }, body: 'abc' }),
                      { MEDIA: r2 }, ctx);
cek(r.status === 503, 'tanpa MEDIA_KUNCI: tulis 503 (dasbor jatuh ke jalan lama)');

// --- lewat server.mjs: run_worker_first + isi PUT mengalir ---
const PORT = 4460;
const srv = await mulai(PORT);
const K2 = `${P}/bbbbbbbb-c8c1-4da4-8dd4-f5426fa5c70c.mp4`;
const video = Buffer.alloc(300000, 7);
r = await fetch(`http://127.0.0.1:${PORT}/media/${K2}`, { method: 'PUT', body: video,
  headers: { 'content-type': 'video/mp4', ...(await tiket('unggah', K2, 'video/mp4', 20971520, jam(), MEDIA_KUNCI)) } });
cek(r.status === 201 && MEDIA_SERVER.isi.get(K2)?.buf.length === 300000, 'lewat HTTP: video 300 KB tertulis utuh', String(r.status));
r = await fetch(`http://127.0.0.1:${PORT}/media/${K2}`, { headers: { range: 'bytes=299990-' } });
cek(r.status === 206 && (await r.arrayBuffer()).byteLength === 10, 'lewat HTTP: rentang akhir video');
r = await fetch(`http://127.0.0.1:${PORT}/media/bukan`);
cek(r.status === 404, '/media/ yang bukan kunci tidak jatuh ke index.html');

srv.close(); sb.close();
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
