import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { bikinModel, pasang, T_PENUH, ISI } from './stub.mjs';

const PORT = 4322, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const srv = await mulai(PORT);
const browser = await chromium.launch({ args:['--host-resolver-rules=MAP *.mengundang.id 127.0.0.1, MAP mengundang.id 127.0.0.1'] });

/* ---------- potret panel 6 di HP sempit ---------- */
{
  const ctx = await browser.newContext({ viewport:{width:400,height:900}, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const model = bikinModel();
  await pasang(page, model);
  // satu tamu sudah punya rekap supaya potretnya menunjukkan keadaan terisi
  model.tamu[0].datang = true;
  model.pemberian.push({ id:'g1', tamu_id:'tamu-0', jenis:'uang', nominal:250000, barang:null, catatan:null });
  model.pemberian.push({ id:'g2', tamu_id:'tamu-0', jenis:'barang', nominal:null, barang:'Gula 2 kg', catatan:null });
  await page.goto(ASAL + '/kirim?t=' + T_PENUH);
  await page.waitForSelector('.rk-baris[data-id="tamu-0"]');
  await page.locator('#panelRekap').screenshot({ path:'panel6-400.png' });
  const t = await page.locator('.rk-baris[data-id="tamu-0"]').innerText();
  cek('potret: baris terisi menampilkan amplop + barang',
      t.includes('Rp 250.000') && t.includes('Gula 2 kg'), t.replace(/\n/g,' | '));
  await ctx.close();
}

/* ---------- halaman kenangan (versi 2, migrasi 033) ----------
   Foto latarnya dibuat di peramban sendiri (canvas → JPEG), dan
   videonya direkam dari canvas (MediaRecorder → WebM), supaya
   tangkapan layarnya menunjukkan tulisan di atas gambar sungguhan. */
async function bikinFoto(warna){
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const b64 = await pg.evaluate(([a, b]) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1200, 1600);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, 1200, 1600);
    // gaun putih di tengah: tempat teks kapur paling mudah hilang
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(600, 1150, 260, 420, 0, 0, 7); g.fill();
    for (let i = 0; i < 40; i++){ g.fillStyle = `rgba(255,220,160,${Math.random()*.5})`;
      g.beginPath(); g.arc(Math.random()*1200, Math.random()*700, 6 + Math.random()*24, 0, 7); g.fill(); }
    return c.toDataURL('image/jpeg', .8).split(',')[1];
  }, warna);
  await ctx.close();
  return Buffer.from(b64, 'base64');
}
async function bikinVideo(){
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('about:blank');
  const b64 = await pg.evaluate(() => new Promise(selesai => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 480;
    const g = c.getContext('2d');
    const rek = new MediaRecorder(c.captureStream(20), { mimeType:'video/webm' });
    const potong = []; rek.ondataavailable = e => potong.push(e.data);
    rek.onstop = () => { const f = new FileReader(); f.onload = () => selesai(f.result.split(',')[1]); f.readAsDataURL(new Blob(potong)); };
    let n = 0;
    const t = setInterval(() => { g.fillStyle = `hsl(${n*9},40%,40%)`; g.fillRect(0, 0, 320, 480); n++; }, 50);
    rek.start(); setTimeout(() => { clearInterval(t); rek.stop(); }, 1200);
  }));
  await ctx.close();
  return Buffer.from(b64, 'base64');
}
const FOTO = { 'p/akad.jpg': await bikinFoto(['#6b4a2b', '#d9b98a']),
               'p/resepsi.jpg': await bikinFoto(['#2b3b5b', '#b58a6a']),
               'p/sampul.jpg': await bikinFoto(['#2a3550', '#c9a77a']),
               'p/keluarga.jpg': await bikinFoto(['#3d4a33', '#cdb894']) };
const VIDEO = await bikinVideo();

const f = (jalur, lain = {}) => Object.assign({ id:'f-' + jalur + (lain.bagian || lain.acara_id || ''), jenis:'foto', jalur, kecil:jalur,
  lebar:1200, tinggi:1600, durasi_ms:null, keterangan:null, acara_id:null, bagian:null, latar:false }, lain);
const vid = (lain = {}) => f('p/klip.webm', Object.assign({ jenis:'video', kecil:'p/keluarga.jpg', lebar:320, tinggi:480, durasi_ms:1200 }, lain));

function isiKenangan(ubah = {}){
  return Object.assign({
    slug:'rian-aini', aktif:true, tanggal_acara:'2026-09-15', kota:'jepara', hadir:null,
    mempelai: ISI.mempelai,
    foto: [f('p/sampul.jpg', { bagian:'sampul', latar:true }), f('p/resepsi.jpg', { bagian:'sampul' }),
           f('p/akad.jpg', { bagian:'pria', keterangan:'Rian' }),
           f('p/keluarga.jpg', { bagian:'keluarga', latar:true, keterangan:'Keluarga besar', fokus_x:20, fokus_y:80, zum:1.5 }),
           vid({ bagian:'keluarga' }), f('p/akad.jpg', { bagian:'keluarga' }),
           f('p/akad.jpg', { acara_id:'A1', keterangan:'Ijab kabul', latar:true }), f('p/resepsi.jpg', { acara_id:'A1' }),
           f('p/resepsi.jpg', { acara_id:'A2' }),
           f('p/keluarga.jpg'), vid()],
    babak: [
      { id:'A1', nama:'Akad Nikah', tanggal:'Selasa, 15 September 2026', jam:'08.00 WIB',
        teks:'Pagi yang hening, dan satu kalimat yang mengubah segalanya.', jumlah_foto:2, latar:null },
      { id:'A2', nama:'Resepsi', tanggal:'Selasa, 15 September 2026', jam:'11.00 WIB', teks:null, jumlah_foto:1, latar:null },
      { id:'A3', nama:'Salam-salaman', tanggal:'Selasa, 15 September 2026', jam:'14.00 WIB',
        teks:'Antrean panjang, tangan yang tak habis-habis.', jumlah_foto:0, latar:null }
    ],
    blok: {},
    vendor: [{ peran:'Fotografer', nama:'Lensa Jepara', tautan:'@lensajepara' },
             { peran:'Dekorasi', nama:'Sekar Dekor', tautan:'https://www.sekar.example/katalog' },
             { peran:'Katering', nama:'Dapur Bu Tin', tautan:null }],
    angka: { hadir:null, ucapan:3, foto:11, babak:3 },
    // dari server: terbaru dulu
    ucapan: [{ nama:'Citra', hadir:'Hadir', pesan:'Bahagia selalu!', waktu:'2026-09-17T02:00:00Z' },
             { nama:'Bayu',  hadir:'Tidak Hadir', pesan:'Maaf belum bisa datang, doa terbaik.', waktu:'2026-09-16T05:00:00Z' },
             { nama:'Ani',   hadir:'Hadir', pesan:'Selamat menempuh hidup baru.', waktu:'2026-09-16T02:00:00Z' }]
  }, ubah);
}

// Foto dan video halaman datang dari /media/ (Worker + R2); di uji
// dilayani dari memori ini.
function layaniMedia(page){
  return page.route('**/media/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/p/klip.webm')) return r.fulfill({ status:200, contentType:'video/webm', body: VIDEO });
    const berkas = Object.keys(FOTO).find(k => u.pathname.endsWith('/' + k));
    if (berkas) return r.fulfill({ status:200, contentType:'image/jpeg', body: FOTO[berkas] });
    return r.fulfill({ status:404, body:'' });
  });
}

async function layani(page, isi, fn = 'terimakasih_isi'){
  await layaniMedia(page);
  return page.route('**/*.supabase.co/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/rest/v1/rpc/' + fn)
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(isi) });
    if (u.pathname.endsWith('/p/klip.webm')) return r.fulfill({ status:200, contentType:'video/webm', body: VIDEO });
    const berkas = Object.keys(FOTO).find(k => u.pathname.endsWith('/' + k));
    if (berkas) return r.fulfill({ status:200, contentType:'image/jpeg', body: FOTO[berkas] });
    return r.fulfill({ status:200, contentType:'application/json', body:'null' });
  });
}

async function tk(isi, opsi = {}){
  const ctx = await browser.newContext({ viewport:{ width: opsi.lebar || 400, height:860 }, deviceScaleFactor:2,
                                         reducedMotion: opsi.diam ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => { galat.push(e.message); console.log('   [pageerror] ' + e.message); });
  page.galat = galat;
  if (opsi.jam) await page.clock.install();
  await layani(page, isi);
  await page.goto(ASAL + '/terimakasih');
  await page.waitForSelector('body[data-siap]', { timeout:8000 });
  return { ctx, page };
}
const teks = (page, sel) => page.locator(sel).innerText().then(t => t.replace(/\s+/g, ' ').trim());
const urutanBab = page => page.evaluate(() =>
  [...document.querySelectorAll('#cerita > section')].map(s => s.dataset.bab || s.id));

/* --- halaman penuh --- */
{
  const { ctx, page } = await tk(isiKenangan());
  const urut = await urutanBab(page);
  cek('tk-1 urutan bab = hari berjalan; bab tanpa media dan tanpa tulisan tidak muncul',
      urut.join('|') === 'pembuka|pria|acara-A1|acara-A2|acara-A3|keluarga|galeri|vendor|penutup', urut.join('|'));
  cek('tk-2 "Dalam Angka" sudah tidak ada',
      await page.locator('#angka').count() === 0 && !/dalam angka|tamu hadir/i.test(await page.locator('body').innerText()));
  cek('tk-3 sampul: nama, tanggal · kota, dua foto bergilir',
      (await teks(page, '#namaBesar')) === "Rian & 'Aini"
      && (await teks(page, '#tanggal')).toLowerCase() === '15 september 2026 · jepara'
      && await page.locator('#sampul .lapis').count() === 2,
      (await teks(page, '#namaBesar')) + ' / ' + (await teks(page, '#tanggal')));
  const pria = await teks(page, '[data-bab="pria"]');
  cek('tk-4 bab mempelai pria: nama panggilan dan orang tua dari silsilah',
      /Rian/i.test(pria) && pria.toLowerCase().includes('bapak joko sudarno & ibu sri kanah'), pria);
  cek('tk-5 babak acara tanpa foto jadi kartu teks',
      await page.locator('[data-bab="acara-A3"]').evaluate(el => el.classList.contains('polos') && !el.querySelector('.latar'))
      && (await teks(page, '[data-bab="acara-A3"]')).includes('Antrean panjang'));
  cek('tk-6 bab keluarga: 3 lapis (foto + video), titik, tombol geser ‹ ›, tanpa "Lihat/Perbesar"',
      await page.locator('[data-bab="keluarga"] .lapis').count() === 3
      && await page.locator('[data-bab="keluarga"] .lapis video').count() === 1
      && await page.locator('[data-bab="keluarga"] .titik button').count() === 3
      && await page.locator('[data-bab="keluarga"] .geser').count() === 2
      && await page.locator('.lihat-semua, [data-bab]:not([data-bab="galeri"]) [data-lihat]').count() === 0
      && await page.locator('[data-bab="pria"] .geser').count() === 0);
  const pot = await page.locator('[data-bab="keluarga"] .lapis >> nth=0').evaluate(el => {
    const g = getComputedStyle(el.querySelector('img'));
    return g.objectPosition + ' | ' + g.transformOrigin.split(' ').length + ' | ' + el.getAttribute('style');
  });
  cek('tk-6b potongan dari dasbor: titik fokus jadi object-position, zum ikut', pot.startsWith('20% 80%') && pot.includes('--z:1.5'), pot);
  cek('tk-7 latar membuka giliran (foto latar jadi lapis pertama)',
      (await page.locator('[data-bab="keluarga"] .lapis.aktif img').getAttribute('src')).endsWith('/p/keluarga.jpg'));
  const albumSrc = await page.locator('[data-bab="galeri"] .album img').evaluateAll(l => l.map(i => i.getAttribute('src').split('/').pop()));
  cek('tk-8 album: SEMUA foto (yang sudah tampil di bab ikut), urut bab, yang tanpa bab di akhir',
      albumSrc.length === 11 && albumSrc[0] === 'sampul.jpg' && albumSrc[2] === 'akad.jpg'
      && await page.locator('[data-bab="galeri"] .tanda-video').count() === 2, albumSrc.join(','));
  const vendor = page.locator('#vendor .vendor > div');
  cek('tk-9 terima kasih kepada: @akun → Instagram, https → nama situs, tanpa tautan tetap tampil',
      await vendor.count() === 3
      && await page.locator('#vendor a[href="https://instagram.com/lensajepara"]').count() === 1
      && (await teks(page, '#vendor .vendor > div >> nth=1')).includes('sekar.example')
      && await page.locator('#vendor .vendor > div >> nth=2').locator('a').count() === 0);
  cek('tk-10 penutup bertanda tangan kalian berdua',
      (await teks(page, '[data-bab="penutup"] .tanda-tangan')).includes("Rian & 'Aini"));
  cek('tk-11 tombol putar, musik, gulir, dan ucapan siap',
      await page.locator('#btnPutar').isVisible() && await page.locator('#btnMusik').isVisible()
      && await page.locator('#btnGulir').isVisible() && await page.locator('#btnUcapan').isVisible()
      && (await page.locator('#btnUcapan').getAttribute('aria-pressed')) === 'true');

  // penampil: hanya dari album
  await page.locator('[data-bab="galeri"] .album button >> nth=7').click();
  const hitung1 = await teks(page, '#kacaHitung');
  const adaVideo = await page.locator('#kacaIsi video[controls]').count();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  const hitung4 = await teks(page, '#kacaHitung');
  await page.keyboard.press('Escape');
  cek('tk-12 penampil album: video dengan kontrol, berputar, Esc menutup',
      hitung1 === '8 / 11' && adaVideo === 1 && hitung4 === '1 / 11' && await page.locator('#kaca').isHidden(),
      JSON.stringify({ hitung1, adaVideo, hitung4 }));

  // giliran berhenti di luar layar, berjalan di dalamnya
  await page.locator('[data-bab="keluarga"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const jalanDi = await page.locator('[data-bab="keluarga"]').evaluate(el => el.classList.contains('jalan'));
  await page.locator('[data-bab="penutup"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const jalanLewat = await page.locator('[data-bab="keluarga"]').evaluate(el => el.classList.contains('jalan'));
  cek('tk-13 bab bergerak hanya selama terlihat', jalanDi && !jalanLewat, JSON.stringify({ jalanDi, jalanLewat }));
  cek('tk-14 tanpa galat halaman', page.galat.length === 0, page.galat.join(' | '));

  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path:'kenangan-sampul.png' });
  await page.locator('[data-bab="pria"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.locator('[data-bab="pria"]').screenshot({ path:'kenangan-babak.png' });
  await page.locator('[data-bab="acara-A3"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('[data-bab="acara-A3"]').screenshot({ path:'kenangan-babak-teks.png' });
  await page.locator('[data-bab="keluarga"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.locator('[data-bab="keluarga"]').screenshot({ path:'kenangan-bab-geser.png' });
  await page.locator('#vendor').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('#vendor').screenshot({ path:'kenangan-vendor.png' });
  await ctx.close();
}
{
  const { ctx, page } = await tk(isiKenangan(), { diam:true });
  await page.screenshot({ path:'kenangan-utuh.png', fullPage:true });
  const anim = await page.locator('[data-bab="keluarga"] .lapis img >> nth=0').evaluate(el => getComputedStyle(el).animationName);
  cek('tk-15 prefers-reduced-motion: foto diam', anim === 'none', anim);
  await ctx.close();
}

/* --- mode tampil per foto (035) --- */
{
  const isiUtuh = isiKenangan({ foto: [
    f('p/resepsi.jpg', { bagian:'kedatangan', lebar:1504, tinggi:1004, latar:true }),            // landscape → utuh otomatis
    f('p/akad.jpg',    { bagian:'kedatangan', lebar:1504, tinggi:1004, tampilan:'isi' }),          // landscape, dipaksa isi
    f('p/keluarga.jpg',{ bagian:'keluarga',   lebar:1004, tinggi:1504, tampilan:'utuh' }),         // potret, dipaksa utuh
    f('p/sampul.jpg',  { bagian:'keluarga',   lebar:1004, tinggi:1504 }) ] });                     // potret → isi
  const { ctx, page } = await tk(isiUtuh);
  const kelas = await page.locator('.lapis').evaluateAll(l => l.map(x => x.classList.contains('utuh')));
  cek('tk-40 mode per foto: otomatis dari ukuran, pilihan pasangan menang, dicampur dalam satu bab',
      JSON.stringify(kelas) === '[true,false,true,false]', JSON.stringify(kelas));
  await page.locator('[data-bab="kedatangan"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const ukur = await page.locator('[data-bab="kedatangan"]').evaluate(bab => {
    const u = bab.querySelector('.lapis.utuh .utama'), b = bab.querySelector('.lapis.utuh .buram');
    const ru = u.getBoundingClientRect(), rb = bab.getBoundingClientRect(), ri = bab.querySelector('.isi').getBoundingClientRect();
    return { fit: getComputedStyle(u).objectFit, buram: getComputedStyle(b).display, lebar: Math.round(ru.width), babLebar: Math.round(rb.width),
             atas: Math.round(ru.top - rb.top), bawah: Math.round(ru.bottom - rb.top), isiAtas: Math.round(ri.top - rb.top),
             tengah: bab.style.getPropertyValue('--tengah') };
  });
  const pusat = (ukur.atas + ukur.bawah) / 2;
  cek('tk-41 tampil utuh di HP: utuh selebar layar, latar buram, di tengah ruang di atas tulisan, tidak tertimpa tulisan',
      ukur.fit === 'contain' && ukur.buram === 'block' && ukur.lebar === ukur.babLebar && ukur.atas > 0
      && ukur.bawah <= ukur.isiAtas && Math.abs(pusat - ukur.isiAtas / 2) < 4, JSON.stringify(ukur));
  await page.screenshot({ path:'kenangan-tampil-utuh.png' });
  await ctx.close();

  const lebar = await tk(isiUtuh, { lebar:1280 });
  const l = await lebar.page.locator('[data-bab="kedatangan"] .lapis.utuh').evaluate(x =>
    [getComputedStyle(x.querySelector('.utama')).objectFit, getComputedStyle(x.querySelector('.buram')).display]);
  cek('tk-42 layar mendatar: foto landscape kembali jadi latar penuh, tanpa latar buram', l[0] === 'cover' && l[1] === 'none', JSON.stringify(l));
  await lebar.ctx.close();
}

/* --- giliran latar dan ucapan, dengan jam palsu --- */
{
  const { ctx, page } = await tk(isiKenangan(), { jam:true });
  await page.locator('[data-bab="keluarga"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('[data-bab="keluarga"].jalan');
  await page.clock.runFor(500);
  const awal = await page.locator('[data-bab="keluarga"] .lapis').evaluateAll(l => l.findIndex(x => x.classList.contains('aktif')));
  await page.clock.runFor(6600);
  const sesudah = await page.locator('[data-bab="keluarga"] .lapis').evaluateAll(l => l.findIndex(x => x.classList.contains('aktif')));
  const titik = await page.locator('[data-bab="keluarga"] .titik button[aria-current="true"]').getAttribute('data-ke');
  cek('tk-16 latar bergilir ke foto/video berikutnya, titik ikut', awal === 0 && sesudah === 1 && titik === '1',
      JSON.stringify({ awal, sesudah, titik }));
  await page.locator('[data-bab="keluarga"] .titik button >> nth=2').click();
  const lapisAktif = () => page.locator('[data-bab="keluarga"] .lapis').evaluateAll(l => l.findIndex(x => x.classList.contains('aktif')));
  const t2 = await lapisAktif();
  await page.locator('[data-bab="keluarga"] .geser[data-geser="1"]').click();
  const t0 = await lapisAktif();
  await page.locator('[data-bab="keluarga"] .geser[data-geser="-1"]').click();
  const tBalik = await lapisAktif();
  // usap mendatar ke kiri = berikutnya; usap tegak tidak menggeser
  const usap = (dx, dy) => page.locator('[data-bab="keluarga"]').evaluate((el, [dx, dy]) => {
    const t = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(200, 400)], changedTouches: [t(200, 400)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(200 + dx, 400 + dy)], bubbles: true }));
  }, [dx, dy]);
  await usap(-120, 10); const tUsap = await lapisAktif();
  await usap(-60, 200); const tTegak = await lapisAktif();
  cek('tk-17 titik, tombol ‹ ›, dan usap mendatar menggeser; usap tegak tidak',
      t2 === 2 && t0 === 0 && tBalik === 2 && tUsap === 0 && tTegak === 0, JSON.stringify({ t2, t0, tBalik, tUsap, tTegak }));

  await ctx.close();
}
{
  // ucapan: muncul 2,5 dtk sesudah siap, dari yang PERTAMA masuk;
  // satu putaran = 7 dtk tampil + 0,6 pudar + 1,6 jeda
  const { ctx, page } = await tk(isiKenangan(), { jam:true });
  await page.clock.runFor(3000);
  const u1 = await teks(page, '#ucapan .nama');
  await page.clock.runFor(9200);
  const u2 = await teks(page, '#ucapan .nama');
  await page.clock.runFor(9200);
  const u3 = await teks(page, '#ucapan .nama');
  await page.clock.runFor(9200);
  const u4 = await teks(page, '#ucapan .nama');
  cek('tk-18 ucapan muncul satu per satu, berurutan, lalu berputar', [u1, u2, u3, u4].join('|') === 'Ani|Bayu|Citra|Ani',
      [u1, u2, u3, u4].join('|'));
  await page.screenshot({ path:'kenangan-ucapan.png' });
  const op = await page.locator('#ucapan .ucap').evaluate(el => { const g = getComputedStyle(el); return [g.opacity, g.backgroundColor, el.getBoundingClientRect().width]; });
  cek('tk-18b pop-up kecil dan tembus pandang', Number(op[0]) < 1 && /rgba\(.*0\.4\d?\)/.test(op[1]) && op[2] <= 262, JSON.stringify(op));
  await page.locator('#ucapan .tutup').click();
  await page.clock.runFor(20000);
  cek('tk-19 × menyembunyikan ucapan; tombol gelembung ikut mati',
      await page.locator('#ucapan .ucap').count() === 0 && (await page.locator('#btnUcapan').getAttribute('aria-pressed')) === 'false');
  await page.reload();
  await page.waitForSelector('body[data-siap]');
  await page.clock.runFor(12000);
  const masihMati = await page.locator('#ucapan .ucap').count() === 0;
  await page.locator('#btnUcapan').click();
  await page.clock.runFor(800);
  cek('tk-19b pilihan diingat sesudah dimuat ulang; tombol gelembung menyalakannya lagi',
      masihMati && await page.locator('#ucapan .ucap').count() === 1
      && (await page.locator('#btnUcapan').getAttribute('aria-pressed')) === 'true');
  await ctx.close();
}
{
  const { ctx, page } = await tk(isiKenangan({ blok:{ ucapan:{ tampil:false } } }), { jam:true });
  await page.clock.runFor(12000);
  cek('tk-20 ucapan dimatikan dari panel 9: tidak ada pop-up, tidak ada tombolnya',
      await page.locator('#ucapan .ucap').count() === 0 && await page.locator('#btnUcapan').isHidden());
  await ctx.close();
}
{
  const { ctx, page } = await tk(isiKenangan(), { lebar:1280 });
  await page.waitForSelector('#ucapan .ucap.in', { timeout:5000 });
  const kiri = await page.locator('#ucapan').evaluate(el => el.classList.contains('kanan'));
  await page.waitForFunction(() => document.getElementById('ucapan').classList.contains('kanan'), null, { timeout:12000 });
  cek('tk-21 layar lebar: ucapan bergantian kiri lalu kanan', kiri === false);
  await ctx.close();
}

/* --- putar kenangan: musik + gulir otomatis --- */
{
  const { ctx, page } = await tk(isiKenangan());
  await page.addInitScript(() => {});
  await page.evaluate(() => { HTMLMediaElement.prototype.play = function(){ window.__musik = this.src; return Promise.resolve(); }; });
  await page.locator('#btnPutar').click();
  await page.waitForFunction(() => document.getElementById('btnGulir').getAttribute('aria-pressed') === 'true', null, { timeout:5000 });
  const y1 = await page.evaluate(() => scrollY);
  await page.waitForTimeout(800);
  const y2 = await page.evaluate(() => scrollY);
  cek('tk-22 "Putar kenangan": musik menyala, tombol hilang, halaman bergulir sendiri',
      await page.evaluate(() => /backsound\.mp3$/.test(window.__musik || '')) && await page.locator('#btnMusik.on').count() === 1
      && await page.locator('#btnPutar').isHidden() && y2 > y1 && y1 > 0, JSON.stringify({ y1, y2 }));
  await ctx.close();
}

/* --- blok dari panel 9 --- */
{
  const { ctx, page } = await tk(isiKenangan({ blok: {
    galeri:  { tampil:false, judul:null, teks:null },
    sampul:  { tampil:false, judul:'Matur Nuwun', teks:'Sugeng rawuh.' },
    penutup: { tampil:false, judul:'Wassalam', teks:null },
    pembuka: { tampil:true, judul:'Hari Kami', teks:null },
    wanita:  { tampil:true, judul:null, teks:'Yang paling sabar menunggu.' },
    keluarga:{ tampil:false, judul:null, teks:null },
    vendor:  { tampil:true, judul:'Dengan Dukungan', teks:null }
  }}));
  const urut = await urutanBab(page);
  cek('tk-23 galeri dan keluarga dimatikan; wanita tanpa foto muncul karena ditulisi',
      !urut.includes('galeri') && !urut.includes('keluarga') && urut.includes('wanita')
      && await page.locator('[data-bab="wanita"]').evaluate(el => el.classList.contains('polos')), urut.join('|'));
  cek('tk-24 sampul tidak bisa dimatikan, tulisannya bisa diganti',
      await page.locator('#sampul').isVisible() && (await teks(page, '#sampulJudul')).toUpperCase() === 'MATUR NUWUN'
      && (await teks(page, '#sampulKalimat')) === 'Sugeng rawuh.');
  cek('tk-25 penutup tidak bisa dimatikan; judul baru, teks bawaan',
      (await teks(page, '[data-bab="penutup"] h2')) === 'Wassalam' && (await teks(page, '[data-bab="penutup"] .kalimat')).length > 20);
  cek('tk-26 judul pembuka dan vendor diganti, teksnya tetap bawaan',
      (await teks(page, '[data-bab="pembuka"] h2')) === 'Hari Kami' && (await teks(page, '[data-bab="pembuka"] .kalimat')).length > 20
      && (await teks(page, '#vendor h2')) === 'Dengan Dukungan');
  await ctx.close();
}

/* --- tanpa bahan apa pun: tetap halaman utuh --- */
{
  const { ctx, page } = await tk(isiKenangan({ babak:[], foto:[], ucapan:[], vendor:[] }));
  const urut = await urutanBab(page);
  cek('tk-27 tanpa foto, babak, vendor: sampul, pembuka, penutup saja; sampul tanpa latar',
      urut.join('|') === 'pembuka|penutup' && await page.locator('#sampul .latar').count() === 0 && page.galat.length === 0,
      urut.join('|'));
  await page.screenshot({ path:'kenangan-kosong.png', fullPage:true });
  await ctx.close();
}
{
  // Jawaban sebelum 033: foto tanpa jenis/bagian, tanpa vendor, tanpa kota.
  const lama = isiKenangan({ vendor: undefined, kota: undefined,
    foto: [{ jalur:'p/akad.jpg', kecil:'p/akad.jpg', lebar:1200, tinggi:1600, keterangan:null, acara_id:'A1' },
           { jalur:'p/resepsi.jpg', kecil:'p/resepsi.jpg', lebar:1200, tinggi:1600, keterangan:null, acara_id:null }] });
  delete lama.vendor; delete lama.kota;
  const { ctx, page } = await tk(lama);
  cek('tk-28 jawaban bentuk lama tetap tergambar',
      await page.locator('[data-bab="acara-A1"] .lapis').count() === 1 && await page.locator('[data-bab="galeri"] .album button').count() === 2
      && await page.locator('#vendor').count() === 0 && (await teks(page, '#tanggal')).toLowerCase() === '15 september 2026' && page.galat.length === 0);
  await ctx.close();
}
{
  const { ctx, page } = await tk({ slug:'rian-aini', aktif:false });
  cek('tk-29 belum terbit: sampul berkata belum tersedia, tidak ada ucapan',
      (await teks(page, '#sampulKalimat')) === 'Halaman ini belum tersedia.' && await page.locator('#ucapan .ucap').count() === 0
      && await page.locator('#btnPutar').isHidden());
  await ctx.close();
}

/* --- isi dari pasangan dan tamu tidak pernah jadi HTML --- */
{
  const jahat = '<img src=x onerror="window.__kena=1">';
  const isi = isiKenangan();
  isi.babak[0].nama = jahat; isi.babak[2].teks = jahat;
  isi.blok = { sampul:{ tampil:true, judul:jahat, teks:jahat }, keluarga:{ tampil:true, judul:jahat, teks:null } };
  isi.vendor[0].nama = jahat; isi.vendor[1].tautan = 'https://x.example/"><img src=x onerror="window.__kena=1">';
  isi.ucapan[2].pesan = jahat; isi.ucapan[2].nama = jahat;
  const { ctx, page } = await tk(isi);
  await page.waitForSelector('#ucapan .ucap', { timeout:5000 });
  cek('tk-30 nama babak, blok, vendor, dan ucapan di-escape',
      await page.evaluate(() => !window.__kena) && (await teks(page, '[data-bab="acara-A1"] h2')).includes('<img')
      && (await teks(page, '#ucapan .nama')).includes('<img'));
  await ctx.close();
}

/* ---------- pratinjau pemilik ---------- */
async function tkPratinjau({ cari = '?pratinjau=1', sesi = true, jawab = 200, isi = {} } = {}){
  const ctx = await browser.newContext({ viewport:{width:400,height:860} });
  const page = await ctx.newPage();
  const panggil = [];
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  if (sesi) await page.addInitScript(() =>
    localStorage.setItem('dasbor-sesi', JSON.stringify({ akses:'JWT-pemilik', segar:'S' })));
  await layaniMedia(page);
  await page.route('**/*.supabase.co/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      panggil.push({ fn: u.pathname.split('/').pop(), auth: r.request().headers()['authorization'] });
      if (u.pathname.endsWith('/terimakasih_pratinjau')) {
        if (jawab !== 200) return r.fulfill({ status: jawab, contentType:'application/json', body:'{"message":"x"}' });
        return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(Object.assign(
          isiKenangan(), { pratinjau:true, undangan_terbit:true, kenangan_terbit:false }, isi)) });
      }
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(isiKenangan()) });
    }
    const berkas = Object.keys(FOTO).find(k => u.pathname.endsWith('/' + k));
    if (berkas) return r.fulfill({ status:200, contentType:'image/jpeg', body: FOTO[berkas] });
    return r.fulfill({ status:200, contentType:'application/json', body:'null' });
  });
  await page.goto(ASAL + '/terimakasih' + cari);
  await page.waitForSelector('body[data-siap]', { timeout:8000 });
  return { ctx, page, panggil };
}
{
  const { ctx, page, panggil } = await tkPratinjau();
  cek('tk-31 pratinjau memanggil terimakasih_pratinjau dengan JWT pemilik, bukan anon key',
      panggil.length === 1 && panggil[0].fn === 'terimakasih_pratinjau' && panggil[0].auth === 'Bearer JWT-pemilik',
      JSON.stringify(panggil));
  const pita = await teks(page, '#pita');
  cek('tk-32 pita pratinjau jujur: belum terbit, tamu belum melihat', /belum diterbitkan/i.test(pita), pita);
  cek('tk-33 isi pratinjau tergambar seperti halaman tamu', await page.locator('[data-bab^="acara-"]').count() === 3);
  await page.waitForTimeout(1500);
  await page.screenshot({ path:'kenangan-pratinjau.png' });
  await ctx.close();
}
{
  const { ctx, page, panggil } = await tkPratinjau({ cari: '' });
  cek('tk-34 tanpa ?pratinjau=1, sesi pemilik tidak disentuh: pintu tamu, anon key, tanpa pita',
      panggil.length === 1 && panggil[0].fn === 'terimakasih_isi' && !/JWT-pemilik/.test(panggil[0].auth)
      && await page.locator('#pita').isHidden(), JSON.stringify(panggil));
  await ctx.close();
}
{
  const { ctx, page, panggil } = await tkPratinjau({ sesi: false });
  cek('tk-35 pratinjau tanpa sesi: tidak memanggil apa pun, mengarahkan ke dasbor',
      panggil.length === 0 && await page.locator('#sampulKalimat a[href="/dasbor"]').count() === 1, JSON.stringify(panggil));
  await ctx.close();
}
{
  const { ctx, page } = await tkPratinjau({ jawab: 401 });
  cek('tk-36 sesi habis: diminta masuk lagi', /sudah habis/i.test(await teks(page, '#sampulKalimat')));
  await ctx.close();
}
{
  const { ctx, page } = await tkPratinjau({ jawab: 403 });
  cek('tk-37 bukan pemilik: dikatakan terus terang, tanpa isi', /bukan pemilik/i.test(await teks(page, '#sampulKalimat'))
      && await page.locator('#cerita section').count() === 0);
  await ctx.close();
}
{
  const { ctx, page } = await tkPratinjau({ isi: { undangan_terbit:false, kenangan_terbit:true } });
  cek('tk-38 pita: undangan masih draf disebut, walau saklar kenangan menyala',
      /undangan masih draf/i.test(await teks(page, '#pita')));
  await ctx.close();
}
{
  const { ctx, page } = await tkPratinjau({ isi: { undangan_terbit:true, kenangan_terbit:true } });
  cek('tk-39 pita: sudah terbit, warnanya berbeda',
      /sudah terbit/i.test(await teks(page, '#pita')) && await page.locator('#pita.terbit').count() === 1);
  await ctx.close();
}

/* ---------- pasangan mana yang dimuat halaman /terimakasih ----------
   Di domain bersama, /terimakasih tidak punya tempat untuk slug
   pasangan di jalurnya, jadi pasangannya disebut lewat ?pasangan=.
   Tanpa itu halamannya memuat pasangan cadangan — yaitu pasangan
   ORANG LAIN. */
async function tkSlug(alamat){
  const ctx = await browser.newContext({ viewport:{width:430,height:900} });
  const page = await ctx.newPage();
  let arg = null;
  await page.route('**/*.supabase.co/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/rest/v1/rpc/terimakasih_isi'){
      try { arg = JSON.parse(r.request().postData() || '{}'); } catch { arg = {}; }
      return r.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify({ slug:arg.p_slug, aktif:true, tanggal_acara:'2026-09-15',
                               hadir:null, mempelai: ISI.mempelai, foto: [], ucapan: [] })});
    }
    return r.fulfill({ status:200, contentType:'application/json', body:'null' });
  });
  await page.goto(alamat);
  await page.waitForFunction(() => !!window.MENGUNDANG, null, { timeout:8000 });
  await page.waitForTimeout(500);
  await ctx.close();
  return arg;
}

const tkBersama = await tkSlug('http://mengundang.id:' + PORT + '/terimakasih?pasangan=budi-sari');
cek('tk-5 domain bersama: ?pasangan= yang menentukan pasangannya',
    tkBersama && tkBersama.p_slug === 'budi-sari', JSON.stringify(tkBersama));

const tkSub = await tkSlug('http://rian-aini.mengundang.id:' + PORT + '/terimakasih');
cek('tk-6 subdomain: pasangannya dari subdomain, tanpa ?pasangan=',
    tkSub && tkSub.p_slug === 'rian-aini', JSON.stringify(tkSub));

const tkTimpa = await tkSlug('http://rian-aini.mengundang.id:' + PORT + '/terimakasih?pasangan=budi-sari');
cek('tk-7 subdomain tidak bisa ditimpa lewat ?pasangan=',
    tkTimpa && tkTimpa.p_slug === 'rian-aini', JSON.stringify(tkTimpa));

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
