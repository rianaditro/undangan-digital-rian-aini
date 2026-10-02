/* Menjalankan seluruh suite satu per satu dan merangkum hasilnya.

     cd uji && npm install && npm test
     node semua.mjs dasbor alamat      ← hanya suite yang namanya disebut

   Satu per satu, bukan paralel: tiap suite menyalakan server statisnya
   sendiri di port tetap, dan beberapa menulis tangkapan layar dengan nama
   yang sama.

   uji-xlsx dan uji-unduh tidak dihitung lulus/gagal di sini. Keduanya
   menghasilkan berkas .xlsx yang isinya diperiksa terpisah dengan
   openpyxl — lihat README.md di folder ini. Yang diperiksa runner ini
   cuma bahwa keduanya selesai tanpa galat. */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname;
const pilihan = process.argv.slice(2);
const semua = readdirSync(dir)
  .filter(f => /^uji-.+\.mjs$/.test(f))
  .filter(f => !pilihan.length || pilihan.some(p => f.includes(p)))
  .sort();

const TANPA_HITUNGAN = new Set(['uji-xlsx.mjs', 'uji-unduh.mjs']);

function jalankan(berkas) {
  return new Promise(selesai => {
    const p = spawn(process.execPath, [berkas], { cwd: dir });
    let keluar = '';
    p.stdout.on('data', d => keluar += d);
    p.stderr.on('data', d => keluar += d);
    p.on('close', kode => selesai({ kode, keluar }));
  });
}

let total = 0, gagalTotal = 0, rusak = [];
for (const f of semua) {
  const t0 = Date.now();
  const { kode, keluar } = await jalankan(f);
  const dt = ((Date.now() - t0) / 1000).toFixed(0) + 'd';

  const m = keluar.match(/(\d+)\s+lulus,\s+(\d+)\s+gagal/i) || keluar.match(/LULUS\s+(\d+)\s+GAGAL\s+(\d+)/);
  let baris;
  if (m) {
    const l = +m[1], g = +m[2];
    total += l + g; gagalTotal += g;
    baris = `${l} lulus, ${g} gagal`;
  } else if (TANPA_HITUNGAN.has(f) && kode === 0) {
    baris = 'selesai (isi berkas diperiksa terpisah)';
  } else {
    baris = 'TIDAK SELESAI (kode ' + kode + ')';
  }
  if (kode !== 0) rusak.push({ f, keluar });
  console.log(`${f.padEnd(20)} ${baris.padEnd(42)} ${dt}`);
}

for (const { f, keluar } of rusak) {
  console.log(`\n===== ${f} =====`);
  console.log(keluar.split('\n').filter(b => /GAGAL|Error|galat/i.test(b)).slice(0, 25).join('\n'));
}

console.log(`\n${total - gagalTotal} dari ${total} lulus` + (rusak.length ? ` · ${rusak.length} suite bermasalah` : ''));
process.exit(rusak.length ? 1 : 0);
