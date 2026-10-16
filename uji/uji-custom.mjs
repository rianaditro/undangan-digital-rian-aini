/* Uji halaman custom (Full Custom anak tangga 3) — kontrak
   docs/halaman-khusus.md 3.3, dijalankan untuk SETIAP folder di custom/
   (termasuk kerangkanya), lewat Worker yang sama dengan produksi:
   setiap folder dipetakan ke slug uji-<n> di peta tiruan, lalu dibuka
   di subdomainnya sendiri.

   Bagian yang cukup dibaca dari berkas ada di tema/periksa-custom.mjs. */
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
import { mulai } from './server.mjs';
import { ISI } from './stub.mjs';

const PORT = 4412;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const AKAR = path.resolve(new URL('..', import.meta.url).pathname);
const FOLDER = fs.readdirSync(path.join(AKAR, 'custom')).filter(n => fs.statSync(path.join(AKAR, 'custom', n)).isDirectory()).sort();
const PETA = Object.fromEntries(FOLDER.map((k, i) => ['uji-' + i, k]));
const srv = await mulai(PORT, { PETA_CUSTOM: PETA });
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.mengundang.id 127.0.0.1, MAP mengundang.id 127.0.0.1, MAP *.workers.dev 127.0.0.1'] });

const XSS = '<img src=x onerror="window.__xss=1">';
const IZIN = [/^http:\/\/[a-z0-9.-]+:\d+\//, /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/cdnjs\.cloudflare\.com\//,
              /\.supabase\.co\//, /^data:/, /^blob:/];

function isiUntuk(slug, rekaan) {
  let d = structuredClone(ISI);
  if (rekaan) d = JSON.parse(JSON.stringify(d)
    .replace(/RIAN ADI SAPUTRO/g, 'BIMA ARYA').replace(/NURUL ZAKIYATUL 'AINI/g, 'LARAS SEKAR')
    .replace(/'AINI|AINI/g, 'LARAS').replace(/RIAN/g, 'BIMA').replace(/'Aini|Aini/g, 'Laras').replace(/Rian/g, 'Bima'));
  return { ...d, slug, aktif: true, khusus: { kutipan: 'Kutipan ' + XSS } };
}

async function buka(kode, i, { lebar = 360, jalur = '/bapak-ahmad?p=kp', reduced = false, rekaan = false, host } = {}) {
  const slug = 'uji-' + i;
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const galat = [], luar = [], panggil = [], ukuran = { bita: 0 };
  page.on('pageerror', e => galat.push(e.message));
  page.on('request', r => { if (!IZIN.some(re => re.test(r.url()))) luar.push(r.url()); });
  page.on('response', async r => {
    const u = new URL(r.url());
    if (/^127\.|mengundang\.id$|workers\.dev$/.test(u.hostname) && !u.pathname.startsWith('/media/'))
      try { ukuran.bita += (await r.body()).length; } catch {}
  });
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/media/**', r => r.fulfill({ status: 404, body: '' }));
  const ucapan = [{ nama: 'Siti ' + XSS, hadir: 'Hadir', pesan: 'Selamat ' + XSS, created_at: '2026-09-10T02:00:00Z' }];
  await page.route('**/*.supabase.co/**', async r => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, body: '' });
    const nama = new URL(req.url()).pathname.split('/').pop();
    let arg = {}; try { arg = JSON.parse(req.postData() || '{}'); } catch {}
    panggil.push({ nama, arg });
    const kirim = x => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(x) });
    if (nama === 'undangan_isi') return kirim(isiUntuk(arg.p_slug, rekaan));
    if (nama === 'undangan_tamu') return kirim([{ nama: rekaan ? 'Bapak ' + XSS : 'Bapak Ahmad Fauzi', pihak: 'keluarga-pria' }]);
    if (nama === 'ucapan_publik') return kirim(ucapan);
    if (nama === 'ucapan_tulis') { ucapan.unshift({ nama: arg.p_nama, hadir: arg.p_hadir, pesan: arg.p_pesan, created_at: new Date().toISOString() }); return kirim(null); }
    if (nama === 'terimakasih_isi') return kirim({ slug: arg.p_slug, aktif: true, tanggal_acara: '2026-09-15', mempelai: isiUntuk(slug, rekaan).mempelai,
      foto: [], babak: [], blok: {}, vendor: [], ucapan: [], angka: { hadir: 120, ucapan: 40, foto: 0, babak: 0 } });
    return kirim(null);
  });
  await page.goto(`http://${host || slug + '.mengundang.id'}:${PORT}${jalur}`);
  await page.waitForFunction(() => document.body && document.body.dataset.siap, null, { timeout: 8000 }).catch(() => {});
  return { ctx, page, galat, luar, panggil, ukuran };
}

const lebih = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function bukaSampul(page) {
  const b = page.locator('[data-kit="buka"]');
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(1200); }
}

for (const [i, kode] of FOLDER.entries()) {
  const nama = 'custom/' + kode;
  const m = JSON.parse(fs.readFileSync(path.join(AKAR, 'custom', kode, 'halaman.json'), 'utf8'));

  /* ---------- 1–5, 7, 8: undangan di HP ---------- */
  let r = await buka(kode, i);
  const halamanIni = await r.page.evaluate(k => !!document.querySelector(`link[href^="/custom/${k}/"], script[src^="/custom/${k}/"]`), kode);
  cek(`${nama}: Worker menyajikan halaman custom di subdomain pasangan`, halamanIni && await r.page.evaluate(() => document.body.dataset.siap) === 'isi');
  // nama tamu dibaca sebelum sampul dibuka — di sanalah biasanya ia tertulis
  let teks = await r.page.evaluate(() => document.body.innerText);
  await bukaSampul(r.page);
  teks += await r.page.evaluate(() => document.body.innerText);
  cek(`${nama} 1: nama tamu dari alamat tampil`, teks.includes('Bapak Ahmad Fauzi'), teks.slice(0, 120));
  const peta = await r.page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href));
  cek(`${nama} 2: semua acara dan tempatnya tampil, dengan tautan peta`,
    ISI.acara.every(a => teks.includes(a.nama)) && Object.values(ISI.tempat).some(t => peta.includes(t.maps)), peta.join(' '));
  cek(`${nama} 4: hadiah tampil (pihak tamu)`, Object.values(ISI.dompet).some(d => teks.includes(d.nomor)));
  await r.page.locator('[data-kit="ucapan-pesan"]').fill('Barakallah, semoga sakinah.');
  await r.page.locator('[data-kit="ucapan-hadir"]').selectOption({ index: 0 });
  await r.page.locator('[data-kit="ucapan-kirim"]').click();
  await r.page.waitForTimeout(800);
  const tulis = r.panggil.find(p => p.nama === 'ucapan_tulis');
  cek(`${nama} 3: ucapan terkirim ke undangan ini, dengan pihak tamu dan kehadiran yang sah`,
    tulis && tulis.arg.p_slug === 'uji-' + i && tulis.arg.p_nama === 'Bapak Ahmad Fauzi' && tulis.arg.p_pihak === 'keluarga-pria'
    && ['Hadir', 'Belum pasti', 'Tidak hadir'].includes(tulis.arg.p_hadir)
    && (await r.page.evaluate(() => document.body.innerText)).includes('semoga sakinah'), JSON.stringify(tulis));
  cek(`${nama} 5: tanpa galat, tidak melebar di 360px`, !r.galat.length && (await lebih(r.page)) <= 0, r.galat.join('; '));
  cek(`${nama} 7: sumber luar hanya dari daftar izin`, !r.luar.length, r.luar.join(' '));
  cek(`${nama} 8: halaman pertama (tanpa foto) ≤ 500 KB`, r.ukuran.bita <= 500 * 1024, Math.round(r.ukuran.bita / 1024) + ' KB');
  await r.page.screenshot({ path: `custom-${kode}-360.png`, fullPage: true });
  await r.ctx.close();

  /* ---------- layar lebar ---------- */
  r = await buka(kode, i, { lebar: 1280 });
  await bukaSampul(r.page);
  cek(`${nama}: layar lebar tanpa galat, tidak melebar`, !r.galat.length && (await lebih(r.page)) <= 0);
  await r.ctx.close();

  /* ---------- 6: gerak dikurangi ---------- */
  r = await buka(kode, i, { reduced: true });
  await bukaSampul(r.page);
  const gerak = await r.page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  cek(`${nama} 6: gerak dikurangi — tidak ada animasi berjalan sesudah dibuka`, gerak === 0, String(gerak));
  await r.ctx.close();

  /* ---------- 9: siap dipakai ulang + data jahil ---------- */
  r = await buka(kode, i, { rekaan: true });
  await bukaSampul(r.page);
  teks = await r.page.evaluate(() => document.body.innerText);
  const kata = (m.asal || '').split('-').filter(k => k.length >= 3);
  const bocor = kata.filter(k => new RegExp('\\b' + k + '\\b', 'i').test(teks));
  cek(`${nama} 9: pasangan rekaan — tanpa sisa pemesan asal, data tidak dieksekusi`,
    !bocor.length && /BIMA|Bima/.test(teks) && !(await r.page.evaluate(() => window.__xss)) && !r.galat.length,
    JSON.stringify({ bocor, xss: await r.page.evaluate(() => window.__xss) }));
  await r.ctx.close();

  /* ---------- 10: halaman terima kasih ---------- */
  r = await buka(kode, i, { jalur: '/terimakasih' });
  const tk = await r.page.evaluate(k => ({ siap: document.body.dataset.siap,
    milik: !!document.querySelector(`link[href^="/custom/${k}/"]`), teks: document.body.innerText }), kode);
  cek(`${nama} 10: halaman terima kasihnya sendiri, tanpa galat, tidak melebar, sumber luar diizinkan`,
    tk.siap === 'isi' && tk.milik && !r.galat.length && (await lebih(r.page)) <= 0 && !r.luar.length, JSON.stringify({ ...tk, teks: tk.teks.slice(0, 80) }));
  await r.page.screenshot({ path: `custom-${kode}-terimakasih-360.png`, fullPage: true });
  await r.ctx.close();
}

/* ---------- rute: hanya subdomain dan pratinjau, hanya yang dipetakan ---------- */
if (FOLDER.length) {
  const k = FOLDER[0], cekCustom = page => page.evaluate(k => !!document.querySelector(`link[href^="/custom/${k}/"]`), k);
  let r = await buka(k, 0, { host: 'mengundang.id', jalur: '/uji-0/bapak-ahmad' });
  cek('rute: domain bersama TIDAK menyajikan halaman custom (origin sama dengan /dasbor)', !(await cekCustom(r.page)));
  await r.ctx.close();
  r = await buka(k, 0, { host: 'mengundang.workers.dev', jalur: '/uji-0/bapak-ahmad' });
  cek('rute: alamat pratinjau *.workers.dev menyajikannya (segmen pertama = pasangan)', await cekCustom(r.page));
  await r.ctx.close();
  r = await buka(k, 0, { host: 'rian-aini.mengundang.id', jalur: '/bapak-ahmad' });
  cek('rute: pasangan yang tidak di peta tetap memakai template', !(await cekCustom(r.page))
    && await r.page.evaluate(() => !!document.getElementById('mempelai')));
  await r.ctx.close();
  r = await buka(k, 0, { jalur: '/kirim' });
  cek('rute: jalur platform di subdomain tetap milik platform', await r.page.evaluate(() => /Panitia/.test(document.title)));
  await r.ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
