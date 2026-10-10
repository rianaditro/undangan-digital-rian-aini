// Edge function drive-impor dijalankan sungguhan di Deno, dengan
// Supabase DAN Google Drive ditiru di belakangnya (DRIVE_API menunjuk
// ke tiruan). Yang diuji: siapa yang boleh masuk, bentuk daftar folder
// (subfolder, jenis yang disaring, batas), terjemahan galat Google, dan
// bahwa unduhan diperiksa jenis dan ukurannya SEBELUM diteruskan.
//
// Butuh Deno: `deno` di PATH, atau DENO=/jalur/ke/deno.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const akar = fileURLToPath(new URL('..', import.meta.url));
let lulus = 0, gagal = 0;
const cek = (ok, pesan, k) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}${!ok && k ? '  — ' + k : ''}`); };

const DENO = process.env.DENO || 'deno';
try { execFileSync(DENO, ['--version'], { stdio: 'ignore' }); }
catch { console.log('GAGAL  deno tidak ditemukan — isi DENO=/jalur/ke/deno'); console.log('0 lulus, 1 gagal'); process.exit(1); }

// ---------- Supabase tiruan ----------
const pengguna = { 'jwt-u1': 'U1', 'jwt-u9': 'U9' };
const pemilik = [{ user_id: 'U1', pasangan_id: 'PAS1' }];
const foto = [{ id: 'F1', pasangan_id: 'PAS1', jenis: 'foto' }, { id: 'F2', pasangan_id: 'PAS1', jenis: 'video' },
              { id: 'F3', pasangan_id: 'PAS2', jenis: 'foto' }];
const sb = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (s, o, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/auth/v1/user') {
    const id = pengguna[(req.headers.authorization || '').replace(/^Bearer /, '')];
    return id ? json(200, { id, aud: 'authenticated' }) : json(401, { msg: 'invalid JWT' });
  }
  const eq = k => (u.searchParams.get(k) || '').replace(/^eq\./, '');
  if (u.pathname === '/rest/v1/pemilik') return json(200, pemilik.filter(p => p.user_id === eq('user_id')));
  if (u.pathname === '/rest/v1/foto') {
    const n = foto.filter(f => f.pasangan_id === eq('pasangan_id') && (!u.searchParams.get('jenis') || f.jenis === eq('jenis'))).length;
    res.writeHead(200, { 'content-range': `0-0/${n}` }); return res.end();
  }
  json(404, {});
});
await new Promise(r => sb.listen(0, '127.0.0.1', r));

// ---------- Google Drive tiruan ----------
const KUNCI = 'kunci-google';
const FOLDER = 'application/vnd.google-apps.folder';
const berkasDrive = {
  FOLDERAKAR01: { name: 'Pernikahan Rian & Aini', mimeType: FOLDER, induk: null },
  SUBAKAD0001:  { name: 'Akad', mimeType: FOLDER, induk: 'FOLDERAKAR01' },
  SUBDALAM001:  { name: 'Detail', mimeType: FOLDER, induk: 'SUBAKAD0001' },
  SUBTERLALU1:  { name: 'Terlalu dalam', mimeType: FOLDER, induk: 'SUBDALAM001' },
  FOTO0000001:  { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', size: '5242880', induk: 'FOLDERAKAR01',
                  imageMediaMetadata: { width: 6000, height: 4000, rotation: 1 }, thumbnailLink: 'https://lh3.example/t1' },
  FOTO0000002:  { name: 'IMG_0002.HEIC', mimeType: 'image/heic', size: '3000000', induk: 'SUBAKAD0001',
                  imageMediaMetadata: { width: 4032, height: 3024 } },
  FOTO0000003:  { name: 'detail.png', mimeType: 'image/png', size: '900000', induk: 'SUBDALAM001' },
  FOTO0000004:  { name: 'hilang.jpg', mimeType: 'image/jpeg', size: '900000', induk: 'SUBTERLALU1' },
  VIDEO000001:  { name: 'klip.mp4', mimeType: 'video/mp4', size: '15000000', induk: 'FOLDERAKAR01',
                  videoMediaMetadata: { width: 1080, height: 1920, durationMillis: '14000' } },
  VIDEOBESAR1:  { name: 'utuh.mp4', mimeType: 'video/mp4', size: '400000000', induk: 'FOLDERAKAR01' },
  DOKUMEN0001:  { name: 'kontrak.pdf', mimeType: 'application/pdf', size: '1000', induk: 'FOLDERAKAR01' },
  PRIBADI0001:  { name: 'rahasia', mimeType: FOLDER, induk: null, pribadi: true },
};
// halaman kedua untuk folder akar: nextPageToken diikuti
const permintaanDrive = [];
let batasi = false;
const drive = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  permintaanDrive.push(u.pathname + u.search);
  const json = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.searchParams.get('key') !== KUNCI) return json(400, { error: { errors: [{ reason: 'keyInvalid' }] } });
  if (batasi) return json(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } });
  if (u.pathname === '/files') {
    const induk = (u.searchParams.get('q').match(/'([^']+)' in parents/) || [])[1];
    const semua = Object.entries(berkasDrive).filter(([, b]) => b.induk === induk)
      .map(([id, b]) => ({ id, ...b, induk: undefined }));
    const tok = u.searchParams.get('pageToken');
    if (induk === 'FOLDERAKAR01' && !tok) return json(200, { files: semua.slice(0, 2), nextPageToken: 'hal2' });
    if (induk === 'FOLDERAKAR01' && tok === 'hal2') return json(200, { files: semua.slice(2) });
    return json(200, { files: semua });
  }
  const m = u.pathname.match(/^\/files\/([^/]+)$/);
  const b = m && berkasDrive[m[1]];
  if (!b) return json(404, { error: { errors: [{ reason: 'notFound' }] } });
  if (b.pribadi) return json(403, { error: { errors: [{ reason: 'forbidden' }] } });
  if (u.searchParams.get('alt') === 'media') {
    res.writeHead(200, { 'content-type': b.mimeType }); return res.end('ISI-' + m[1]);
  }
  json(200, { id: m[1], name: b.name, mimeType: b.mimeType, size: b.size });
});
await new Promise(r => drive.listen(0, '127.0.0.1', r));

// ---------- fungsinya ----------
async function nyalakan(env) {
  const port = 19000 + Math.floor(Math.random() * 900);
  const p = spawn(DENO, ['run', '--allow-net', '--allow-env', '--quiet', 'supabase/functions/drive-impor/index.ts'], {
    cwd: akar,
    env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${sb.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'servis',
           DRIVE_API: `http://127.0.0.1:${drive.address().port}`, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, ...env },
  });
  let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
  const fn = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { await fetch(fn, { method: 'OPTIONS' }); break; }
    catch { if (i > 300) { console.log(log); throw new Error('drive-impor tidak menyala'); } await new Promise(r => setTimeout(r, 100)); }
  }
  return { p, fn };
}

const { p: deno, fn: FN } = await nyalakan({ GOOGLE_API_KEY: KUNCI });
const minta = (cari, jwt = 'jwt-u1') => fetch(FN + '/?' + cari, { headers: jwt ? { Authorization: 'Bearer ' + jwt } : {} });
const isi = async r => { try { return await r.json(); } catch { return null; } };

try {
  // --- pintu ---
  let r = await minta('folder=FOLDERAKAR01', null);
  cek(r.status === 401, 'tanpa JWT: 401');
  r = await minta('folder=FOLDERAKAR01', 'jwt-u9');
  cek(r.status === 403, 'pengguna tanpa undangan: 403');
  r = await minta('unduh=FOTO0000001', null);
  cek(r.status === 401, 'unduh juga butuh JWT pemilik (bukan proksi terbuka)');

  // --- daftar folder ---
  r = await minta('folder=' + encodeURIComponent('https://drive.google.com/drive/folders/FOLDERAKAR01?usp=sharing'));
  const d = await isi(r);
  cek(r.status === 200 && d.folder.nama === 'Pernikahan Rian & Aini', 'link folder bentuk usp=sharing dikenali', JSON.stringify(d && d.folder));
  const nama = (d.berkas || []).map(b => b.nama).sort();
  cek(nama.join(',') === 'IMG_0001.jpg,IMG_0002.HEIC,detail.png,klip.mp4,utuh.mp4',
      'isi: foto/video dari akar + dua tingkat subfolder; halaman kedua diikuti; PDF dan tingkat ketiga tidak', nama.join(','));
  const f1 = d.berkas.find(b => b.id === 'FOTO0000001');
  cek(f1.lebar === 4000 && f1.tinggi === 6000 && f1.bita === 5242880 && f1.kecil === 'https://lh3.example/t1' && f1.sub === '',
      'foto diputar 90°: lebar/tinggi ditukar; ukuran dan thumbnail ikut', JSON.stringify(f1));
  cek(d.berkas.find(b => b.id === 'FOTO0000003').sub === 'Akad / Detail', 'subfolder dicatat sebagai jalurnya');
  cek(d.berkas.find(b => b.id === 'VIDEO000001').durasi_ms === 14000, 'durasi video dari metadata');
  cek(d.terpakai === 2 && d.batas === 100 && d.terpakai_video === 1 && d.batas_video === 12,
      'kuota pasangan ini (bukan pasangan lain) ikut dikirim', JSON.stringify([d.terpakai, d.terpakai_video]));
  cek(!permintaanDrive.some(x => !x.includes('key=' + KUNCI)), 'setiap permintaan ke Google membawa kunci API');
  cek(!JSON.stringify(d).includes(KUNCI), 'kunci API tidak pernah sampai ke jawaban');

  r = await minta('folder=bukan%20link');
  cek(r.status === 400, 'teks yang bukan link: 400');
  r = await minta('folder=FOTO0000001');
  cek(r.status === 400 && /bukan folder/i.test((await isi(r)).pesan), 'link satu berkas: diminta membagikan foldernya');
  r = await minta('folder=PRIBADI0001');
  cek(r.status === 403 && /Siapa saja yang memiliki link/.test((await isi(r)).pesan), 'folder pribadi: pesan menyuruh membagikan dengan link');
  r = await minta('folder=TIDAKADA0001');
  cek(r.status === 404, 'folder tidak ada: 404');

  // --- unduh ---
  r = await minta('unduh=FOTO0000001');
  cek(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && (await r.text()) === 'ISI-FOTO0000001'
      && r.headers.get('access-control-allow-origin') === '*', 'unduh: isi berkas diteruskan dengan jenisnya, CORS terbuka');
  permintaanDrive.length = 0;
  r = await minta('unduh=VIDEOBESAR1');
  cek(r.status === 413 && !permintaanDrive.some(x => x.includes('alt=media')), 'video 400 MB: ditolak dari metadata, isinya tidak pernah diunduh');
  r = await minta('unduh=DOKUMEN0001');
  cek(r.status === 415, 'PDF: ditolak');
  r = await minta('unduh=FOLDERAKAR01');
  cek(r.status === 415, 'folder sebagai berkas: ditolak');

  // --- Google membatasi ---
  batasi = true;
  r = await minta('folder=FOLDERAKAR01');
  cek(r.status === 429 && /beberapa menit/.test((await isi(r)).pesan), 'Google membatasi: 429 dengan pesan coba lagi');
  batasi = false;
} finally {
  deno.kill();
}

// --- tanpa kunci API: pesan jelas, bukan galat ---
{
  const { p, fn } = await nyalakan({ GOOGLE_API_KEY: '' });
  const r = await fetch(fn + '/?folder=FOLDERAKAR01', { headers: { Authorization: 'Bearer jwt-u1' } });
  const j = await isi(r);
  cek(r.status === 503 && /kunci API/.test(j.pesan), 'kunci API belum dipasang: 503 dengan penjelasan');
  p.kill();
}

sb.close(); drive.close();
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
