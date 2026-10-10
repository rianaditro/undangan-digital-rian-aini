import { chromium } from 'playwright';
import { mulai } from './server.mjs';
import { bikinModel, pasang, T_PENUH, T_PIHAK } from './stub.mjs';

const PORT = 4330, ASAL = 'http://127.0.0.1:' + PORT;
let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

async function halaman(browser, { token, sesi, lebar = 1100 } = {}){
  const ctx = await browser.newContext({ viewport:{ width:lebar, height:900 } });
  const model = bikinModel();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  await pasang(page, model);
  if (sesi) await page.addInitScript(s =>
    localStorage.setItem('panitia-sesi', JSON.stringify({ akses:s, segar:'S' })), sesi);
  await page.goto(ASAL + '/kirim' + (token ? '?t=' + token : ''));
  return { ctx, page, model };
}

const R0 = '.rk-baris[data-id="tamu-0"]';
const R1 = '.rk-baris[data-id="tamu-1"]';
const akhir = (m, nama) => m.panggilan.filter(p => p.nama === nama).at(-1);

const srv = await mulai(PORT);
const browser = await chromium.launch();

/* ==================== kategori & takaran ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PENUH });
  await page.waitForSelector(R0, { timeout: 8000 });

  const opsi = await page.locator(R0 + ' select[data-f="jenis"] option').count();
  cek('1a sepuluh kategori pemberian tersedia', opsi === 10, 'dapat ' + opsi);

  // rokok: nominal hilang, merek + takaran muncul
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('rokok');
  cek('1b rokok menyembunyikan nominal',
      !(await page.locator(R0 + ' input[data-f="nominal"]').isVisible()));
  cek('1c rokok memunculkan merek dan takaran',
      await page.locator(R0 + ' input[data-f="barang"]').isVisible()
      && await page.locator(R0 + ' input[data-f="takaran"]').isVisible());
  cek('1d takaran memakai satuan bawaan kategori sebagai contoh',
      (await page.locator(R0 + ' input[data-f="takaran"]').getAttribute('placeholder')) === '2 slop',
      await page.locator(R0 + ' input[data-f="takaran"]').getAttribute('placeholder'));

  await page.locator(R0 + ' input[data-f="barang"]').fill('Djarum Super');
  await page.locator(R0 + ' input[data-f="takaran"]').fill('2 slop');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#rkBarang').textContent === '1', null, { timeout:5000 });

  let p = akhir(model, 'pemberian_simpan');
  cek('2a "2 slop" dipecah jadi angka + satuan',
      p.arg.p_jumlah === 2 && p.arg.p_satuan === 'slop', JSON.stringify(p.arg));
  cek('2b p_jumlah dikirim sebagai ANGKA, bukan teks', typeof p.arg.p_jumlah === 'number');
  cek('2c merek ikut tersimpan', p.arg.p_barang === 'Djarum Super');
  cek('2d nominal null untuk rokok', p.arg.p_nominal === null);
  let teks = await page.locator(R0).innerText();
  cek('2e baris menampilkan "Rokok 2 slop Djarum Super"',
      teks.includes('Rokok') && teks.includes('2 slop') && teks.includes('Djarum Super'),
      teks.replace(/\n/g,' | '));

  // angka tanpa satuan → satuan bawaan
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('gula');
  await page.locator(R0 + ' input[data-f="takaran"]').fill('5');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#rkBarang').textContent === '2', null, { timeout:5000 });
  p = akhir(model, 'pemberian_simpan');
  cek('3a angka tanpa satuan memakai satuan bawaan kategori',
      p.arg.p_jumlah === 5 && p.arg.p_satuan === 'kg', JSON.stringify(p.arg));

  // takaran ngawur → ditahan di peramban
  let sebelum = model.panggilan.filter(x => x.nama === 'pemberian_simpan').length;
  await page.locator(R0 + ' input[data-f="takaran"]').fill('dua kilo');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForSelector('.toast.on', { timeout:3000 });
  cek('3b takaran tanpa angka ditahan di peramban',
      model.panggilan.filter(x => x.nama === 'pemberian_simpan').length === sebelum);
  cek('3c pesannya memberi contoh',
      (await page.locator('.toast').textContent()).includes('2 kg'),
      await page.locator('.toast').textContent());

  // jasa: tidak punya satuan, jadi takaran tidak ditawarkan
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('jasa');
  cek('4a jasa tidak menawarkan takaran',
      !(await page.locator(R0 + ' input[data-f="takaran"]').isVisible()));
  await page.locator(R0 + ' input[data-f="barang"]').fill('Vendor fotografer');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#rkBarang').textContent === '3', null, { timeout:5000 });
  p = akhir(model, 'pemberian_simpan');
  cek('4b jasa terkirim tanpa jumlah/satuan',
      p.arg.p_jumlah === null && p.arg.p_satuan === null, JSON.stringify(p.arg));

  // barang lain wajib disebut
  sebelum = model.panggilan.filter(x => x.nama === 'pemberian_simpan').length;
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('barang');
  await page.locator(R0 + ' input[data-f="barang"]').fill('');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForSelector('.toast.on', { timeout:3000 });
  cek('4c "barang lain" kosong ditahan di peramban',
      model.panggilan.filter(x => x.nama === 'pemberian_simpan').length === sebelum);

  // amplop tetap jalan dan tidak membawa takaran
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('uang');
  await page.locator(R0 + ' input[data-f="nominal"]').fill('');
  await page.locator(R0 + ' input[data-f="nominal"]').type('250000');
  cek('5a nominal dirapikan sambil diketik',
      (await page.locator(R0 + ' input[data-f="nominal"]').inputValue()) === '250.000');
  await page.locator(R0 + ' button[data-aksi="catat"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#rkUang').textContent.includes('250.000'), null, { timeout:5000 });
  p = akhir(model, 'pemberian_simpan');
  cek('5b amplop: angka 250000, tanpa jumlah/satuan/merek',
      p.arg.p_nominal === 250000 && p.arg.p_jumlah === null
      && p.arg.p_satuan === null && p.arg.p_barang === null, JSON.stringify(p.arg));

  // rincian per satuan muncul
  const rinci = await page.locator('#rkRinci').innerText();
  cek('6a rincian per kategori tampil',
      rinci.includes('Rokok') && rinci.includes('2 slop')
      && rinci.includes('Gula') && rinci.includes('5 kg'), rinci);
  cek('6b jasa dihitung sebagai catatan, bukan takaran',
      rinci.includes('Jasa / vendor') && rinci.includes('catatan'), rinci);

  await ctx.close();
}

/* ==================== berkat tiga keadaan ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PENUH });
  await page.waitForSelector(R0, { timeout: 8000 });
  const tbl = page.locator(R0 + ' .lampu.berkat');

  cek('7a awalnya berlabel "Berkat"', (await tbl.textContent()) === 'Berkat');
  await tbl.click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-baris[data-id="tamu-0"] .lampu.berkat').textContent === 'Dijatah',
    null, { timeout:5000 });
  cek('7b sekali tekan → dijatah', akhir(model,'berkat_tandai').arg.p_status === 'dijatah');
  cek('7c label ikut berganti, bukan cuma warnanya',
      (await tbl.textContent()) === 'Dijatah');

  await tbl.click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-baris[data-id="tamu-0"] .lampu.berkat').textContent === 'Diberikan',
    null, { timeout:5000 });
  cek('7d dua kali → diberikan', akhir(model,'berkat_tandai').arg.p_status === 'diberikan');
  cek('7e ringkasan berkat muncul',
      (await page.locator('#rkBerkat').innerText()).includes('1'),
      await page.locator('#rkBerkat').innerText());

  await tbl.click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-baris[data-id="tamu-0"] .lampu.berkat').textContent === 'Berkat',
    null, { timeout:5000 });
  cek('7f tiga kali → kembali ke belum', akhir(model,'berkat_tandai').arg.p_status === 'belum');
  cek('7g model server ikut kembali', model.tamu[0].berkat === 'belum');
  await ctx.close();
}

/* ==================== kelompok ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PENUH });
  await page.waitForSelector(R0, { timeout: 8000 });

  await page.locator(R0 + ' .rk-data summary').click();
  await page.locator(R0 + ' input[data-f="alamat"]').fill('Jl. Pesajen 10');
  await page.locator(R0 + ' input[data-f="kelompok"]').fill('Keluarga Budi Santoso');
  await page.locator(R0 + ' input[data-f="relasi"]').fill('Kepala keluarga');
  await page.locator(R0 + ' button[data-aksi="simpanData"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#rkGrupBlok') && !document.querySelector('#rkGrupBlok').hidden,
    null, { timeout:5000 });

  let p = akhir(model, 'tamu_ubah_rekap');
  cek('8a alamat/kelompok/relasi terkirim sebagai teks',
      p.arg.p_alamat === 'Jl. Pesajen 10'
      && p.arg.p_kelompok === 'Keluarga Budi Santoso'
      && p.arg.p_relasi === 'Kepala keluarga', JSON.stringify(p.arg));
  const kelTag = await page.locator(R0 + ' .tag.kel').textContent();
  cek('8b baris menampilkan kelompok dan relasinya',
      kelTag.includes('Keluarga Budi Santoso') && kelTag.includes('Kepala keluarga'), kelTag);

  // ejaan beda huruf besar-kecil menempel ke yang sudah ada
  await page.locator(R1 + ' .rk-data summary').click();
  await page.locator(R1 + ' input[data-f="kelompok"]').fill('keluarga   budi santoso');
  await page.locator(R1 + ' input[data-f="relasi"]').fill('Anak');
  await page.locator(R1 + ' button[data-aksi="simpanData"]').click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-kel .isi')
    && document.querySelector('.rk-kel .isi').textContent.includes('2 orang'),
    null, { timeout:5000 });
  cek('9a ejaan berbeda TIDAK bikin kelompok kedua',
      model.tamu[1].kelompok === 'Keluarga Budi Santoso', model.tamu[1].kelompok);
  cek('9b ringkasan kelompok tetap satu',
      (await page.locator('#rkGrupN').textContent()) === '1');

  const kel = await page.locator('.rk-kel').first().textContent();
  cek('9c ringkasan kelompok menyebut jumlah anggotanya',
      kel.includes('2 orang'), kel.replace(/\n/g,' | '));

  // saran ketik
  const dl = await page.locator('#dlKelompok option').count();
  cek('9d label yang ada jadi saran ketik', dl === 1, 'dapat ' + dl);

  // Lihat → saringan kelompok
  await page.locator('.rk-kel button[data-aksi="lihatKel"]').first().click();
  await page.waitForFunction(() =>
    document.querySelectorAll('.rk-baris').length === 2, null, { timeout:5000 });
  p = akhir(model, 'rekap_daftar');
  cek('10a "Lihat" mengirim p_kelompok', p.arg.p_kelompok === 'Keluarga Budi Santoso');
  cek('10b chip saringan muncul', await page.locator('#rkChip').isVisible());

  await page.locator('#rkChip button').click();
  await page.waitForFunction(() =>
    document.querySelectorAll('.rk-baris').length === 200, null, { timeout:5000 });
  cek('10c menutup chip melepas saringan',
      akhir(model,'rekap_daftar').arg.p_kelompok === null);

  // ganti nama kelompok
  page.once('dialog', d => d.accept('Keluarga Besar Budi'));
  await page.locator('.rk-kel button[data-aksi="namaiKel"]').first().click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-kel b').textContent === 'Keluarga Besar Budi',
    null, { timeout:5000 });
  cek('11a ganti nama mengenai kedua anggota',
      model.tamu[0].kelompok === 'Keluarga Besar Budi'
      && model.tamu[1].kelompok === 'Keluarga Besar Budi');
  cek('11b rpc menerima nama lama dan baru',
      akhir(model,'kelompok_ganti_nama').arg.p_lama === 'Keluarga Budi Santoso'
      && akhir(model,'kelompok_ganti_nama').arg.p_baru === 'Keluarga Besar Budi');

  // urut kelompok → judul kelompok muncul, anggotanya di atas
  await page.locator('#rkUrut').selectOption('kelompok');
  await page.waitForFunction(() =>
    document.querySelectorAll('.rk-judul').length > 0, null, { timeout:5000 });
  cek('12a p_urut terkirim', akhir(model,'rekap_daftar').arg.p_urut === 'kelompok');
  const judul = await page.locator('.rk-judul').first().textContent();
  cek('12b judul kelompok pertama adalah kelompoknya',
      judul === 'Keluarga Besar Budi', judul);
  const idAwal = await page.locator('.rk-baris').first().getAttribute('data-id');
  cek('12c anggota kelompok naik ke baris teratas',
      ['tamu-0','tamu-1'].includes(idAwal), idAwal);
  cek('12d ada judul kedua untuk yang belum berkelompok',
      (await page.locator('.rk-judul').count()) === 2);

  await page.locator('#rkUrut').selectOption('');
  await page.waitForFunction(() =>
    document.querySelectorAll('.rk-judul').length === 0, null, { timeout:5000 });
  cek('12e urut nama tidak memunculkan judul kelompok', true);

  // kosongkan = keluar dari kelompok
  await page.locator(R1 + ' .rk-data summary').click();
  await page.locator(R1 + ' input[data-f="kelompok"]').fill('');
  await page.locator(R1 + ' button[data-aksi="simpanData"]').click();
  await page.waitForFunction(() =>
    document.querySelector('.rk-kel .isi').textContent.includes('1 orang'),
    null, { timeout:5000 });
  p = akhir(model, 'tamu_ubah_rekap');
  cek('13a kotak dikosongkan terkirim sebagai "" bukan null', p.arg.p_kelompok === '');
  cek('13b anggotanya benar-benar keluar dari kelompok', model.tamu[1].kelompok === null);

  await ctx.close();
}

/* ==================== kotak 3: berkat tiga keadaan ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PENUH });
  await page.waitForSelector('.tamu', { timeout: 8000 });
  const b = page.locator('.tamu').first().locator('.lampu.berkat');

  cek('14a kotak 3 berlabel "Berkat"', (await b.textContent()) === 'Berkat');
  await b.click();
  await page.waitForFunction(() =>
    document.querySelector('.tamu .lampu.berkat').textContent === 'Dijatah', null, { timeout:5000 });
  cek('14b panitia_tandai menerima "dijatah"',
      akhir(model,'panitia_tandai').arg.p_status === 'dijatah');
  await b.click();
  await page.waitForFunction(() =>
    document.querySelector('.tamu .lampu.berkat').textContent === 'Diberikan', null, { timeout:5000 });
  cek('14c lalu "diberikan"', akhir(model,'panitia_tandai').arg.p_status === 'diberikan');
  cek('14d ringkasan kotak 2 menghitung yang diberikan',
      (await page.locator('#nBerkat').textContent()) === '1');

  // saringan status berkat
  await page.locator('#filterStatus').selectOption('berkat-dijatah');
  await page.waitForFunction(() =>
    document.querySelectorAll('.tamu').length === 0, null, { timeout:5000 });
  cek('15a saringan "dijatah" tidak memuat yang sudah diberikan', true);
  await page.locator('#filterStatus').selectOption('berkat-diberikan');
  await page.waitForFunction(() =>
    document.querySelectorAll('.tamu').length === 1, null, { timeout:5000 });
  cek('15b saringan "diberikan" memuat tepat satu', true);
  await page.locator('#filterStatus').selectOption('berkat-belum');
  await page.waitForFunction(() =>
    document.querySelectorAll('.tamu').length === 209, null, { timeout:5000 });
  cek('15c sisanya masih "belum"', true);

  await ctx.close();
}

/* ==================== HP sempit ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PENUH, lebar: 400 });
  await page.waitForSelector(R0, { timeout: 8000 });
  model.tamu[0].kelompok = 'Keluarga Budi Santoso';
  model.tamu[0].relasi = 'Kepala keluarga';
  await page.locator('#btnRkSegarkan').click();
  await page.waitForTimeout(400);
  await page.locator(R0 + ' select[data-f="jenis"]').selectOption('rokok');
  await page.locator(R0 + ' .rk-data summary').click();

  const masalah = await page.evaluate(() => {
    const b = document.querySelector('.rk-baris[data-id="tamu-0"]');
    const el = [...b.querySelectorAll('button, select, input')].filter(x =>
      // offsetParent BUKAN patokan yang benar: anak <details> yang tertutup
      // tetap melaporkannya tidak-null, berikut rect lama yang menumpuk di
      // atas tombol yang sungguh terlihat. checkVisibility() paham
      // content-visibility, offsetParent tidak.
      x.checkVisibility({ checkVisibilityCSS:true, contentVisibilityAuto:true }));
    const buruk = [];
    for (const x of el)
      if (x.tagName === 'BUTTON' && x.scrollWidth > x.clientWidth + 1)
        buruk.push('terpotong: "' + x.textContent.trim() + '"');
    for (let i = 0; i < el.length; i++)
      for (let j = i + 1; j < el.length; j++){
        const a = el[i].getBoundingClientRect(), c = el[j].getBoundingClientRect();
        if (Math.min(a.right,c.right) - Math.max(a.left,c.left) > 1 &&
            Math.min(a.bottom,c.bottom) - Math.max(a.top,c.top) > 1)
          buruk.push('tindih: ' + (el[i].textContent.trim()||el[i].tagName) +
                     ' x ' + (el[j].textContent.trim()||el[j].tagName));
      }
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      buruk.push('gulir mendatar: ' + document.documentElement.scrollWidth);
    return buruk;
  });
  cek('16 tata letak 400px bersih (kategori rokok + panel data terbuka)',
      masalah.length === 0, masalah.join(' ; '));
  await page.locator('#panelRekap').screenshot({ path:'p6-018-400.png' });
  await ctx.close();
}

/* ==================== link per-pihak tetap tertutup ==================== */
{
  const { ctx, page, model } = await halaman(browser, { token: T_PIHAK });
  await page.waitForSelector('.tamu', { timeout: 8000 });
  cek('17a kotak 6 tetap tertutup untuk link per-pihak',
      await page.locator('#panelRekap').isHidden());
  cek('17b tidak ada rpc rekap yang dicoba',
      model.panggilan.filter(p => /^(rekap_|tamu_ubah|berkat_|kelompok_)/.test(p.nama)).length === 0);
  await ctx.close();
}

await browser.close(); srv.close();
console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
