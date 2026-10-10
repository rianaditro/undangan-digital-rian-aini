import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { ISI } from './stub.mjs';

const PORT = 4390, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const srv = await mulai(PORT);
const browser = await chromium.launch();

/* ---------- 1. landing ---------- */
{
  const ctx = await browser.newContext({ viewport:{width:430,height:900} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  let keSupabase = 0;
  await page.route('**/*.supabase.co/**', r => { keSupabase++; r.fulfill({ status:200, body:'null' }); });
  await page.goto(ASAL + '/mulai');
  await page.waitForSelector('#btnBuat');

  cek('1a landing terbuka', (await page.locator('.merek').textContent()).includes('mengundang'));

  // Landing = jualan + demo dalam satu halaman. Merge konflik pernah
  // menyisakan demo saja: kontak dan contohnya hilang tanpa ada uji
  // yang gagal.
  const wa = await page.$$eval('a.tautan-wa', a => a.map(x => x.href));
  cek('1a1 tombol kontak WhatsApp menuju nomor mengundang.id',
      wa.length >= 3 && wa.every(h => h.startsWith('https://wa.me/6289669249279?text=')), wa.join(' '));
  cek('1a2 contoh, paket, dan tanya-jawab ada',
      await page.locator('#contoh').count() === 1 && await page.locator('#paket').count() === 1
      && await page.locator('#tanya').count() === 1);

  // tanpa nama → ditolak, tidak ada tautan
  await page.locator('#btnBuat').click();
  await page.waitForTimeout(150);
  cek('1b tanpa nama ditolak', (await page.locator('#salah').textContent()).length > 0
      && await page.locator('#hasil').isHidden());

  await page.locator('#inPria').fill('Rian');
  await page.locator('#inWanita').fill("'Aini");
  await page.locator('#inKota').fill('Jepara');
  await page.locator('#inTgl').fill('2027-06-12');
  await page.locator('#btnBuat').click();
  await page.waitForSelector('#hasil:not([hidden])');

  const tautan = await page.locator('#tautan').getAttribute('href');
  const terlihat = await page.locator('#tautan').textContent();
  cek('2a0 tautan yang ditampilkan terbaca manusia (bukan %27)',
      !terlihat.includes('%'), terlihat);
  cek('2a tautan memuat kedua nama, kota, dan tanggal',
      tautan.includes('pria=Rian') && tautan.includes('wanita=') && tautan.includes('kota=Jepara')
      && tautan.includes('tgl=2027-06-12'), tautan);
  cek('2b tautannya ke /coba', tautan.includes('/coba?'), tautan);
  cek('2c tombol WhatsApp belum muncul selama nomornya kosong',
      await page.locator('#btnWa').isHidden());

  await page.locator('#inWa').fill('0812-3456-7890');
  await page.locator('#btnBuat').click();
  await page.waitForTimeout(150);
  cek('3a tombol WhatsApp muncul setelah nomor diisi',
      await page.locator('#btnWa').isVisible());

  // wa.me tidak bisa dijangkau dari sini, dan popup yang gagal memuat
  // melaporkan alamat galat — bukan alamat yang diminta. Jadi yang
  // dicatat permintaannya, bukan hasil navigasinya.
  await page.evaluate(() => {
    window.__wa = null;
    window.open = (u) => { window.__wa = u; return null; };
  });
  await page.locator('#btnWa').click();
  await page.waitForFunction(() => window.__wa, null, { timeout:4000 });
  const waUrl = await page.evaluate(() => window.__wa);
  cek('3b nomor dirapikan ke bentuk internasional',
      waUrl.includes('wa.me/6281234567890'), waUrl.slice(0,60));
  cek('3c pesannya memuat tautan undangannya',
      decodeURIComponent(waUrl).includes('/coba?'), decodeURIComponent(waUrl).slice(0,140));

  // Salin harus menyalin bentuk yang DIPAKAI, bukan yang ditampilkan
  await page.evaluate(() => {
    navigator.clipboard.writeText = (t) => { window.__salin = t; return Promise.resolve(); };
  });
  await page.locator('#btnSalin').click();
  await page.waitForFunction(() => window.__salin, null, { timeout:4000 });
  const disalin = await page.evaluate(() => window.__salin);
  cek('3d Salin menyalin tautan tersandi, bukan yang sudah didekode',
      disalin === tautan, disalin);

  cek('4 landing tidak menyentuh Supabase sama sekali', keSupabase === 0, String(keSupabase));
  await page.screenshot({ path:'landing-430.png', clip:{x:0,y:0,width:430,height:900} });
  await ctx.close();
}

/* ---------- 2. /coba = undangan sungguhan, tanpa jaringan ---------- */
{
  const ctx = await browser.newContext({ viewport:{width:430,height:900} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  const kena = [];
  await page.route('**/*.supabase.co/**', r => {
    kena.push(new URL(r.request().url()).pathname);
    r.fulfill({ status:500, contentType:'application/json', body:'{"message":"seharusnya tidak dipanggil"}' });
  });

  await page.goto(ASAL + "/coba?pria=Rian&wanita=%27Aini&kota=Jepara&tgl=2027-06-12");
  await page.waitForFunction(() => window.MENGUNDANG && window.MENGUNDANG.KONF.siap, null, { timeout:8000 });
  await page.waitForTimeout(400);

  cek('5a /coba TIDAK memanggil Supabase sekali pun', kena.length === 0, kena.join(','));
  cek('5b halaman tahu dirinya demo', await page.evaluate(() => window.MENGUNDANG.KONF.demo) === true);

  const badan = await page.locator('body').textContent();
  cek('6a nama yang diketik muncul di undangannya',
      badan.includes('Rian') && badan.includes("'Aini"));
  cek('6b tanggal yang dipilih dipakai',
      badan.includes('Juni 2027'), badan.match(/\w+ 2027/)?.[0]);
  cek('6c kotanya dipakai', badan.includes('Jepara'));
  cek('6d bagian silsilah disembunyikan (belum ada isinya)',
      await page.locator('#silsilah').isHidden());

  /* buku tamu demo: jalan di peramban, tidak dikirim ke mana pun */
  await page.locator('#btnOpen').click().catch(() => {});
  await page.waitForTimeout(600);
  await page.locator('#inNama').fill('Calon Tamu');
  await page.locator('#inPesan').fill('Selamat ya, keren undangannya');
  await page.locator('#btnKirim').click();
  await page.waitForFunction(() =>
    document.body.textContent.includes('Selamat ya, keren undangannya'), null, { timeout:5000 });
  cek('7a ucapan demo langsung muncul di buku tamunya', true);
  cek('7b tidak ada satu pun yang dikirim ke server', kena.length === 0, kena.join(','));

  await ctx.close();
}

/* ---------- 3. akar domain: apex vs subdomain pasangan ---------- */
{
  // fetch() menolak menimpa header Host, jadi permintaannya disusun
  // sendiri lewat node:http — kalau tidak, ujinya menguji host sandbox.
  const http = await import('node:http');
  const ambil = (jalur, host, penuh) => new Promise((res, rej) => {
    const r = http.request({ host:'127.0.0.1', port:PORT, path:jalur,
                             headers:{ Host: host } }, (jwb) => {
      let b = ''; jwb.on('data', d => b += d);
      jwb.on('end', () => res(penuh
        ? { badan:b, status:jwb.statusCode, lokasi:jwb.headers.location }
        : b));
    });
    r.on('error', rej); r.end();
  });

  // ikuti redirect sekali, seperti peramban
  const ambilIkut = async (jalur, host) => {
    const pertama = await ambil(jalur, host, true);
    if (pertama.status >= 300 && pertama.status < 400 && pertama.lokasi)
      return (await ambil(pertama.lokasi, host, true)).badan;
    return pertama.badan;
  };
  const h1 = await ambilIkut('/', 'mengundang.id');
  const arah = await ambil('/', 'mengundang.id', true);
  cek('8a0 akar mengundang.id dialihkan ke /mulai',
      arah.status >= 300 && arah.status < 400 && arah.lokasi === '/mulai',
      arah.status + ' ' + arah.lokasi);
  const arahSub = await ambil('/', 'rian-aini.mengundang.id', true);
  cek('8a1 akar subdomain pasangan TIDAK dialihkan',
      arahSub.status === 200, String(arahSub.status));
  cek('8a akar mengundang.id menyajikan landing',
      h1.includes('mengundang<i>.</i>id') || h1.includes('Coba Sekarang'), h1.slice(0,80));

  const h2 = await ambil('/', 'rian-aini.mengundang.id');
  cek('8b akar subdomain pasangan TETAP menyajikan undangannya',
      !h2.includes('Coba Sekarang') && h2.includes('id="mempelai"'), h2.slice(0,80));

  const h3 = await ambil('/bapak-ahmad?p=kw', 'rian-aini.mengundang.id');
  cek('8c tautan personal tamu tidak tertimpa landing',
      !h3.includes('Coba Sekarang') && h3.includes('id="mempelai"'));
}

/* ---------- 4. 400px ---------- */
{
  const ctx = await browser.newContext({ viewport:{width:400,height:900} });
  const page = await ctx.newPage();
  await page.route('**/*.supabase.co/**', r => r.fulfill({ status:200, body:'null' }));
  await page.goto(ASAL + '/mulai');
  await page.locator('#inPria').fill('Rian');
  await page.locator('#inWanita').fill('Aini');
  await page.locator('#inWa').fill('08123456789');
  await page.locator('#btnBuat').click();
  await page.waitForSelector('#hasil:not([hidden])');
  const buruk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button, input, a.btn')]
      .filter(x => x.checkVisibility({ checkVisibilityCSS:true, contentVisibilityAuto:true }));
    const out = [];
    for (const x of el)
      if (x.tagName !== 'INPUT' && x.scrollWidth > x.clientWidth + 1)
        out.push('terpotong: ' + x.textContent.trim());
    for (let i=0;i<el.length;i++) for (let j=i+1;j<el.length;j++){
      const a=el[i].getBoundingClientRect(), c=el[j].getBoundingClientRect();
      if (Math.min(a.right,c.right)-Math.max(a.left,c.left) > 1 &&
          Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top) > 1)
        out.push('tindih: ' + (el[i].textContent.trim()||el[i].tagName));
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      out.push('gulir mendatar: ' + document.documentElement.scrollWidth);
    return out;
  });
  cek('9 landing 400px bersih', buruk.length === 0, buruk.join(' ; '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
