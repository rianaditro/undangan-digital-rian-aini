/* ============================================================
   Penjaga palet dan manifest tema
   Jalankan:  node tema/periksa-palet.mjs

   Palet dipilih pasangan, tapi yang membacanya tamu — di HP murah, di
   bawah matahari, di tengah kondangan. Palet yang lolos ke repo harus
   sudah pasti terbaca. Berkas ini memeriksa setiap tema.json:

   · setiap palet lulus kontras (rumus yang sama dengan halaman:
     MENGUNDANG.tema.periksaPalet di assets/varian.js)
   · setiap gaya teks paling banyak 3 keluarga huruf
   · bawaan menunjuk palet dan gaya teks yang ada
   · nilai :root di gaya.css dan kenangan.css SAMA dengan palet dan gaya
     teks bawaan — keduanya berlaku sebelum JS jalan, dan tidak boleh
     berselisih dengan yang dipasang JS sesudahnya
   · @import huruf di kedua berkas itu memuat huruf gaya teks bawaan
   · tema/daftar.json sama dengan hasil tema/bangun-daftar.mjs
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { semuaManifest, isiDaftar, TEMA } from './bangun-daftar.mjs';

createRequire(import.meta.url)('../assets/varian.js');
const T = globalThis.MENGUNDANG.tema;

const salah = [];
const kodeSah = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function bacaRoot(css) {
  const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([^}]*)\}/);
  const nilai = {};
  if (!m) return nilai;
  for (const d of m[1].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    nilai[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return nilai;
}
const rapi = v => String(v).replace(/\s+/g, '').replace(/"/g, "'").toLowerCase();

const daftar = semuaManifest();
for (const { kode, dir, m } of daftar) {
  const s = msg => salah.push(kode + ': ' + msg);

  if (m.kode !== kode) s(`kode di manifest "${m.kode}" ≠ nama folder`);
  if (!['katalog', 'custom'].includes(m.kategori)) s('kategori harus katalog atau custom');
  if ((m.kategori === 'custom') !== kode.startsWith('custom/')) s('tema custom tinggal di tema/custom/, dan hanya di sana');

  const palet = m.palet || [], huruf = m.huruf || [];
  if (!palet.length) s('tidak ada palet');
  if (!huruf.length) s('tidak ada gaya teks');

  const kp = new Set();
  for (const p of palet) {
    if (!kodeSah.test(p.kode || '') || p.kode === 'foto') s(`kode palet "${p.kode}" tidak sah`);
    if (kp.has(p.kode)) s(`palet "${p.kode}" ganda`); kp.add(p.kode);
    if (!p.nama) s(`palet "${p.kode}" tanpa nama`);
    for (const e of T.periksaPalet(p)) s(`palet "${p.kode}": ${e}`);
  }

  const kh = new Set();
  for (const h of huruf) {
    if (!kodeSah.test(h.kode || '')) s(`kode gaya teks "${h.kode}" tidak sah`);
    if (kh.has(h.kode)) s(`gaya teks "${h.kode}" ganda`); kh.add(h.kode);
    for (const k of ['nama', 'judul', 'naskah', 'isi', 'google']) if (!h[k]) s(`gaya teks "${h.kode}" tanpa ${k}`);
    if (h.google && (!/^family=/.test(h.google) || /display=/.test(h.google))) s(`gaya teks "${h.kode}": google harus "family=…" tanpa display=`);
    const kel = (h.google || '').split('&').filter(x => x.startsWith('family='));
    if (kel.length > 3) s(`gaya teks "${h.kode}" memuat ${kel.length} keluarga huruf (maks. 3)`);
  }

  for (const st of m.setelan || []) {
    if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(st.kode || '') || ['palet', 'huruf', 'palet_foto'].includes(st.kode)) s(`setelan "${st.kode}" tidak sah`);
    if (!st.nama) s(`setelan "${st.kode}" tanpa nama`);
    if (!(st.pilihan || []).length) s(`setelan "${st.kode}" tanpa pilihan`);
    for (const pl of st.pilihan || []) if (!kodeSah.test(pl.kode || '') || !pl.nama) s(`setelan "${st.kode}": pilihan "${pl.kode}" tidak sah`);
  }
  /* "ornamen-{daerah}.svg#…" diperiksa untuk setiap pilihan setelan itu
     (kecuali yang memakai ornamen bawaan halaman). */
  const ornamenNyata = [];
  for (const [dari, ke] of Object.entries(m.ornamen || {})) {
    const k = (String(ke).match(/\{([a-z0-9_]+)\}/) || [])[1];
    if (!k) { ornamenNyata.push([dari, ke]); continue; }
    const st = (m.setelan || []).find(x => x.kode === k);
    if (!st) { s(`ornamen "${ke}" menyebut setelan "${k}" yang tidak ada`); continue; }
    for (const pl of st.pilihan) if (!pl.ornamen_bawaan) ornamenNyata.push([dari, String(ke).replace('{' + k + '}', pl.kode)]);
  }
  for (const [dari, ke] of ornamenNyata) {
    const [berkas, id] = String(ke).split('#');
    if (!/^[a-z0-9-]+\.svg$/.test(berkas || '') || !id) { s(`ornamen "${dari}" → "${ke}" bukan berkas.svg#id`); continue; }
    const f = path.join(dir, berkas);
    if (!fs.existsSync(f)) s(`ornamen: ${berkas} tidak ada`);
    else if (!new RegExp(`id=["']${id}["']`).test(fs.readFileSync(f, 'utf8'))) s(`ornamen: ${berkas} tidak punya #${id}`);
    else for (const k of fs.readFileSync(f, 'utf8').matchAll(/<!--([\s\S]*?)-->/g))
      // XML melarang "--" di dalam komentar; berkasnya jadi tidak sah dan
      // <use> yang merujuknya tidak menggambar apa pun, tanpa galat.
      if (k[1].includes('--')) { s(`ornamen: ${berkas} — komentar berisi "--" (XML tidak sah)`); break; }
  }

  if (m.tata !== undefined) {
    if (!/^[a-z0-9-]+\.js$/.test(m.tata)) s(`tata "${m.tata}" bukan nama berkas .js`);
    else if (!fs.existsSync(path.join(dir, m.tata))) s(`tata: ${m.tata} tidak ada`);
    else if (!fs.readFileSync(path.join(dir, m.tata), 'utf8').includes(`daftarTata('${kode}'`)) s(`tata: ${m.tata} tidak mendaftar dengan daftarTata('${kode}', …)`);
  }

  const b = m.bawaan || {};
  const pb = palet.find(p => p.kode === b.palet), hb = huruf.find(h => h.kode === b.huruf);
  if (!pb) s(`palet bawaan "${b.palet}" tidak ada`);
  if (!hb) s(`gaya teks bawaan "${b.huruf}" tidak ada`);

  for (const berkas of ['gaya.css', 'kenangan.css']) {
    const f = path.join(dir, berkas);
    if (!fs.existsSync(f)) { s(`${berkas} tidak ada`); continue; }
    if (!pb || !hb) continue;
    const css = fs.readFileSync(f, 'utf8');
    const root = bacaRoot(css);
    const harap = { ...T.tokenPalet(pb), ...T.tokenHuruf(hb) };
    for (const [k, v] of Object.entries(harap)) {
      if (!(k in root)) s(`${berkas}: :root tidak punya ${k}`);
      else if (rapi(root[k]) !== rapi(v)) s(`${berkas}: ${k} di :root ${root[k]} ≠ bawaan ${v}`);
    }
    const imp = css.match(/@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com\/css2\?([^'")]+)/);
    if (!imp) s(`${berkas}: tidak meng-@import huruf gaya teks bawaan`);
    else if (imp[1].replace(/&display=swap$/, '') !== hb.google) s(`${berkas}: @import huruf ≠ google gaya teks bawaan`);
  }
}

const tertulis = fs.existsSync(path.join(TEMA, 'daftar.json'))
  ? fs.readFileSync(path.join(TEMA, 'daftar.json'), 'utf8') : '';
if (tertulis !== JSON.stringify(isiDaftar(), null, 2) + '\n') {
  salah.push('tema/daftar.json tertinggal dari manifest — jalankan: node tema/bangun-daftar.mjs');
}

for (const { kode, m } of daftar) {
  console.log(`   ${kode}: ${(m.palet || []).length} palet, ${(m.huruf || []).length} gaya teks`);
}
if (salah.length) {
  console.log('\nGAGAL:\n' + salah.map(x => '  ✗ ' + x).join('\n'));
  process.exit(1);
}
console.log('\nSemua palet terbaca, semua manifest sah.');
