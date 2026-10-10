// Edge function foto-unggah dijalankan sungguhan di Deno, dengan Supabase
// ditiru di belakangnya — bukan distub dari sisi peramban seperti suite
// lain. Yang diuji kodenya sendiri: siapa yang boleh masuk, ke pasangan
// mana barisnya jatuh, dan apa yang dibereskan kalau gagal di tengah.
//
// Bentuk permintaannya disalin dari halaman yang memanggilnya: /dasbor,
// JWT pemilik, untuk foto acara (kotak 8) dan foto silsilah (kotak 1).
// Jalan token panitia (dulu /kirim) sudah ditutup sejak Fase 3.
//
// Butuh Deno: `deno` di PATH, atau DENO=/jalur/ke/deno.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layaniMedia } from '../cloudflare/media.js';
import { R2Tiruan } from './r2-tiruan.mjs';

const akar = fileURLToPath(new URL('..', import.meta.url));
let lulus = 0, gagal = 0;
const cek = (ok, pesan) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}`); };

const DENO = process.env.DENO || 'deno';
try { execFileSync(DENO, ['--version'], { stdio: 'ignore' }); }
catch { console.log('GAGAL  deno tidak ditemukan — isi DENO=/jalur/ke/deno'); console.log('0 lulus, 1 gagal'); process.exit(1); }

// ---------- Supabase tiruan ----------
const ANON = 'kunci-anon';
// Pasangan ber-uuid sungguhan untuk jalan R2 (kunci /media memakai uuid).
const PASU = '11111111-2222-4333-8444-555555555555';
const SIL_LAMA = PASU + '/99999999-2222-4333-8444-555555555555.webp';
const data = {
  pengguna: { 'jwt-u1': 'U1', 'jwt-u2': 'U2', 'jwt-u3': 'U3', 'jwt-u4': 'U4' },
  pemilik:  [{ user_id: 'U4', pasangan_id: PASU },
             { user_id: 'U1', pasangan_id: 'PAS1' },
             { user_id: 'U2', pasangan_id: 'PAS1' }, { user_id: 'U2', pasangan_id: 'PAS2' }],
  acara:    [{ id: 'A1', pasangan_id: 'PAS1' }, { id: 'A2', pasangan_id: 'PAS2' }],
  silsilah: [{ id: 'S4', pasangan_id: PASU, foto_jalur: SIL_LAMA, foto_kecil: null },
             { id: 'S1', pasangan_id: 'PAS1', foto_jalur: 'PAS1/lama.webp', foto_kecil: 'PAS1/lama-kecil.webp' },
             { id: 'S2', pasangan_id: 'PAS2', foto_jalur: null, foto_kecil: null }],
  foto:     [{ id: 'F1', pasangan_id: 'PAS1', jalur: 'PAS1/f1.webp', jalur_kecil: 'PAS1/f1-kecil.webp' },
             { id: 'F2', pasangan_id: 'PAS2', jalur: 'PAS2/f2.webp', jalur_kecil: null }],
};
let jumlahFotoPaksa = null;      // untuk uji batas 100
let jejak = [];                  // setiap permintaan ke Supabase tiruan

const saring = (baris, q) => baris.filter(b =>
  [...q].every(([k, v]) => k === 'select' || !v.startsWith('eq.') || String(b[k]) === v.slice(3)));

function balasBaris(res, req, baris) {
  const satu = (req.headers.accept || '').includes('vnd.pgrst.object');
  if (satu) {
    if (baris.length !== 1) { res.writeHead(406, { 'content-type': 'application/json' }); return res.end('{"message":"0 baris"}'); }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(baris[0]));
  }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(baris));
}

const tiruan = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let badan = '';
  for await (const c of req) badan += c;
  jejak.push({ m: req.method, p: u.pathname, q: u.search, badan, auth: req.headers.authorization });
  const json = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

  if (u.pathname === '/rest/v1/rpc/panitia_pasangan_penuh') {
    const t = JSON.parse(badan).p_token;
    if (t === 'tok-penuh') return json(200, 'PAS1');
    return json(400, { message: t === 'tok-pihak' ? 'Link ini hanya untuk satu pihak' : 'Token tidak dikenal' });
  }
  if (u.pathname === '/auth/v1/user') {
    const jwt = (req.headers.authorization || '').replace(/^Bearer /, '');
    const id = data.pengguna[jwt];
    return id ? json(200, { id, aud: 'authenticated', role: 'authenticated' }) : json(401, { code: 401, msg: 'invalid JWT' });
  }
  if (u.pathname.startsWith('/storage/v1/object/foto')) {
    if (req.method === 'DELETE') return json(200, []);
    return json(200, { Key: 'foto/' + u.pathname.split('/foto/')[1], Id: 'x' });
  }
  const tabel = u.pathname.replace('/rest/v1/', '');
  if (!data[tabel]) return json(404, { message: 'tabel ' + tabel });

  if (req.method === 'HEAD' || (req.headers.prefer || '').includes('count=exact')) {
    const n = jumlahFotoPaksa ?? saring(data[tabel], u.searchParams).length;
    res.writeHead(200, { 'content-range': `0-0/${n}` }); return res.end();
  }
  if (req.method === 'GET') return balasBaris(res, req, saring(data[tabel], u.searchParams));
  if (req.method === 'POST') {
    const baris = { id: 'BARU' + jejak.length, tampil: true, latar: false, ...JSON.parse(badan) };
    data[tabel].push(baris);
    return balasBaris(res, req, [baris]);
  }
  if (req.method === 'PATCH') {
    const kena = saring(data[tabel], u.searchParams);
    kena.forEach(b => Object.assign(b, JSON.parse(badan)));
    return balasBaris(res, req, kena);
  }
  if (req.method === 'DELETE') {
    const kena = saring(data[tabel], u.searchParams);
    data[tabel] = data[tabel].filter(b => !kena.includes(b));
    res.writeHead(204); return res.end();
  }
  json(405, {});
});
await new Promise(r => tiruan.listen(0, '127.0.0.1', r));
const SB = `http://127.0.0.1:${tiruan.address().port}`;

// ---------- Worker /media tiruan: modul Worker yang sungguhan, R2 di memori ----------
const MEDIA_KUNCI = 'kunci-media-uji';
const r2 = new R2Tiruan();
await r2.put(SIL_LAMA, Buffer.from('lama'), { httpMetadata: { contentType: 'image/webp' } });
const media = http.createServer(async (req, res) => {
  const adaBadan = !['GET', 'HEAD'].includes(req.method);
  const rq = new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers,
    ...(adaBadan ? { body: req, duplex: 'half' } : {}) });
  const j = await layaniMedia(rq, { MEDIA: r2, MEDIA_KUNCI }, { waitUntil() {} });
  res.writeHead(j.status, Object.fromEntries(j.headers));
  res.end(req.method === 'HEAD' ? undefined : Buffer.from(await j.arrayBuffer()));
});
await new Promise(r => media.listen(0, '127.0.0.1', r));
const MEDIA = `http://127.0.0.1:${media.address().port}`;

// ---------- fungsinya, di Deno ----------
const PORT = 18000 + Math.floor(Math.random() * 1000);
const deno = spawn(DENO, ['run', '--allow-net', '--allow-env', '--quiet',
  'supabase/functions/foto-unggah/index.ts'], {
  cwd: akar,
  env: { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'kunci-servis',
         MEDIA_ASAL: MEDIA, MEDIA_KUNCI,
         DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${PORT}` },
});
let log = '';
deno.stdout.on('data', d => log += d); deno.stderr.on('data', d => log += d);
const FN = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try { await fetch(FN, { method: 'OPTIONS' }); break; }
  catch { if (i > 300) { console.log(log); throw new Error('foto-unggah tidak menyala'); } await new Promise(r => setTimeout(r, 100)); }
}

const gambar = (tipe = 'image/webp', bita = 1000) => new Blob([new Uint8Array(bita)], { type: tipe });
function formulir({ tipe, bita, acara } = {}) {
  const f = new FormData();
  f.append('berkas', gambar(tipe, bita), 'foto.webp');
  f.append('kecil', gambar(), 'kecil.webp');
  f.append('lebar', '1600'); f.append('tinggi', '1200');
  if (acara) f.append('acara_id', acara);
  return f;
}
const kirim = (headers) => ({ 'Authorization': 'Bearer ' + ANON, 'apikey': ANON, ...headers });
const dasbor = (jwt) => ({ 'Authorization': 'Bearer ' + jwt, 'apikey': ANON });
async function minta(jalur, opsi) {
  jejak = [];
  const r = await fetch(FN + jalur, opsi);
  let isi = null; try { isi = await r.json(); } catch {}
  return { s: r.status, isi };
}
const unggahan = () => jejak.filter(j => j.m === 'POST' && j.p.startsWith('/storage/'));
const buangan  = () => jejak.filter(j => j.m === 'DELETE' && j.p.startsWith('/storage/')).map(j => JSON.parse(j.badan).prefixes).flat();

try {
  // ---------- jalan token panitia sudah ditutup ----------
  let r = await minta('/?untuk=silsilah&id=S1', { method: 'POST', headers: kirim({ 'x-panitia-token': 'tok-penuh' }), body: formulir() });
  cek(r.s === 403 && /dasbor/.test(r.isi?.pesan || '') && unggahan().length === 0,
      `token panitia ditolak dengan arahan ke dasbor, tanpa apa pun naik → ${r.s}`);
  cek(!jejak.some(j => j.p.includes('panitia_pasangan_penuh')), 'token tidak lagi ditukar lewat panitia_pasangan_penuh');
  r = await minta('/?untuk=silsilah&id=S1', { method: 'DELETE', headers: kirim({ 'x-panitia-token': 'tok-penuh' }) });
  cek(r.s === 403 && data.silsilah.find(b => b.id === 'S1').foto_jalur === 'PAS1/lama.webp',
      `token panitia juga tidak bisa melepas foto → ${r.s}`);

  // ---------- /dasbor kotak 1: silsilah lewat JWT pemilik ----------
  r = await minta('/?untuk=silsilah&id=S1', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir() });
  const s1 = data.silsilah.find(b => b.id === 'S1');
  cek(r.s === 201 && r.isi?.silsilah?.id === 'S1', `silsilah: pemilik mengunggah foto → ${r.s}`);
  cek(s1.foto_jalur.startsWith('PAS1/') && s1.foto_jalur !== 'PAS1/lama.webp', 'silsilah: baris menunjuk berkas baru di folder pasangannya');
  cek(unggahan().length === 2, 'silsilah: berkas penuh dan thumbnail sama-sama naik');
  cek(buangan().includes('PAS1/lama.webp') && buangan().includes('PAS1/lama-kecil.webp'), 'silsilah: foto lama dibuang dari bucket');

  r = await minta('/?untuk=silsilah&id=S2', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir() });
  cek(r.s === 404, `silsilah: baris pasangan lain ditolak → ${r.s}`);
  cek(data.silsilah.find(b => b.id === 'S2').foto_jalur === null, 'silsilah: baris pasangan lain tidak tersentuh');
  cek(buangan().length === 2, 'silsilah: berkas yang terlanjur naik dibereskan');

  r = await minta('/?untuk=silsilah&id=S1', { method: 'DELETE', headers: dasbor('jwt-u1') });
  cek(r.s === 200 && data.silsilah.find(b => b.id === 'S1').foto_jalur === null, `silsilah: lepas foto → ${r.s}`);

  // ---------- /dasbor: foto acara lewat JWT pemilik ----------
  r = await minta('/', { method: 'POST', headers: dasbor(ANON), body: formulir() });
  cek(r.s === 401 && unggahan().length === 0, `anon key bukan pengguna → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: { apikey: ANON }, body: formulir() });
  cek(r.s === 401, `tanpa Authorization → ${r.s}`);

  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir() });
  const baru = data.foto.at(-1);
  cek(r.s === 201 && baru.pasangan_id === 'PAS1', `dasbor: pemilik mengunggah ke pasangannya → ${r.s}`);
  cek(baru.jalur.startsWith('PAS1/') && baru.acara_id === null, 'dasbor: tanpa babak, foto jadi foto lepas');
  cek(r.isi?.foto && 'latar' in r.isi.foto && 'acara_id' in r.isi.foto, 'dasbor: jawaban membawa acara_id dan latar (kolom 026)');

  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir({ acara: 'A1' }) });
  cek(r.s === 201 && data.foto.at(-1).acara_id === 'A1', 'dasbor: babak milik sendiri tercatat');
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir({ acara: 'A2' }) });
  cek(r.s === 201 && data.foto.at(-1).acara_id === null, 'dasbor: babak pasangan lain dibuang, fotonya tetap masuk');

  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u2'), body: formulir() });
  cek(r.s === 409 && unggahan().length === 0, `dasbor: akun dua undangan wajib menyebut yang mana → ${r.s}`);
  r = await minta('/?pasangan=PAS2', { method: 'POST', headers: dasbor('jwt-u2'), body: formulir() });
  cek(r.s === 201 && data.foto.at(-1).pasangan_id === 'PAS2', 'dasbor: ?pasangan= milik sendiri diterima');
  r = await minta('/?pasangan=PAS9', { method: 'POST', headers: dasbor('jwt-u2'), body: formulir() });
  cek(r.s === 403, `dasbor: ?pasangan= milik orang lain ditolak → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u3'), body: formulir() });
  cek(r.s === 403, `dasbor: akun tanpa undangan ditolak → ${r.s}`);

  // ---------- pemeriksaan berkas ----------
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir({ tipe: 'image/png' }) });
  cek(r.s === 415 && unggahan().length === 0, `PNG ditolak sebelum naik → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir({ bita: 2 * 1024 * 1024 + 1 }) });
  cek(r.s === 413 && unggahan().length === 0, `lebih dari 2 MB ditolak → ${r.s}`);
  jumlahFotoPaksa = 100;
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: formulir() });
  cek(r.s === 409, `batas 100 foto → ${r.s}`);
  jumlahFotoPaksa = null;

  // ---------- video dan bagian (033) ----------
  const videoForm = ({ tipe = 'video/mp4', bita = 5000, poster = true, bagian, durasi = '4200' } = {}) => {
    const f = new FormData();
    f.append('berkas', new Blob([new Uint8Array(bita)], { type: tipe }), 'klip.mp4');
    if (poster) f.append('kecil', gambar(), 'poster.webp');
    f.append('lebar', '1920'); f.append('tinggi', '1080'); f.append('durasi_ms', durasi);
    if (bagian) f.append('bagian', bagian);
    return f;
  };
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ bagian: 'berdua' }) });
  let v = data.foto.at(-1);
  cek(r.s === 201 && v.jenis === 'video' && v.jalur.endsWith('.mp4') && v.jalur_kecil.endsWith('-kecil.webp')
      && v.bagian === 'berdua' && v.durasi_ms === 4200 && v.acara_id === null,
      `video MP4 + poster masuk ke bagian "berdua" → ${r.s} ${JSON.stringify(v)}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ tipe: 'video/webm' }) });
  cek(r.s === 201 && data.foto.at(-1).jalur.endsWith('.webm'), `video WebM diterima → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ poster: false }) });
  cek(r.s === 400 && unggahan().length === 0, `video tanpa poster ditolak sebelum naik → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ tipe: 'video/quicktime' }) });
  cek(r.s === 415 && unggahan().length === 0, `MOV ditolak → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ bita: 20 * 1024 * 1024 + 1 }) });
  cek(r.s === 413 && unggahan().length === 0, `video lebih dari 20 MB ditolak → ${r.s}`);
  r = await minta('/?untuk=silsilah&id=S1', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm() });
  cek(r.s === 415, `video tidak bisa jadi foto silsilah → ${r.s}`);
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm({ bagian: 'iklan', durasi: '999999999' }) });
  v = data.foto.at(-1);
  cek(r.s === 201 && v.bagian === null && v.durasi_ms === null, 'bagian di luar daftar dan durasi tak wajar dibuang, berkasnya tetap masuk');
  const fb = formulir({ acara: 'A1' }); fb.append('bagian', 'keluarga');
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: fb });
  v = data.foto.at(-1);
  cek(r.s === 201 && v.bagian === 'keluarga' && v.acara_id === null && v.jenis === 'foto',
      'foto dengan bagian: acara_id dikosongkan supaya satu berkas di satu tempat');
  const nVideo = data.foto.filter(f => f.jenis === 'video').length;
  data.foto.push(...Array.from({ length: 12 - nVideo }, (_, i) => ({ id: 'VX' + i, pasangan_id: 'PAS1', jenis: 'video', jalur: 'x' })));
  r = await minta('/', { method: 'POST', headers: dasbor('jwt-u1'), body: videoForm() });
  cek(r.s === 409 && /12 video/.test(r.isi?.pesan || '') && unggahan().length === 0, `batas 12 video per pasangan → ${r.s}`);
  data.foto = data.foto.filter(f => !String(f.id).startsWith('VX'));

  // ---------- R2: izin → PUT ke /media → catat ----------
  const json = (jwt, badan) => ({ method: 'POST', headers: { ...dasbor(jwt), 'Content-Type': 'application/json' }, body: JSON.stringify(badan) });
  const kirimMedia = async (u, isi) => (await fetch(MEDIA + u.url, { method: 'PUT', body: isi,
    headers: { 'content-type': u.jenis, ...u.kepala } })).status;
  r = await minta('/?langkah=izin', json('jwt-u4', {}));
  cek(r.s === 400, `izin tanpa jenis/ukuran → ${r.s}`);
  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'image/webp', bita: 1500 }, kecil: { jenis: 'image/webp', bita: 300 } }));
  const iz = r.isi;
  cek(r.s === 200 && iz.unggah.length === 2 && iz.jalur.startsWith(PASU + '/') && iz.unggah[0].url === '/media/' + iz.jalur
      && iz.unggah[1].jalur === iz.jalur_kecil && unggahan().length === 0,
      `izin: dua tiket, jalur di folder pasangannya, TIDAK ada yang naik ke Supabase → ${r.s}`);
  cek(!JSON.stringify(iz).includes(MEDIA_KUNCI), 'izin: rahasia tiket tidak ikut terkirim');
  cek(await kirimMedia(iz.unggah[0], new Uint8Array(1500)) === 201 && await kirimMedia(iz.unggah[1], new Uint8Array(300)) === 201,
      'tiket dari foto-unggah diterima Worker (format tanda tangan sama di dua sisi)');
  cek(await kirimMedia(iz.unggah[0], new Uint8Array(10)) === 409, 'tiket tidak bisa dipakai menimpa');
  r = await minta('/?langkah=catat', json('jwt-u4', { jalur: iz.jalur, jalur_kecil: iz.jalur_kecil, lebar: 1600, tinggi: 1200,
                                                       bagian: 'keluarga', bita: 1 }));
  let rf = data.foto.at(-1);
  cek(r.s === 201 && rf.pasangan_id === PASU && rf.jalur === iz.jalur && rf.jalur_kecil === iz.jalur_kecil
      && rf.bita === 1500 && rf.jenis === 'foto' && rf.bagian === 'keluarga',
      `catat: baris tercatat; ukuran dari R2 (1500), bukan dari peramban → ${r.s} ${JSON.stringify(rf)}`);
  r = await minta('/?langkah=catat', json('jwt-u1', { jalur: iz.jalur, jalur_kecil: iz.jalur_kecil }));
  cek(r.s === 400, `catat: jalur milik pasangan lain ditolak → ${r.s}`);
  r = await minta('/?langkah=catat', json('jwt-u4', { jalur: PASU + '/77777777-2222-4333-8444-555555555555.webp' }));
  cek(r.s === 409, `catat: berkas yang belum sampai di R2 ditolak → ${r.s}`);
  r = await minta('/?langkah=catat', json('jwt-u4', { jalur: iz.jalur, jalur_kecil: PASU + '/88888888-2222-4333-8444-555555555555-kecil.webp' }));
  cek(r.s === 400, `catat: thumbnail dari berkas lain ditolak → ${r.s}`);

  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'image/png', bita: 100 } }));
  cek(r.s === 415, `izin: PNG ditolak → ${r.s}`);
  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'image/webp', bita: 3 * 1024 * 1024 } }));
  cek(r.s === 413, `izin: foto > 2 MB ditolak → ${r.s}`);
  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'video/mp4', bita: 5000 } }));
  cek(r.s === 400, `izin: video tanpa poster ditolak → ${r.s}`);
  jumlahFotoPaksa = 100;
  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'image/webp', bita: 100 } }));
  cek(r.s === 409, `izin: batas 100 berkas → ${r.s}`);
  jumlahFotoPaksa = null;

  r = await minta('/?langkah=izin', json('jwt-u4', { berkas: { jenis: 'video/mp4', bita: 5000 }, kecil: { jenis: 'image/jpeg', bita: 200 } }));
  const iv = r.isi;
  await kirimMedia(iv.unggah[0], new Uint8Array(5000)); await kirimMedia(iv.unggah[1], new Uint8Array(200));
  r = await minta('/?langkah=catat', json('jwt-u4', { jalur: iv.jalur, jalur_kecil: iv.jalur_kecil, durasi_ms: 4200, acara_id: 'A1' }));
  rf = data.foto.at(-1);
  cek(r.s === 201 && rf.jenis === 'video' && rf.jalur.endsWith('.mp4') && rf.jalur_kecil.endsWith('-kecil.jpg')
      && rf.durasi_ms === 4200 && rf.acara_id === null,
      `video lewat R2: jenis dari R2, poster JPEG, acara pasangan lain dibuang → ${r.s}`);

  // silsilah lewat R2: foto lama ikut dibuang dari R2
  r = await minta('/?langkah=izin&untuk=silsilah&id=S1', json('jwt-u4', { berkas: { jenis: 'image/webp', bita: 100 } }));
  cek(r.s === 404, `izin silsilah: baris pasangan lain → ${r.s}`);
  r = await minta('/?langkah=izin&untuk=silsilah&id=S4', json('jwt-u4', { berkas: { jenis: 'image/webp', bita: 100 } }));
  const is = r.isi;
  await kirimMedia(is.unggah[0], new Uint8Array(100));
  r = await minta('/?langkah=catat&untuk=silsilah&id=S4', json('jwt-u4', { jalur: is.jalur, lebar: 400, tinggi: 400 }));
  const s4 = data.silsilah.find(b => b.id === 'S4');
  cek(r.s === 201 && s4.foto_jalur === is.jalur && !r2.isi.has(SIL_LAMA) && buangan().includes(SIL_LAMA),
      `silsilah lewat R2: baris menunjuk berkas baru; yang lama dibuang dari R2 dan Supabase → ${r.s}`);

  // hapus: R2 ikut dibersihkan
  const idR2 = data.foto.find(f => f.jalur === iz.jalur).id;
  r = await minta('/?id=' + idR2, { method: 'DELETE', headers: dasbor('jwt-u4') });
  cek(r.s === 200 && !r2.isi.has(iz.jalur) && !r2.isi.has(iz.jalur_kecil), `hapus: berkas dan thumbnail hilang dari R2 → ${r.s}`);

  // ---------- hapus ----------
  r = await minta('/?id=F2', { method: 'DELETE', headers: dasbor('jwt-u1') });
  cek(r.s === 404 && data.foto.some(f => f.id === 'F2') && buangan().length === 0, `dasbor: foto pasangan lain tidak bisa dihapus → ${r.s}`);
  r = await minta('/?id=F1', { method: 'DELETE', headers: dasbor('jwt-u1') });
  cek(r.s === 200 && !data.foto.some(f => f.id === 'F1'), `dasbor: hapus foto sendiri → ${r.s}`);
  cek(buangan().includes('PAS1/f1.webp') && buangan().includes('PAS1/f1-kecil.webp'), 'dasbor: berkas dan thumbnail ikut dibuang');
} finally {
  deno.kill(); tiruan.close(); media.close();
}

if (/error|uncaught/i.test(log) && gagal) console.log(log.slice(-2000));
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
