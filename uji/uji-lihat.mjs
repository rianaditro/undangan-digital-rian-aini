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

/* ---------- halaman kenangan ----------
   Foto latarnya dibuat di peramban sendiri (canvas → JPEG), supaya
   tangkapan layarnya menunjukkan tulisan di atas gambar sungguhan —
   keterbacaan di atas foto justru yang perlu dilihat mata. */
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
const FOTO = { 'p/akad.jpg': await bikinFoto(['#6b4a2b', '#d9b98a']),
               'p/resepsi.jpg': await bikinFoto(['#2b3b5b', '#b58a6a']) };

function isiKenangan(ubah = {}){
  return Object.assign({
    slug:'rian-aini', aktif:true, tanggal_acara:'2026-09-15', hadir:null,
    mempelai: ISI.mempelai,
    foto: [{ jalur:'p/akad.jpg', kecil:'p/akad.jpg', lebar:1200, tinggi:1600, keterangan:'Ijab kabul', acara_id:'A1' },
           { jalur:'p/akad.jpg', kecil:'p/akad.jpg', lebar:1200, tinggi:1600, keterangan:null, acara_id:'A1' },
           { jalur:'p/resepsi.jpg', kecil:'p/resepsi.jpg', lebar:1200, tinggi:1600, keterangan:null, acara_id:'A2' }],
    babak: [
      { id:'A1', nama:'Akad Nikah', tanggal:'Selasa, 15 September 2026', jam:'08.00 WIB',
        teks:'Pagi yang hening, dan satu kalimat yang mengubah segalanya.', jumlah_foto:2,
        latar:{ jalur:'p/akad.jpg', kecil:'p/akad.jpg', lebar:1200, tinggi:1600 } },
      { id:'A2', nama:'Resepsi', tanggal:'Selasa, 15 September 2026', jam:'11.00 WIB',
        teks:null, jumlah_foto:1, latar:{ jalur:'p/resepsi.jpg', kecil:'p/resepsi.jpg', lebar:1200, tinggi:1600 } },
      { id:'A3', nama:'Salam-salaman', tanggal:'Selasa, 15 September 2026', jam:'14.00 WIB',
        teks:'Antrean panjang, tangan yang tak habis-habis.', jumlah_foto:0, latar:null }
    ],
    blok: {},
    angka: { hadir:null, ucapan:1, foto:3, babak:3 },
    ucapan: [{ nama:'Budi', hadir:'Hadir', pesan:'Selamat!', waktu:'2026-09-16T02:00:00Z',
               balasan:'Terima kasih, Budi.', dibalas:'2026-09-17T02:00:00Z' }]
  }, ubah);
}

async function tk(isi, opsi = {}){
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, deviceScaleFactor:2,
                                         reducedMotion: opsi.diam ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => { galat.push(e.message); console.log('   [pageerror] ' + e.message); });
  page.galat = galat;
  await page.route('**/*.supabase.co/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/rest/v1/rpc/terimakasih_isi')
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(isi) });
    const berkas = Object.keys(FOTO).find(k => u.pathname.endsWith('/' + k));
    if (berkas) return r.fulfill({ status:200, contentType:'image/jpeg', body: FOTO[berkas] });
    return r.fulfill({ status:200, contentType:'application/json', body:'null' });
  });
  await page.goto(ASAL + '/terimakasih');
  // Selesai = penutup tergambar (aktif) atau ucapan disembunyikan (belum tersedia).
  await page.waitForFunction(() => !document.getElementById('penutup').hidden
                                   || document.getElementById('ucapan').hidden, null, { timeout:8000 });
  return { ctx, page };
}
const teks = (page, sel) => page.locator(sel).innerText().then(t => t.replace(/\s+/g, ' ').trim());

/* --- halaman penuh: babak berfoto, babak tanpa foto, angka, galeri --- */
{
  const { ctx, page } = await tk(isiKenangan({ angka:{ hadir:1234, ucapan:1, foto:3, babak:3 } }));
  const babak = page.locator('.babak');
  cek('tk-1 tiga babak, urutan hari itu',
      await babak.count() === 3
      && (await teks(page, '.babak >> nth=0')).includes('AKAD NIKAH') === false   // judul tidak dikapitalkan CSS
      && (await page.locator('.babak h2').allInnerTexts()).join('|') === 'Akad Nikah|Resepsi|Salam-salaman',
      (await page.locator('.babak h2').allInnerTexts()).join('|'));
  cek('tk-2 babak berfoto memakai fotonya sebagai latar',
      await page.locator('.babak[data-babak="A1"] .latar img').getAttribute('src').then(s => s.endsWith('/p/akad.jpg')));
  cek('tk-3 babak tanpa foto jadi kartu teks, bukan kotak kosong',
      await page.locator('.babak[data-babak="A3"]').evaluate(el => el.classList.contains('teks') && !el.querySelector('.latar'))
      && (await teks(page, '.babak[data-babak="A3"]')).includes('Antrean panjang'));
  cek('tk-4 sampul memakai latar babak pertama',
      await page.locator('#atas .latar img').getAttribute('src').then(s => s && s.endsWith('/p/akad.jpg')));
  cek('tk-5 sisa foto babak diarahkan ke galeri',
      (await teks(page, '.babak[data-babak="A1"] .ke-galeri')).toLowerCase() === '1 foto lagi di galeri'
      && await page.locator('.babak[data-babak="A2"] .ke-galeri').count() === 0);
  const angka = await teks(page, '#angkaIsi');
  cek('tk-6 angka hari itu, diformat gaya Indonesia', angka.includes('1.234') && /tamu hadir/i.test(angka), angka);
  cek('tk-7 pembuka muncul karena ada babak', await page.locator('#pembuka').isVisible());
  cek('tk-8 penutup selalu ada, bertanda tangan nama pasangan',
      await page.locator('#penutup').isVisible() && (await teks(page, '#penutupNama')).includes('&'));

  // pan: bergerak selama terlihat, berhenti sesudah lewat
  const jalan = () => page.evaluate(() =>
    [...document.querySelectorAll('#atas, .babak')].filter(b => b.querySelector('.latar'))
      .map(b => b.classList.contains('jalan') && getComputedStyle(b.querySelector('.latar img')).animationPlayState));
  const awal = await jalan();
  await page.locator('#penutup').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const lewat = await jalan();
  await page.locator('.babak[data-babak="A2"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const diA2 = await jalan();
  cek('tk-9 pan berjalan selama terlihat, berhenti sesudah lewat',
      awal[0] === 'running' && lewat.every(x => x === false) && diA2[2] === 'running',
      JSON.stringify({ awal, lewat, diA2 }));
  // Latar babak kedua lazy: ia harus benar-benar turun begitu digulir.
  const termuat = await page.locator('.babak[data-babak="A2"] .latar img')
    .evaluate(img => img.complete ? img.naturalWidth : new Promise(r => img.onload = () => r(img.naturalWidth)));
  cek('tk-9b latar lazy termuat saat babaknya digulir', termuat === 1200, String(termuat));
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);

  await page.screenshot({ path:'kenangan-sampul.png' });
  await page.locator('.babak[data-babak="A1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('.babak[data-babak="A1"]').screenshot({ path:'kenangan-babak.png' });
  await page.locator('.babak[data-babak="A3"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('.babak[data-babak="A3"]').screenshot({ path:'kenangan-babak-teks.png' });
  await ctx.close();
}
{
  // Satu halaman utuh untuk dilihat mata; gerak dimatikan supaya semua
  // .reveal sudah tampil saat dipotret.
  const { ctx, page } = await tk(isiKenangan({ angka:{ hadir:1234, ucapan:1, foto:3, babak:3 } }), { diam:true });
  await page.screenshot({ path:'kenangan-utuh.png', fullPage:true });
  await ctx.close();
}

/* --- nol tidak dipajang --- */
{
  const { ctx, page } = await tk(isiKenangan({ angka:{ hadir:null, ucapan:null, foto:null, babak:null }, hadir:null }));
  cek('tk-10 tanpa angka sama sekali, blok angka diam', await page.locator('#angka').isHidden());
  await ctx.close();
}
{
  const { ctx, page } = await tk(isiKenangan({ angka:{ hadir:0, ucapan:2, foto:null, babak:null } }));
  const t = await teks(page, '#angkaIsi');
  cek('tk-11 hadir=0 tidak dipajang, angka lain tetap', !/tamu hadir/i.test(t) && /ucapan/i.test(t), t);
  await ctx.close();
}
{
  // Jawaban sebelum 028: cuma `hadir`, tanpa babak/blok/angka.
  const lama = { slug:'rian-aini', aktif:true, tanggal_acara:'2026-09-15', hadir:312,
                 mempelai: ISI.mempelai, foto: [], ucapan: [] };
  const { ctx, page } = await tk(lama);
  cek('tk-12 jawaban bentuk lama tetap tergambar (hadir dari kunci lama)',
      (await teks(page, '#angkaIsi')).includes('312') && await page.locator('.babak').count() === 0
      && await page.locator('#pembuka').isHidden() && page.galat.length === 0);
  await ctx.close();
}

/* --- blok dari panel 9 --- */
{
  const { ctx, page } = await tk(isiKenangan({ blok: {
    galeri:  { tampil:false, judul:null, teks:null },
    ucapan:  { tampil:false, judul:null, teks:null },
    sampul:  { tampil:false, judul:'Matur Nuwun', teks:'Sugeng rawuh.' },
    penutup: { tampil:false, judul:'Wassalam', teks:null },
    pembuka: { tampil:true, judul:'Hari Kami', teks:null }
  }}));
  cek('tk-13 galeri dimatikan: tidak tampil walau ada foto, tautan "di galeri" ikut hilang',
      await page.locator('#galeri').isHidden() && await page.locator('.ke-galeri').count() === 0);
  cek('tk-14 ucapan dimatikan', await page.locator('#ucapan').isHidden());
  cek('tk-15 sampul tidak bisa dimatikan, tulisannya bisa diganti',
      await page.locator('#atas').isVisible() && (await teks(page, '#atasEyebrow')) === 'MATUR NUWUN'
      && (await teks(page, '#atasSalam')) === 'Sugeng rawuh.');
  cek('tk-16 penutup tidak bisa dimatikan; judul baru, teks bawaan',
      await page.locator('#penutup').isVisible() && (await teks(page, '#penutupJudul')) === 'Wassalam'
      && (await teks(page, '#penutupTeks')).length > 20);
  cek('tk-17 judul pembuka diganti, teksnya tetap bawaan',
      (await teks(page, '#pembukaJudul')) === 'Hari Kami' && (await teks(page, '#pembukaTeks')).length > 20);
  await ctx.close();
}

/* --- tanpa bahan apa pun: tetap halaman utuh --- */
{
  const { ctx, page } = await tk(isiKenangan({ babak:[], foto:[], ucapan:[], angka:{ hadir:null, ucapan:null, foto:null, babak:null } }));
  cek('tk-18 tanpa babak dan foto: sampul, ucapan, penutup tetap ada; pembuka dan galeri diam',
      await page.locator('#atas').isVisible() && await page.locator('#penutup').isVisible()
      && await page.locator('#ucapan').isVisible() && await page.locator('#pembuka').isHidden()
      && await page.locator('#galeri').isHidden() && await page.locator('#atas .latar').count() === 0);
  await page.screenshot({ path:'kenangan-kosong.png', fullPage:true });
  await ctx.close();
}
{
  const { ctx, page } = await tk({ slug:'rian-aini', aktif:false });
  cek('tk-19 belum terbit: sampul berkata belum tersedia, tidak ada ucapan',
      (await teks(page, '#atasSalam')) === 'Halaman ini belum tersedia.' && await page.locator('#ucapan').isHidden());
  await ctx.close();
}

/* --- isi dari pasangan tidak pernah jadi HTML --- */
{
  const jahat = '<img src=x onerror="window.__kena=1">';
  const isi = isiKenangan();
  isi.babak[0].nama = jahat; isi.babak[2].teks = jahat;
  isi.blok = { sampul:{ tampil:true, judul:jahat, teks:jahat } };
  const { ctx, page } = await tk(isi);
  await page.waitForTimeout(300);
  cek('tk-20 nama babak, kalimat, dan blok di-escape',
      await page.evaluate(() => !window.__kena) && (await teks(page, '.babak[data-babak="A1"] h2')).includes('<img'));
  await ctx.close();
}

/* --- gerak dikurangi: tidak ada pan --- */
{
  const { ctx, page } = await tk(isiKenangan(), { diam:true });
  const anim = await page.locator('.babak[data-babak="A1"] .latar img').evaluate(el => getComputedStyle(el).animationName);
  cek('tk-21 prefers-reduced-motion: foto diam', anim === 'none', anim);
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
