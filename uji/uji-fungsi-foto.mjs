// Edge function foto-unggah dijalankan sungguhan di Deno, dengan Supabase
// ditiru di belakangnya — bukan distub dari sisi peramban seperti suite
// lain. Yang diuji kodenya sendiri: siapa yang boleh masuk, ke pasangan
// mana barisnya jatuh, dan apa yang dibereskan kalau gagal di tengah.
//
// Bentuk permintaannya disalin dari halaman yang memanggilnya:
//   /kirim   silsilah, x-panitia-token + anon key
//   /dasbor  foto acara, JWT pemilik
//
// Butuh Deno: `deno` di PATH, atau DENO=/jalur/ke/deno.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const akar = fileURLToPath(new URL('..', import.meta.url));
let lulus = 0, gagal = 0;
const cek = (ok, pesan) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}`); };

const DENO = process.env.DENO || 'deno';
try { execFileSync(DENO, ['--version'], { stdio: 'ignore' }); }
catch { console.log('GAGAL  deno tidak ditemukan — isi DENO=/jalur/ke/deno'); console.log('0 lulus, 1 gagal'); process.exit(1); }

// ---------- Supabase tiruan ----------
const ANON = 'kunci-anon';
const data = {
  pengguna: { 'jwt-u1': 'U1', 'jwt-u2': 'U2', 'jwt-u3': 'U3' },
  pemilik:  [{ user_id: 'U1', pasangan_id: 'PAS1' },
             { user_id: 'U2', pasangan_id: 'PAS1' }, { user_id: 'U2', pasangan_id: 'PAS2' }],
  acara:    [{ id: 'A1', pasangan_id: 'PAS1' }, { id: 'A2', pasangan_id: 'PAS2' }],
  silsilah: [{ id: 'S1', pasangan_id: 'PAS1', foto_jalur: 'PAS1/lama.webp', foto_kecil: 'PAS1/lama-kecil.webp' },
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

// ---------- fungsinya, di Deno ----------
const PORT = 18000 + Math.floor(Math.random() * 1000);
const deno = spawn(DENO, ['run', '--allow-net', '--allow-env', '--quiet',
  'supabase/functions/foto-unggah/index.ts'], {
  cwd: akar,
  env: { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'kunci-servis',
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
  // ---------- /kirim: silsilah lewat token panitia ----------
  let r = await minta('/?untuk=silsilah&id=S1', { method: 'POST', headers: kirim({ 'x-panitia-token': 'tok-penuh' }), body: formulir() });
  const s1 = data.silsilah.find(b => b.id === 'S1');
  cek(r.s === 201 && r.isi?.silsilah?.id === 'S1', `kirim: unggah foto silsilah → ${r.s}`);
  cek(s1.foto_jalur.startsWith('PAS1/') && s1.foto_jalur !== 'PAS1/lama.webp', 'kirim: baris silsilah menunjuk berkas baru di folder pasangannya');
  cek(unggahan().length === 2, 'kirim: berkas penuh dan thumbnail sama-sama naik');
  cek(buangan().includes('PAS1/lama.webp') && buangan().includes('PAS1/lama-kecil.webp'), 'kirim: foto lama dibuang dari bucket');
  cek(!jejak.some(j => j.p === '/auth/v1/user'), 'kirim: jalur token tidak menyentuh Auth');

  r = await minta('/?untuk=silsilah&id=S2', { method: 'POST', headers: kirim({ 'x-panitia-token': 'tok-penuh' }), body: formulir() });
  cek(r.s === 404, `kirim: baris silsilah pasangan lain ditolak → ${r.s}`);
  cek(data.silsilah.find(b => b.id === 'S2').foto_jalur === null, 'kirim: baris pasangan lain tidak tersentuh');
  cek(buangan().length === 2, 'kirim: berkas yang terlanjur naik dibereskan');

  r = await minta('/?untuk=silsilah&id=S1', { method: 'POST', headers: kirim({ 'x-panitia-token': 'tok-pihak' }), body: formulir() });
  cek(r.s === 403 && unggahan().length === 0, `kirim: link per-pihak ditolak sebelum apa pun naik → ${r.s}`);

  r = await minta('/?untuk=silsilah&id=S1', { method: 'DELETE', headers: kirim({ 'x-panitia-token': 'tok-penuh' }) });
  cek(r.s === 200 && data.silsilah.find(b => b.id === 'S1').foto_jalur === null, `kirim: lepas foto silsilah → ${r.s}`);

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

  // ---------- hapus ----------
  r = await minta('/?id=F2', { method: 'DELETE', headers: dasbor('jwt-u1') });
  cek(r.s === 404 && data.foto.some(f => f.id === 'F2') && buangan().length === 0, `dasbor: foto pasangan lain tidak bisa dihapus → ${r.s}`);
  r = await minta('/?id=F1', { method: 'DELETE', headers: dasbor('jwt-u1') });
  cek(r.s === 200 && !data.foto.some(f => f.id === 'F1'), `dasbor: hapus foto sendiri → ${r.s}`);
  cek(buangan().includes('PAS1/f1.webp') && buangan().includes('PAS1/f1-kecil.webp'), 'dasbor: berkas dan thumbnail ikut dibuang');
} finally {
  deno.kill(); tiruan.close();
}

if (/error|uncaught/i.test(log) && gagal) console.log(log.slice(-2000));
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
