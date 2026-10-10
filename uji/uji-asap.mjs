/* Asap: tiap halaman dibuka apa adanya, tanpa stub. Yang dicari cuma
   galat yang muncul saat memuat — salah ketik, fungsi yang tidak ada,
   berkas yang tidak tersaji. Bukan pengganti uji perilaku. */
import { chromium } from 'playwright';
import { mulai } from './server.mjs';

const PORT = 4399, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const srv = await mulai(PORT);
const browser = await chromium.launch();

for (const jalur of ['/', '/mulai', '/coba', '/admin', '/dasbor', '/kirim', '/terimakasih',
                     '/rian-aini', '/rian-aini/bapak-ahmad']) {
  const ctx = await browser.newContext({ viewport:{width:430,height:900} });
  const page = await ctx.newPage();
  const galat = [], aset = [];
  page.on('pageerror', e => galat.push(e.message));
  page.on('response', r => {
    const u = r.url(), t = r.headers()['content-type'] || '';
    if (/\.(js|css)(\?|$)/.test(u) && (r.status() >= 400 || !/javascript|css/.test(t)))
      aset.push(u.replace(ASAL,'') + ' -> ' + r.status() + ' ' + t);
  });
  /* Supabase tidak terjangkau dari sini; dijawab kosong supaya yang
     tersisa benar-benar galat halaman, bukan galat jaringan. */
  await page.route('**/*.supabase.co/**', r => r.fulfill({
    status:200, contentType:'application/json',
    headers:{'access-control-allow-origin':'*'}, body:'null' }));
  await page.goto(ASAL + jalur, { waitUntil:'load' });
  await page.waitForTimeout(600);
  cek('memuat ' + jalur, galat.length === 0 && aset.length === 0,
      [...galat, ...aset].join(' ; '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
