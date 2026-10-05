import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { bikinModel, pasang, T_PENUH, T_PIHAK, ISI } from './stub.mjs';

const PORT = 4321;
const ASAL = 'http://127.0.0.1:' + PORT;

let lulus = 0, gagal = 0;
function cek(nama, ok, ket){
  if (ok) { lulus++; console.log('OK    ' + nama); }
  else    { gagal++; console.log('GAGAL ' + nama + (ket ? '  — ' + ket : '')); }
}

async function halaman(browser, { token, sesi, lebar = 1100 }){
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 900 } });
  const model = bikinModel();
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('   [console] ' + m.text()); });
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  await pasang(page, model);
  if (sesi){
    await page.addInitScript(s => {
      localStorage.setItem('panitia-sesi', JSON.stringify({ akses: s, segar: 'SEGAR' }));
    }, sesi);
  }
  await page.goto(ASAL + '/kirim' + (token ? '?t=' + token : ''));
  return { ctx, page, model };
}

const baris0 = '.rk-baris[data-id="tamu-0"]';

async function jalan(){
  const srv = await mulai(PORT);
  const browser = await chromium.launch({ args:['--host-resolver-rules=MAP *.mengundang.id 127.0.0.1, MAP mengundang.id 127.0.0.1'] });

  /* ============ 1. link bercakupan penuh ============ */
  {
    const { ctx, page, model } = await halaman(browser, { token: T_PENUH });
    await page.waitForSelector('#panelRekap:not([hidden])', { timeout: 8000 });
    cek('1a panel rekap tampil untuk link penuh', true);

    await page.waitForSelector(baris0, { timeout: 8000 });
    const n = await page.locator('.rk-baris').count();
    cek('1b daftar dipagari di 200 baris', n === 200, 'dapat ' + n);
    cek('1c pemberitahuan "baru 200 teratas" muncul',
        await page.locator('#rkLagi').isVisible());
    const belum = await page.locator('#rkBelum').textContent();
    cek('1d ringkasan awal: belum ditandai = 210', belum === '210', belum);

    /* ---- tandai hadir ---- */
    await page.locator(baris0 + ' .lampu.hadir').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkDatang').textContent === '1', null, { timeout: 5000 });
    const p1 = model.panggilan.filter(p => p.nama === 'tamu_datang').at(-1);
    cek('2a tamu_datang dipanggil dengan true', p1 && p1.arg.p_datang === true, JSON.stringify(p1 && p1.arg));
    cek('2b baris menyala hijau',
        await page.locator(baris0 + ' .lampu.hadir').evaluate(e => e.classList.contains('on')));
    cek('2c model server ikut berubah', model.tamu[0].datang === true);
    const belum2 = await page.locator('#rkBelum').textContent();
    cek('2d ringkasan ikut turun jadi 209', belum2 === '209', belum2);

    /* ---- tekan lagi = tarik kembali ke "belum" ---- */
    await page.locator(baris0 + ' .lampu.hadir').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkDatang').textContent === '0', null, { timeout: 5000 });
    const p2 = model.panggilan.filter(p => p.nama === 'tamu_datang').at(-1);
    cek('3a menekan ulang mengirim null (bukan false)', p2.arg.p_datang === null, JSON.stringify(p2.arg));
    cek('3b model kembali ke belum ditandai', model.tamu[0].datang === null);
    cek('3c kedua lampu padam', await page.locator(baris0 + ' .lampu.on').count() === 0);

    /* ---- tandai tidak hadir ---- */
    await page.locator(baris0 + ' .lampu.absen').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkBelum').textContent === '209', null, { timeout: 5000 });
    cek('4a "Tidak" mengirim false', model.tamu[0].datang === false);
    cek('4b hadir tetap 0', await page.locator('#rkDatang').textContent() === '0');

    /* ---- catat amplop ---- */
    const nom = page.locator(baris0 + ' input[data-f="nominal"]');
    await nom.fill('');
    await nom.type('250000');
    cek('5a nominal dirapikan sambil diketik',
        (await nom.inputValue()) === '250.000', await nom.inputValue());

    await page.locator(baris0 + ' button[data-aksi="catat"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkUang').textContent.includes('250.000'), null, { timeout: 5000 });
    const p3 = model.panggilan.filter(p => p.nama === 'pemberian_simpan').at(-1);
    cek('5b p_nominal dikirim sebagai ANGKA 250000',
        p3.arg.p_nominal === 250000, JSON.stringify(p3.arg.p_nominal));
    cek('5c p_jenis = uang', p3.arg.p_jenis === 'uang');
    cek('5d p_barang null untuk amplop', p3.arg.p_barang === null, JSON.stringify(p3.arg.p_barang));
    const teksBaris = await page.locator(baris0).innerText();
    cek('5e baris menampilkan "Amplop" dan "Rp 250.000"',
        teksBaris.includes('Amplop') && teksBaris.includes('Rp 250.000'), teksBaris.replace(/\n/g,' | '));
    cek('5f kotak nominal dikosongkan sesudah tercatat',
        (await page.locator(baris0 + ' input[data-f="nominal"]').inputValue()) === '');
    cek('5g ringkasan pemberi = 1', await page.locator('#rkPemberi').textContent() === '1');

    /* ---- catat barang ---- */
    await page.locator(baris0 + ' select[data-f="jenis"]').selectOption('barang');
    cek('6a kotak nominal disembunyikan untuk barang',
        !(await page.locator(baris0 + ' input[data-f="nominal"]').isVisible()));
    cek('6b kotak barang muncul',
        await page.locator(baris0 + ' input[data-f="barang"]').isVisible());

    await page.locator(baris0 + ' input[data-f="barang"]').fill('Gula 2 kg');
    await page.locator(baris0 + ' button[data-aksi="catat"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkBarang').textContent === '1', null, { timeout: 5000 });
    const p4 = model.panggilan.filter(p => p.nama === 'pemberian_simpan').at(-1);
    cek('6c p_nominal null untuk barang', p4.arg.p_nominal === null, JSON.stringify(p4.arg.p_nominal));
    cek('6d p_barang = "Gula 2 kg"', p4.arg.p_barang === 'Gula 2 kg', JSON.stringify(p4.arg.p_barang));
    cek('6e total amplop TIDAK ikut naik',
        (await page.locator('#rkUang').textContent()).includes('250.000'));
    cek('6f baris menampilkan barangnya',
        (await page.locator(baris0).innerText()).includes('Gula 2 kg'));
    cek('6g pemberi tetap 1 (dua pemberian, satu orang)',
        await page.locator('#rkPemberi').textContent() === '1');

    /* ---- tolak sebelum dikirim ---- */
    const sebelum = model.panggilan.filter(p => p.nama === 'pemberian_simpan').length;
    await page.locator(baris0 + ' select[data-f="jenis"]').selectOption('uang');
    await page.locator(baris0 + ' button[data-aksi="catat"]').click();
    await page.waitForSelector('.toast.on', { timeout: 3000 });
    const sesudah = model.panggilan.filter(p => p.nama === 'pemberian_simpan').length;
    cek('7a nominal kosong ditahan di peramban, tidak dikirim',
        sesudah === sebelum, sebelum + ' -> ' + sesudah);
    cek('7b pesannya muncul',
        (await page.locator('.toast').textContent()).toLowerCase().includes('nominal'));

    /* ---- hapus satu catatan ---- */
    page.once('dialog', d => d.accept());
    await page.locator(baris0 + ' .rk-beri .buang').first().click();
    await page.waitForFunction(() =>
      document.querySelector('#rkPemberi').textContent === '1'
      && document.querySelectorAll('.rk-baris[data-id="tamu-0"] .rk-beri li').length === 1,
      null, { timeout: 5000 });
    cek('8a satu catatan terhapus, satu tersisa', model.pemberian.length === 1);
    cek('8b yang tersisa adalah barangnya', model.pemberian[0].jenis === 'barang');
    cek('8c total amplop kembali Rp 0',
        (await page.locator('#rkUang').textContent()) === 'Rp 0',
        await page.locator('#rkUang').textContent());

    /* ---- cari ---- */
    await page.locator('#rkCari').fill('Ababil');
    await page.waitForFunction(() =>
      document.querySelectorAll('.rk-baris').length === 1, null, { timeout: 5000 });
    const p5 = model.panggilan.filter(p => p.nama === 'rekap_daftar').at(-1);
    cek('9a p_cari dikirim apa adanya', p5.arg.p_cari === 'Ababil', JSON.stringify(p5.arg.p_cari));
    cek('9b p_batas 200 dikirim', p5.arg.p_batas === 200);
    cek('9c pemberitahuan 200-teratas hilang saat hasilnya sedikit',
        !(await page.locator('#rkLagi').isVisible()));

    /* ---- saring ---- */
    await page.locator('#rkCari').fill('');
    await page.locator('#rkSaring').selectOption('memberi');
    await page.waitForFunction(() =>
      document.querySelectorAll('.rk-baris').length === 1, null, { timeout: 5000 });
    const p6 = model.panggilan.filter(p => p.nama === 'rekap_daftar').at(-1);
    cek('10a p_saring dikirim', p6.arg.p_saring === 'memberi', JSON.stringify(p6.arg.p_saring));
    cek('10b hanya tamu yang memberi yang tersisa',
        (await page.locator('.rk-baris').first().getAttribute('data-id')) === 'tamu-0');

    await ctx.close();
  }

  /* ============ 2. link per-pihak: panel harus tertutup ============ */
  {
    const { ctx, page, model } = await halaman(browser, { token: T_PIHAK });
    await page.waitForSelector('.tamu', { timeout: 8000 });
    cek('11a panel rekap tersembunyi untuk link per-pihak',
        await page.locator('#panelRekap').isHidden());
    const dipanggil = model.panggilan.filter(p => p.nama.startsWith('rekap_')).length;
    cek('11b tidak ada rpc rekap yang dicoba sama sekali', dipanggil === 0, 'ada ' + dipanggil);
    await ctx.close();
  }

  /* ============ 3. jalur login email (tanpa token) ============ */
  {
    const { ctx, page, model } = await halaman(browser, { sesi: 'JWT-PEMILIK-PALSU' });
    await page.waitForSelector('#panelRekap:not([hidden])', { timeout: 8000 });
    await page.waitForSelector(baris0, { timeout: 8000 });
    cek('12a panel rekap hidup juga di jalur login email', true);

    const p = model.panggilan.filter(x => x.nama === 'rekap_daftar').at(-1);
    cek('12b tanpa token, p_token dikirim null', p.arg.p_token === null, JSON.stringify(p.arg.p_token));
    cek('12c dikirim memakai JWT pemilik, bukan anon key',
        p.jwt === 'JWT-PEMILIK-PALSU', p.jwt);

    await page.locator(baris0 + ' .lampu.hadir').click();
    await page.waitForFunction(() =>
      document.querySelector('#rkDatang').textContent === '1', null, { timeout: 5000 });
    const q = model.panggilan.filter(x => x.nama === 'tamu_datang').at(-1);
    cek('12d menulis pun lewat JWT pemilik', q.jwt === 'JWT-PEMILIK-PALSU' && q.arg.p_token === null);
    await ctx.close();
  }

  /* ============ 4. HP sempit: tidak ada yang tumpang tindih / terpotong ============ */
  {
    const { ctx, page } = await halaman(browser, { token: T_PENUH, lebar: 400 });
    await page.waitForSelector(baris0, { timeout: 8000 });

    const masalah = await page.evaluate(() => {
      const b = document.querySelector('.rk-baris[data-id="tamu-0"]');
      const el = Array.from(b.querySelectorAll('button, select, input'))
                      .filter(x =>
      // offsetParent BUKAN patokan yang benar: anak <details> yang tertutup
      // tetap melaporkannya tidak-null, berikut rect lama yang menumpuk di
      // atas tombol yang sungguh terlihat. checkVisibility() paham
      // content-visibility, offsetParent tidak.
      x.checkVisibility({ checkVisibilityCSS:true, contentVisibilityAuto:true }));
      const buruk = [];
      // teks terpotong
      for (const x of el){
        if (x.tagName === 'BUTTON' && x.scrollWidth > x.clientWidth + 1)
          buruk.push('terpotong: "' + x.textContent.trim() + '" ' + x.clientWidth + '<' + x.scrollWidth);
      }
      // saling tindih
      for (let i = 0; i < el.length; i++)
        for (let j = i + 1; j < el.length; j++){
          const a = el[i].getBoundingClientRect(), c = el[j].getBoundingClientRect();
          const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (w > 1 && h > 1)
            buruk.push('tindih: ' + (el[i].textContent.trim() || el[i].tagName) +
                       ' x ' + (el[j].textContent.trim() || el[j].tagName));
        }
      // keluar dari layar
      if (document.documentElement.scrollWidth > window.innerWidth + 1)
        buruk.push('halaman menggulir mendatar: ' +
                   document.documentElement.scrollWidth + ' > ' + window.innerWidth);
      return buruk;
    });
    cek('13 tata letak 400px bersih', masalah.length === 0, masalah.join(' ; '));
    await page.screenshot({ path: 'rekap-400.png', fullPage: false });
    await ctx.close();
  }

  /* ---------- /kirim di domain bersama tahu undangan siapa ----------
     Token sudah menentukan pasangannya di server, tapi isi undangan
     (nama, acara, pihak) tetap dimuat lewat slug dari alamat. Di domain
     bersama /kirim tidak menyebut pasangan di jalurnya, jadi link
     panitia membawanya di ?pasangan=. */
  {
    async function slugDipakai(alamat){
      const ctx = await browser.newContext({ viewport:{width:900,height:1000} });
      const page = await ctx.newPage();
      const model = bikinModel();
      await pasang(page, model);
      let arg = null;
      await page.route('**/rpc/undangan_isi', async (route) => {
        try { arg = JSON.parse(route.request().postData() || '{}'); } catch { arg = {}; }
        return route.fulfill({ status:200, contentType:'application/json',
          headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(ISI) });
      });
      await page.goto(alamat);
      await page.waitForFunction(() => !!window.MENGUNDANG, null, { timeout:8000 });
      await page.waitForTimeout(500);
      await ctx.close();
      return arg;
    }

    const a1 = await slugDipakai('http://mengundang.id:' + PORT + '/kirim?t=' + T_PENUH + '&pasangan=budi-sari');
    cek('14a /kirim di domain bersama memuat pasangan dari ?pasangan=',
        a1 && a1.p_slug === 'budi-sari', JSON.stringify(a1));

    const a2 = await slugDipakai('http://rian-aini.mengundang.id:' + PORT + '/kirim?t=' + T_PENUH);
    cek('14b /kirim di subdomain memuat pasangan dari subdomainnya',
        a2 && a2.p_slug === 'rian-aini', JSON.stringify(a2));
  }

  /* ============ 9. judul halaman panitia dari database ============
     Halaman ini dipakai semua pasangan. Judulnya dulu tertulis mati
     "Rian & 'Aini" — dan tampil di halaman panitia pasangan lain. */
  {
    const sumber = await (await fetch(ASAL + '/kirim')).text();
    const tanpaKomentar = sumber.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    cek('J1 sumber /kirim tidak menyebut nama pasangan mana pun',
        !/\bRian\b|'Aini|’Aini/i.test(tanpaKomentar), (tanpaKomentar.match(/.{20}(Rian|Aini).{20}/i) || [''])[0]);

    const { ctx, page } = await halaman(browser, { token: T_PENUH });
    await page.waitForSelector('#panelRekap:not([hidden])', { timeout: 8000 });
    cek('J2 judul dari isi undangan, kapital dirapikan',
        (await page.locator('#judulPasangan').textContent()) === "Rian & 'Aini"
        && (await page.title()) === "Panitia — Rian & 'Aini", await page.title());
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const model = bikinModel();
    const lain = JSON.parse(JSON.stringify(ISI));
    lain.mempelai.pria.panggilan = 'BUDI'; lain.mempelai.wanita.panggilan = 'SARI';
    model.rpc.undangan_isi = () => lain;
    model.rpc.panitia_masuk = () => [];          // link tidak dikenal
    const page = await ctx.newPage();
    await pasang(page, model);
    await page.goto(ASAL + '/kirim?t=link-asing');
    await page.waitForFunction(() => /tidak berlaku/i.test(document.body.textContent), null, { timeout: 8000 });
    const t = await page.locator('#gerbang').textContent();
    cek('J3 link tidak berlaku: diarahkan ke pengantin pasangan INI, bukan Rian & \'Aini',
        /kepada Budi atau Sari/.test(t) && !/Rian|Aini/i.test(t), t.replace(/\s+/g, ' ').slice(0, 160));
    await ctx.close();
  }

  await browser.close();
  srv.close();

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
}

jalan().catch(e => { console.error(e); process.exit(2); });
