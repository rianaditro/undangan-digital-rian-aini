import { chromium } from 'playwright';
import fs from 'node:fs';

const kode = fs.readFileSync(new URL('../assets/xlsx.js', import.meta.url),'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><title>uji</title>');
await page.addScriptTag({ content: kode });

const b64 = await page.evaluate(() => {
  const kolomBanyak = [];
  for (let i = 1; i <= 30; i++) kolomBanyak.push({ v: 'K' + i, j: 'judul' });

  const blob = window.XLSX.buat([
    { nama: 'Sumbangan', lebar: [28, 14, 16],
      baris: [
        [{v:'Nama',j:'judul'}, {v:'Nominal',j:'judul'}, {v:'Waktu',j:'judul'}, {v:'Jumlah',j:'judul'}],
        [{v:"Nurul Zakiyatul 'AINI"}, {v:250000,j:'uang'},
         {v:'2026-09-15T09:30:00Z',j:'tanggal'}, {v:2.5,j:'angka'}],
        [{v:'Tanda & baca <kurung> "kutip"'}, {v:1000000,j:'uang'}, null, null],
        [{v:'Kendali\u0007nyasar'}, {v:null,j:'uang'}, null, {v:0,j:'angka'}],
        [{v:'  spasi pinggir  '}, {v:'bukan angka',j:'uang'}, null, null]
      ]},
    { nama: 'Ringkasan', baris: [ kolomBanyak, [{v:'nilai AD'}] ] }
  ]);
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.readAsDataURL(blob);
  });
});

fs.writeFileSync('uji.xlsx', Buffer.from(b64, 'base64'));
await browser.close();
console.log('berkas ditulis:', fs.statSync('uji.xlsx').size, 'byte');
