import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { bikinModel, pasang, T_PENUH } from './stub.mjs';
import fs from 'node:fs';

const PORT = 4350, ASAL = 'http://127.0.0.1:' + PORT;
const srv = await mulai(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1100,height:900}, acceptDownloads:true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
const model = bikinModel();
await pasang(page, model);

/* 240 pemberian — lebih banyak dari pagar 200 baris di layar, supaya
   unduhan yang diam-diam memakai daftar layar ketahuan. */
const T = model.tamu;
T[0].kelompok = 'Keluarga Zaenal'; T[0].relasi = 'Kepala keluarga';
T[0].alamat = 'Jl. Mawar 3'; T[0].datang = true; T[0].berkat = 'diberikan';
T[0].nama = "Zaenal Abidin & 'Aini <sekeluarga>";   // tanda baca + apostrof
model.pemberian.push(
  {id:'g1',tamu_id:'tamu-0',jenis:'uang',nominal:250000,barang:null,jumlah:null,satuan:null,catatan:null},
  {id:'g2',tamu_id:'tamu-0',jenis:'rokok',nominal:null,barang:'Djarum Super',jumlah:2,satuan:'slop',catatan:null},
  {id:'g3',tamu_id:'tamu-1',jenis:'transfer',nominal:500000,barang:null,jumlah:null,satuan:null,catatan:'tidak bisa hadir'});
for (let i = 0; i < 237; i++)
  model.pemberian.push({id:'x'+i,tamu_id:'tamu-'+((i % 208) + 2),jenis:'uang',nominal:1000+i,
                        barang:null,jumlah:null,satuan:null,catatan:null});

await page.goto(ASAL + '/kirim?t=' + T_PENUH);
await page.waitForSelector('.rk-baris', { timeout: 8000 });

const diLayar = await page.locator('.rk-baris').count();
const unduhan = page.waitForEvent('download');
await page.locator('#btnRkUnduh').click();
const d = await unduhan;
const nama = d.suggestedFilename();
await d.saveAs('unduh.xlsx');
await page.waitForSelector('.toast.on', { timeout: 5000 });
const pesan = await page.locator('.toast').textContent();

fs.writeFileSync('unduh-info.json', JSON.stringify({
  nama, diLayar, pesan, pemberian: model.pemberian.length,
  panggilan: model.panggilan.filter(p => p.nama === 'rekap_unduh').map(p => p.arg)
}, null, 1));

/* kasus kosong: tidak ada sumbangan sama sekali */
const ctx2 = await browser.newContext({ viewport:{width:1100,height:900}, acceptDownloads:true });
const page2 = await ctx2.newPage();
const model2 = bikinModel();
await pasang(page2, model2);
await page2.goto(ASAL + '/kirim?t=' + T_PENUH);
await page2.waitForSelector('.rk-baris', { timeout: 8000 });
let adaUnduhan = false;
page2.on('download', () => { adaUnduhan = true; });
await page2.locator('#btnRkUnduh').click();
await page2.waitForSelector('.toast.on', { timeout: 5000 });
const pesan2 = await page2.locator('.toast').textContent();
await page2.waitForTimeout(600);
fs.appendFileSync('unduh-info.json', '\n' + JSON.stringify({ kosongPesan: pesan2, kosongUnduh: adaUnduhan }));

await browser.close(); srv.close();
console.log('selesai');
