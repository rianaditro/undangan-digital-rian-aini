/* Pintu Cloudflare: wrangler.jsonc + .assetsignore + _headers +
   cloudflare/pintu.js, dijalankan lewat server.mjs yang meniru
   Workers. Tanpa peramban — yang diuji cuma jawaban HTTP-nya. */
import http from 'node:http';
import { mulai } from './server.mjs';

const PORT = 4398;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const ambil = (host, jalur) => new Promise((res, rej) => {
  http.get({ host:'127.0.0.1', port:PORT, path:jalur, headers:{ Host:host } }, j => {
    let b = ''; j.on('data', d => b += d);
    j.on('end', () => res({ status:j.statusCode, lokasi:j.headers.location || '',
                            robot:j.headers['x-robots-tag'] || '', badan:b }));
  }).on('error', rej);
});

const srv = await mulai(PORT);

// 1. akar per host
let r = await ambil('mengundang.id', '/?utm=wa');
cek('1a apex / → /mulai, query ikut', r.status === 307 && r.lokasi === '/mulai?utm=wa', r.status + ' ' + r.lokasi);
r = await ambil('www.mengundang.id', '/');
cek('1b www / → https://mengundang.id/mulai', r.status === 307 && r.lokasi === 'https://mengundang.id/mulai', r.lokasi);
r = await ambil('rian-aini.mengundang.id', '/');
cek('1c subdomain pasangan / → undangannya, tanpa alih', r.status === 200 && r.badan.includes('id="mempelai"'));
r = await ambil('mengundang.workers.dev', '/');
cek('1d workers.dev / → undangan (domain bersama)', r.status === 200 && r.badan.includes('id="mempelai"'));

// 2. tautan tamu dan pasangan jatuh ke index.html
for (const [h, j] of [['rian-aini.mengundang.id', '/bapak-ahmad?p=kw'], ['mengundang.id', '/budi-sari/ibu-rahayu']]) {
  r = await ambil(h, j);
  cek('2 ' + h + j + ' → index.html 200', r.status === 200 && r.badan.includes('id="mempelai"'), String(r.status));
}

// 3. halaman platform di tempat, garis miring dialihkan
r = await ambil('mengundang.id', '/kirim');
cek('3a /kirim disajikan di tempat', r.status === 200 && r.badan.includes('<title>Halaman Panitia'));
r = await ambil('mengundang.id', '/kirim/?t=1');
cek('3b /kirim/ → /kirim, query ikut', r.status === 307 && r.lokasi === '/kirim?t=1', r.lokasi);

// 4. noindex
for (const j of ['/kirim', '/dasbor', '/admin', '/pemilik']) {
  r = await ambil('mengundang.id', j);
  cek('4 ' + j + ' noindex', r.robot === 'noindex, nofollow', r.robot);
}
r = await ambil('rian-aini.mengundang.id', '/');
cek('4 undangan TIDAK noindex', r.robot === '', r.robot);

// 4b. alamat lama
r = await ambil('mengundang.id', '/reseller');
cek('4b /reseller → 301 /admin', r.status === 301 && r.lokasi === '/admin', r.status + ' ' + r.lokasi);
r = await ambil('mengundang.id', '/_redirects');
cek('4c _redirects sendiri tidak terbit', r.status === 200 && r.badan.includes('id="mempelai"'));

// 5. berkas internal tidak pernah terbit
for (const j of ['/docs/operasi-domain-dan-admin.md', '/supabase/migrations/028_kenangan_blok.sql',
                 '/uji/server.mjs', '/alat/periksa-dns.py', '/cloudflare/pintu.js', '/wrangler.jsonc',
                 '/README.md', '/_headers', '/.assetsignore', '/.github/workflows/uji.yml']) {
  r = await ambil('mengundang.id', j);
  // Berkas yang diabaikan = tidak ada; yang keluar index.html (SPA).
  cek('5 ' + j + ' tidak terbit', r.status === 200 && r.badan.includes('id="mempelai"'), r.badan.slice(0, 60));
}

srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
