/* ============================================================
   Mencetak :root dan @import huruf untuk palet + gaya teks bawaan
   sebuah tema — bagian yang wajib sama persis di gaya.css dan
   kenangan.css (dijaga tema/periksa-palet.mjs).

   Jalankan:  node tema/cetak-root.mjs <kode>      (mis. kisah, custom/teras-jati)

   Dipakai waktu membuat tema baru atau mengganti palet bawaannya:
   tempel hasilnya ke kedua berkas.
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { TEMA } from './bangun-daftar.mjs';

createRequire(import.meta.url)('../assets/varian.js');
const T = globalThis.MENGUNDANG.tema;
const kode = process.argv[2];
const f = kode && path.join(TEMA, kode, 'tema.json');
if (!f || !fs.existsSync(f)) { console.error('pakai: node tema/cetak-root.mjs <kode tema>'); process.exit(1); }
const m = JSON.parse(fs.readFileSync(f, 'utf8'));
const p = (m.palet || []).find(x => x.kode === (m.bawaan || {}).palet);
const h = (m.huruf || []).find(x => x.kode === (m.bawaan || {}).huruf);
if (!p || !h) { console.error('bawaan palet/huruf tidak ditemukan di ' + f); process.exit(1); }

const t = T.tokenPalet(p), u = T.tokenHuruf(h);
console.log(`@import url('https://fonts.googleapis.com/css2?${h.google}&display=swap');\n`);
console.log(':root{');
for (const k of Object.keys(t).filter(k => !k.endsWith('-rgb'))) {
  const rgb = t[k + '-rgb'];
  console.log((('  ' + k + ':' + t[k] + ';').padEnd(26) + (rgb ? k + '-rgb:' + rgb + ';' : '')).trimEnd());
}
console.log('');
for (const [k, v] of Object.entries(u)) console.log('  ' + k + ':' + v + ';');
console.log('}');
