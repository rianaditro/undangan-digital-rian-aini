/* ============================================================
   Membangun tema/daftar.json dari manifest tiap tema.
   Jalankan:  node tema/bangun-daftar.mjs

   Situsnya statis, jadi dasbor tidak bisa membaca isi folder tema/.
   Berkas ini yang menjadi daftarnya: semua tema kategori "katalog",
   lengkap dengan palet dan gaya teksnya, dalam satu permintaan.

   Tema kategori "custom" (Full Custom, docs/halaman-khusus.md) sengaja
   TIDAK masuk — mereka tidak tampil di pemilih tema pasangan mana pun.

   tema/periksa-palet.mjs gagal kalau daftar.json tertinggal dari
   manifestnya, jadi lupa menjalankan ini tertangkap di uji.
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path';

export const AKAR = path.resolve(new URL('..', import.meta.url).pathname);
export const TEMA = path.join(AKAR, 'tema');

/* Semua folder yang berisi tema.json, termasuk tema/custom/<kode>/. */
export function semuaManifest() {
  const hasil = [];
  function telusuri(dir, awalan) {
    for (const n of fs.readdirSync(dir).sort()) {
      const d = path.join(dir, n);
      if (!fs.statSync(d).isDirectory() || n.startsWith('_')) continue;
      const m = path.join(d, 'tema.json');
      if (fs.existsSync(m)) hasil.push({ kode: awalan + n, dir: d, m: JSON.parse(fs.readFileSync(m, 'utf8')) });
      else if (!awalan && n === 'custom') telusuri(d, 'custom/');
    }
  }
  telusuri(TEMA, '');
  return hasil;
}

export function isiDaftar() {
  return semuaManifest()
    .filter(t => t.m.kategori !== 'custom')
    .map(t => t.m);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const isi = JSON.stringify(isiDaftar(), null, 2) + '\n';
  fs.writeFileSync(path.join(TEMA, 'daftar.json'), isi);
  console.log('tema/daftar.json: ' + isiDaftar().map(m => m.kode).join(', '));
}
