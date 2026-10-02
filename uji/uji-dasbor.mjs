/* Suite /dasbor. Belum ada sebelumnya — dibuat sekarang karena panel
   8–10 (foto, halaman kenangan, terbit) akan dibangun di atasnya.

   Supabase distub seluruhnya: /auth/v1/token untuk masuk, /rest/v1/…
   untuk baca-tulis. Yang direkam: PATCH yang benar-benar dikirim, karena
   di situlah bug-nya dulu — nilai centang yang terbaca dari .value. */
import { chromium } from 'playwright';
import { mulai } from './server.mjs';

const PORT = 4401, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

function bikinModel() {
  return {
    pasangan: [{
      id: 'p-1', slug: 'rian-aini', status: 'aktif', terbit: true, paket: 'premium',
      tema: 'ukir-jepara', tanggal_acara: '2026-09-15', kota: 'Jepara',
      canonical_host: 'rian-aini.mengundang.id', pihak_bawaan: 'keluarga-wanita'
    }],
    mempelai: [
      { id: 'm-1', pasangan_id: 'p-1', sisi: 'pria',   panggilan: 'RIAN',   lengkap: 'RIAN',   anak: 'Putra dari' },
      { id: 'm-2', pasangan_id: 'p-1', sisi: 'wanita', panggilan: "'AINI",  lengkap: "'AINI",  anak: 'Putri dari' }
    ],
    tempat: [
      { id: 't-1', pasangan_id: 'p-1', kode: 'wanita', nama: 'Kediaman Putri', alamat: 'Jepara', ringkas: 'Jepara', maps: '' },
      { id: 't-2', pasangan_id: 'p-1', kode: 'pria',   nama: 'Kediaman Putra', alamat: 'Kudus',  ringkas: 'Kudus',  maps: '' }
    ],
    acara: [
      { id: 'a-1', pasangan_id: 'p-1', urutan: 1, nama: 'Akad Nikah', tanggal: 'Selasa, 15 September 2026',
        jam: 'Pukul 08.00 WIB', ringkas: 'Akad 08.00', mulai: null, tempat_id: 't-1',
        di_undangan: true, di_terimakasih: true, kenangan_teks: null },
      { id: 'a-2', pasangan_id: 'p-1', urutan: 2, nama: 'Resepsi', tanggal: 'Selasa, 15 September 2026',
        jam: 'Pukul 11.00 WIB', ringkas: 'Resepsi 11.00', mulai: null, tempat_id: null,
        di_undangan: true, di_terimakasih: true, kenangan_teks: null }
    ],
    foto: [
      { id: 'f-1', pasangan_id: 'p-1', jalur: 'p-1/a.webp', jalur_kecil: 'p-1/a-kecil.webp',
        lebar: 1600, tinggi: 1067, bita: 210000, urutan: 0, keterangan: '', tampil: true,
        acara_id: null, latar: false, diunggah: '2026-09-16T02:00:00Z' },
      { id: 'f-2', pasangan_id: 'p-1', jalur: 'p-1/b.webp', jalur_kecil: 'p-1/b-kecil.webp',
        lebar: 1600, tinggi: 1067, bita: 190000, urutan: 1, keterangan: 'Sungkem', tampil: true,
        acara_id: 'a-1', latar: false, diunggah: '2026-09-16T02:05:00Z' }
    ],
    fn: [],
    dompet: [{ id: 'd-1', pasangan_id: 'p-1', kode: 'dana', bank: 'DANA', nomor: '0812', atas_nama: 'Rian', sisi: 'pria' }],
    pihak: [{ id: 'ph-1', pasangan_id: 'p-1', kode: 'keluarga-wanita', kode_pendek: 'kw',
              label: 'Keluarga Pihak Wanita', sisi: 'wanita', ttd_label: 'Hormat kami', ttd_sub: 'Beserta Keluarga' }],
    patch: []          // { tabel, id, badan }
  };
}

async function pasang(page, model) {
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const jalur = u.pathname;
    const kirim = (isi, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(isi)
    });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });

    if (jalur === '/auth/v1/token') {
      return kirim({ access_token: 'JWT-pemilik', refresh_token: 'SEGAR' });
    }

    if (jalur === '/functions/v1/foto-unggah') {
      model.fn.push({ metode: req.method(), auth: req.headers()['authorization'] || '',
                      panitia: req.headers()['x-panitia-token'] || null, cari: u.search });
      if (req.method() === 'DELETE') {
        const id = u.searchParams.get('id');
        model.foto = model.foto.filter(f => f.id !== id);
        return kirim({ dihapus: id });
      }
      const baru = { id: 'f-baru-' + (model.foto.length + 1), pasangan_id: 'p-1',
                     jalur: 'p-1/x.webp', jalur_kecil: 'p-1/x-kecil.webp', lebar: 1600,
                     tinggi: 1067, bita: 200000, urutan: model.foto.length, keterangan: '',
                     tampil: true, acara_id: null, latar: false, diunggah: '2026-09-16T03:00:00Z' };
      model.foto.push(baru);
      return kirim({ foto: baru, terpakai: model.foto.length, batas: 100 }, 201);
    }

    const m = jalur.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (m) {
      const tabel = m[1];
      let badan = {};
      try { badan = JSON.parse(req.postData() || '{}'); } catch {}
      if (req.method() === 'GET')   return kirim(model[tabel] || []);
      if (req.method() === 'PATCH') {
        const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
        model.patch.push({ tabel, id, badan });
        const baris = (model[tabel] || []).find(x => x.id === id);
        if (baris) Object.assign(baris, badan);
        return kirim(null);
      }
      if (req.method() === 'POST') {
        const baru = Object.assign({ id: tabel + '-baru-' + ((model[tabel] || []).length + 1) }, badan);
        (model[tabel] = model[tabel] || []).push(baru);
        return kirim([baru], 201);
      }
    }
    return kirim({ message: 'tidak distub: ' + req.method() + ' ' + jalur }, 500);
  });
}

async function masuk(browser, model, lebar = 1100) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: 1000 } });
  const page = await ctx.newPage();
  /* Galat halaman dikumpulkan dan DIHITUNG sebagai kegagalan di akhir.
     Dulu cuma dicetak — dan satu galat sungguhan lolos dengan 26/26. */
  page.on('pageerror', e => {
    galatHalaman.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n'));
    console.log('   [pageerror] ' + e.message);
  });
  await pasang(page, model);
  await page.goto(ASAL + '/dasbor');
  await page.locator('#inEmail').fill('rian@contoh.com');
  await page.locator('#inSandi').fill('rahasia-sekali');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('#formAcara .baris', { timeout: 8000 });
  return { ctx, page };
}

const galatHalaman = [];
const srv = await mulai(PORT);
const browser = await chromium.launch();

/* ---------- panel 3: dua centang per acara ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);

  const baris = page.locator('#formAcara .baris');
  cek('1a kedua acara tergambar', (await baris.count()) === 2);

  const centang = baris.first().locator('.centang input[type=checkbox]');
  cek('1b tiap acara punya dua centang', (await centang.count()) === 2);
  cek('1c dua-duanya tercentang dari data',
      (await centang.nth(0).isChecked()) && (await centang.nth(1).isChecked()));

  /* Centang tidak boleh melar selebar panel — input{width:100%} berlaku
     untuk semua input di halaman ini. */
  const kotak = await centang.first().boundingBox();
  cek('1d kotak centang tetap kecil, tidak melebar',
      kotak.width <= 24 && kotak.height <= 24, JSON.stringify(kotak));

  /* --- matikan "tampil di undangan" pada Akad, simpan --- */
  await centang.nth(0).uncheck();
  await page.locator('#btnSimpan').click();
  await page.waitForSelector('.toast.on', { timeout: 6000 });

  const akad = model.patch.filter(p => p.tabel === 'acara' && p.id === 'a-1').at(-1);
  cek('2a PATCH acara terkirim', !!akad, JSON.stringify(model.patch.map(p => p.tabel + '/' + p.id)));
  cek('2b di_undangan terkirim false, BUKAN "on"',
      akad && akad.badan.di_undangan === false, JSON.stringify(akad && akad.badan));
  cek('2c di_terimakasih tetap true — dua penanda berdiri sendiri',
      akad && akad.badan.di_terimakasih === true, JSON.stringify(akad && akad.badan));

  const resepsi = model.patch.filter(p => p.tabel === 'acara' && p.id === 'a-2').at(-1);
  cek('2d acara lain tidak ikut berubah',
      resepsi && resepsi.badan.di_undangan === true && resepsi.badan.di_terimakasih === true,
      JSON.stringify(resepsi && resepsi.badan));

  cek('2e kolom lama tetap ikut terkirim',
      akad && akad.badan.nama === 'Akad Nikah' && akad.badan.urutan === 1,
      JSON.stringify(akad && akad.badan));

  /* --- gambar ulang: keadaan centang bertahan --- */
  await page.reload();
  await page.waitForSelector('#formAcara .baris', { timeout: 8000 });
  const c2 = page.locator('#formAcara .baris').first().locator('.centang input[type=checkbox]');
  cek('3a sesudah dimuat ulang, centang mengikuti data',
      !(await c2.nth(0).isChecked()) && (await c2.nth(1).isChecked()));

  await ctx.close();
}

/* ---------- acara baru lahir menyala di dua-duanya ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);
  await page.locator('#btnAcaraBaru').click();
  await page.waitForFunction(() => document.querySelectorAll('#formAcara .baris').length === 3,
                             null, { timeout: 6000 });
  const c = page.locator('#formAcara .baris').nth(2).locator('.centang input[type=checkbox]');
  cek('4a acara baru: dua-duanya tercentang',
      (await c.nth(0).isChecked()) && (await c.nth(1).isChecked()));
  await ctx.close();
}

/* ---------- panel 8: pustaka foto ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);

  const ubin = page.locator('#pustakaFoto .ubin');
  cek('6a pustaka menggambar tiap foto', (await ubin.count()) === 2);
  cek('6b kuota menyebut jumlah dan ukuran',
      /2 dari 100 foto/.test(await page.locator('#kuotaFoto').textContent()),
      await page.locator('#kuotaFoto').textContent());

  /* Babak dipasang lewat .value, bukan atribut selected — acara_id bisa
     null, dan "null" di atribut terbaca sebagai nilai yang tampak sah. */
  const pilih0 = ubin.nth(0).locator('[data-f="acara_id"]');
  const pilih1 = ubin.nth(1).locator('[data-f="acara_id"]');
  cek('6c foto tanpa babak: pilihan kosong, bukan "null"',
      (await pilih0.inputValue()) === '', JSON.stringify(await pilih0.inputValue()));
  cek('6d foto berbabak: pilihannya terpasang', (await pilih1.inputValue()) === 'a-1');
  cek('6e daftar babak datang dari rangkaian acara',
      (await pilih0.locator('option').allTextContents()).join('|') === 'Tanpa babak|Akad Nikah|Resepsi');

  /* --- memberi babak --- */
  await pilih0.selectOption('a-2');
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('on'),
                             null, { timeout: 5000 });
  const p = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7a babak tersimpan lewat PATCH foto', p && p.badan.acara_id === 'a-2',
      JSON.stringify(p && p.badan));

  /* --- melepas babak: null, bukan string kosong --- */
  await pilih0.selectOption('');
  await page.waitForTimeout(400);
  const p2 = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7b dilepas -> acara_id null, bukan ""', p2 && p2.badan.acara_id === null,
      JSON.stringify(p2 && p2.badan));

  /* --- keterangan --- */
  await ubin.nth(0).locator('[data-f="keterangan"]').fill('Menuju pelaminan');
  await ubin.nth(0).locator('[data-f="keterangan"]').blur();
  await page.waitForTimeout(400);
  const p3 = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7c keterangan tersimpan', p3 && p3.badan.keterangan === 'Menuju pelaminan',
      JSON.stringify(p3 && p3.badan));

  /* --- hapus lewat edge function, pakai JWT pemilik --- */
  page.once('dialog', d => d.accept());
  await ubin.nth(0).locator('[data-aksi="hapus"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pustakaFoto .ubin').length === 1,
                             null, { timeout: 6000 });
  const hapus = model.fn.filter(x => x.metode === 'DELETE').at(-1);
  cek('8a hapus lewat foto-unggah', !!hapus);
  cek('8b dikirim dengan JWT pemilik, BUKAN anon key',
      hapus && hapus.auth === 'Bearer JWT-pemilik', hapus && hapus.auth);
  cek('8c tanpa header token panitia', hapus && hapus.panitia === null);

  await ctx.close();
}

/* ---------- keterangan pra-acara ---------- */
{
  const model = bikinModel();
  model.pasangan[0].tanggal_acara = '2099-01-01';   // masih jauh
  const { ctx, page } = await masuk(browser, model);
  const hint = await page.locator('#hintFoto').textContent();
  cek('9a sebelum acara, panelnya tetap terlihat',
      await page.locator('#pustakaFoto').isVisible());
  cek('9b dengan keterangan pra-acara', /belum perlu diisi/i.test(hint), hint.slice(0, 60));
  await ctx.close();
}
{
  const model = bikinModel();
  model.pasangan[0].tanggal_acara = '2020-01-01';   // sudah lewat
  const { ctx, page } = await masuk(browser, model);
  const hint = await page.locator('#hintFoto').textContent();
  cek('9c sesudah acara, keterangannya berubah',
      /foto hari itu/i.test(hint), hint.slice(0, 60));
  await ctx.close();
}

/* ---------- tata letak HP ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model, 400);
  const buruk = await page.evaluate(() => {
    const keluar = [];
    document.querySelectorAll('#formAcara .centang label, .panel h2, #pustakaFoto .ubin .btn').forEach(el => {
      if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) return;
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 || r.left < -1) {
        keluar.push((el.textContent || '').trim().slice(0, 28) + ' @' + Math.round(r.right));
      }
    });
    return keluar;
  });
  cek('5 tata letak 400px bersih', buruk.length === 0, buruk.join(' ; '));
  await page.locator('#formAcara .baris').first().screenshot({ path: 'dasbor-acara-400.png' });
  await ctx.close();
}

cek('99 tidak ada galat JavaScript di halaman sepanjang uji',
    galatHalaman.length === 0, '\n' + galatHalaman.join('\n---\n'));

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
