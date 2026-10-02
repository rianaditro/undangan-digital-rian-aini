import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { ISI } from './stub.mjs';

const PORT = 4380, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

const srv = await mulai(PORT);
const browser = await chromium.launch({ args:['--host-resolver-rules=MAP *.mengundang.id 127.0.0.1, MAP mengundang.id 127.0.0.1'] });
const ctx = await browser.newContext({ viewport:{width:430,height:900} });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('   [pageerror] ' + e.message));

const dilihat = [];
await page.route('**/*.supabase.co/**', async (route) => {
  const req = route.request(), jalur = new URL(req.url()).pathname;
  dilihat.push(jalur);
  let arg = {}; try { arg = JSON.parse(req.postData() || '{}'); } catch {}
  const kirim = (isi, status=200) => route.fulfill({ status, contentType:'application/json',
    headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(isi) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status:204, body:'' });
  if (jalur === '/rest/v1/rpc/undangan_isi') return kirim(ISI);
  if (jalur === '/rest/v1/rpc/ucapan_publik'){
    if (arg.p_slug !== 'rian-aini') return kirim([]);
    return kirim([
      { nama:'Budi Aris', hadir:'Hadir', pesan:'Selamat menempuh hidup baru!', created_at:'2026-09-10T02:00:00Z' },
      { nama:'Siti', hadir:'Belum pasti', pesan:'Semoga lancar', created_at:'2026-09-09T02:00:00Z' }
    ]);
  }
  if (jalur === '/rest/v1/rpc/ucapan_tulis') return kirim(null);
  return kirim({ message:'tidak distub: ' + jalur }, 500);
});

await page.goto(ASAL + '/');
await page.waitForFunction(() =>
  document.querySelectorAll('#ucapanList .kartu, #listUcapan > *, .ucapan-item').length > 0
  || (document.getElementById('stateUcapan') &&
      document.getElementById('stateUcapan').textContent.indexOf('Memuat') === -1),
  null, { timeout: 8000 });

const adaLangsung = dilihat.filter(j => j === '/rest/v1/ucapan');
cek('1 halaman undangan TIDAK lagi membaca tabel ucapan langsung',
    adaLangsung.length === 0, adaLangsung.join(','));
cek('2 memakai rpc ucapan_publik',
    dilihat.includes('/rest/v1/rpc/ucapan_publik'), dilihat.join(' '));

const badan = await page.locator('body').textContent();
cek('3 ucapan tamunya tergambar',
    badan.includes('Budi Aris') && badan.includes('Selamat menempuh hidup baru!'),
    badan.slice(0,60));
cek('4 nama mempelai tetap tergambar dari undangan_isi',
    badan.includes('RIAN') && badan.includes("'AINI"));


await ctx.close();

/* ------------------------------------------------------------------
   Dua bentuk alamat, satu tamu. Yang direkam: argumen yang benar-benar
   dikirim ke undangan_tamu(), karena di situlah lubangnya dulu —
   slug tamu saja, tanpa menyebut pasangan.
   ------------------------------------------------------------------ */
const TAMU = { nama:'Bapak Ahmad Fauzi', pihak:'keluarga-pria' };

async function buka(alamat, { tamuGagal = false } = {}) {
  const c = await browser.newContext({ viewport:{width:430,height:900} });
  const pg = await c.newPage();
  const rekam = { isi:null, tamu:null, ucapan:null, dipanggil:[] };
  pg.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  /* Aset di kedalaman dua segmen: kalau jalurnya relatif, rewrite
     tangkap-semua menyajikan index.html sebagai .js/.css dan halaman
     mati diam-diam. */
  rekam.asetSalah = [];
  pg.on('response', r => {
    const u = r.url(), t = (r.headers()['content-type'] || '');
    if (/\.(js|css)(\?|$)/.test(u) && !/javascript|css/.test(t)) rekam.asetSalah.push(u + ' -> ' + t);
    if (/\.(js|css)(\?|$)/.test(u) && r.status() >= 400) rekam.asetSalah.push(u + ' -> ' + r.status());
    if (/\.(js|css)(\?|$)/.test(u)) (rekam.aset = rekam.aset || []).push(u);
  });
  await pg.route('**/*.supabase.co/**', async (route) => {
    const r = route.request(), jalur = new URL(r.url()).pathname;
    let arg = {}; try { arg = JSON.parse(r.postData() || '{}'); } catch {}
    rekam.dipanggil.push(jalur);
    const kirim = (isi, status=200) => route.fulfill({ status, contentType:'application/json',
      headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(isi) });
    if (r.method() === 'OPTIONS') return route.fulfill({ status:204, body:'' });
    if (jalur === '/rest/v1/rpc/undangan_isi'){ rekam.isi = arg; return kirim(ISI); }
    if (jalur === '/rest/v1/rpc/undangan_tamu'){
      rekam.tamu = arg;
      if (tamuGagal) return kirim({ message:'fungsi lama sudah dibuang' }, 404);
      /* Peniru migrasi 022: dijawab HANYA kalau pasangannya disebut benar */
      if (arg.p_pasangan !== 'rian-aini') return kirim([]);
      if (arg.p_slug !== 'bapak-ahmad-fauzi') return kirim([]);
      return kirim([TAMU]);
    }
    if (jalur === '/rest/v1/rpc/ucapan_publik'){ rekam.ucapan = arg; return kirim([]); }
    return kirim([], 200);
  });
  await pg.goto(alamat);
  await pg.waitForFunction(() => window.MENGUNDANG && window.MENGUNDANG.KONF.siap, null, { timeout:8000 });
  await pg.waitForTimeout(400);
  rekam.badan = await pg.locator('body').textContent();
  rekam.tutup = async () => c.close();
  return rekam;
}

const PORTS = ':' + PORT;

/* --- bentuk subdomain --- */
const sub = await buka('http://rian-aini.mengundang.id' + PORTS + '/bapak-ahmad-fauzi?p=kp');
cek('5 subdomain: undangan_isi memakai slug pasangan dari subdomain',
    sub.isi && sub.isi.p_slug === 'rian-aini', JSON.stringify(sub.isi));
cek('6 subdomain: undangan_tamu menyebut tamu DAN pasangan',
    sub.tamu && sub.tamu.p_slug === 'bapak-ahmad-fauzi' && sub.tamu.p_pasangan === 'rian-aini',
    JSON.stringify(sub.tamu));
cek('7 subdomain: nama tamu dari database yang tergambar',
    sub.badan.includes('Bapak Ahmad Fauzi'));
cek('8 subdomain: ucapan_publik memakai slug pasangan',
    sub.ucapan && sub.ucapan.p_slug === 'rian-aini', JSON.stringify(sub.ucapan));
await sub.tutup();

/* --- bentuk path, domain bersama --- */
const jalur = await buka('http://mengundang.id' + PORTS + '/rian-aini/bapak-ahmad-fauzi?p=kp');
cek('9 path: undangan_isi memakai segmen pertama sebagai pasangan',
    jalur.isi && jalur.isi.p_slug === 'rian-aini', JSON.stringify(jalur.isi));
cek('10 path: undangan_tamu memakai segmen KEDUA sebagai tamu',
    jalur.tamu && jalur.tamu.p_slug === 'bapak-ahmad-fauzi' && jalur.tamu.p_pasangan === 'rian-aini',
    JSON.stringify(jalur.tamu));
cek('11 path: bukan gabungan dua segmen',
    !(jalur.tamu && jalur.tamu.p_slug === 'rian-aini-bapak-ahmad-fauzi'),
    JSON.stringify(jalur.tamu));
cek('12 path: nama tamu dari database yang tergambar, bukan "Rian Aini Bapak…"',
    jalur.badan.includes('Bapak Ahmad Fauzi') && !jalur.badan.includes('Rian Aini Bapak'));
cek('13 path: aset di kedalaman dua segmen tersaji dengan tipe yang benar',
    jalur.asetSalah.length === 0 && (jalur.aset || []).length >= 3,
    'salah: ' + jalur.asetSalah.join(' | ') + '  terpantau: ' + (jalur.aset || []).length);
await jalur.tutup();

/* --- pasangan tanpa tamu: undangan_tamu tidak usah dipanggil --- */
const polos = await buka('http://mengundang.id' + PORTS + '/rian-aini');
cek('14 tanpa nama tamu, undangan_tamu tidak dipanggil sama sekali',
    polos.tamu === null, JSON.stringify(polos.tamu));
cek('15 undangannya tetap terbuka',
    polos.isi && polos.isi.p_slug === 'rian-aini' && polos.badan.includes('RIAN'));
await polos.tutup();

/* --- halaman lama di cache memanggil bentuk yang sudah dibuang --- */
const basi = await buka('http://rian-aini.mengundang.id' + PORTS + '/bapak-ahmad-fauzi?p=kp',
                         { tamuGagal:true });
cek('16 undangan_tamu galat → jatuh ke nama dari alamat, halaman tetap jalan',
    basi.badan.includes('Bapak Ahmad Fauzi') && basi.badan.includes('RIAN'),
    basi.badan.slice(0,80));
await basi.tutup();

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
