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

/* Tema katalog, tema custom (tema/custom/<kode>/), dan kerangkanya
   (tema/custom/_contoh, dilayani di uji sebagai custom/contoh-uji karena
   "_" bukan kode tema yang sah). Tema custom diuji persis seperti katalog
   — Full Custom tidak boleh jadi warga kelas dua yang diam-diam rusak. */
import { semuaManifest, TEMA as DIR_TEMA } from '../tema/bangun-daftar.mjs';
import path from 'node:path';
const KERANGKA = path.join(DIR_TEMA, 'custom', '_contoh');
const DAFTAR = [
  ...JSON.parse(fs.readFileSync(new URL('../tema/daftar.json', import.meta.url), 'utf8')),
  ...semuaManifest().filter(t => t.m.kategori === 'custom').map(t => t.m),
  { ...JSON.parse(fs.readFileSync(path.join(KERANGKA, 'tema.json'), 'utf8')), kode: 'custom/contoh-uji' }
];
const nm = k => k.replace(/\//g, '-');   // nama berkas tangkapan layar

await mulai(PORT);
const browser = await chromium.launch();
/* Setiap konteks peramban melayani kerangka di /tema/custom/contoh-uji/. */
const konteksAsli = browser.newContext.bind(browser);
browser.newContext = async (o) => {
  const c = await konteksAsli(o);
  await c.route('**/tema/custom/contoh-uji/**', r => {
    const nama = decodeURIComponent(new URL(r.request().url()).pathname.split('/contoh-uji/')[1] || '');
    const f = path.join(KERANGKA, nama);
    if (!nama || nama.includes('..') || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let isi = fs.readFileSync(f);
    if (nama === 'tema.json') isi = JSON.stringify({ ...JSON.parse(isi), kode: 'custom/contoh-uji' });
    const jenis = { css: 'text/css', json: 'application/json', svg: 'image/svg+xml', js: 'text/javascript' }[nama.split('.').pop()] || 'application/octet-stream';
    return r.fulfill({ status: 200, contentType: jenis, body: isi });
  });
  return c;
};

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
      await page.screenshot({ path: `tema-${nm(k)}-${nama}-${lebar}-sampul.png` });
      await bukaUndangan(page);
      const s = await page.evaluate(() => ({
        galeri: !document.getElementById('galeri').hidden,
        item: document.querySelectorAll('#galeriIsi .galeri-item').length,
        potret: document.querySelectorAll('#pasangan .person-foto img').length,
        mendatar: document.querySelectorAll('#galeriIsi .galeri-item.mendatar').length
      }));
      const lebih = await melebar(page);
      await page.screenshot({ path: `tema-${nm(k)}-${nama}-${lebar}.png`, fullPage: true });
      if (nama === 'banyak') for (const id of ['mempelai', 'galeri'])
        await page.locator('#' + id).screenshot({ path: `tema-${nm(k)}-${nama}-${lebar}-${id}.png` });
      const label = `${k} ${nama} foto @${lebar}`;
      cek(`${label}: tanpa galat, tidak melebar ke samping`, !galat.length && lebih <= 0, galat.join('; ') + ' lebih=' + lebih);
      if (nama === '0' && lebar === 360) {
        /* Ornamen benar-benar tergambar: <use> ke berkas ornamen yang rusak
           tetap ada di DOM, hanya kosong. getBBox() melihat isinya. */
        const orn = await page.evaluate(() => [...document.querySelectorAll('svg.divider use')]
          .filter(u => u.closest('svg').getClientRects().length)
          .map(u => { try { return u.getBBox().width; } catch (e) { return 0; } }));
        cek(`${label}: ornamen pemisah tergambar`, orn.length > 0 && orn.every(w => w > 10), orn.join(','));
      }
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
    /* nama di sampul memakai huruf judul ATAU naskah gaya teks itu
       (Studio Anggun: nama dalam huruf tulisan tangan) */
    const kel = x => x.split(',')[0].replace(/'/g, '').trim();
    const keluarga = h => [kel(g.judul), kel(g.naskah)].find(k => h.includes(k));
    const bawaan = g.kode === tema.bawaan.huruf;
    cek(`${k} gaya teks ${g.kode}: nama berhuruf ${kel(g.judul)}/${kel(g.naskah)}, ${bawaan ? 'tanpa tautan tambahan' : 'tautan hurufnya dipasang'}`,
      !!keluarga(h.judul) && h.attr === g.kode &&
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
    const g = document.getElementById('galeriIsi');
    return { sendiri: el.map((e, i) => e.classList.contains('sendiri') ? i : -1).filter(i => i >= 0),
             penuh: el.filter(e => e.getBoundingClientRect().width > lebar * 0.9).length,
             // satu baris = rentang tegak setiap foto bertumpang dengan foto pertama
             // (foto mendatar lebih pendek dan ditengahkan, jadi tepi atasnya beda)
             strip: getComputedStyle(g).overflowX === 'auto' && el.every(e => {
               const a = e.getBoundingClientRect(), b = el[0].getBoundingClientRect();
               return a.top < b.bottom && a.bottom > b.top; }) };
  });
  /* tema bergaleri strip (Dokumenter) tidak punya petak sama sekali: satu baris yang digeser */
  cek(`${tema.kode}: galeri tegak ganjil — ${h.strip ? 'strip satu baris' : 'yang tak berpasangan dilebarkan (tanpa petak kosong)'}`,
    JSON.stringify(h.sendiri) === '[0,4]' && (h.strip || h.penuh === 3), JSON.stringify(h));
  await r.ctx.close();
}

/* ---------- teks pembuka menurut agama (037) ---------- */
{
  const baca = page => page.evaluate(() => {
    const t = sel => { const e = document.querySelector(sel); return !e ? null : (e.hidden || !e.getClientRects().length ? '(sembunyi)' : e.textContent.trim()); };
    return {
      attr: document.documentElement.dataset.pembuka,
      basmalah: t('.cover-basmalah'), label: t('.cover-label'), ayat: t('.hero-arabic'), salam: t('#mulai .hero-salam'),
      sumber: t('.hero-source'), alis: t('#mempelai .eyebrow'), selesai: document.querySelector('#countDone span').textContent,
      hadir: document.querySelector('#inHadir option[value="Hadir"]').textContent,
      contoh: document.getElementById('inPesan').getAttribute('placeholder'),
      tutup: t('#penutup .hero-salam'),
      wa: window.MENGUNDANG.pesanWA('Bapak Budi', 'bapak-budi', null)
    };
  });
  let r = await buka(isiDengan(KOSONG));
  await bukaUndangan(r.page);
  let h = await baca(r.page);
  cek('pembuka bawaan (tanpa kunci, pasangan lama): teks Islam persis seperti sebelumnya',
    h.attr === 'islam' && h.basmalah === 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ' && h.label === "Walimatul 'Ursy" &&
    h.salam === "Assalamu'alaikum Warahmatullahi Wabarakatuh" && h.sumber === 'QS. Ar-Rum : 21' &&
    h.selesai === 'Alhamdulillah, hari bahagia telah tiba.' && h.hadir === 'Insya Allah hadir' &&
    h.wa.startsWith("Assalamu'alaikum Warahmatullahi Wabarakatuh\n\nYth.") && h.wa.includes("Wassalamu'alaikum"), JSON.stringify(h));
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { pembuka: 'hindu' }));
  await bukaUndangan(r.page);
  h = await baca(r.page);
  cek('pembuka Hindu: Om Swastiastu, Rgveda, tanpa basmalah dan ayat Arab, salam WA ikut',
    h.attr === 'hindu' && h.basmalah === '(sembunyi)' && h.ayat === '(sembunyi)' && h.label === 'Pawiwahan' &&
    h.salam === 'Om Swastiastu' && h.sumber === 'Rgveda X.85.42' && h.tutup === 'Om Shanti Shanti Shanti Om' &&
    h.hadir === 'Saya akan hadir' && !/Allah|Assalam|Insya/.test(JSON.stringify(h)) &&
    h.wa.startsWith('Om Swastiastu\n\nYth.'), JSON.stringify(h));
  await r.page.screenshot({ path: 'pembuka-hindu-mulai.png' });
  await r.ctx.close();

  r = await buka(isiDengan(KOSONG, { pembuka: 'umum' }));
  await bukaUndangan(r.page);
  h = await baca(r.page);
  cek('pembuka umum: tanpa salam, ayat, kutipan, dan salam penutup; WA tanpa salam',
    h.salam === '(sembunyi)' && h.ayat === '(sembunyi)' && h.sumber === '(sembunyi)' && h.tutup === '(sembunyi)' &&
    h.label === 'Undangan Pernikahan' && h.wa.startsWith('Yth.') && !/Allah|Assalam|Tuhan|Om /.test(h.wa), JSON.stringify(h));
  await r.ctx.close();

  for (const k of ['kristen', 'katolik', 'buddha']) {
    r = await buka(isiDengan(KOSONG, { pembuka: k, tema: 'dua-bingkai' }));
    await bukaUndangan(r.page);
    h = await baca(r.page);
    cek(`pembuka ${k}: teksnya sendiri, tanpa teks Islam`, h.attr === k && h.basmalah === '(sembunyi)' &&
      !/Allah Subhanahu|Assalam|Insya|Barakallah|Ar-Rum/.test(JSON.stringify(h)), JSON.stringify(h));
    await r.ctx.close();
  }

  r = await buka(isiDengan(KOSONG, { pembuka: 'agama-tak-dikenal' }));
  h = await r.page.evaluate(() => document.documentElement.dataset.pembuka);
  cek('pembuka tak dikenal jatuh ke islam (bawaan database)', h === 'islam', h);
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
    await page.screenshot({ path: `tema-${nm(k)}-kenangan-${lebar}.png` });
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
      // nama besar boleh memakai --judul atau --naskah (tulisan tangan), sama seperti sampul undangan
      [lain.judul, lain.naskah].some(f => h.f.includes(f.split(',')[0].replace(/'/g, '').trim())) && h.t.includes('fonts.googleapis.com'), JSON.stringify(h));
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

/* ---------- Dokumenter: JS tema (tata.js) ---------- */
if (DAFTAR.some(t => t.kode === 'dokumenter')) {
  const baca = page => page.evaluate(() => ({
    tata: !!document.querySelector('script[data-tata="dokumenter"]'),
    cap: [...document.querySelectorAll('#galeriIsi .cap-tanggal')].map(e => e.textContent),
    miring: [...document.querySelectorAll('#galeriIsi .galeri-item')].map(e => e.style.getPropertyValue('--miring')),
    strip: getComputedStyle(document.getElementById('galeriIsi')).overflowX
  }));
  let r = await buka(isiDengan(BANYAK, { tema: 'dokumenter' }));
  await bukaUndangan(r.page);
  await r.page.waitForFunction(() => document.querySelector('#galeriIsi .cap-tanggal'), null, { timeout: 4000 }).catch(() => {});
  let h = await baca(r.page);
  cek('dokumenter: tata.js dimuat — cap tanggal "15 9 \'26" di tiap foto galeri, polaroid miring tetap',
    h.tata && h.cap.length === 6 && h.cap.every(c => c === "15 9 '26") && h.miring.every(m => /deg$/.test(m)) && h.strip === 'auto', JSON.stringify(h));
  const m1 = h.miring.join();
  await r.page.evaluate(() => window.MENGUNDANG.tema.jalankanTata(document));
  h = await baca(r.page);
  cek('dokumenter: tata.js aman dipanggil berulang (cap tidak dobel, miring tidak berubah)', h.cap.length === 6 && h.miring.join() === m1, JSON.stringify(h));
  await r.page.locator('#galeri').screenshot({ path: 'tema-dokumenter-galeri.png' });
  await r.page.locator('#mempelai').screenshot({ path: 'tema-dokumenter-mempelai.png' });
  await r.ctx.close();

  /* tanpa tata.js: halaman tetap utuh */
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 } });
  const pg = await ctx.newPage();
  const galat = []; pg.on('pageerror', e => galat.push(e.message));
  await pg.route('**/tema/dokumenter/tata.js', x => x.fulfill({ status: 404, body: '' }));
  await pg.route('**/fonts.googleapis.com/**', x => x.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await pg.route('**/media/**', x => x.fulfill({ status: 404, body: '' }));
  await pg.route('**/*.supabase.co/**', x => x.request().method() === 'OPTIONS' ? x.fulfill({ status: 204, body: '' })
    : x.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(new URL(x.request().url()).pathname.endsWith('/undangan_isi') ? isiDengan(BANYAK, { tema: 'dokumenter' }) : []) }));
  await pg.goto(ASAL + '/');
  await pg.waitForSelector('.cover-frame.siap', { timeout: 8000 });
  await pg.click('#btnOpen'); await pg.waitForTimeout(600);
  const t = await pg.evaluate(() => ({ item: document.querySelectorAll('#galeriIsi .galeri-item').length,
    cap: document.querySelectorAll('.cap-tanggal').length, lebih: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  cek('dokumenter tanpa tata.js (gagal dimuat): galeri tetap tampil, tanpa galat, tidak melebar',
    t.item === 6 && t.cap === 0 && t.lebih <= 0 && !galat.length, JSON.stringify(t) + galat.join(';'));
  await ctx.close();
}

/* ---------- Adat Nusantara: ornamen mengikuti daerah ---------- */
{
  const ornamen = page => page.evaluate(() => ({
    href: [...new Set([...document.querySelectorAll('use')].map(u => u.getAttribute('href')).filter(h => /pemisah|sudut/.test(h)))],
    lebar: [...document.querySelectorAll('svg.divider use, svg.corner use')].filter(u => u.closest('svg').getClientRects().length)
      .map(u => { try { return Math.round(u.getBBox().width); } catch (e) { return 0; } })
  }));
  let r = await buka(isiDengan(KOSONG, { tema: 'ukir-jepara' }));
  let h = await ornamen(r.page);
  cek('adat Jawa (bawaan): ornamen ukir tertanam, tidak berubah', h.href.join(' ') === '#ukir-sudut #ukir-pemisah', h.href.join(' '));
  await r.ctx.close();
  for (const d of ['sunda', 'bugis', 'bali']) {
    r = await buka(isiDengan(KOSONG, { tema: 'ukir-jepara', tema_setel: { daerah: d } }));
    h = await ornamen(r.page);
    const pal = await r.page.evaluate(() => document.documentElement.dataset.palet);
    cek(`adat ${d} tanpa warna tersimpan: warna pertama daerahnya`, pal === { sunda: 'hijau-siger', bugis: 'marun-songket', bali: 'prada' }[d], pal);
    cek(`adat ${d}: ornamen dari ornamen-${d}.svg dan tergambar`,
      h.href.length === 2 && h.href.every(x => x.startsWith(`/tema/ukir-jepara/ornamen-${d}.svg#`)) && h.lebar.length > 0 && h.lebar.every(w => w > 10),
      JSON.stringify(h));
    await r.page.waitForTimeout(1200);
    await r.page.screenshot({ path: `tema-adat-${d}-sampul.png` });
    await bukaUndangan(r.page);
    await r.page.locator('#mempelai').screenshot({ path: `tema-adat-${d}-mempelai.png` });
    await r.ctx.close();
  }
  const k = await bukaKenangan(kenangan({ tema: 'ukir-jepara', tema_setel: { daerah: 'bali' } }));
  const kh = await k.page.evaluate(() => [...new Set([...document.querySelectorAll('use')].map(u => u.getAttribute('href')).filter(h => /pemisah/.test(h)))]);
  cek('adat Bali di halaman terima kasih: ornamen yang digambar belakangan ikut daerahnya',
    kh.length > 0 && kh.every(x => x === '/tema/ukir-jepara/ornamen-bali.svg#pemisah'), kh.join(' '));
  await k.ctx.close();
}

/* ---------- Kisah kami (038): slot di semua tema ---------- */
{
  const BAB = [
    { tahun: '2015', judul: 'Pertama bertemu', teks: 'Satu kelas di semester pertama, berbagi catatan sebelum ujian.', foto: foto('u/tegak.jpg') },
    { tahun: null, judul: 'Saling mengenal', teks: null, foto: null },
    { tahun: '2025', judul: 'Lamaran', teks: 'Dua keluarga bertemu di Jepara.', foto: foto('u/datar.jpg', { lebar: 1600, tinggi: 1000 }) },
    { tahun: '2026', judul: 'Menikah <b>', teks: 'Dan kisah ini berlanjut.', foto: null }
  ];
  let r = await buka(isiDengan(KOSONG, { tema: 'ukir-jepara' }));
  await bukaUndangan(r.page);
  let h = await r.page.evaluate(() => ({ sembunyi: document.getElementById('kisah').hidden,
    tampak: document.getElementById('kisah').getClientRects().length }));
  cek('kisah: tanpa bab (pasangan lama / belum diisi) bagian tidak tampil', h.sembunyi && h.tampak === 0, JSON.stringify(h));
  await r.ctx.close();

  for (const tema of DAFTAR) {
    for (const lebar of [360, 1280]) {
      r = await buka(isiDengan(BANYAK, { tema: tema.kode, kisah: BAB }), { lebar });
      await bukaUndangan(r.page);
      h = await r.page.evaluate(() => {
        const s = document.getElementById('kisah');
        const bab = [...s.querySelectorAll('.kisah-bab')];
        const kotak = s.getBoundingClientRect();
        return {
          tampak: !s.hidden && s.getClientRects().length > 0,
          urutan: s.compareDocumentPosition(document.getElementById('mempelai')) & Node.DOCUMENT_POSITION_PRECEDING,
          bab: bab.length,
          kelas: bab.map(b => b.classList.contains('ada-foto') ? 'f' : 't').join(''),
          tahun: [...s.querySelectorAll('.kisah-tahun')].map(e => e.textContent).join('|'),
          judulAman: bab[3].querySelector('.kisah-judul').textContent === 'Menikah <b>' && !bab[3].querySelector('b'),
          foto: [...s.querySelectorAll('.kisah-foto img')].map(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 40),
          keluar: bab.some(b => { const k = b.getBoundingClientRect(); return k.left < kotak.left - 1 || k.right > kotak.right + 1; }),
          terbaca: bab.every(b => { const j = b.querySelector('.kisah-judul'); return getComputedStyle(j).opacity === '1' && j.getBoundingClientRect().height > 0; })
        };
      });
      const lebih = await melebar(r.page);
      cek(`kisah ${tema.kode} ${lebar}: empat bab setelah mempelai, foto tergambar, tidak melebar, judul ter-escape`,
        h.tampak && h.urutan && h.bab === 4 && h.kelas === 'ftft' && h.tahun === '2015|2025|2026' && h.judulAman
        && h.foto.length === 2 && h.foto.every(Boolean) && !h.keluar && h.terbaca && lebih <= 0 && !r.galat.length,
        JSON.stringify({ ...h, lebih, galat: r.galat }));
      await r.page.locator('#kisah').screenshot({ path: `tema-${nm(tema.kode)}-kisah-${lebar}.png` });
      await r.ctx.close();
    }
  }

  /* gerak dikurangi: garis waktu langsung utuh, bab langsung tampak */
  r = await buka(isiDengan(KOSONG, { tema: 'kisah', kisah: BAB }), { reduced: true });
  await r.page.click('#btnOpen'); await r.page.waitForTimeout(1100);
  await r.page.locator('#kisah').scrollIntoViewIfNeeded(); await r.page.waitForTimeout(400);
  h = await r.page.evaluate(() => [...document.querySelectorAll('#kisah .kisah-bab')].map(b => getComputedStyle(b).opacity));
  cek('kisah dengan gerak dikurangi: bab tampak tanpa menunggu animasi', h.length === 4 && h.every(o => o === '1'), h.join());
  await r.ctx.close();
}

/* ---------- tema custom siap dipakai ulang (kontrak butir 9) ---------- */
{
  /* Pasangan rekaan: data stub dengan semua nama diganti. Tema custom
     yang dipakai pasangan kedua tidak boleh menampilkan apa pun milik
     pemesan asalnya — nama asal dibaca dari "asal" di manifest. */
  const REKAAN = JSON.parse(JSON.stringify(ISI)
    .replace(/RIAN ADI SAPUTRO/g, 'BIMA ARYA').replace(/NURUL ZAKIYATUL 'AINI/g, 'LARAS SEKAR')
    .replace(/'AINI|AINI/g, 'LARAS').replace(/RIAN/g, 'BIMA').replace(/'Aini|Aini/g, 'Laras').replace(/Rian/g, 'Bima')
    .replace(/rian-aini/g, 'bima-laras').replace(/Jepara/g, 'Salatiga'));
  for (const tema of DAFTAR.filter(t => t.kategori === 'custom')) {
    const kata = (tema.asal || '').split('-').filter(x => x.length >= 3);
    for (const [jalur, buka2] of [['undangan', async () => {
        const r = await buka({ ...REKAAN, foto: BANYAK, tema: tema.kode }, { lebar: 360 });
        await bukaUndangan(r.page); return r; }],
      ['terima kasih', async () => bukaKenangan(kenangan({ tema: tema.kode, slug: 'bima-laras', kota: 'salatiga', mempelai: REKAAN.mempelai }), 360)]]) {
      const r = await buka2();
      const teks = await r.page.evaluate(() => document.body.innerText + ' ' + document.title);
      const bocor = kata.filter(x => new RegExp('\\b' + x + '\\b', 'i').test(teks));
      const lebih = await melebar(r.page);
      cek(`${tema.kode} ${jalur} dengan pasangan rekaan: tanpa sisa pemesan asal${kata.length ? ' (' + kata.join(', ') + ')' : ''}, tanpa galat, tidak melebar`,
        !bocor.length && (jalur !== 'undangan' || /BIMA|Bima/.test(teks)) && !r.galat.length && lebih <= 0,
        JSON.stringify({ bocor, lebih, galat: r.galat }));
      await r.ctx.close();
    }
  }
}

await browser.close();
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
