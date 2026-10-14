/* ============================================================
   Membangun tema/daftar.json dari manifest tiap tema.
   Jalankan:  node tema/bangun-daftar.mjs

   Situsnya statis, jadi dasbor tidak bisa membaca isi folder tema/.
   Berkas ini yang menjadi daftarnya: semua tema kategori "katalog",
   lengkap dengan palet dan gaya teksnya, dalam satu permintaan.

   Tema kategori "custom" (Full Custom, docs/halaman-khusus.md) sengaja
   TIDAK masuk — mereka tidak tampil di pemilih tema pasangan mana pun.
   Mereka dicatat terpisah di tema/custom.json: katalog custom yang hanya
   dibaca /pemilik (bagian 6), lengkap dengan asal, turunan, izin pakai
   ulang, dan isi khusus yang dibutuhkan.

   Folder berawalan "_" (tema/custom/_contoh, kerangka) bukan tema:
   tidak masuk daftar mana pun, tapi ikut diperiksa penjaga.

   tema/periksa-palet.mjs gagal kalau daftar.json tertinggal dari
   manifestnya, jadi lupa menjalankan ini tertangkap di uji.
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path';

export const AKAR = path.resolve(new URL('..', import.meta.url).pathname);
export const TEMA = path.join(AKAR, 'tema');

/* Semua folder yang berisi tema.json, termasuk tema/custom/<kode>/.
   kerangka: ikut sertakan tema/custom/_contoh (untuk penjaga). */
export function semuaManifest({ kerangka = false } = {}) {
  const hasil = [];
  function telusuri(dir, awalan) {
    for (const n of fs.readdirSync(dir).sort()) {
      const d = path.join(dir, n);
      if (!fs.statSync(d).isDirectory()) continue;
      if (n.startsWith('_') && !(kerangka && awalan === 'custom/' && n === '_contoh')) continue;
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

/* Katalog custom: ringkasan saja — palet dan gaya teksnya dibaca dari
   tema.json tema itu sendiri bila perlu. Tema yang pemesan asalnya
   menolak dipakai ulang (izin_ulang: false) tidak masuk. */
export function isiCustom() {
  return semuaManifest()
    .filter(t => t.m.kategori === 'custom' && t.m.izin_ulang !== false)
    .map(({ m }) => ({
      kode: m.kode, nama: m.nama, untuk: m.untuk || '', asal: m.asal || '',
      turunan: m.turunan || null, tangga: 2, isi_khusus: m.isi_khusus || [],
      palet: (m.palet || []).map(p => ({ kode: p.kode, nama: p.nama, latar: p.latar, teks: p.teks, aksen: p.aksen }))
    }));
}

if (import.meta.url === 'file://' + process.argv[1]) {
  fs.writeFileSync(path.join(TEMA, 'daftar.json'), JSON.stringify(isiDaftar(), null, 2) + '\n');
  fs.writeFileSync(path.join(TEMA, 'custom.json'), JSON.stringify(isiCustom(), null, 2) + '\n');
  console.log('tema/daftar.json: ' + isiDaftar().map(m => m.kode).join(', '));
  console.log('tema/custom.json: ' + (isiCustom().map(m => m.kode).join(', ') || '(kosong)'));
}
