/* Uji tema: setiap tema di tema/daftar.json, dengan 0 / 1 / banyak foto,
   di layar HP dan layar lebar, lalu palet dan gaya teksnya.

   Yang dicari bukan "cantik" — itu dinilai mata dari tangkapan layarnya
   (tema-<kode>-<foto>-<lebar>.png). Yang dicari hal yang bisa salah diam-
   diam: halaman melebar ke samping di HP, bagian kosong yang tetap
   tampil, palet yang tidak terpasang, gaya teks yang jatuh ke bawaan,
   pilihan tak dikenal yang membuat halaman tanpa warna. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mulai } from './server.mjs';
import { ISI } from './stub.mjs';

const PORT = 4386, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const DAFTAR = JSON.parse(fs.readFileSync(new URL('../tema/daftar.json', import.meta.url), 'utf8'));

await mulai(PORT);
const browser = await chromium.launch();

/* Foto uji dibuat di peramban (canvas → JPEG), seperti uji-lihat: potret
   tegak dan foto mendatar, dengan "gaun" terang di tengah — tempat teks
   terang paling mudah hilang. */
async function bikinFoto(a, b, w, h){
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const b64 = await pg.evaluate(([a, b, w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(w / 2, h * .72, w * .2, h * .26, 0, 0, 7); g.fill();
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(w / 2, h * .38, Math.min(w, h) * .09, 0, 7); g.fill();
    return c.toDataURL('image/jpeg', .8).split(',')[1];
  }, [a, b, w, h]);
  await ctx.close();
  return Buffer.from(b64, 'base64');
}
const BERKAS = {
  'u/sampul.jpg':  await bikinFoto('#6b4a2b', '#e8d2a8', 1200, 1600),
  'u/pria.jpg':    await bikinFoto('#2b3b5b', '#b58a6a', 900, 1200),
  'u/wanita.jpg':  await bikinFoto('#5b2b3b', '#e0b0a0', 900, 1200),
  'u/datar.jpg':   await bikinFoto('#3d4a33', '#cdb894', 1600, 1000),
  'u/tegak.jpg':   await bikinFoto('#334a4a', '#b8cdc4', 1000, 1400)
};

const foto = (jalur, lain = {}) => Object.assign({
  jalur, kecil: jalur, lebar: 1000, tinggi: 1400, keterangan: null,
  fokus_x: 50, fokus_y: 50, zum: 1, tampilan: null }, lain);
const KOSONG = { sampul: null, pria: null, wanita: null, galeri: [] };
const GANJIL = { ...KOSONG, galeri: [foto('u/tegak.jpg'), foto('u/datar.jpg', { lebar: 1600, tinggi: 1000 }),
  foto('u/tegak.jpg'), foto('u/tegak.jpg'), foto('u/tegak.jpg')] };
const SATU   = { ...KOSONG, sampul: foto('u/sampul.jpg', { lebar: 1200, tinggi: 1600 }) };
const BANYAK = {
  sampul: foto('u/sampul.jpg', { lebar: 1200, tinggi: 1600, fokus_y: 40 }),
  pria:   foto('u/pria.jpg',   { lebar: 900, tinggi: 1200 }),
  wanita: foto('u/wanita.jpg', { lebar: 900, tinggi: 1200 }),
  galeri: [foto('u/datar.jpg', { lebar: 1600, tinggi: 1000, keterangan: 'Di pantai' }),
           foto('u/tegak.jpg'), foto('u/pria.jpg', { lebar: 900, tinggi: 1200 }),
           foto('u/wanita.jpg', { lebar: 900, tinggi: 1200 }), foto('u/tegak.jpg', { zum: 1.6, fokus_x: 30 }),
           foto('u/datar.jpg', { lebar: 1600, tinggi: 1000 })]
};

async function buka(isi, { lebar = 430, jalur = '/', reduced = false } = {}){
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 },
                                         reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const galat = [], diminta = [];
  page.on('pageerror', e => { galat.push(e.message); console.log('   [pageerror] ' + e.message); });
  page.on('request', r => diminta.push(r.url()));
  // Huruf Google tidak diunduh di uji: cukup lembar CSS kosong.
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/media/**', r => {
    const k = Object.keys(BERKAS).find(x => new URL(r.request().url()).pathname.endsWith('/' + x));
    return k ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: BERKAS[k] })
             : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/*.supabase.co/**', r => {
    const j = new URL(r.request().url()).pathname;
    const kirim = x => r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(x) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, body: '' });
    if (j.endsWith('/undangan_isi')) return kirim(isi);
    if (j.endsWith('/ucapan_publik')) return kirim([{ nama: 'Budi', hadir: 'Hadir', pesan: 'Selamat!', created_at: '2026-09-10T02:00:00Z' }]);
    return kirim(null);
  });
  await page.goto(ASAL + jalur);
  await page.waitForSelector('.cover-frame.siap', { timeout: 8000 });
  return { ctx, page, galat, diminta };
}

async function bukaUndangan(page){
  await page.click('#btnOpen');
  await page.waitForTimeout(1100);   // sampul memudar keluar (.9 detik)
  // semua .reveal ditampilkan supaya tangkapan layar penuh terbaca
  await page.evaluate(() => document.querySelectorAll('.reveal, .draw').forEach(e => e.classList.add('in')));
  await page.waitForTimeout(1000);   // transisi .reveal selesai
  await tungguGambar(page);
}

// foto lazy tidak pernah turun di luar layar; dipaksa turun, ditunggu paling lama 4 detik
async function tungguGambar(page){
  await page.evaluate(() => Promise.race([
    Promise.all([...document.images].filter(i => i.src).map(i => {
      i.loading = 'eager';
      // decode(): termuat belum berarti sudah tergambar (decoding="async")
      const dekode = () => i.decode ? i.decode().catch(() => {}) : null;
      return i.complete ? dekode() : new Promise(s => { i.onload = i.onerror = s; }).then(dekode);
    })),
    new Promise(s => setTimeout(s, 4000))]));
}

const melebar = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const isiDengan = (fotoIsi, lain = {}) => ({ ...ISI, foto: fotoIsi, ...lain });

for (const tema of DAFTAR) {
  const k = tema.kode;

  /* ---------- 0 / 1 / banyak foto × HP / layar lebar ---------- */
  for (const [nama, f] of [['0', KOSONG], ['1', SATU], ['banyak', BANYAK]]) {
    for (const lebar of [360, 1280]) {
      const { ctx, page, galat } = await buka(isiDengan(f, { tema: k }), { lebar });
      const sampul = await page.evaluate(() => !document.getElementById('sampulFoto').hidden);
      await page.waitForTimeout(1500);   // sampul dan fotonya memudar masuk
      await page.screenshot({ path: `tema-${k}-${nama}-${lebar}-sampul.png` });
      await bukaUndangan(page);
      const s = await page.evaluate(() => ({
        galeri: !document.getElementById('galeri').hidden,
        item: document.querySelectorAll('#galeriIsi .galeri-item').length,
        potret: document.querySelectorAll('#pasangan .person-foto img').length,
        mendatar: document.querySelectorAll('#galeriIsi .galeri-item.mendatar').length
      }));
      const lebih = await melebar(page);
      await page.screenshot({ path: `tema-${k}-${nama}-${lebar}.png`, fullPage: true });
      if (nama === 'banyak') for (const id of ['mempelai', 'galeri'])
        await page.locator('#' + id).screenshot({ path: `tema-${k}-${nama}-${lebar}-${id}.png` });
      const label = `${k} ${nama} foto @${lebar}`;
      cek(`${label}: tanpa galat, tidak melebar ke samping`, !galat.length && lebih <= 0, galat.join('; ') + ' lebih=' + lebih);
      if (nama === '0') cek(`${label}: sampul, galeri, potret tidak tampil`, !sampul && !s.galeri && s.potret === 0, JSON.stringify(s));
      if (nama === '0') {
        // acara di data uji sudah lewat: kotak hitung mundur tersembunyi, kalimat penggantinya tampil
        const h = await page.evaluate(() => ({ kotak: document.getElementById('countGrid').getClientRects().length,
          kalimat: document.getElementById('countDone').getClientRects().length }));
        cek(`${label}: sesudah hari-H kotak hitung mundur benar-benar hilang`, h.kotak === 0 && h.kalimat > 0, JSON.stringify(h));
      }
      if (nama === '1') cek(`${label}: sampul tampil, galeri tidak`, sampul && !s.galeri && s.potret === 0, JSON.stringify(s));
      if (nama === 'banyak' && lebar === 360) {
        /* galeri: datar, tegak×4, datar — pasangan rapi; tidak boleh ada
           foto tegak yang sendirian di barisnya kecuali ditandai .sendiri */
        const lubang = await page.evaluate(() => {
          const kotak = [...document.querySelectorAll('#galeriIsi .galeri-item')].map(b => b.getBoundingClientRect());
          const lebar = document.getElementById('galeriIsi').getBoundingClientRect().width;
          return kotak.filter(k => k.width < lebar * 0.7 && !kotak.some(l => l !== k && Math.abs(l.top - k.top) < 2)).length;
        });
        cek(`${label}: galeri tanpa petak kosong`, lubang === 0, 'foto tegak sendirian: ' + lubang);
      }
      if (nama === 'banyak') cek(`${label}: sampul, 2 potret, 6 galeri (2 mendatar)`,
        sampul && s.galeri && s.item === 6 && s.potret === 2 && s.mendatar === 2, JSON.stringify(s));
      await ctx.close();
    }
  }

  /* ---------- setiap palet terpasang ---------- */
  for (const p of tema.palet) {
    const { ctx, page, galat } = await buka(isiDengan(KOSONG, { tema: k, tema_setel: { palet: p.kode } }));
    const h = await page.evaluate(() => ({
      latar: getComputedStyle(document.body).backgroundColor,
      attr: document.documentElement.dataset.palet
    }));
    const rgb = 'rgb(' + [1, 3, 5].map(i => parseInt(p.latar.slice(i, i + 2), 16)).join(', ') + ')';
    cek(`${k} palet ${p.kode}: latar ${p.latar} terpasang`, h.latar === rgb && h.attr === p.kode && !galat.length, JSON.stringify(h));
    await ctx.close();
  }

  /* ---------- setiap gaya teks memasang hurufnya ---------- */
  for (const g of tema.huruf) {
    const { ctx, page } = await buka(isiDengan(KOSONG, { tema: k, tema_setel: { huruf: g.kode } }));
    const h = await page.evaluate(() => ({
      judul: getComputedStyle(document.querySelector('.cover-names')).fontFamily,
      tautan: (document.getElementById('temaHuruf') || {}).href || '',
      attr: document.documentElement.dataset.huruf
    }));
    const keluarga = g.judul.split(',')[0].replace(/'/g, '').trim();
    const bawaan = g.kode === tema.bawaan.huruf;
    cek(`${k} gaya teks ${g.kode}: judul ${keluarga}, ${bawaan ? 'tanpa tautan tambahan' : 'tautan hurufnya dipasang'}`,
      h.judul.includes(keluarga) && h.attr === g.kode &&
      (bawaan ? !h.tautan : h.tautan.includes(g.google.split('&')[0])), JSON.stringify(h));
    await ctx.close();
  }
}

/* ---------- galeri dengan foto tegak berjumlah ganjil ---------- */
for (const tema of DAFTAR) {
  const r = await buka(isiDengan(GANJIL, { tema: tema.kode }), { lebar: 360 });
  await bukaUndangan(r.page);
  const h = await r.page.evaluate(() => {
    const el = [...document.querySelectorAll('#galeriIsi .galeri-item')];
    const lebar = document.getElementById('galeriIsi').getBoundingClientRect().width;
    return { sendiri: el.map((e, i) => e.classList.contains('sendiri') ? i : -1).filter(i => i >= 0),
             penuh: el.filter(e => e.getBoundingClientRect().width > lebar * 0.9).length };
  });
  cek(`${tema.kode}: galeri tegak ganjil — yang tak berpasangan dilebarkan (tanpa petak kosong)`,
    JSON.stringify(h.sendiri) === '[0,4]' && h.penuh === 3, JSON.stringify(h));
  await r.ctx.close();
}

/* ---------- pilihan tak dikenal jatuh ke bawaan ---------- */
{
  const t = DAFTAR[0];
  const { ctx, page } = await buka(isiDengan(KOSONG, { tema: t.kode, tema_setel: { palet: 'sudah-dihapus', huruf: 'tidak-ada' } }));
  const h = await page.evaluate(() => ({ p: document.documentElement.dataset.palet, h: document.documentElement.dataset.huruf }));
  cek('palet & gaya teks tak dikenal → bawaan tema', h.p === t.bawaan.palet && h.h === t.bawaan.huruf, JSON.stringify(h));
  await ctx.close();
}
{
  const { ctx, page, galat } = await buka(isiDengan(KOSONG, { tema: 'tidak-ada-tema' }));
  const h = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  cek('tema yang foldernya tidak ada: halaman tetap bertampilan bawaan', h === 'rgb(19, 30, 51)' && !galat.length, h);
  await ctx.close();
}
{
  // nama yang mencoba keluar dari folder tema tidak pernah dipakai sebagai alamat
  const { ctx, page, diminta } = await buka(isiDengan(KOSONG, { tema: '../dasbor' }));
  cek('nama tema "../dasbor" tidak dipakai sebagai alamat berkas',
    !diminta.some(u => u.includes('/dasbor')) && await page.evaluate(() => document.documentElement.dataset.tema) === 'ukir-jepara',
    diminta.filter(u => !u.includes('supabase')).join(' '));
  await ctx.close();
}

/* ---------- pratinjau dasbor menimpa, tamu biasa tidak ---------- */
{
  const t = DAFTAR[0], lain = t.palet[1];
  let r = await buka(isiDengan(KOSONG, { tema: t.kode }), { jalur: `/?pratinjau=1&palet=${lain.kode}` });
  let p = await r.page.evaluate(() => document.documentElement.dataset.palet);
  cek('?pratinjau=1&palet=… menimpa pilihan tersimpan', p === lain.kode, p);
  await r.ctx.close();
  r = await buka(isiDengan(KOSONG, { tema: t.kode }), { jalur: `/?palet=${lain.kode}` });
  p = await r.page.evaluate(() => document.documentElement.dataset.palet);
  cek('tanpa pratinjau=1, ?palet= diabaikan', p === t.bawaan.palet, p);
  await r.ctx.close();
}

/* ---------- foto galeri dibuka besar ---------- */
{
  const { ctx, page } = await buka(isiDengan(BANYAK));
  await bukaUndangan(page);
  await page.click('#galeriIsi .galeri-item >> nth=0');
  const buka1 = await page.evaluate(() => ({ tampil: !document.getElementById('lihatFoto').hidden,
    src: document.getElementById('lihatGambar').getAttribute('src') }));
  await page.screenshot({ path: 'tema-lihat-foto.png' });
  await page.keyboard.press('Escape');
  const tutup = await page.evaluate(() => document.getElementById('lihatFoto').hidden);
  cek('foto galeri dibuka besar (berkas penuh), Escape menutup',
    buka1.tampil && buka1.src === '/media/u/datar.jpg' && tutup, JSON.stringify(buka1));
  await ctx.close();
}

/* ---------- halaman lama tanpa kunci foto (sebelum 036) ---------- */
{
  const lama = { ...ISI }; delete lama.foto; delete lama.tema_setel;
  const { ctx, page, galat } = await buka(lama);
  await bukaUndangan(page);
  cek('jawaban undangan_isi tanpa kunci foto/tema_setel tetap jalan', !galat.length &&
    await page.evaluate(() => document.getElementById('galeri').hidden), galat.join('; '));
  await ctx.close();
}

/* ---------- halaman terima kasih mengikuti tema undangannya ---------- */
async function bukaKenangan(isi, lebar = 430){
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 } });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => { galat.push(e.message); console.log('   [pageerror] ' + e.message); });
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/media/**', r => {
    const k = Object.keys(BERKAS).find(x => new URL(r.request().url()).pathname.endsWith('/' + x));
    return k ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: BERKAS[k] }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/*.supabase.co/**', r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, body: '' });
    return r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(isi) });
  });
  await page.goto(ASAL + '/terimakasih?pasangan=rian-aini');
  await page.waitForFunction(() => document.body.dataset.siap === 'isi', null, { timeout: 8000 });
  return { ctx, page, galat };
}
const kenangan = (lain = {}) => ({
  slug: 'rian-aini', aktif: true, tanggal_acara: '2026-09-15', kota: 'jepara', hadir: null,
  mempelai: ISI.mempelai, tema: 'ukir-jepara', tema_setel: {},
  foto: [{ id: 'k1', jenis: 'foto', jalur: 'u/sampul.jpg', kecil: 'u/sampul.jpg', lebar: 1200, tinggi: 1600,
           keterangan: null, acara_id: null, bagian: 'sampul', latar: true }],
  babak: [{ id: 'A1', nama: 'Akad Nikah', tanggal: 'Selasa, 15 September 2026', jam: '08.00 WIB',
            teks: 'Pagi yang hening.', jumlah_foto: 0, latar: null }],
  blok: {}, vendor: [], angka: { hadir: null, ucapan: null, foto: 1, babak: 1 }, ucapan: [], ...lain });

for (const tema of DAFTAR) {
  const k = tema.kode;
  for (const lebar of [360, 1280]) {
    const { ctx, page, galat } = await bukaKenangan(kenangan({ tema: k }), lebar);
    const h = await page.evaluate(() => ({ href: document.getElementById('temaGaya').getAttribute('href'),
      lebih: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    await page.waitForTimeout(1800);   // isi sampul memudar masuk
    await page.screenshot({ path: `tema-${k}-kenangan-${lebar}.png` });
    cek(`${k} kenangan @${lebar}: memuat kenangan.css temanya, tanpa galat, tidak melebar`,
      h.href === `/tema/${k}/kenangan.css` && !galat.length && h.lebih <= 0, JSON.stringify(h) + galat.join('; '));
    await ctx.close();
  }
  for (const p of tema.palet) {
    const { ctx, page } = await bukaKenangan(kenangan({ tema: k, tema_setel: { palet: p.kode } }));
    const latar = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const rgb = 'rgb(' + [1, 3, 5].map(i => parseInt(p.latar.slice(i, i + 2), 16)).join(', ') + ')';
    cek(`${k} kenangan palet ${p.kode}: palet undangan ikut terpasang`, latar === rgb, latar);
    await ctx.close();
  }
  const lain = tema.huruf.find(h => h.kode !== tema.bawaan.huruf);
  if (lain) {
    const { ctx, page } = await bukaKenangan(kenangan({ tema: k, tema_setel: { huruf: lain.kode } }));
    const h = await page.evaluate(() => ({ f: getComputedStyle(document.querySelector('.nama-besar')).fontFamily,
      t: (document.getElementById('temaHuruf') || {}).href || '' }));
    cek(`${k} kenangan gaya teks ${lain.kode}: hurufnya ikut terpasang`,
      h.f.includes(lain.judul.split(',')[0].replace(/'/g, '').trim()) && h.t.includes('fonts.googleapis.com'), JSON.stringify(h));
    await ctx.close();
  }
}
{
  const { ctx, page, galat } = await bukaKenangan(kenangan({ tema: 'tidak-ada-tema' }));
  const h = await page.evaluate(() => ({ latar: getComputedStyle(document.body).backgroundColor,
    href: document.getElementById('temaGaya').getAttribute('href') }));
  cek('kenangan dengan tema yang tidak ada: tetap kenangan.css bawaan', h.latar === 'rgb(19, 30, 51)' &&
    h.href === '/tema/ukir-jepara/kenangan.css' && !galat.length, JSON.stringify(h));
  await ctx.close();
}
{
  const lama = kenangan(); delete lama.tema; delete lama.tema_setel;
  const { ctx, page, galat } = await bukaKenangan(lama);
  cek('jawaban terimakasih_isi lama (tanpa tema) tetap jalan', !galat.length &&
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(19, 30, 51)', galat.join('; '));
  await ctx.close();
}

/* ---------- Dua Bingkai: potret, ornamen, teks di atas foto ---------- */
if (DAFTAR.some(t => t.kode === 'dua-bingkai')) {
  const potretnya = page => page.evaluate(() => [...document.querySelectorAll('#pasangan .person-foto')]
    .map(e => e.dataset.mode + ':' + (e.querySelector('img') ? 'img' : e.textContent.trim() || (e.querySelector('svg') ? 'svg' : ''))));

  let r = await buka(isiDengan(KOSONG, { tema: 'dua-bingkai' }));
  await bukaUndangan(r.page);
  let pt = await potretnya(r.page);
  cek('dua-bingkai tanpa foto: kedua bingkai tetap terisi huruf awal', pt.join(' ') === "monogram:A monogram:R", pt.join(' '));
  const orn = await r.page.evaluate(() => ({
    use: [...document.querySelectorAll('use')].map(u => u.getAttribute('href')),
    ok: [...document.querySelectorAll('svg.divider')].every(s => s.getBoundingClientRect().height > 0)
  }));
  cek('dua-bingkai: ornamen ditukar ke berkas temanya', orn.use.length > 0 &&
    orn.use.every(h => h.startsWith('/tema/dua-bingkai/ornamen.svg#')), orn.use.slice(0, 3).join(' '));
  await r.page.locator('#mempelai').screenshot({ path: 'tema-dua-bingkai-0-mempelai.png' });
  await r.ctx.close();

  r = await buka(isiDengan(BANYAK, { tema: 'dua-bingkai', tema_setel: { mode_wanita: 'siluet', mode_pria: 'foto' } }));
  await bukaUndangan(r.page);
  pt = await potretnya(r.page);
  cek('dua-bingkai: tiap mempelai memilih sendiri — wanita siluet, pria foto', pt.join(' ') === 'siluet:svg foto:img', pt.join(' '));
  await tungguGambar(r.page);
  cek('dua-bingkai: foto potret benar-benar termuat', await r.page.evaluate(() =>
    document.querySelector('#pasangan .person-foto img').naturalWidth > 0));
  await r.page.locator('#mempelai').screenshot({ path: 'tema-dua-bingkai-campur-mempelai.png' });
  await r.ctx.close();

  r = await buka(isiDengan(BANYAK, { tema: 'dua-bingkai', tema_setel: { mode_pria: 'tidak-ada', mode_wanita: 'monogram' } }));
  await bukaUndangan(r.page);
  pt = await potretnya(r.page);
  cek('dua-bingkai: mode tak dikenal → pilihan pertama (foto); monogram tetap monogram walau ada foto',
    pt.join(' ') === 'monogram:A foto:img', pt.join(' '));
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { tema: 'ukir-jepara', tema_setel: { mode_pria: 'siluet' } }));
  await bukaUndangan(r.page);
  pt = await potretnya(r.page);
  cek('ukir-jepara tidak punya setelan mode: tanpa foto, tanpa bingkai (seperti sebelumnya)', pt.length === 0, pt.join(' '));
  await r.ctx.close();

  /* kenangan: tulisan bab berfoto memakai --terang, bukan --teks */
  const k = await bukaKenangan(kenangan({ tema: 'dua-bingkai',
    babak: [{ id: 'A1', nama: 'Akad Nikah', tanggal: 'Selasa', jam: '08.00', teks: 'Pagi.', jumlah_foto: 1, latar: null }],
    foto: [{ id: 'k1', jenis: 'foto', jalur: 'u/sampul.jpg', kecil: 'u/sampul.jpg', lebar: 1200, tinggi: 1600, keterangan: null, acara_id: null, bagian: 'sampul', latar: true },
           { id: 'k2', jenis: 'foto', jalur: 'u/datar.jpg', kecil: 'u/datar.jpg', lebar: 1600, tinggi: 1000, keterangan: null, acara_id: 'A1', bagian: null, latar: true }] }));
  await k.page.waitForTimeout(1800);
  const w = await k.page.evaluate(() => ({
    sampul: getComputedStyle(document.getElementById('namaBesar')).color,
    bab: (() => { const j = document.querySelector('.bab:not(.polos) .judul'); return j ? getComputedStyle(j).color : ''; })(),
    use: [...document.querySelectorAll('use')].map(u => u.getAttribute('href')).filter(h => !h.startsWith('/tema/dua-bingkai/')
      && !h.startsWith('#ikon'))
  }));
  const terang = 'rgb(241, 242, 235)';
  cek('dua-bingkai kenangan: nama di sampul berfoto dan judul bab berfoto berwarna terang',
    w.sampul === terang && w.bab === terang, JSON.stringify(w));
  cek('dua-bingkai kenangan: ornamen yang digambar sesudah memuat ikut ditukar', w.use.length === 0, w.use.join(' '));
  await k.page.screenshot({ path: 'tema-dua-bingkai-kenangan-berfoto.png' });
  await k.ctx.close();
}

/* ---------- Monokrom: foto hitam putih, judul majalah ---------- */
if (DAFTAR.some(t => t.kode === 'monokrom')) {
  const saring = page => page.evaluate(() => ({
    attr: document.documentElement.dataset.warnaFoto,
    galeri: getComputedStyle(document.querySelector('#galeriIsi img')).filter,
    sampul: getComputedStyle(document.getElementById('sampulGambar')).filter,
    judul: getComputedStyle(document.querySelector('.cover-names')).textTransform
  }));
  let r = await buka(isiDengan(BANYAK, { tema: 'monokrom' }));
  await bukaUndangan(r.page);
  let h = await saring(r.page);
  cek('monokrom: semua foto hitam putih, judul kapital (bawaan)',
    h.attr === 'hitam-putih' && h.galeri.includes('grayscale(1)') && h.sampul.includes('grayscale(1)') && h.judul === 'uppercase', JSON.stringify(h));
  for (const id of ['mempelai', 'galeri']) await r.page.locator('#' + id).screenshot({ path: `tema-monokrom-banyak-${id}.png` });
  await r.ctx.close();

  r = await buka(isiDengan(BANYAK, { tema: 'monokrom', tema_setel: { warna_foto: 'asli' } }));
  await bukaUndangan(r.page);
  h = await saring(r.page);
  cek('monokrom "Warna asli": foto tidak disaring', h.attr === 'asli' && h.galeri === 'none' && h.sampul === 'none', JSON.stringify(h));
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { tema: 'ukir-jepara' }));
  h = await r.page.evaluate(() => getComputedStyle(document.querySelector('.cover-names')).textTransform);
  cek('ukir-jepara tidak ikut kapital', h === 'none', h);
  await r.ctx.close();

  const k = await bukaKenangan(kenangan({ tema: 'monokrom',
    babak: [{ id: 'A1', nama: 'Akad Nikah', tanggal: 'Selasa', jam: '08.00', teks: 'Pagi.', jumlah_foto: 1, latar: null }],
    foto: [{ id: 'k1', jenis: 'foto', jalur: 'u/sampul.jpg', kecil: 'u/sampul.jpg', lebar: 1200, tinggi: 1600, keterangan: null, acara_id: null, bagian: 'sampul', latar: true },
           { id: 'k2', jenis: 'foto', jalur: 'u/datar.jpg', kecil: 'u/datar.jpg', lebar: 1600, tinggi: 1000, keterangan: null, acara_id: 'A1', bagian: null, latar: true }] }));
  await k.page.waitForTimeout(1800);
  const w = await k.page.evaluate(() => ({
    f: getComputedStyle(document.querySelector('.lapis img:not(.buram)')).filter,
    t: getComputedStyle(document.querySelector('.nama-besar')).textTransform,
    c: getComputedStyle(document.getElementById('namaBesar')).color }));
  cek('monokrom kenangan: foto bab hitam putih, nama kapital, tulisan di atas foto terang',
    w.f.includes('grayscale(1)') && w.t === 'uppercase' && w.c === 'rgb(247, 245, 240)', JSON.stringify(w));
  await k.page.screenshot({ path: 'tema-monokrom-kenangan-berfoto.png' });
  await k.ctx.close();
}

/* ---------- Senja di Alam: palet dari foto ---------- */
if (DAFTAR.some(t => t.kode === 'senja-alam')) {
  const pf = { latar: '#EFF3ED', teks: '#2F4125', aksen: '#638B4B', latar_2: '#E3EADF', kertas: '#F8FAF8',
               kertas_2: '#E4EAE0', kertas_teks: '#2F4125', kertas_aksen: '#577B42', ornamen: '#638B4B' };
  let r = await buka(isiDengan(SATU, { tema: 'senja-alam', tema_setel: { palet: 'foto', palet_foto: pf } }));
  let h = await r.page.evaluate(() => ({ latar: getComputedStyle(document.body).backgroundColor,
    attr: document.documentElement.dataset.palet }));
  cek('senja-alam palet "Dari foto": warna dari foto terpasang', h.latar === 'rgb(239, 243, 237)' && h.attr === 'foto', JSON.stringify(h));
  await bukaUndangan(r.page);
  await r.page.screenshot({ path: 'tema-senja-alam-dari-foto.png', fullPage: true });
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { tema: 'monokrom', tema_setel: { palet: 'foto', palet_foto: pf } }));
  h = await r.page.evaluate(() => document.documentElement.dataset.palet);
  cek('monokrom tidak menawarkan palet foto: setelan "foto" jatuh ke bawaan', h === 'arang', h);
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { tema: 'senja-alam', tema_setel: { palet: 'foto' } }));
  h = await r.page.evaluate(() => document.documentElement.dataset.palet);
  cek('senja-alam "foto" tanpa warna tersimpan: jatuh ke bawaan', h === 'senja-pantai', h);
  await r.ctx.close();
}

await browser.close();
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
