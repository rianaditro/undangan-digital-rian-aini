/* /admin — meja admin (mitra penjual; di database: reseller). Supabase distub dari sisi peramban; yang
   diuji halaman: gerbangnya, angka dan tautannya, pesanan baru, status
   cair, dan bahwa halaman tidak pernah meminta data tamu. */
import { chromium } from 'playwright';
import { mulai } from './server.mjs';

const PORT = 4371, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

function bikinModel(){
  return {
    reseller: true, panggilan: [],
    saya: { kode:'123', nama:'Percetakan A', rekening:'BCA 999', pengunjung:40, pengunjung_30h:12,
            pesanan:3, lunas:2, komisi_total:130000, komisi_cair:65000, komisi_tertahan:65000 },
    pesanan: [
      { nomor:9, status:'menunggu', pria:'Dodi', wanita:'Rina', slug:'dodi-rina', paket:'standar', tanggal:null,
        email_klien:'dodi@contoh.com', dibuat:'2026-10-09T00:00:00Z', dikonfirmasi:null, komisi:null, cair:false,
        pencairan_ref:null, pencairan_tanggal:null, canonical_host:null, terbit:null },
      { nomor:8, status:'lunas', pria:'Budi', wanita:'Sari', slug:'budi-sari', paket:'premium', tanggal:null,
        email_klien:'budi@contoh.com', dibuat:'2026-10-05T00:00:00Z', dikonfirmasi:'2026-10-06T00:00:00Z', komisi:65000,
        cair:true, pencairan_ref:'TRX-123', pencairan_tanggal:'2026-10-07T00:00:00Z',
        canonical_host:'budi-sari.mengundang.id', terbit:true },
      { nomor:7, status:'lunas', pria:'Eko', wanita:'Fitri', slug:'eko-fitri', paket:'standar', tanggal:null,
        email_klien:'eko@contoh.com', dibuat:'2026-10-04T00:00:00Z', dikonfirmasi:'2026-10-04T00:00:00Z', komisi:65000,
        cair:false, pencairan_ref:null, pencairan_tanggal:null, canonical_host:null, terbit:false }
    ],
    cair: [{ dibuat:'2026-10-07T00:00:00Z', nominal:65000, ref:'TRX-123', catatan:null, jumlah_pesanan:1 }]
  };
}

async function pasang(page, model){
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request(), jalur = new URL(req.url()).pathname;
    const kirim = (isi, status=200) => route.fulfill({ status, contentType:'application/json',
      headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(isi) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status:204, body:'' });
    let arg = {}; try { arg = JSON.parse(req.postData() || '{}'); } catch {}
    const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i,'');
    model.panggilan.push({ jalur, arg, auth });
    if (jalur === '/auth/v1/token'){
      if (arg.password !== 'benar') return kirim({ error_description:'Invalid login credentials' }, 400);
      return kirim({ access_token:'JWT-' + arg.email, refresh_token:'SEGAR' });
    }
    const nama = jalur.replace('/rest/v1/rpc/', '');
    if (nama === 'is_reseller')        return kirim(model.reseller);
    if (!model.reseller)               return kirim({ message:'Halaman ini hanya untuk reseller' }, 403);
    if (nama === 'reseller_saya')      return kirim(model.saya);
    if (nama === 'reseller_pesanan')   return kirim(model.pesanan);
    if (nama === 'reseller_pencairan') return kirim(model.cair);
    if (nama === 'reseller_pesan'){
      if (arg.p_slug === 'rian-aini') return kirim({ message:'Slug "rian-aini" sudah dipakai' }, 409);
      model.pesanan.unshift({ nomor:10, status:'menunggu', pria:arg.p_pria, wanita:arg.p_wanita, slug:arg.p_slug,
        paket:arg.p_paket, email_klien:arg.p_email, dibuat:'2026-10-10T00:00:00Z', cair:false });
      return kirim(10);
    }
    if (nama === 'reseller_batal'){
      model.pesanan.find(x => x.nomor === arg.p_nomor).status = 'batal'; return kirim(null);
    }
    return kirim({ message:'tidak distub: ' + jalur }, 500);
  });
}

async function halaman(browser, { reseller = true, lebar = 1000 } = {}){
  const ctx = await browser.newContext({ viewport:{ width:lebar, height:1000 } });
  const page = await ctx.newPage();
  const galat = [];
  page.on('pageerror', e => { galat.push(e.message); console.log('   [pageerror] ' + e.message); });
  const model = bikinModel(); model.reseller = reseller;
  await pasang(page, model);
  await page.goto(ASAL + '/admin');
  return { ctx, page, model, galat };
}
async function masuk(page){
  await page.locator('#inEmail').fill('a@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
}

const srv = await mulai(PORT);
const browser = await chromium.launch();

/* ===== bukan admin ===== */
{
  const { ctx, page } = await halaman(browser, { reseller:false });
  await masuk(page);
  await page.waitForFunction(() => document.querySelector('#pesanMasuk').textContent.includes('bukan admin'), null, { timeout:6000 });
  cek('1a akun bukan admin ditolak', await page.locator('#isi').isHidden());
  cek('1b sesinya dibuang', await page.evaluate(() => localStorage.getItem('admin-sesi')) === null);
  await ctx.close();
}

/* ===== reseller ===== */
{
  const { ctx, page, model, galat } = await halaman(browser);
  await masuk(page);
  await page.waitForSelector('#daftarPesanan .baris', { timeout:8000 });

  cek('2a tautan rujukan memakai kodenya', (await page.locator('#tautan').textContent()) === 'https://mengundang.id/?r=123');
  const angka = await page.locator('#angka').textContent();
  cek('2b ringkasan: pengunjung, konversi 5.0%, cair dan belum cair',
      angka.includes('40') && angka.includes('5.0%') && angka.includes('Rp65.000'), angka);
  const teks = await page.locator('#daftarPesanan').textContent();
  cek('2c pesanan cair menampilkan nomor transaksinya', teks.includes('cair · TRX-123'));
  cek('2d pesanan lunas yang belum cair ditandai', teks.includes('belum cair'));
  cek('2e alamat premium dan standar ditampilkan sesuai paket',
      teks.includes('budi-sari.mengundang.id') && teks.includes('/eko-fitri') && !teks.includes('eko-fitri.mengundang.id'), teks);
  cek('2f riwayat pencairan', (await page.locator('#daftarCair').textContent()).includes('TRX-123'));

  /* pesanan baru: slug diusulkan dari nama */
  await page.locator('#inPria').fill('Fajar');
  await page.locator('#inWanita').fill('Gita');
  cek('3a slug diusulkan dari kedua nama', (await page.locator('#inSlug').inputValue()) === 'fajar-gita');
  await page.locator('#inPaket').selectOption('premium');
  cek('3b petunjuk alamat ikut paket', (await page.locator('#hintAlamat').textContent()).includes('fajar-gita.mengundang.id'));
  await page.locator('#btnPesan').click();
  cek('3c tanpa email ditolak di halaman', (await page.locator('#salahPesan').textContent()).includes('email'));
  await page.locator('#inEmailKlien').fill('fajar@contoh.com');
  await page.locator('#btnPesan').click();
  await page.waitForFunction(() => document.querySelector('#daftarPesanan').textContent.includes('#10'), null, { timeout:5000 });
  const p = model.panggilan.filter(x => x.jalur.endsWith('/reseller_pesan')).at(-1);
  cek('3d reseller_pesan dikirim dengan data klien dan JWT reseller',
      p.arg.p_slug === 'fajar-gita' && p.arg.p_paket === 'premium' && p.arg.p_email === 'fajar@contoh.com'
      && p.auth === 'JWT-a@contoh.com', JSON.stringify(p.arg));
  cek('3e formulir dikosongkan', (await page.locator('#inPria').inputValue()) === '');

  /* slug dipakai */
  await page.locator('#inPria').fill('Rian');
  await page.locator('#inWanita').fill('Aini');
  await page.locator('#inSlug').fill('rian-aini');
  await page.locator('#inEmailKlien').fill('x@contoh.com');
  await page.locator('#btnPesan').click();
  await page.waitForFunction(() => document.querySelector('#salahPesan').textContent.includes('sudah dipakai'), null, { timeout:5000 });
  cek('3f slug yang dipakai: pesan dari database ditampilkan', true);

  /* batal */
  page.on('dialog', d => d.accept());
  await page.locator('#daftarPesanan button[data-batal="9"]').click();
  await page.waitForFunction(() => document.querySelector('#daftarPesanan').textContent.includes('batal'), null, { timeout:5000 });
  cek('4a pesanan menunggu bisa dibatalkan', model.panggilan.some(x => x.jalur.endsWith('/reseller_batal') && x.arg.p_nomor === 9));

  /* tidak pernah menyentuh data tamu */
  const terlarang = model.panggilan.filter(x => /\/rest\/v1\/(tamu|ucapan|pemberian|pengiriman|rsvp)|rpc\/(admin_|undangan_)/.test(x.jalur));
  cek('5 tidak satu pun permintaan ke tabel tamu, ucapan, amplop, atau fungsi admin',
      terlarang.length === 0, terlarang.map(x => x.jalur).join(','));
  cek('6 tanpa galat halaman', galat.length === 0, galat.join(' ; '));
  await ctx.close();
}

/* ===== lupa sandi ===== */
{
  const { ctx, page } = await halaman(browser);
  const minta = [];
  await page.route('**/auth/v1/recover**', r => { minta.push(r.request().url());
    r.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:'{}' }); });
  await page.locator('#inEmail').fill('a@contoh.com');
  await page.locator('#btnLupa').click();
  await page.waitForFunction(() => document.querySelector('#pesanMasuk').textContent.includes('tautan'), null, { timeout:5000 });
  cek('8a lupa sandi: tautan pemulihan kembali ke /admin',
      minta.length === 1 && decodeURIComponent(minta[0]).includes('redirect_to=' + ASAL + '/admin'), minta[0]);
  await ctx.close();
}

/* ===== /reseller lama dialihkan ===== */
{
  const r = await fetch(ASAL + '/reseller', { redirect:'manual' });
  cek('9 /reseller dialihkan permanen ke /admin', r.status === 301 && r.headers.get('location') === '/admin',
      r.status + ' ' + r.headers.get('location'));
}

/* ===== 400px ===== */
{
  const { ctx, page } = await halaman(browser, { lebar:400 });
  await masuk(page);
  await page.waitForSelector('#daftarPesanan .baris', { timeout:8000 });
  const lebar = await page.evaluate(() => document.documentElement.scrollWidth);
  cek('7 400px tanpa gulir mendatar', lebar <= 401, String(lebar));
  await page.screenshot({ path:'admin-400.png', fullPage:true });
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
