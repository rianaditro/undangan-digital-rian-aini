/* Suite /dasbor. Belum ada sebelumnya — dibuat sekarang karena panel
   8–10 (foto, halaman kenangan, terbit) akan dibangun di atasnya.

   Supabase distub seluruhnya: /auth/v1/token untuk masuk, /rest/v1/…
   untuk baca-tulis. Yang direkam: PATCH yang benar-benar dikirim, karena
   di situlah bug-nya dulu — nilai centang yang terbaca dari .value. */
import { chromium } from 'playwright';
import { mulai, MEDIA, MEDIA_KUNCI } from './server.mjs';
import { tandatangan } from '../cloudflare/media.js';
import { randomUUID } from 'node:crypto';

const GAMBAR_DATAR = 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR4nGM4MS1lQBDDqMWjFo9aPGrxqMWjFo9aPGrxyLEYAIILfozXZrotAAAAAElFTkSuQmCC';
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
    kenangan_blok: [],
    silsilah: [
      { id: 's-1', pasangan_id: 'p-1', sisi: 'pria', urutan: 1, peran: 'Ayah', nama: 'Bapak Contoh',
        keterangan: '(Alm)', foto_jalur: 'p-1/sil-a.webp', foto_kecil: 'p-1/sil-a-kecil.webp', tampil: true },
      { id: 's-2', pasangan_id: 'p-1', sisi: 'wanita', urutan: 1, peran: 'Ibu', nama: 'Ibu Contoh',
        keterangan: null, foto_jalur: null, foto_kecil: null, tampil: true }
    ],
    hapus: [],         // { tabel, id } — urutan DELETE yang terkirim
    post: [],          // { tabel, cari, prefer, badan }
    dompet: [{ id: 'd-1', pasangan_id: 'p-1', kode: 'dana', bank: 'DANA', nomor: '0812', atas_nama: 'Rian', sisi: 'pria' }],
    pihak: [{ id: 'ph-1', pasangan_id: 'p-1', kode: 'keluarga-wanita', kode_pendek: 'kw',
              label: 'Keluarga Pihak Wanita', sisi: 'wanita', ttd_label: 'Hormat kami', ttd_sub: 'Beserta Keluarga' }],
    patch: []          // { tabel, id, badan }
  };
}

async function pasang(page, model) {
  // /media/: yang sudah diunggah dalam uji dilayani Worker di server uji
  // (R2 tiruan); jalur data contoh yang tidak ada di sana diganti gambar
  // mendatar, supaya ubin dan editor potongan punya gambar sungguhan.
  await page.route('**/media/**', async (route) => {
    const req = route.request();
    const kunci = decodeURIComponent(new URL(req.url()).pathname.slice('/media/'.length));
    if (req.method() === 'GET' && !MEDIA.isi.has(kunci))
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(GAMBAR_DATAR, 'base64') });
    return route.continue();
  });
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
    // Berkas foto: satu gambar mendatar 2:1, supaya editor potongan punya
    // ruang geser yang sungguhan.
    if (jalur.startsWith('/storage/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(GAMBAR_DATAR, 'base64') });
    }
    if (jalur === '/functions/v1/foto-unggah' && ['izin', 'catat'].includes(u.searchParams.get('langkah'))) {
      const b = JSON.parse(req.postData() || '{}');
      (model.r2 = model.r2 || []).push({ langkah: u.searchParams.get('langkah'), cari: u.search, badan: b,
                                        auth: req.headers()['authorization'] || '' });
      if (u.searchParams.get('langkah') === 'izin') {
        if (model.r2Mati) return kirim({ pesan: 'Penyimpanan media belum disiapkan', jalanLama: true }, 503);
        const P = '11111111-2222-4333-8444-555555555555', nama = randomUUID();
        const eks = t => ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm' }[t]);
        const kd = String(Math.floor(Date.now() / 1000) + 600);
        const satu = async (j, t, n) => ({ jalur: j, url: '/media/' + j, jenis: t,
          kepala: { 'x-media-tanda': await tandatangan(MEDIA_KUNCI, 'unggah', j, t, String(n), kd),
                    'x-media-batas': String(n), 'x-media-kedaluwarsa': kd } });
        const jalurU = `${P}/${nama}.${eks(b.berkas.jenis)}`;
        const jalurK = b.kecil ? `${P}/${nama}-kecil.${eks(b.kecil.jenis)}` : null;
        const unggah = [await satu(jalurU, b.berkas.jenis, b.berkas.bita)];
        if (jalurK) unggah.push(await satu(jalurK, b.kecil.jenis, b.kecil.bita));
        return kirim({ jalur: jalurU, jalur_kecil: jalurK, unggah });
      }
      if (u.searchParams.get('untuk') === 'silsilah') {
        const s = model.silsilah.find(x => x.id === u.searchParams.get('id'));
        if (s) { s.foto_jalur = b.jalur; s.foto_kecil = b.jalur_kecil; }
        return kirim({ silsilah: s }, 201);
      }
      const baru = { id: 'f-r2-' + (model.foto.length + 1), pasangan_id: 'p-1', jalur: b.jalur, jalur_kecil: b.jalur_kecil,
                     lebar: b.lebar, tinggi: b.tinggi, bita: 1, urutan: model.foto.length, keterangan: '', tampil: true,
                     acara_id: b.acara_id || null, bagian: b.bagian || null, latar: false, diunggah: '2026-10-10T03:00:00Z',
                     jenis: /\.(mp4|webm)$/.test(b.jalur) ? 'video' : 'foto', durasi_ms: b.durasi_ms ?? null };
      model.foto.push(baru);
      return kirim({ foto: baru, terpakai: model.foto.length, batas: 100 }, 201);
    }

    if (jalur === '/auth/v1/token') {
      return kirim({ access_token: 'JWT-pemilik', refresh_token: 'SEGAR' });
    }
    if (jalur === '/auth/v1/user' && req.method() === 'PUT') {
      (model.sandiBaru = model.sandiBaru || []).push({ auth: req.headers()['authorization'] || '',
        isi: JSON.parse(req.postData() || '{}') });
      return kirim({ id: 'u-1', email: 'budi@contoh.com' });
    }

    if (jalur === '/functions/v1/drive-impor') {
      model.drive = model.drive || [];
      model.drive.push({ cari: u.search, auth: req.headers()['authorization'] || '' });
      if (u.searchParams.has('folder')) {
        if (/pribadi/.test(u.searchParams.get('folder')))
          return kirim({ pesan: 'Folder belum bisa dibaca. Ubah aksesnya jadi "Siapa saja yang memiliki link".' }, 403);
        return kirim(Object.assign({
          folder: { id: 'FOLDER1', nama: 'Rian & Aini — fotografer' }, terpotong: false,
          terpakai: model.foto.length, batas: 100, terpakai_video: 0, batas_video: 12,
          berkas: [
            { id: 'D1', nama: 'IMG_0001.jpg', jenis: 'image/png', bita: 5000000, lebar: 40, tinggi: 20, kecil: null, sub: '' },
            { id: 'D2', nama: 'IMG_0002.jpg', jenis: 'image/png', bita: 4000000, lebar: 40, tinggi: 20, kecil: null, sub: 'Akad' },
            { id: 'D3', nama: 'klip.MOV', jenis: 'video/quicktime', bita: 9000000, kecil: null, sub: 'Akad' },
            { id: 'D4', nama: 'utuh.mp4', jenis: 'video/mp4', bita: 300000000, durasi_ms: 600000, kecil: null, sub: '' }
          ] }, model.driveUbah || {}));
      }
      if (u.searchParams.get('unduh') === 'D2' && model.driveGagalD2)
        return kirim({ pesan: 'Google sedang membatasi akses. Coba lagi beberapa menit lagi.' }, 429);
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' },
                             body: Buffer.from(GAMBAR_DATAR, 'base64') });
    }
    if (jalur === '/functions/v1/foto-unggah') {
      model.fn.push({ metode: req.method(), auth: req.headers()['authorization'] || '',
                      panitia: req.headers()['x-panitia-token'] || null, cari: u.search,
                      badan: req.method() === 'POST' ? (req.postDataBuffer() || Buffer.alloc(0)).toString('latin1') : '' });
      if (u.searchParams.get('untuk') === 'silsilah') {
        const s = model.silsilah.find(x => x.id === u.searchParams.get('id'));
        model.hapus.push({ tabel: 'foto-silsilah', id: u.searchParams.get('id'), metode: req.method() });
        if (req.method() === 'DELETE') { if (s) { s.foto_jalur = null; s.foto_kecil = null; } return kirim({ fotoDilepas: s && s.id }); }
        if (s) { s.foto_jalur = 'p-1/sil-baru.webp'; s.foto_kecil = 'p-1/sil-baru-kecil.webp'; }
        return kirim({ silsilah: s }, 201);
      }
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
        /* Tiruan pemicu foto_satu_latar (026): menyalakan latar mematikan
           latar lain di babak yang sama. Dasbor mengandalkannya — ia cuma
           mengirim satu PATCH. */
        if (tabel === 'foto' && baris && badan.latar === true) {
          model.foto.forEach(f => { if (f !== baris && (baris.bagian ? f.bagian === baris.bagian
                                                                     : f.acara_id === baris.acara_id)) f.latar = false; });
        }
        return kirim(null);
      }
      if (req.method() === 'DELETE') {
        const cari = u.searchParams.get('id') || '';
        const id = cari.replace(/^eq\./, '');
        const ids = /^in\.\(/.test(cari) ? cari.slice(4, -1).split(',') : [id];
        model.hapus.push({ tabel, id, metode: 'DELETE' });
        model[tabel] = (model[tabel] || []).filter(x => !ids.includes(x.id));
        return kirim(null);
      }
      if (req.method() === 'POST' && u.searchParams.get('on_conflict')) {
        /* upsert PostgREST: baris dengan kunci yang sama ditimpa */
        model.post.push({ tabel, cari: u.search, prefer: req.headers()['prefer'] || '', badan });
        const kunci = u.searchParams.get('on_conflict').split(',');
        for (const b of [].concat(badan)) {
          const daftar = (model[tabel] = model[tabel] || []);
          const ada = daftar.find(x => kunci.every(k => x[k] === b[k]));
          ada ? Object.assign(ada, b) : daftar.push({ ...b });
        }
        return kirim(null, 201);
      }
      if (req.method() === 'POST') {
        model.post.push({ tabel, cari: u.search, prefer: req.headers()['prefer'] || '', badan });
        const baru = [].concat(badan).map(b => {
          const x = Object.assign({ id: tabel + '-baru-' + ((model[tabel] || []).length + 1) }, b);
          (model[tabel] = model[tabel] || []).push(x);
          return x;
        });
        return kirim(baru, 201);
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
      /2 dari 100 berkas/.test(await page.locator('#kuotaFoto').textContent()),
      await page.locator('#kuotaFoto').textContent());

  /* Babak dipasang lewat .value, bukan atribut selected — acara_id bisa
     null, dan "null" di atribut terbaca sebagai nilai yang tampak sah. */
  const pilih0 = ubin.nth(0).locator('[data-f="bab"]');
  const pilih1 = ubin.nth(1).locator('[data-f="bab"]');
  cek('6c foto tanpa babak: pilihan kosong, bukan "null"',
      (await pilih0.inputValue()) === '', JSON.stringify(await pilih0.inputValue()));
  cek('6d foto berbabak: pilihannya terpasang', (await pilih1.inputValue()) === 'a:a-1');
  const opsi = (await pilih0.locator('option').allTextContents()).join('|');
  cek('6e daftar bab mengikuti hari itu: bab tetap, babak acara di tempatnya',
      opsi === 'Tanpa bab (album)|Sampul|Mempelai pria|Mempelai wanita|Kedatangan keluarga|Akad Nikah|Resepsi|Sungkem|Keluarga|Para tamu|Kami berdua', opsi);

  /* --- memberi babak --- */
  await pilih0.selectOption('a:a-2');
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('on'),
                             null, { timeout: 5000 });
  const p = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7a babak tersimpan lewat PATCH foto, bagian dikosongkan', p && p.badan.acara_id === 'a-2' && p.badan.bagian === null,
      JSON.stringify(p && p.badan));

  /* --- bab tetap: bagian terisi, acara_id dikosongkan (satu tempat) --- */
  await pilih0.selectOption('b:keluarga');
  await page.waitForTimeout(400);
  const pb = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7a2 bab Keluarga: bagian=keluarga, acara_id null', pb && pb.badan.bagian === 'keluarga' && pb.badan.acara_id === null,
      JSON.stringify(pb && pb.badan));

  /* --- melepas babak: null, bukan string kosong --- */
  await pilih0.selectOption('');
  await page.waitForTimeout(400);
  const p2 = model.patch.filter(x => x.tabel === 'foto' && x.id === 'f-1').at(-1);
  cek('7b dilepas -> acara_id dan bagian null, bukan ""', p2 && p2.badan.acara_id === null && p2.badan.bagian === null,
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
      /foto dan video hari itu/i.test(hint), hint.slice(0, 60));
  await ctx.close();
}

/* ---------- panel 9: halaman kenangan ---------- */
{
  const model = bikinModel();
  model.foto.push({ id: 'f-3', pasangan_id: 'p-1', jalur: 'p-1/c.webp', jalur_kecil: 'p-1/c-kecil.webp',
                    lebar: 1600, tinggi: 1067, bita: 150000, urutan: 2, keterangan: '', tampil: true,
                    acara_id: 'a-1', latar: false, diunggah: '2026-09-16T02:10:00Z' });
  const { ctx, page } = await masuk(browser, model);
  const babak = page.locator('#formBabak [data-babak]');

  cek('10a panel 9 ada, satu baris per acara yang jadi babak', (await babak.count()) === 2);
  /* Langsung sesudah masuk, sebelum aksi apa pun: dulu blok baru
     tergambar sesudah foto dimuat ulang, dan uji yang mengganti latar
     lebih dulu menyembunyikannya. */
  const jmlBlok = await page.evaluate(() => window.Kenangan.BLOK.filter(b => b.jenis !== 'acara').length);
  cek('10a2 semua bab tergambar sejak halaman dimuat, tanpa "Dalam Angka"',
      (await page.locator('#formBlok [data-kblok]').count()) === jmlBlok && jmlBlok === 13
      && (await page.locator('#formBlok [data-kblok="angka"]').count()) === 0
      && (await page.locator('#formBlok [data-info="acara"]').textContent()).includes('Akad Nikah, Resepsi'));
  cek('10b sesudah acara, keterangannya bercerita tentang halaman',
      /babak demi babak/i.test(await page.locator('#hintKenangan').textContent()));

  const pilihAkad = babak.nth(0).locator('.pilih-latar button');
  cek('10c babak Akad menawarkan foto-foto Akad saja', (await pilihAkad.count()) === 2);
  cek('10d tanpa pilihan, yang tertanda latar = foto pertama babak itu (sama dengan terimakasih_isi)',
      (await pilihAkad.nth(0).getAttribute('data-latar')) === 'f-2'
      && (await pilihAkad.nth(0).getAttribute('class')) === 'dipilih');
  cek('10e babak tanpa foto menjelaskan dirinya, bukan kotak kosong',
      /kartu teks/i.test(await babak.nth(1).textContent()) && (await babak.nth(1).locator('.pilih-latar').count()) === 0);

  /* --- ganti latar: satu PATCH, pemicu yang mematikan yang lama --- */
  await pilihAkad.nth(1).click();
  await page.waitForFunction(() => document.querySelector('#formBabak [data-latar="f-3"]')?.classList.contains('dipilih'),
                             null, { timeout: 5000 });
  const latar = model.patch.filter(x => x.tabel === 'foto' && 'latar' in x.badan);
  cek('11a ganti latar = satu PATCH latar:true, tanpa mematikan yang lama dari peramban',
      latar.length === 1 && latar[0].id === 'f-3' && latar[0].badan.latar === true, JSON.stringify(latar));
  cek('11b yang terpilih pindah ke foto baru',
      (await page.locator('#formBabak [data-latar="f-2"]').getAttribute('class')) === '');

  /* --- placeholder = tulisan bawaan halaman, dari satu sumber --- */
  cek('12c placeholder kalimat babak = kalimat bawaan halaman sesuai nama acara',
      /dua hidup resmi menjadi satu/.test(await babak.nth(0).locator('[data-kk="kenangan_teks"]').getAttribute('placeholder'))
      && /menemukan rumahnya/.test(await babak.nth(1).locator('[data-kk="kenangan_teks"]').getAttribute('placeholder')));
  const ph = await page.locator('[data-kblok="sampul"] [data-kb="judul"]').getAttribute('placeholder');
  const bawaan = await page.evaluate(() => window.Kenangan.MENURUT.sampul.judul);
  cek('12a placeholder sama dengan bawaan halaman (assets/kenangan.js)', ph === bawaan && ph === 'Terima Kasih', ph);
  cek('12b sampul dan penutup tidak bisa dimatikan',
      (await page.locator('[data-kblok="sampul"] [data-kb="tampil"]').count()) === 0
      && (await page.locator('[data-kblok="penutup"] [data-kb="tampil"]').count()) === 0
      && (await page.locator('[data-kblok="galeri"] [data-kb="tampil"]').count()) === 1);

  /* --- simpan tanpa perubahan: tidak menulis apa-apa --- */
  model.post.length = 0; model.patch.length = 0;
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await page.locator('#btnSimpanKenangan').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent !== '', null, { timeout: 5000 });
  cek('13a tidak diubah = tidak ada baris kenangan_blok yang ditulis (bawaan tidak dibekukan)',
      model.post.length === 0 && model.patch.length === 0, JSON.stringify({ post: model.post, patch: model.patch }));

  /* --- ubah tiga hal, simpan --- */
  await babak.nth(0).locator('[data-kk="kenangan_teks"]').fill('  Pagi yang hening.  ');
  await page.locator('[data-kblok="galeri"] [data-kb="tampil"]').uncheck();
  await page.locator('[data-kblok="sampul"] [data-kb="judul"]').fill('Matur Nuwun');
  cek('13b blok yang dimatikan tampak samar', await page.locator('[data-kblok="galeri"]').evaluate(el => el.classList.contains('mati')));
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await page.locator('#btnSimpanKenangan').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent !== '', null, { timeout: 5000 });
  const teks = model.patch.filter(x => x.tabel === 'acara');
  cek('14a kalimat babak: PATCH acara hanya untuk babak yang berubah, dirapikan',
      teks.length === 1 && teks[0].id === 'a-1' && teks[0].badan.kenangan_teks === 'Pagi yang hening.'
      && Object.keys(teks[0].badan).length === 1, JSON.stringify(teks));
  const up = model.post.filter(x => x.tabel === 'kenangan_blok');
  const kunci = up.length ? up[0].badan.map(b => b.kunci).sort().join(',') : '';
  cek('14b blok: satu upsert berisi hanya yang berubah', up.length === 1 && kunci === 'galeri,sampul', kunci);
  cek('14c upsert sungguhan: on_conflict + merge-duplicates',
      up[0] && /on_conflict=pasangan_id,kunci/.test(up[0].cari) && /merge-duplicates/.test(up[0].prefer),
      up[0] && up[0].cari + ' / ' + up[0].prefer);
  const sampul = up[0] && up[0].badan.find(b => b.kunci === 'sampul');
  cek('14d kolom yang tidak diisi dikirim null, bukan ""',
      sampul && sampul.judul === 'Matur Nuwun' && sampul.teks === null && sampul.tampil === true,
      JSON.stringify(sampul));

  /* --- "Simpan Semua" di kotak 7 tidak menghapus ketikan kotak 9 --- */
  await babak.nth(1).locator('[data-kk="kenangan_teks"]').fill('Belum disimpan');
  await page.locator('#btnSimpan').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Tersimpan',
                             null, { timeout: 5000 });
  cek('15a ketikan kotak 9 bertahan sesudah Simpan Semua',
      (await page.locator('#formBabak [data-babak="a-2"] [data-kk="kenangan_teks"]').inputValue()) === 'Belum disimpan');

  /* --- foto diberi babak di kotak 8 → pilihan latar muncul di kotak 9 --- */
  await page.locator('#pustakaFoto [data-foto="f-1"] [data-f="bab"]').selectOption('a:a-2');
  await page.waitForFunction(() => document.querySelectorAll('#formBabak [data-babak="a-2"] .pilih-latar button').length === 1,
                             null, { timeout: 5000 });
  cek('15b memberi babak di kotak 8 langsung menyusun kotak 9', true);

  /* --- bab tetap: pilihan latarnya di baris bab itu --- */
  await page.locator('[data-kblok="sampul"] [data-kb="teks"]').fill('Ketikan sampul');
  cek('15c bab Keluarga tanpa foto menjelaskan dirinya',
      /Pilih bab Keluarga/i.test(await page.locator('[data-kblok="keluarga"]').textContent()));
  await page.locator('#pustakaFoto [data-foto="f-1"] [data-f="bab"]').selectOption('b:keluarga');
  await page.waitForFunction(() => document.querySelectorAll('[data-kblok="keluarga"] .pilih-latar button').length === 1,
                             null, { timeout: 5000 });
  cek('15d foto diberi bab Keluarga → muncul di baris Keluarga; ketikan bab lain bertahan',
      (await page.locator('[data-kblok="sampul"] [data-kb="teks"]').inputValue()) === 'Ketikan sampul');
  model.patch.length = 0;
  model.foto.push({ id: 'f-4', pasangan_id: 'p-1', jalur: 'p-1/v.mp4', jalur_kecil: 'p-1/v-poster.webp', jenis: 'video',
                    durasi_ms: 9000, lebar: 720, tinggi: 1280, bita: 9000000, urutan: 3, keterangan: '', tampil: true,
                    acara_id: null, bagian: 'keluarga', latar: false, diunggah: '2026-09-16T02:20:00Z' });
  await page.locator('#pustakaFoto [data-foto="f-1"] [data-f="keterangan"]').fill('x');
  await page.locator('#pustakaFoto [data-foto="f-1"] [data-f="keterangan"]').blur();
  await page.locator('#pustakaFoto [data-foto="f-2"] [data-aksi="tampil"]').click();   // memuat ulang foto
  await page.waitForFunction(() => document.querySelectorAll('[data-kblok="keluarga"] .pilih-latar button').length >= 1
                                   && !!document.querySelector('#pustakaFoto [data-foto="f-4"]'), null, { timeout: 5000 });
  cek('15e video di pustaka bertanda ▶ dan durasinya',
      (await page.locator('#pustakaFoto [data-foto="f-4"] .tanda-video').textContent()).includes('0:09'));
  await page.locator('[data-kblok="keluarga"] [data-latar="f-4"]').click();
  await page.waitForFunction(() => document.querySelector('[data-kblok="keluarga"] [data-latar="f-4"]')?.classList.contains('dipilih'),
                             null, { timeout: 5000 });
  cek('15f latar bab tetap: satu PATCH latar:true', model.patch.some(x => x.id === 'f-4' && x.badan.latar === true));

  /* --- tombol lihat membuka alamat halaman kenangan pasangan ini --- */
  await page.evaluate(() => { window.__buka = []; window.open = (u) => { window.__buka.push(u); }; });
  await page.locator('#btnLihatKenangan').click();
  const dibuka = await page.evaluate(() => window.__buka[0]);
  /* Pratinjau di asal dasbor sendiri, BUKAN subdomain pasangan premium:
     sesi pemilik tinggal di localStorage asal ini. */
  cek('16 Pratinjau = /terimakasih?pratinjau=1 di asal dasbor',
      dibuka === ASAL + '/terimakasih?pasangan=rian-aini&pratinjau=1', dibuka);

  await ctx.close();
}
{
  const model = bikinModel();
  model.pasangan[0].tanggal_acara = '2099-01-01';
  model.foto = [];
  const { ctx, page } = await masuk(browser, model, 400);
  cek('17a sebelum acara: panel 9 tetap terlihat, dengan keterangan pra-acara, blok lengkap',
      await page.locator('#panelKenangan').isVisible()
      && (await page.locator('#formBlok [data-kblok]').count()) === 13
      && /belum perlu diisi/i.test(await page.locator('#hintKenangan').textContent()));
  const buruk = await page.evaluate(() => {
    const keluar = [];
    document.querySelectorAll('#panelKenangan *, #panelTerbitKenangan *').forEach(el => {
      if (!el.checkVisibility({ checkVisibilityCSS: true })) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) keluar.push(el.tagName + ' @' + Math.round(r.right));
    });
    return keluar;
  });
  cek('17b panel 9 dan 10 bersih di 400px', buruk.length === 0, buruk.slice(0, 5).join(' ; '));
  await page.locator('#panelTerbitKenangan').screenshot({ path: 'dasbor-terbit-kenangan-400.png' });
  await page.locator('#panelKenangan').screenshot({ path: 'dasbor-kenangan-400.png' });
  await ctx.close();
}

/* ---------- panel 9: terima kasih kepada ---------- */
{
  const model = bikinModel();
  model.kenangan_vendor = [{ id: 'v-1', pasangan_id: 'p-1', urutan: 0, peran: 'Fotografer', nama: 'Lensa', tautan: '@lensa' }];
  const { ctx, page } = await masuk(browser, model, 400);
  const baris = page.locator('#formVendor .vendor-baris');
  cek('19a vendor tersimpan tergambar', (await baris.count()) === 1
      && (await baris.nth(0).locator('[data-kv="nama"]').inputValue()) === 'Lensa');

  const simpan = async () => {
    await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    await page.locator('#btnSimpanKenangan').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent !== '', null, { timeout: 5000 });
    return page.locator('#toast').textContent();
  };

  await page.locator('#btnTambahVendor').click();
  await baris.nth(1).locator('[data-kv="peran"]').fill('Dekorasi');
  await baris.nth(1).locator('[data-kv="nama"]').fill('Sekar');
  await baris.nth(1).locator('[data-kv="tautan"]').fill('javascript:alert(1)');
  const t1 = await simpan();
  cek('19b tautan aneh ditolak sebelum dikirim', /belum benar/i.test(t1) && !model.post.some(x => x.tabel === 'kenangan_vendor'), t1);

  await baris.nth(1).locator('[data-kv="tautan"]').fill('https://www.instagram.com/sekar.dekor/');
  await baris.nth(0).locator('[data-kv="nama"]').fill('Lensa Jepara');
  await page.locator('#btnTambahVendor').click();       // baris kosong: diabaikan
  await simpan();
  const post = model.post.filter(x => x.tabel === 'kenangan_vendor');
  const patch = model.patch.filter(x => x.tabel === 'kenangan_vendor');
  cek('19c baris baru: satu POST, tautan Instagram jadi @akun, urutan ikut posisi',
      post.length === 1 && post[0].badan.length === 1 && post[0].badan[0].tautan === '@sekar.dekor'
      && post[0].badan[0].urutan === 1 && post[0].badan[0].pasangan_id === 'p-1', JSON.stringify(post));
  cek('19d baris lama yang diubah: PATCH', patch.length === 1 && patch[0].id === 'v-1' && patch[0].badan.nama === 'Lensa Jepara',
      JSON.stringify(patch));
  cek('19e sesudah simpan, daftar dimuat ulang (baris kosong hilang)', (await baris.count()) === 2);

  await baris.nth(0).locator('[data-hapus-vendor]').click();
  await simpan();
  cek('19f baris dihapus: DELETE id=in.(…)', model.hapus.some(x => x.tabel === 'kenangan_vendor')
      && model.kenangan_vendor.length === 1 && model.kenangan_vendor[0].nama === 'Sekar');
  await page.locator('#panelKenangan').screenshot({ path: 'dasbor-kenangan-400.png' });
  await ctx.close();
}

/* ---------- panel 8: potongan untuk layar HP ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model, 400);
  const ubin = page.locator('#pustakaFoto [data-foto="f-1"]');
  await ubin.locator('[data-aksi="potong"]').click();
  const bingkai = page.locator('#potongBingkai');
  await page.locator('#potong [data-mode="isi"]').click();     // foto contoh landscape: otomatis "utuh"
  await page.waitForFunction(() => document.getElementById('potongGambar').naturalWidth > 0, null, { timeout: 5000 });
  const kotak = await bingkai.boundingBox();
  cek('21a editor terbuka dengan bingkai layar HP (390:844)',
      await page.locator('#potong').isVisible() && Math.abs(kotak.width / kotak.height - 390 / 844) < 0.02,
      JSON.stringify(kotak));
  // tarik gambar ke kanan → jendela ke kiri → fokus_x turun
  await page.mouse.move(kotak.x + kotak.width / 2, kotak.y + kotak.height / 2);
  await page.mouse.down();
  await page.mouse.move(kotak.x + kotak.width / 2 + 60, kotak.y + kotak.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await page.locator('#potongZum').fill('1.6');
  const pos = await page.locator('#potongGambar').evaluate(i => getComputedStyle(i).objectPosition);
  model.patch.length = 0;
  await page.locator('#potongSimpan').click();
  await page.waitForFunction(() => document.getElementById('potong').hidden, null, { timeout: 5000 });
  const p = model.patch.find(x => x.tabel === 'foto' && x.id === 'f-1');
  cek('21b tarik + perbesar: satu PATCH fokus_x turun, fokus_y tetap (gambar mendatar tidak punya ruang tegak tanpa zum), zum 1.6, mode isi',
      p && p.badan.fokus_x < 50 && p.badan.fokus_x >= 0 && p.badan.fokus_y === 50 && p.badan.zum === 1.6
      && p.badan.tampilan === 'isi' && Object.keys(p.badan).sort().join(',') === 'fokus_x,fokus_y,tampilan,zum', JSON.stringify(p && p.badan) + ' ' + pos);
  const gaya = await page.locator('#pustakaFoto [data-foto="f-1"] .gbr').getAttribute('style');
  cek('21c ubin pustaka langsung memakai potongan baru', gaya.includes('--z:1.6') && gaya.includes('--fx:' + p.badan.fokus_x + '%'), gaya);
  // Mode tampil: foto contoh 1600×1067 (landscape) → otomatis "Tampil utuh"
  await page.locator('#pustakaFoto [data-foto="f-2"] [data-aksi="potong"]').click();
  const modeAwal = await page.locator('#potong [data-mode][aria-checked="true"]').getAttribute('data-mode');
  cek('21e foto landscape: editor membuka dengan "Tampil utuh" (otomatis), tanpa geser/perbesar',
      modeAwal === 'utuh' && await page.locator('#potongKendali').isHidden() && await page.locator('#potongBuram').isVisible());
  model.patch.length = 0;
  await page.locator('#potongSimpan').click();
  await page.waitForFunction(() => document.getElementById('potong').hidden, null, { timeout: 5000 });
  const pOto = model.patch.find(x => x.id === 'f-2');
  cek('21f pilihan otomatis tidak dibekukan: tampilan tidak dikirim', pOto && !('tampilan' in pOto.badan), JSON.stringify(pOto && pOto.badan));
  await page.locator('#pustakaFoto [data-foto="f-2"] [data-aksi="potong"]').click();
  await page.locator('#potong [data-mode="isi"]').click();
  cek('21g "Isi layar": geser dan perbesar muncul lagi', await page.locator('#potongKendali').isVisible());
  model.patch.length = 0;
  await page.locator('#potongSimpan').click();
  await page.waitForFunction(() => document.getElementById('potong').hidden, null, { timeout: 5000 });
  const pIsi = model.patch.find(x => x.id === 'f-2');
  cek('21h pilihan berbeda dari otomatis: tampilan "isi" dikirim; tanda "Utuh" hilang dari ubin',
      pIsi && pIsi.badan.tampilan === 'isi' && await page.locator('#pustakaFoto [data-foto="f-2"] .tanda-utuh').count() === 0, JSON.stringify(pIsi && pIsi.badan));

  // Batal tidak menyimpan
  await page.locator('#pustakaFoto [data-foto="f-2"] [data-aksi="potong"]').click();
  await page.locator('#potong [data-mode="isi"]').click();
  await page.locator('#potongZum').fill('2.5');
  model.patch.length = 0;
  await page.locator('#potongBatal').click();
  cek('21d Batal tidak mengirim apa pun', model.patch.length === 0 && await page.locator('#potong').isHidden());
  await page.locator('#pustakaFoto [data-foto="f-1"] [data-aksi="potong"]').click();
  await page.waitForTimeout(200);
  await page.locator('#potong').screenshot({ path: 'dasbor-potong-400.png' });
  await ctx.close();
}

/* ---------- panel 8: impor dari Google Drive ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model, 400);
  cek('22a panel impor tersembunyi sampai tombolnya ditekan', await page.locator('#drive').isHidden());
  await page.locator('#btnDrive').click();
  await page.locator('#inDrive').fill('https://drive.google.com/drive/folders/pribadi?usp=sharing');
  await page.locator('#btnDriveLihat').click();
  await page.waitForSelector('#driveIsi [role="alert"]', { timeout: 5000 });
  cek('22b folder pribadi: pesan dari fungsi ditampilkan apa adanya',
      /Siapa saja yang memiliki link/.test(await page.locator('#driveIsi').textContent()));

  await page.locator('#inDrive').fill('https://drive.google.com/drive/folders/FOLDER1?usp=sharing');
  await page.locator('#inDrive').press('Enter');
  await page.waitForSelector('#driveGrid', { timeout: 5000 });
  const ubin = page.locator('#driveGrid .drive-ubin');
  cek('22c isi folder tergambar; MOV dan video 300 MB ditandai tidak bisa, dengan alasannya',
      await ubin.count() === 4 && await page.locator('#driveGrid [data-drive]:disabled').count() === 2
      && /MOV/.test(await ubin.nth(2).textContent()) && /20 MB/.test(await ubin.nth(3).textContent()));
  cek('22d permintaan memakai JWT pemilik', model.drive.every(x => x.auth === 'Bearer JWT-pemilik'));

  await page.locator('#drivePilihSemua').check();
  cek('22e pilih semua = hanya yang bisa', /^2 dipilih/.test(await page.locator('#driveHitung').textContent())
      && (await page.locator('#btnDriveImpor').textContent()).trim() === 'Impor 2');
  await page.locator('#driveBab').selectOption('b:keluarga');
  model.fn.length = 0;
  await page.screenshot({ path: 'dasbor-drive-400.png', fullPage: false });
  await page.locator('#btnDriveImpor').click();
  await page.waitForFunction(() => document.querySelectorAll('#driveGrid .drive-ubin.selesai').length === 2, null, { timeout: 20000 });
  const izinD = model.r2.filter(x => x.langkah === 'izin'), catatD = model.r2.filter(x => x.langkah === 'catat');
  cek('22f tiap berkas dikecilkan (webp/jpeg + thumbnail), dikirim ke R2, dicatat di bab Keluarga',
      izinD.length === 2 && izinD.every(x => /^image\/(webp|jpeg)$/.test(x.badan.berkas.jenis) && x.badan.kecil)
      && catatD.length === 2 && catatD.every(x => x.badan.bagian === 'keluarga' && MEDIA.isi.has(x.badan.jalur)),
      JSON.stringify(model.r2.map(x => [x.langkah, x.badan.bagian, x.badan.berkas && x.badan.berkas.jenis])));
  cek('22g yang sudah diimpor tidak bisa dipilih lagi; pustaka dimuat ulang',
      await page.locator('#driveGrid [data-drive]:not(:disabled)').count() === 0
      && await page.locator('#pustakaFoto .ubin').count() === 4);
  await ctx.close();
}
{
  const model = bikinModel();
  model.driveUbah = { terpakai: 99 };
  model.driveGagalD2 = false;
  const { ctx, page } = await masuk(browser, model);
  await page.locator('#btnDrive').click();
  await page.locator('#inDrive').fill('FOLDER1xxxxxx');
  await page.locator('#btnDriveLihat').click();
  await page.waitForSelector('#driveGrid', { timeout: 5000 });
  await page.locator('#drivePilihSemua').check();
  cek('23a melebihi sisa kuota: tombol impor mati, alasannya disebut',
      await page.locator('#btnDriveImpor').isDisabled() && /Melebihi sisa kuota \(1 berkas/.test(await page.locator('#driveHitung').textContent()));
  await page.locator('#driveGrid [data-drive="D2"]').uncheck();
  model.driveGagalD2 = true;
  await page.locator('#driveGrid [data-drive="D2"]').check();
  await page.locator('#driveGrid [data-drive="D1"]').uncheck();
  await page.locator('#btnDriveImpor').click();
  await page.waitForFunction(() => /gagal/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 });
  cek('23b unduhan gagal: alasannya di ubin dan di toast, tidak ada yang diunggah',
      /membatasi/.test(await page.locator('[data-drive-ubin="D2"] .ket').textContent())
      && !model.fn.some(x => x.metode === 'POST'));
  await ctx.close();
}

/* ---------- panel 8: unggah video ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);
  const b64 = await page.evaluate(() => new Promise(selesai => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 480;
    const g = c.getContext('2d');
    const rek = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm' });
    const potong = []; rek.ondataavailable = e => potong.push(e.data);
    rek.onstop = () => { const f = new FileReader(); f.onload = () => selesai(f.result.split(',')[1]); f.readAsDataURL(new Blob(potong)); };
    let n = 0; const t = setInterval(() => { g.fillStyle = `hsl(${n * 9},40%,40%)`; g.fillRect(0, 0, 320, 480); n++; }, 50);
    rek.start(); setTimeout(() => { clearInterval(t); rek.stop(); }, 2500);
  }));
  model.fn.length = 0;
  await page.locator('#inBerkasFoto').setInputFiles([
    { name: 'klip.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') },
    { name: 'IMG_0001.MOV', mimeType: 'video/quicktime', buffer: Buffer.from('bukan video') }
  ]);
  await page.waitForFunction(() => /gagal/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 });
  const toastV = await page.locator('#toast').textContent();
  const izin = (model.r2 || []).filter(x => x.langkah === 'izin'), catat = (model.r2 || []).filter(x => x.langkah === 'catat');
  const kunciV = catat[0] && catat[0].badan.jalur, kunciP = catat[0] && catat[0].badan.jalur_kecil;
  cek('20a video lewat R2: izin menyebut jenis+ukuran, isi video dan poster tiba di /media, catat membawa durasi; tidak ada multipart',
      izin.length === 1 && izin[0].badan.berkas.jenis === 'video/webm' && izin[0].badan.kecil
      && /^image\/(webp|jpeg)$/.test(izin[0].badan.kecil.jenis)
      && MEDIA.isi.get(kunciV)?.buf.length === izin[0].badan.berkas.bita && MEDIA.isi.get(kunciV)?.jenis === 'video/webm'
      && MEDIA.isi.get(kunciP)?.buf.length === izin[0].badan.kecil.bita
      && catat.length === 1 && catat[0].badan.durasi_ms > 0 && !model.fn.some(x => x.metode === 'POST')
      && izin.every(x => x.auth === 'Bearer JWT-pemilik'),
      JSON.stringify({ izin: izin.map(x => x.badan), catat: catat.map(x => x.badan) }).slice(0, 400));
  cek('20b MOV ditolak di perangkat dengan petunjuk iPhone, yang lain tetap masuk',
      /1 masuk, 1 gagal/.test(toastV) && /MP4/.test(toastV) && /Paling Kompatibel/.test(toastV), toastV);
  await ctx.close();
}

/* ---------- R2 belum disiapkan: jatuh ke jalan lama ---------- */
{
  const model = bikinModel();
  model.r2Mati = true;
  const { ctx, page } = await masuk(browser, model);
  model.fn.length = 0;
  await page.locator('#inBerkasFoto').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(GAMBAR_DATAR, 'base64') }]);
  await page.waitForFunction(() => /tersimpan/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  const lama = model.fn.filter(x => x.metode === 'POST');
  cek('24a izin menjawab 503 jalanLama: unggahan jatuh ke multipart lama, tetap tersimpan',
      model.r2.filter(x => x.langkah === 'izin').length === 1 && !model.r2.some(x => x.langkah === 'catat')
      && lama.length === 1 && /name="berkas"; filename="berkas\.(webp|jpg)"/.test(lama[0].badan) && /name="kecil"/.test(lama[0].badan),
      lama.map(x => x.badan.split('\r\n').filter(l => /name=/.test(l)).join(' ')).join(' | '));
  await ctx.close();
}

/* ---------- panel 10: terbitkan halaman kenangan ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);
  cek('18a bawaan: draf, dengan ajakan memeriksa lewat pratinjau',
      (await page.locator('#lencanaKenangan').textContent()) === 'Draf'
      && /pratinjau/i.test(await page.locator('#hintTerbitKenangan').textContent())
      && await page.locator('#alamatKenangan').isHidden());

  await page.locator('#btnTerbitKenangan').click();
  await page.waitForFunction(() => document.querySelector('#lencanaKenangan').textContent === 'Terbit', null, { timeout: 5000 });
  const p1 = model.patch.filter(x => x.tabel === 'pasangan' && 'kenangan_terbit' in x.badan);
  cek('18b terbit: satu PATCH berisi kenangan_terbit saja, tidak menyentuh terbit undangan',
      p1.length === 1 && p1[0].badan.kenangan_terbit === true && Object.keys(p1[0].badan).length === 1,
      JSON.stringify(p1));
  cek('18c alamat publiknya ditunjukkan',
      (await page.locator('#alamatKenangan').textContent()) === 'rian-aini.mengundang.id/terimakasih');

  await page.locator('#btnTerbitKenangan').click();
  await page.waitForFunction(() => document.querySelector('#lencanaKenangan').textContent === 'Draf', null, { timeout: 5000 });
  cek('18d tarik lagi: kenangan_terbit false',
      model.patch.filter(x => x.tabel === 'pasangan' && 'kenangan_terbit' in x.badan).at(-1).badan.kenangan_terbit === false);

  await page.evaluate(() => { window.__buka = []; window.open = (u) => { window.__buka.push(u); }; });
  await page.locator('#btnPratinjauKenangan').click();
  cek('18e tombol pratinjau panel 10 membuka pratinjau yang sama',
      (await page.evaluate(() => window.__buka[0])) === ASAL + '/terimakasih?pasangan=rian-aini&pratinjau=1');
  await ctx.close();
}
{
  const model = bikinModel();
  model.pasangan[0].tanggal_acara = '2099-01-01';
  const { ctx, page } = await masuk(browser, model);
  let ditanya = '';
  page.once('dialog', d => { ditanya = d.message(); d.dismiss(); });
  await page.locator('#btnTerbitKenangan').click();
  await page.waitForTimeout(400);
  cek('18f sebelum acara: diminta yakin dulu; dibatalkan = tidak ada yang dikirim',
      /belum berlangsung/i.test(ditanya)
      && model.patch.filter(x => x.tabel === 'pasangan').length === 0
      && (await page.locator('#lencanaKenangan').textContent()) === 'Draf', ditanya);
  await ctx.close();
}
{
  const model = bikinModel();
  model.pasangan[0].terbit = false; model.pasangan[0].status = 'draf';
  model.pasangan[0].kenangan_terbit = true;
  const { ctx, page } = await masuk(browser, model);
  cek('18g saklar menyala tapi undangan draf: dijelaskan bahwa tamu belum bisa membuka',
      /masih draf/i.test(await page.locator('#hintTerbitKenangan').textContent())
      && await page.locator('#alamatKenangan').isHidden());
  await ctx.close();
}

/* ---------- kotak 1: silsilah keluarga (pindah dari /kirim) ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model);
  const kartu = page.locator('#silDaftar [data-sil]');
  cek('19a silsilah tergambar per sisi', (await kartu.count()) === 2
      && (await page.locator('#silDaftar h4').allTextContents()).join('|') === 'Keluarga pihak pria|Keluarga pihak wanita');

  /* --- tambah --- */
  await page.locator('#silSisi').selectOption('pria');
  await page.locator('#btnSilTambah').click();
  await page.waitForTimeout(300);
  cek('19b peran/nama kosong: ditolak sebelum dikirim', model.post.length === 0
      && !(model.silsilah.length > 2));
  await page.locator('#silPeran').fill('Ibu');
  await page.locator('#silNama').fill('Ibu Kedua');
  await page.locator('#btnSilTambah').click();
  await page.waitForFunction(() => document.querySelectorAll('#silDaftar [data-sil]').length === 3, null, { timeout: 5000 });
  const baru = model.silsilah.at(-1);
  cek('19c baris baru: langsung ke tabel lewat REST, urutan paling belakang di sisinya, keterangan kosong = null',
      baru.pasangan_id === 'p-1' && baru.sisi === 'pria' && baru.peran === 'Ibu' && baru.nama === 'Ibu Kedua'
      && baru.urutan === 2 && baru.keterangan === null, JSON.stringify(baru));

  /* --- foto lewat foto-unggah, JWT pemilik --- */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8DAwMDAAAAMAAH5TKPOAAAAAElFTkSuQmCC', 'base64');
  const pemilih = page.waitForEvent('filechooser');
  await page.locator('#silDaftar [data-sil="s-2"] [data-sil-aksi="foto"]').click();
  await (await pemilih).setFiles({ name: 'ibu.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => !!document.querySelector('#silDaftar [data-sil="s-2"] img.gbr'), null, { timeout: 8000 });
  const izinS = (model.r2 || []).filter(f => /untuk=silsilah/.test(f.cari));
  cek('19d foto silsilah: izin + catat ?untuk=silsilah&id=s-2 dengan JWT pemilik, isinya ke /media (R2)',
      izinS.length === 2 && izinS.every(f => /id=s-2/.test(f.cari) && f.auth === 'Bearer JWT-pemilik')
      && MEDIA.isi.has(izinS[1].badan.jalur) && !model.fn.some(f => f.metode === 'POST' && /untuk=silsilah/.test(f.cari)),
      JSON.stringify(izinS.map(f => [f.langkah, f.cari])));

  /* --- hapus baris berfoto: fotonya dibuang dulu --- */
  model.hapus.length = 0;
  page.once('dialog', d => d.accept());
  await page.locator('#silDaftar [data-sil="s-1"] [data-sil-aksi="hapus"]').click();
  await page.waitForFunction(() => !document.querySelector('#silDaftar [data-sil="s-1"]'), null, { timeout: 5000 });
  cek('19e hapus baris berfoto: berkasnya dibuang lewat foto-unggah DULU, baru barisnya',
      model.hapus.length === 2 && model.hapus[0].tabel === 'foto-silsilah' && model.hapus[0].metode === 'DELETE'
      && model.hapus[1].tabel === 'silsilah' && model.hapus[1].id === 's-1', JSON.stringify(model.hapus));
  await ctx.close();
}
{
  const sumber = await (await fetch(ASAL + '/kirim')).text();
  cek('19f /kirim tidak lagi punya editor silsilah', !/panelSilsilah|silsilah_simpan|silsilah_hapus|silsilah_daftar/.test(sumber));
}

/* ---------- tautan undangan dari email (031) ---------- */
{
  const model = bikinModel();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { galatHalaman.push(e.message); console.log('   [pageerror] ' + e.message); });
  await pasang(page, model);
  // JWT tiruan: kepala.badan.tanda, badan memuat email
  const badan = Buffer.from(JSON.stringify({ email: 'budi@contoh.com', sub: 'u-1' })).toString('base64url');
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.' + badan + '.tanda';
  await page.goto(ASAL + '/dasbor#access_token=' + jwt + '&refresh_token=SEGAR2&expires_in=3600&token_type=bearer&type=invite');
  await page.waitForSelector('#kotakSandiBaru:not([hidden])', { timeout: 5000 });
  cek('20a tautan undangan membuka kotak buat sandi, bukan formulir masuk',
      await page.locator('#inEmail').isHidden() && (await page.locator('#emailUndangan').textContent()) === 'budi@contoh.com');
  cek('20b token dibuang dari bilah alamat', !(await page.evaluate(() => location.href)).includes('access_token'));
  await page.locator('#inSandiBaru').fill('pendek');
  await page.locator('#inSandiUlang').fill('pendek');
  await page.locator('#btnSandiBaru').click();
  cek('20c sandi < 10 huruf ditolak di halaman', (await page.locator('#pesanSandiBaru').textContent()).includes('10') && !model.sandiBaru);
  await page.locator('#inSandiBaru').fill('sandi-baru-panjang');
  await page.locator('#inSandiUlang').fill('sandi-baru-panjang');
  await page.locator('#btnSandiBaru').click();
  await page.waitForSelector('#formAcara .baris', { timeout: 8000 });
  cek('20d sandi disimpan lewat PUT /auth/v1/user dengan sesi dari tautan, lalu dasbor terbuka',
      model.sandiBaru && model.sandiBaru[0].isi.password === 'sandi-baru-panjang'
      && model.sandiBaru[0].auth === 'Bearer ' + jwt);
  await ctx.close();

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await pasang(page2, bikinModel());
  await page2.goto(ASAL + '/dasbor#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page2.waitForTimeout(300);
  cek('20e tautan kedaluwarsa: pesan jelas, formulir masuk tetap ada',
      (await page2.locator('#pesanMasuk').textContent()).includes('kedaluwarsa') && await page2.locator('#inEmail').isVisible());
  await ctx2.close();
}

/* ---------- lupa sandi (assets/akun.js) ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { galatHalaman.push(e.message); console.log('   [pageerror] ' + e.message); });
  await pasang(page, bikinModel());
  const minta = [];
  await page.route('**/auth/v1/recover**', r => { minta.push({ url:r.request().url(), isi:r.request().postData() });
    r.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:'{}' }); });
  await page.goto(ASAL + '/dasbor');
  await page.locator('#inEmail').fill('budi@contoh.com');
  await page.locator('#btnLupa').click();
  await page.waitForFunction(() => document.querySelector('#pesanMasuk').textContent.includes('tautan'), null, { timeout:5000 });
  cek('21a Lupa sandi meminta tautan pemulihan ke /dasbor untuk email itu',
      minta.length === 1 && JSON.parse(minta[0].isi).email === 'budi@contoh.com'
      && decodeURIComponent(minta[0].url).includes('redirect_to=' + ASAL + '/dasbor'));
  await ctx.close();

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await pasang(page2, bikinModel());
  const jwt = 'x.' + Buffer.from(JSON.stringify({ email:'budi@contoh.com' })).toString('base64url') + '.y';
  await page2.goto(ASAL + '/dasbor#access_token=' + jwt + '&refresh_token=S&type=recovery');
  await page2.waitForSelector('#kotakSandiBaru:not([hidden])', { timeout:5000 });
  cek('21b tautan pemulihan: kotak sandi baru, judulnya bukan "undangan aktif"',
      (await page2.locator('#judulSandiBaru').textContent()) === 'Buat kata sandi baru');
  await ctx2.close();
}

/* ---------- tata letak HP ---------- */
{
  const model = bikinModel();
  const { ctx, page } = await masuk(browser, model, 400);
  const buruk = await page.evaluate(() => {
    const keluar = [];
    document.querySelectorAll('#formAcara .centang label, .panel h2, #pustakaFoto .ubin .btn, .sil-tambah > *, .sil-kartu .btn').forEach(el => {
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
