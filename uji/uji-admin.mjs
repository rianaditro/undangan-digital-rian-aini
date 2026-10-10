import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { ISI } from './stub.mjs';

const PORT = 4370, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

function bikinModel(){
  const pasangan = [{
    id:'p-1', slug:'rian-aini', status:'aktif', terbit:true, paket:'premium',
    tema:'ukir-jepara', tanggal_acara:'2026-09-15', kota:'Jepara',
    canonical_host:'rian-aini.mengundang.id', dibuat:'2026-08-15T00:00:00Z',
    pria:'RIAN', wanita:"'AINI", pemilik:'rian@contoh.com',
    tamu:436, undangan:414, ucapan:29, foto:0, pemberian:0
  }];
  const token = [
    { id:'t-0', nama:"Rian & 'Aini (semua pihak)", token:'TOKPENUH', pihak:null, aktif:true, terakhir_dipakai:null },
    { id:'t-1', nama:'Keluarga Pihak Pria',   token:'TOKKP', pihak:'keluarga-pria',   aktif:true, terakhir_dipakai:null },
    { id:'t-2', nama:'Keluarga Pihak Wanita', token:'TOKKW', pihak:'keluarga-wanita', aktif:true, terakhir_dipakai:null },
    { id:'t-3', nama:'Pengantin Pria',        token:'TOKP',  pihak:'pria',            aktif:true, terakhir_dipakai:null },
    { id:'t-4', nama:'Pengantin Wanita',      token:'TOKW',  pihak:'wanita',          aktif:true, terakhir_dipakai:null }
  ];
  const pesanan = [
    { id:'s-1', nomor:7, status:'menunggu', reseller_kode:'123', reseller_nama:'Percetakan A',
      pria:'Budi', wanita:'Sari', slug:'budi-sari', paket:'premium', tanggal:null, kota:null,
      email_klien:'budi@contoh.com', catatan:null, nominal:null, komisi:null, cair:false,
      pencairan_ref:null, dibuat:'2026-10-09T00:00:00Z', dikonfirmasi:null },
    { id:'s-2', nomor:6, status:'lunas', reseller_kode:null, reseller_nama:null,
      pria:'Eko', wanita:'Fitri', slug:'eko-fitri', paket:'standar', tanggal:null, kota:null,
      email_klien:'eko@contoh.com', catatan:null, nominal:69000, komisi:0, cair:false,
      pencairan_ref:null, dibuat:'2026-10-08T00:00:00Z', dikonfirmasi:'2026-10-08T00:00:00Z' }
  ];
  const reseller = [
    { id:'r-1', kode:'123', nama:'Percetakan A', kontak:'0812', rekening:'BCA 999', aktif:true,
      email:'a@contoh.com', dibuat:'2026-10-01T00:00:00Z', pengunjung:40, pengunjung_30h:12,
      pesanan:5, lunas:2, omzet:318000, komisi_total:130000, komisi_cair:65000, komisi_tertahan:65000 }
  ];
  const admins = [
    { user_id:'u-o', email:'owner@contoh.com', nama:'Owner', peran:'owner', dibuat:'2026-09-01T00:00:00Z' },
    { user_id:'u-a', email:'staf@contoh.com', nama:'Staf', peran:'admin', dibuat:'2026-10-01T00:00:00Z' }
  ];
  return { pasangan, token, pesanan, reseller, admins, peran:'owner', panggilan: [], adminOk: true, hapusGagal: false };
}

async function pasang(page, model){
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), jalur = url.pathname;
    const kirim = (isi, status=200) => route.fulfill({ status, contentType:'application/json',
      headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(isi) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status:204, body:'' });

    let arg = {};
    try { arg = JSON.parse(req.postData() || '{}'); } catch {}
    const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i,'');

    if (jalur === '/auth/v1/token'){
      if (arg.password !== 'benar') return kirim({ error_description:'Invalid login credentials' }, 400);
      return kirim({ access_token:'JWT-' + arg.email, refresh_token:'SEGAR' });
    }
    if (jalur.startsWith('/rest/v1/rpc/')){
      const nama = jalur.slice('/rest/v1/rpc/'.length);
      model.panggilan.push({ nama, arg, auth });
      if (nama === 'undangan_isi')       return kirim(ISI);
      if (nama === 'is_admin')           return kirim(model.adminOk);
      if (!model.adminOk)                return kirim({ message:'Halaman ini hanya untuk admin' }, 400);
      if (nama === 'admin_daftar')       return kirim(model.pasangan);
      if (nama === 'admin_peran')        return kirim(model.peran);
      if (nama === 'admin_pesanan')      return kirim(model.pesanan);
      if (nama === 'admin_reseller')     return kirim(model.reseller);
      if (nama === 'admin_admin'){
        if (model.peran !== 'owner') return kirim({ message:'Hanya owner' }, 403);
        return kirim(model.admins);
      }
      if (nama === 'admin_pesan')        return kirim(8);
      if (nama === 'admin_pencairan_catat'){
        const r = model.reseller.find(x => x.id === arg.p_reseller);
        const d = { nominal:r.komisi_tertahan, jumlah_pesanan:1 };
        r.komisi_cair += r.komisi_tertahan; r.komisi_tertahan = 0;
        return kirim(d);
      }
      if (nama === 'admin_admin_cabut'){
        model.admins = model.admins.filter(a => a.user_id !== arg.p_user); return kirim(null);
      }
      if (nama === 'admin_token')        return kirim(model.token);
      if (nama === 'admin_slug_dipakai') return kirim(model.pasangan.some(p => p.slug === arg.p_slug));
      if (nama === 'admin_token_ganti'){
        const t = model.token.find(x => x.id === arg.p_id);
        t.token = 'TOKBARU'; return kirim('TOKBARU');
      }
      if (nama === 'admin_status'){
        model.pasangan[0].status = arg.p_status; return kirim(null);
      }
      if (nama === 'admin_paket'){
        const p = model.pasangan.find(x => x.id === arg.p_pasangan_id);
        p.paket = arg.p_paket;
        p.canonical_host = arg.p_paket === 'premium' ? p.slug + '.mengundang.id' : null;
        return kirim(null);
      }
      if (nama === 'admin_hapus_kosong')
        return kirim({ message:'Pasangan ini sudah berisi 465 baris data; arsipkan saja, jangan dihapus' }, 400);
      return kirim({ message:'rpc tak dikenal: ' + nama }, 404);
    }
    if (jalur === '/functions/v1/admin-pasangan'){
      model.panggilan.push({ nama:'fn', arg, auth });
      if (arg.aksi === 'sandi') return kirim({ email:arg.email, diganti:true });
      if (arg.aksi === 'konfirmasi'){
        const s = model.pesanan.find(x => x.id === arg.pesanan_id);
        s.status = 'lunas'; s.nominal = arg.nominal; s.komisi = arg.komisi;
        return kirim({ pasangan_id:'p-9', nomor:s.nomor, slug:s.slug, email:s.email_klien,
          pria:s.pria, wanita:s.wanita, akun_baru:true, diundang:model.diundang !== false,
          sandi: model.diundang === false ? 'SandiCadangan9' : null,
          canonical_host: s.paket === 'premium' ? s.slug + '.mengundang.id' : null,
          token:[{ nama:'Pengantin (semua pihak)', token:'TOKBARU', pihak:null }] }, 201);
      }
      if (arg.aksi === 'reseller') return kirim({ email:arg.email, kode:arg.kode, nama:arg.nama, akun_baru:true }, 201);
      if (arg.aksi === 'admin')    return kirim({ email:arg.email, nama:arg.nama, akun_baru:true }, 201);
      if (arg.aksi === 'pemilik'){
        const p = model.pasangan.find(x => x.slug === arg.slug);
        if (!p) return kirim({ pesan:'tidak ada' }, 404);
        p.pemilik = arg.email;
        return kirim({ slug:p.slug, email:arg.email, akun_baru:true, sudah_pemilik:false,
                       canonical_host:p.canonical_host }, 201);
      }
      if (model.pasangan.some(p => p.slug === arg.slug))
        return kirim({ pesan:`Slug "${arg.slug}" sudah dipakai pasangan lain` }, 409);
      return kirim({ pasangan_id:'p-2', slug:arg.slug, email:arg.email, akun_baru:true,
        paket: arg.paket,
        canonical_host: arg.paket === 'premium' ? arg.slug + '.mengundang.id' : null,
        token: model.token.map(t => ({ nama:t.nama, token:t.token + '-BARU', pihak:t.pihak })) }, 201);
    }
    return kirim({ message:'tidak distub: ' + jalur }, 500);
  });
}

async function halaman(browser, { admin = true, lebar = 1100 } = {}){
  const ctx = await browser.newContext({ viewport:{width:lebar,height:1000} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  const model = bikinModel();
  model.adminOk = admin;
  await pasang(page, model);
  await page.goto(ASAL + '/admin');
  return { ctx, page, model };
}

const srv = await mulai(PORT);
const browser = await chromium.launch();

/* ===== bukan admin ===== */
{
  const { ctx, page } = await halaman(browser, { admin:false });
  await page.locator('#inEmail').fill('biasa@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForFunction(() =>
    document.querySelector('#pesanMasuk').textContent.includes('bukan admin'), null, { timeout:6000 });
  cek('1a akun bukan admin ditolak di gerbang', true);
  cek('1b isi halaman tetap tersembunyi', await page.locator('#isi').isHidden());
  const sisa = await page.evaluate(() => localStorage.getItem('admin-sesi'));
  cek('1c sesinya dibuang, tidak tertinggal di peramban', sisa === null, String(sisa));
  await ctx.close();
}

/* ===== sandi salah ===== */
{
  const { ctx, page } = await halaman(browser, {});
  await page.locator('#inEmail').fill('admin@contoh.com');
  await page.locator('#inSandi').fill('salah');
  await page.locator('#btnMasuk').click();
  await page.waitForFunction(() =>
    document.querySelector('#pesanMasuk').textContent.length > 0, null, { timeout:6000 });
  cek('2a sandi salah ditolak',
      (await page.locator('#pesanMasuk').textContent()).length > 0);
  await ctx.close();
}

/* ===== admin ===== */
{
  const { ctx, page, model } = await halaman(browser, {});
  await page.locator('#inEmail').fill('admin@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('.ps', { timeout:8000 });
  cek('3a admin masuk dan daftar pasangan tampil', true);
  const kartu = await page.locator('.ps').first().textContent();
  cek('3b kartu memuat nama, slug, dan angkanya',
      kartu.includes("RIAN") && kartu.includes('rian-aini') && kartu.includes('436 tamu'),
      kartu.replace(/\s+/g,' ').slice(0,120));
  cek('3c rpc dikirim memakai JWT admin, bukan anon key',
      model.panggilan.filter(p => p.nama === 'admin_daftar').at(-1).auth === 'JWT-admin@contoh.com');

  /* --- slug diusulkan --- */
  await page.locator('#inPria').fill('Budi');
  await page.locator('#inWanita').fill('Sari');
  await page.waitForFunction(() =>
    document.querySelector('#inSlug').value === 'budi-sari', null, { timeout:4000 });
  cek('4a slug diusulkan dari kedua nama', true);
  await page.waitForFunction(() =>
    document.querySelector('#hintSlug').textContent.includes('/budi-sari'),
    null, { timeout:4000 });
  const hintStandar = await page.locator('#hintSlug').textContent();
  cek('4b paket standar: alamatnya bentuk jalur, bukan subdomain',
      hintStandar.includes('/budi-sari') && !hintStandar.includes('budi-sari.mengundang.id'),
      hintStandar);

  await page.locator('#inPaket').selectOption('premium');
  await page.waitForFunction(() =>
    document.querySelector('#hintSlug').textContent.includes('budi-sari.mengundang.id'),
    null, { timeout:4000 });
  cek('4c paket premium: alamatnya subdomain sendiri', true);
  await page.locator('#inPaket').selectOption('standar');

  /* --- slug bentrok --- */
  await page.locator('#inSlug').fill('rian-aini');
  await page.waitForFunction(() =>
    document.querySelector('#hintSlug').textContent.includes('sudah dipakai'), null, { timeout:5000 });
  cek('5a slug yang sudah dipakai diberitahukan sebelum menyimpan', true);

  /* --- ketikan sendiri tidak ditimpa lagi --- */
  await page.locator('#inSlug').fill('budi-dan-sari');
  await page.locator('#inPria').fill('Bambang');
  await page.waitForTimeout(300);
  cek('5b slug yang sudah diketik sendiri tidak ditimpa usulan',
      (await page.locator('#inSlug').inputValue()) === 'budi-dan-sari',
      await page.locator('#inSlug').inputValue());

  /* --- sandi acak --- */
  await page.locator('#btnAcak').click();
  const sandi = await page.locator('#inSandiKlien').inputValue();
  cek('6a sandi acak cukup panjang', sandi.length >= 12, sandi);
  cek('6b tanpa huruf yang mudah tertukar (O 0 I l 1)',
      !/[O0Il1]/.test(sandi), sandi);

  /* --- buat --- */
  await page.locator('#inEmailKlien').fill('budi@contoh.com');
  await page.locator('#inKota').fill('Semarang');
  await page.locator('#inTanggal').fill('2027-03-20');
  await page.locator('#btnBuat').click();
  await page.waitForSelector('#serah:not([hidden])', { timeout:8000 });

  const fn = model.panggilan.filter(p => p.nama === 'fn').at(-1);
  cek('7a edge function menerima seluruh isian',
      fn.arg.slug === 'budi-dan-sari' && fn.arg.email === 'budi@contoh.com'
      && fn.arg.pria === 'Bambang' && fn.arg.wanita === 'Sari'
      && fn.arg.tanggal === '2027-03-20' && fn.arg.kota === 'Semarang'
      && fn.arg.sandi === sandi, JSON.stringify(fn.arg));
  cek('7c paket ikut terkirim', fn.arg.paket === 'standar', String(fn.arg.paket));
  cek('7b edge function dipanggil dengan JWT admin', fn.auth === 'JWT-admin@contoh.com');

  const serah = await page.locator('#serahTeks').inputValue();
  /* Pasangan ini dibuat dengan paket standar, jadi alamatnya bentuk
     jalur. Menuliskan subdomain di sini berarti klien menyalin alamat
     yang sertifikatnya tidak ada. */
  cek('8a teks serah terima memuat alamat bentuk jalur, bukan subdomain',
      serah.includes('/budi-dan-sari') && !serah.includes('budi-dan-sari.mengundang.id'),
      serah.split('\n').slice(0,3).join(' | '));
  cek('8b memuat email dan sandi klien',
      serah.includes('budi@contoh.com') && serah.includes(sandi));
  cek('8c memuat link /dasbor', serah.includes('/dasbor'));
  cek('8d memuat kelima link panitia',
      (serah.match(/\/kirim\?t=/g) || []).length === 5,
      String((serah.match(/\/kirim\?t=/g) || []).length));
  cek('8d2 paket standar: tiap link panitia menyebut pasangannya',
      (serah.match(/&pasangan=budi-dan-sari/g) || []).length === 5,
      String((serah.match(/&pasangan=/g) || []).length));
  cek('8e link penuh disebut lebih dulu',
      serah.indexOf('TOKPENUH-BARU') < serah.indexOf('TOKKP-BARU'));

  await page.locator('#btnTutupSerah').click();
  await page.waitForTimeout(200);
  cek('9a Tutup mengosongkan formulirnya',
      (await page.locator('#inPria').inputValue()) === ''
      && (await page.locator('#inSandiKlien').inputValue()) === ''
      && (await page.locator('#inSlug').inputValue()) === '');
  cek('9b serah terima disembunyikan', await page.locator('#serah').isHidden());

  /* --- token --- */
  await page.locator('.ps button[data-aksi="token"]').first().click();
  await page.waitForFunction(() =>
    document.querySelectorAll('.token div').length === 5, null, { timeout:5000 });
  const tok = await page.locator('.token').first().textContent();
  cek('10a kelima link panitia tampil', true);
  cek('10b link penuh ditandai "semua pihak"', tok.includes('semua pihak'), tok.slice(0,60));
  cek('10c link berbentuk /kirim?t=…', tok.includes('/kirim?t=TOKPENUH'));
  cek('10d pasangan premium: link panitia di subdomainnya, tanpa ?pasangan=',
      tok.includes('https://rian-aini.mengundang.id/kirim?t=TOKPENUH')
      && !tok.includes('pasangan='), tok.slice(0,120));

  page.once('dialog', d => d.accept());
  await page.locator('.token button[data-aksi="gantiToken"]').first().click();
  await page.waitForFunction(() =>
    document.querySelector('.token').textContent.includes('TOKBARU'), null, { timeout:5000 });
  cek('11a ganti token memperbarui daftarnya di layar', true);
  cek('11b token lama hilang dari layar',
      !(await page.locator('.token').first().textContent()).includes('TOKPENUH'));

  /* --- status --- */
  await page.locator('.ps select[data-aksi="status"]').first().selectOption('arsip');
  await page.waitForFunction(() =>
    document.querySelector('.ps select[data-aksi="status"]').value === 'arsip', null, { timeout:5000 });
  cek('12a status terkirim ke server',
      model.panggilan.filter(p => p.nama === 'admin_status').at(-1).arg.p_status === 'arsip');

  /* --- ganti paket: alamat berubah, jadi harus disengaja --- */
  const alamatSebelum = await page.locator('.ps .ps-slug').first().textContent();
  cek('12b kartu menulis alamat premium sebagai subdomain',
      alamatSebelum.trim() === 'rian-aini.mengundang.id', alamatSebelum);

  let tanya = '';
  page.once('dialog', d => { tanya = d.message(); d.dismiss(); });
  await page.locator('.ps select[data-aksi="paket"]').first().selectOption('standar');
  await page.waitForTimeout(400);
  cek('12c ganti paket menanyakan dulu, dan menyebut link tamu akan mati',
      /link/i.test(tanya) && /mati/i.test(tanya), tanya);
  cek('12d dibatalkan: tidak ada rpc admin_paket yang terkirim',
      model.panggilan.filter(p => p.nama === 'admin_paket').length === 0);
  cek('12e dibatalkan: paketnya di layar kembali seperti semula',
      (await page.locator('.ps select[data-aksi="paket"]').first().inputValue()) === 'premium');

  page.once('dialog', d => d.accept());
  await page.locator('.ps select[data-aksi="paket"]').first().selectOption('standar');
  await page.waitForSelector('.toast.on', { timeout:5000 });
  cek('12f disetujui: admin_paket terkirim',
      model.panggilan.filter(p => p.nama === 'admin_paket').at(-1).arg.p_paket === 'standar');
  /* Kartunya digambar ulang SESUDAH rpc selesai. Membaca sekali tepat
     setelah toast muncul kadang masih menangkap teks yang lama —
     balapan di ujinya, bukan di halamannya. Jadi ditunggu. */
  let alamatSesudah = '';
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.ps .ps-slug');
      return !!el && el.textContent.includes('/rian-aini');
    }, null, { timeout: 5000 });
  } catch { /* biarkan cek di bawah yang melaporkannya */ }
  alamatSesudah = await page.locator('.ps .ps-slug').first().textContent();
  cek('12g alamat di kartu ikut berubah jadi bentuk jalur',
      alamatSesudah.includes('/rian-aini') && !alamatSesudah.includes('rian-aini.mengundang.id'),
      alamatSesudah);

  page.once('dialog', d => d.accept());
  await page.locator('.ps select[data-aksi="paket"]').first().selectOption('premium');
  await page.waitForSelector('.toast.on', { timeout:5000 });

  /* --- hapus yang berisi ditolak --- */
  page.once('dialog', d => d.accept());
  await page.locator('.ps button[data-aksi="hapus"]').first().click();
  await page.waitForSelector('.toast.on.galat', { timeout:5000 });
  cek('13a hapus pasangan berisi ditolak dan alasannya ditampilkan',
      (await page.locator('.toast').textContent()).includes('arsipkan saja'),
      await page.locator('.toast').textContent());
  cek('13b pasangannya masih di layar', (await page.locator('.ps').count()) === 1);

  /* --- ganti sandi klien --- */
  await page.locator('#inEmailGanti').fill('budi@contoh.com');
  await page.locator('#btnAcak2').click();
  await page.locator('#btnGantiSandi').click();
  await page.waitForFunction(() =>
    document.querySelector('.toast').textContent.includes('Sandi diganti'), null, { timeout:5000 });
  const fs2 = model.panggilan.filter(p => p.nama === 'fn').at(-1);
  cek('14a ganti sandi memakai aksi yang benar',
      fs2.arg.aksi === 'sandi' && fs2.arg.email === 'budi@contoh.com'
      && fs2.arg.sandi.length >= 12, JSON.stringify({...fs2.arg, sandi:'…'}));

  await ctx.close();
}

/* ===== pasang akun ke pasangan lama ===== */
{
  const { ctx, page, model } = await halaman(browser);
  model.pasangan[0].pemilik = null;
  await page.locator('#inEmail').fill('admin@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('.ps', { timeout:8000 });
  const p0 = model.pasangan[0];

  cek('16a pasangan tanpa pemilik punya tombol Pasang Akun',
      await page.locator('.ps button[data-aksi="pemilik"]').count() === 1);
  await page.locator('.ps button[data-aksi="pemilik"]').click();
  await page.locator('.ps [data-isi="email"]').fill('pengantin@contoh.com');
  await page.locator('.ps button[data-aksi="acakPemilik"]').click();
  const sandiP = await page.locator('.ps [data-isi="sandi"]').inputValue();
  await page.locator('.ps button[data-aksi="simpanPemilik"]').click();
  await page.waitForSelector('.ps [data-isi="serah"]:not([hidden])', { timeout:5000 });
  const fp = model.panggilan.filter(p => p.nama === 'fn').at(-1);
  cek('16b memakai aksi pemilik dengan slug pasangan itu',
      fp.arg.aksi === 'pemilik' && fp.arg.slug === p0.slug && fp.arg.email === 'pengantin@contoh.com'
      && sandiP.length >= 12, JSON.stringify({...fp.arg, sandi:'…'}));
  cek('16c token admin yang dikirim, bukan anon', fp.auth.startsWith('JWT-'), fp.auth);
  const teks = await page.locator('.ps [data-isi="serah"]').inputValue();
  cek('16d teks serah-terima memuat /dasbor, email, dan sandinya',
      teks.includes('/dasbor') && teks.includes('pengantin@contoh.com') && teks.includes(sandiP), teks);

  model.pasangan[0].pemilik = 'pengantin@contoh.com';
  await page.locator('#btnSegarkan').click();
  await page.waitForFunction(() => !document.querySelector('.ps button[data-aksi="pemilik"]'), null, { timeout:5000 });
  cek('16e sesudah dimuat ulang tombolnya hilang', true);
  await ctx.close();
}

/* ===== pesanan, reseller, admin — owner ===== */
{
  const { ctx, page, model } = await halaman(browser);
  await page.locator('#inEmail').fill('owner@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('#daftarPesanan .baris', { timeout:8000 });

  cek('17a pesanan menunggu tampil dengan asal reseller-nya',
      (await page.locator('#daftarPesanan .baris').first().textContent()).includes('reseller 123'));
  cek('17b penjualan langsung tidak punya kotak komisi',
      await page.locator('#daftarPesanan .baris').nth(1).locator('[data-isi="komisi"]').count() === 0);

  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'TRX-555' : undefined));
  const baris = page.locator('#daftarPesanan .baris').first();
  await baris.locator('[data-isi="nominal"]').fill('159.000');
  await baris.locator('[data-isi="komisi"]').fill('65000');
  await baris.locator('button[data-aksi="lunas"]').click();
  await page.waitForSelector('#serahPesanan:not([hidden])', { timeout:5000 });
  const fk = model.panggilan.filter(p => p.nama === 'fn').at(-1);
  cek('17c Lunas memanggil aksi konfirmasi dengan nominal dan komisi berupa angka',
      fk.arg.aksi === 'konfirmasi' && fk.arg.pesanan_id === 's-1' && fk.arg.nominal === 159000 && fk.arg.komisi === 65000,
      JSON.stringify(fk.arg));
  const serah = await page.locator('#serahPesananTeks').inputValue();
  cek('17d serah-terima: alamat premium, arahan email, link panitia',
      serah.includes('budi-sari.mengundang.id') && serah.includes('buka email') && serah.includes('t=TOKBARU'), serah);

  cek('17e statistik reseller: konversi 2/40 = 5.0%',
      (await page.locator('#daftarReseller').textContent()).includes('5.0%'));
  await page.locator('#daftarReseller button[data-aksi="cair"]').click();
  await page.waitForFunction(() => document.querySelector('.toast').textContent.includes('Pencairan'), null, { timeout:5000 });
  const pc = model.panggilan.filter(p => p.nama === 'admin_pencairan_catat').at(-1);
  cek('17f Catat Pencairan mengirim nomor transaksinya', pc && pc.arg.p_ref === 'TRX-555' && pc.arg.p_reseller === 'r-1');

  cek('17g owner melihat panel admin dan form reseller', await page.locator('#panelAdmin').isVisible());
  await page.locator('#adNama').fill('Staf Dua');
  await page.locator('#adEmail').fill('staf2@contoh.com');
  await page.locator('#btnAcakAd').click();
  await page.locator('#btnBuatAd').click();
  await page.waitForFunction(() => document.querySelector('.toast').textContent.includes('Admin ditambahkan'), null, { timeout:5000 });
  const fa = model.panggilan.filter(p => p.nama === 'fn').at(-1);
  cek('17h Tambah Admin memakai aksi admin', fa.arg.aksi === 'admin' && fa.arg.email === 'staf2@contoh.com' && fa.arg.sandi.length >= 12);
  await ctx.close();
}

/* ===== admin biasa tidak melihat bagian owner ===== */
{
  const { ctx, page, model } = await halaman(browser);
  model.peran = 'admin';
  await page.locator('#inEmail').fill('staf@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('#daftarReseller .baris', { timeout:8000 });
  cek('18a admin biasa: panel admin tersembunyi', await page.locator('#panelAdmin').isHidden());
  cek('18b admin biasa: tidak ada tombol pencairan',
      await page.locator('#daftarReseller button[data-aksi="cair"]').count() === 0);
  cek('18c admin biasa tidak memanggil admin_admin',
      !model.panggilan.some(p => p.nama === 'admin_admin'));
  await ctx.close();
}

/* ===== HP sempit ===== */
{
  const { ctx, page } = await halaman(browser, { lebar:400 });
  await page.locator('#inEmail').fill('admin@contoh.com');
  await page.locator('#inSandi').fill('benar');
  await page.locator('#btnMasuk').click();
  await page.waitForSelector('.ps', { timeout:8000 });
  await page.locator('.ps button[data-aksi="token"]').first().click();
  await page.waitForSelector('.token div');
  const buruk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.panel button, .panel select, .panel input')]
      .filter(x => x.checkVisibility({ checkVisibilityCSS:true, contentVisibilityAuto:true }));
    const out = [];
    for (const x of el)
      if (x.tagName === 'BUTTON' && x.scrollWidth > x.clientWidth + 1)
        out.push('terpotong: ' + x.textContent.trim());
    for (let i=0;i<el.length;i++) for (let j=i+1;j<el.length;j++){
      const a=el[i].getBoundingClientRect(), c=el[j].getBoundingClientRect();
      if (Math.min(a.right,c.right)-Math.max(a.left,c.left) > 1 &&
          Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top) > 1)
        out.push('tindih: ' + (el[i].textContent.trim()||el[i].tagName) +
                 ' x ' + (el[j].textContent.trim()||el[j].tagName));
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      out.push('gulir mendatar: ' + document.documentElement.scrollWidth);
    return out;
  });
  cek('15 tata letak 400px bersih', buruk.length === 0, buruk.join(' ; '));
  await page.screenshot({ path:'admin-400.png', clip:{x:0,y:0,width:400,height:1000} });
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
