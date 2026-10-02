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

/* ---------- halaman terima kasih ---------- */
async function tk(hadir){
  const ctx = await browser.newContext({ viewport:{width:430,height:900}, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  await page.route('**/*.supabase.co/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/rest/v1/rpc/terimakasih_isi'){
      return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
        slug:'rian-aini', aktif:true, tanggal_acara:'2026-09-15', hadir,
        mempelai: ISI.mempelai, foto: [],
        ucapan: [{ nama:'Budi', hadir:'Hadir', pesan:'Selamat!', waktu:'2026-09-16T02:00:00Z',
                   balasan:'Terima kasih, Budi.', dibalas:'2026-09-17T02:00:00Z' }]
      })});
    }
    return r.fulfill({ status:200, contentType:'application/json', body:'null' });
  });
  await page.goto(ASAL + '/terimakasih');
  await page.waitForSelector('.kartu', { timeout:8000 });
  return { ctx, page };
}

{
  const { ctx, page } = await tk(312);
  const b = page.locator('#hadirBaris');
  cek('tk-1 baris kehadiran muncul saat ada angkanya', await b.isVisible());
  const t = (await b.innerText()).replace(/\s+/g,' ').trim();
  cek('tk-2 angkanya diformat gaya Indonesia', t === 'DIHADIRI 312 TAMU UNDANGAN', t);
  await page.screenshot({ path:'terimakasih-hadir.png', clip:{x:0,y:0,width:430,height:900} });
  await ctx.close();
}
{
  const { ctx, page } = await tk(null);
  cek('tk-3 tanpa rekap, tidak ada baris "0 tamu"',
      await page.locator('#hadirBaris').isHidden());
  await ctx.close();
}
{
  const { ctx, page } = await tk(0);
  cek('tk-4 hadir=0 pun tidak dipajang',
      await page.locator('#hadirBaris').isHidden());
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
