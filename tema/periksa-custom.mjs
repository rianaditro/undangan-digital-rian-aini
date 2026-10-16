/* ============================================================
   Penjaga halaman custom (Full Custom anak tangga 3)
   Jalankan:  node tema/periksa-custom.mjs

   Bagian kontrak docs/halaman-khusus.md 3.3 yang bisa diperiksa dari
   berkasnya saja (sisanya — tampil, kirim ucapan, tidak melebar — di
   uji/uji-custom.mjs, di peramban):

   · custom/peta.json: slug sah → folder custom/<kode>/ yang ada
   · setiap folder: index.html, terimakasih/index.html, halaman.json
     (kode = nama folder, versi kit yang memang ada, asal, izin_ulang)
   · rujukan /custom/<x>/ hanya ke foldernya sendiri — kerangka yang
     disalin tanpa mengganti jalurnya akan memuat gaya halaman lain
   · skrip dan stylesheet luar hanya dari daftar izin; tanpa pelacak
   · tanpa gambar raster (foto pasangan datang dari data), tanpa /media/,
     tanpa kata dari slug pemesan asal (butir 9: siap dipakai ulang)
   · halaman memuat /assets/kit.js, bukan memanggil Supabase sendiri
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';

const AKAR = path.resolve(new URL('..', import.meta.url).pathname);
const CUSTOM = path.join(AKAR, 'custom');
global.window = global; global.location = { search: '', hostname: 'periksa', pathname: '/' };
const req = createRequire(import.meta.url);
req('../assets/varian.js'); req('../assets/kit.js');
const VERSI_KIT = global.Kit.versi;

const SIPUT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KODE = /^(_contoh|[a-z0-9]+(-[a-z0-9]+)*)$/;
const RASTER = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i;
const IZIN_LUAR = [/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/, /^https:\/\/cdnjs\.cloudflare\.com\//];
const salah = [];

function semua(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String).filter(f => fs.statSync(path.join(dir, f)).isFile());
}

const folder = fs.existsSync(CUSTOM) ? fs.readdirSync(CUSTOM).filter(n => fs.statSync(path.join(CUSTOM, n)).isDirectory()).sort() : [];

let peta = {};
try { peta = JSON.parse(fs.readFileSync(path.join(CUSTOM, 'peta.json'), 'utf8')); }
catch (e) { salah.push('custom/peta.json tidak terbaca: ' + e.message); }
if (!peta || typeof peta !== 'object' || Array.isArray(peta)) { salah.push('custom/peta.json harus objek { "slug": "kode" }'); peta = {}; }
for (const [slug, kode] of Object.entries(peta)) {
  if (!SIPUT.test(slug)) salah.push(`peta: slug "${slug}" tidak sah`);
  if (kode === '_contoh') salah.push(`peta: ${slug} menunjuk kerangka — salin dulu ke custom/<kode>/`);
  else if (!folder.includes(kode)) salah.push(`peta: ${slug} → custom/${kode}/ yang tidak ada`);
}

for (const kode of folder) {
  const dir = path.join(CUSTOM, kode);
  const s = m => salah.push(`custom/${kode}: ${m}`);
  if (!KODE.test(kode)) s('nama folder bukan kode yang sah');
  for (const wajib of ['index.html', 'terimakasih/index.html', 'halaman.json'])
    if (!fs.existsSync(path.join(dir, wajib))) s(`${wajib} tidak ada`);
  let m = {};
  try { m = JSON.parse(fs.readFileSync(path.join(dir, 'halaman.json'), 'utf8')); } catch (e) { s('halaman.json tidak terbaca'); }
  if (m.kode !== kode) s(`halaman.json: kode "${m.kode}" ≠ nama folder`);
  if (!Number.isInteger(m.kit) || m.kit < 1 || m.kit > VERSI_KIT) s(`halaman.json: kit ${m.kit} tidak ada (kit sekarang versi ${VERSI_KIT})`);
  if (typeof m.asal !== 'string' || (kode !== '_contoh' && !SIPUT.test(m.asal))) s('halaman.json: "asal" harus slug pemesan pertama');
  if ('izin_ulang' in m && typeof m.izin_ulang !== 'boolean') s('halaman.json: izin_ulang harus true/false');
  const kata = (m.asal || '').split('-').filter(k => k.length >= 3);

  for (const f of semua(dir)) {
    if (RASTER.test(f)) { s(`${f}: gambar raster — foto pasangan datang dari data; ornamen pakai svg`); continue; }
    if (f === 'halaman.json') continue;
    const isi = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const r of isi.matchAll(/\/custom\/([A-Za-z0-9_-]+)\//g))
      if (r[1] !== kode) { s(`${f}: merujuk /custom/${r[1]}/ — jalur kerangka belum diganti?`); break; }
    if (/\/media\//.test(isi)) s(`${f}: menunjuk /media/ langsung — pakai Kit.fotoUrl`);
    if (/supabase\.co|\/rest\/v1\//.test(isi)) s(`${f}: memanggil Supabase sendiri — pakai Kit`);
    for (const k of kata) if (new RegExp('\\b' + k + '\\b', 'i').test(isi)) s(`${f}: memuat "${k}" dari nama pemesan asal`);
    if (f.endsWith('.html')) {
      for (const r of isi.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)) {
        const u = r[1];
        if (/^https?:\/\//.test(u) && !IZIN_LUAR.some(re => re.test(u))) s(`${f}: sumber luar tidak diizinkan: ${u}`);
      }
      if (!/<script[^>]+src=["']\/assets\/kit\.js["']/.test(isi)) s(`${f}: tidak memuat /assets/kit.js`);
    }
  }
}

console.log(`   ${folder.length} halaman custom, ${Object.keys(peta).length} pasangan di peta, kit versi ${VERSI_KIT}`);
if (salah.length) { console.log('\nGAGAL:\n' + salah.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
console.log('\nSemua halaman custom sah.');
