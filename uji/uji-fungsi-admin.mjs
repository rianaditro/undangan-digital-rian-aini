// Edge function admin-pasangan dijalankan sungguhan di Deno, dengan
// Supabase (REST + Auth admin) ditiru di belakangnya — pola yang sama
// dengan uji-fungsi-foto. Yang diuji: siapa yang boleh, apa yang dibuat,
// dan apa yang dibereskan kalau gagal di tengah.
//
// Butuh Deno: `deno` di PATH, atau DENO=/jalur/ke/deno.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const akar = fileURLToPath(new URL('..', import.meta.url));
let lulus = 0, gagal = 0;
const cek = (ok, pesan) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}`); };

const DENO = process.env.DENO || 'deno';
try { execFileSync(DENO, ['--version'], { stdio: 'ignore' }); }
catch { console.log('GAGAL  deno tidak ditemukan — isi DENO=/jalur/ke/deno'); console.log('0 lulus, 1 gagal'); process.exit(1); }

// ---------- Supabase tiruan ----------
let data, jejak = [], undanganGagal = false, lunaskanGagal = false;
function awal() {
  data = {
    jwt:   { 'jwt-owner': 'OWNER', 'jwt-admin': 'ADMIN', 'jwt-biasa': 'BIASA' },
    users: [{ id: 'OWNER', email: 'owner@contoh.com' }, { id: 'ADMIN', email: 'admin@contoh.com' },
            { id: 'BIASA', email: 'biasa@contoh.com' }, { id: 'LAMA', email: 'lama@contoh.com' }],
    admin: [{ user_id: 'OWNER', peran: 'owner' }, { user_id: 'ADMIN', peran: 'admin' }],
    reseller: [{ id: 'R1', user_id: 'X', kode: '123', nama: 'A' }],
    pesanan: [
      { id: 'S1', nomor: 1, status: 'menunggu', slug: 'budi-sari', email_klien: 'baru@contoh.com', pria: 'Budi', wanita: 'Sari' },
      { id: 'S2', nomor: 2, status: 'lunas',    slug: 'eko-fitri', email_klien: 'baru@contoh.com', pria: 'Eko', wanita: 'Fitri' },
      { id: 'S3', nomor: 3, status: 'menunggu', slug: 'dodi-rina', email_klien: 'lama@contoh.com', pria: 'Dodi', wanita: 'Rina' },
    ],
    pasangan: [{ id: 'PAS0', slug: 'rian-aini', canonical_host: 'rian-aini.mengundang.id' }],
    panitia_akses: [], pemilik: [],
  };
  undanganGagal = false; lunaskanGagal = false;
}
awal();

const saring = (baris, q) => baris.filter(b =>
  [...q].every(([k, v]) => ['select', 'order'].includes(k) || !v.startsWith('eq.') || String(b[k]) === v.slice(3)));

const tiruan = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let badan = '';
  for await (const c of req) badan += c;
  jejak.push({ m: req.method, p: u.pathname, q: u.search, badan });
  const json = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const isi = badan ? JSON.parse(badan) : {};

  if (u.pathname === '/auth/v1/user') {
    const id = data.jwt[(req.headers.authorization || '').replace(/^Bearer /, '')];
    return id ? json(200, { id, aud: 'authenticated' }) : json(401, { msg: 'invalid JWT' });
  }
  if (u.pathname === '/auth/v1/admin/users' && req.method === 'GET')
    return json(200, { users: data.users, aud: 'authenticated' });
  if (u.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
    const baru = { id: randomUUID(), email: isi.email };
    data.users.push(baru); return json(200, baru);
  }
  if (u.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
    const id = u.pathname.split('/').pop();
    data.users = data.users.filter(x => x.id !== id); return json(200, {});
  }
  if (u.pathname === '/auth/v1/invite') {
    if (undanganGagal) return json(500, { code: 500, msg: 'Error sending invite email' });
    const baru = { id: randomUUID(), email: isi.email };
    data.users.push(baru); return json(200, baru);
  }
  if (u.pathname === '/rest/v1/rpc/pesanan_lunaskan') {
    if (lunaskanGagal) return json(400, { message: 'Slug "budi-sari" sudah dipakai pasangan lain' });
    const s = data.pesanan.find(x => x.id === isi.p_id);
    s.status = 'lunas';
    data.pasangan.push({ id: 'PASB', slug: s.slug, canonical_host: null });
    data.panitia_akses.push({ pasangan_id: 'PASB', nama: 'Pengantin', token: 'tok', pihak: null });
    return json(200, 'PASB');
  }
  const tabel = u.pathname.replace('/rest/v1/', '');
  if (!data[tabel]) return json(404, { message: 'tabel ' + tabel });
  const satu = (req.headers.accept || '').includes('vnd.pgrst.object');
  if (req.method === 'GET') {
    const b = saring(data[tabel], u.searchParams);
    if (satu) return b.length === 1 ? json(200, b[0]) : json(406, { message: '0 baris' });
    return json(200, b);
  }
  if (req.method === 'POST') {
    if (tabel === 'admin' && data.admin.some(a => a.user_id === isi.user_id))
      return json(409, { code: '23505', message: 'duplicate key' });
    if (tabel === 'reseller' && data.reseller.some(a => a.user_id === isi.user_id))
      return json(409, { code: '23505', message: 'duplicate key' });
    data[tabel].push(isi); res.writeHead(201); return res.end();
  }
  json(405, {});
});
await new Promise(r => tiruan.listen(0, '127.0.0.1', r));
const SB = `http://127.0.0.1:${tiruan.address().port}`;

// ---------- fungsinya, di Deno ----------
const PORT = 19000 + Math.floor(Math.random() * 1000);
const deno = spawn(DENO, ['run', '--allow-net', '--allow-env', '--quiet',
  'supabase/functions/admin-pasangan/index.ts'], {
  cwd: akar,
  env: { ...process.env, SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'kunci-servis',
         DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${PORT}` },
});
let log = '';
deno.stdout.on('data', d => log += d); deno.stderr.on('data', d => log += d);
const FN = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try { await fetch(FN, { method: 'OPTIONS' }); break; }
  catch { if (i > 300) { console.log(log); throw new Error('admin-pasangan tidak menyala'); } await new Promise(r => setTimeout(r, 100)); }
}

async function minta(jwt, badan) {
  jejak = [];
  const r = await fetch(FN, { method: 'POST', body: JSON.stringify(badan),
    headers: { 'Authorization': 'Bearer ' + jwt, 'content-type': 'application/json' } });
  let isi = null; try { isi = await r.json(); } catch {}
  return { s: r.status, isi };
}
const ada = (p) => jejak.some(j => j.p === p);

try {
  // ---------- pintu ----------
  let r = await minta('jwt-biasa', { aksi: 'konfirmasi', pesanan_id: 'S1', nominal: 1, komisi: 0 });
  cek(r.s === 403, `akun bukan admin ditolak → ${r.s}`);

  r = await minta('jwt-admin', { aksi: 'reseller', email: 'r@contoh.com', sandi: 'sandipanjang1', kode: 'abc', nama: 'R' });
  cek(r.s === 403 && !ada('/auth/v1/admin/users'), `admin biasa tidak boleh membuat reseller, tanpa akun terbuat → ${r.s}`);
  r = await minta('jwt-admin', { aksi: 'admin', email: 'x@contoh.com', sandi: 'sandipanjang1' });
  cek(r.s === 403, `admin biasa tidak boleh membuat admin → ${r.s}`);

  // ---------- reseller dan admin oleh owner ----------
  r = await minta('jwt-owner', { aksi: 'reseller', email: 'Jepara@Contoh.com', sandi: 'sandipanjang1',
                                 kode: 'JEPARA', nama: 'Percetakan Jepara', rekening: 'BCA 123' });
  const rs = data.reseller.find(x => x.kode === 'jepara');
  cek(r.s === 201 && rs && data.users.some(u => u.id === rs.user_id && u.email === 'jepara@contoh.com') && rs.rekening === 'BCA 123',
      `owner membuat reseller: akun + baris reseller, kode dan email dirapikan → ${r.s}`);
  r = await minta('jwt-owner', { aksi: 'reseller', email: 'lain@contoh.com', sandi: 'sandipanjang1', kode: '123', nama: 'B' });
  cek(r.s === 409 && !data.users.some(u => u.email === 'lain@contoh.com'), `kode kembar ditolak sebelum akun dibuat → ${r.s}`);
  r = await minta('jwt-owner', { aksi: 'admin', email: 'staf@contoh.com', sandi: 'pendek' });
  cek(r.s === 400 && !data.users.some(u => u.email === 'staf@contoh.com'), `sandi pendek ditolak → ${r.s}`);
  r = await minta('jwt-owner', { aksi: 'admin', email: 'staf@contoh.com', sandi: 'sandipanjang1', nama: 'Staf' });
  const ad = data.admin.find(a => data.users.find(u => u.id === a.user_id)?.email === 'staf@contoh.com');
  cek(r.s === 201 && ad?.peran === 'admin', `owner membuat admin berperan 'admin', bukan owner → ${r.s}`);
  r = await minta('jwt-owner', { aksi: 'admin', email: 'admin@contoh.com', sandi: 'x' });
  cek(r.s === 400 && /sudah admin/.test(r.isi?.pesan || '') && data.users.some(u => u.id === 'ADMIN'),
      `admin yang sudah ada: ditolak, akunnya tidak dihapus → ${r.s}`);

  // ---------- konfirmasi: undangan surel ----------
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S2', nominal: 1, komisi: 0 });
  cek(r.s === 409, `pesanan yang sudah lunas ditolak → ${r.s}`);
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S1', nominal: 159000.5, komisi: 0 });
  cek(r.s === 400 && !ada('/auth/v1/invite'), `nominal pecahan ditolak sebelum apa pun → ${r.s}`);

  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S1', nominal: 159000, komisi: 65000 });
  const undang = jejak.find(j => j.p === '/auth/v1/invite');
  const lunas = jejak.find(j => j.p === '/rest/v1/rpc/pesanan_lunaskan');
  cek(r.s === 201 && r.isi?.diundang === true && r.isi?.sandi === null && r.isi?.akun_baru === true,
      `klien baru diundang lewat surel, tanpa sandi di layar admin → ${r.s} ${JSON.stringify(r.isi)}`);
  cek(undang && decodeURIComponent(undang.q).includes('redirect_to=https://mengundang.id/dasbor'),
      `tautan undangan mengarah ke /dasbor → ${undang?.q}`);
  cek(lunas && JSON.parse(lunas.badan).p_oleh === 'ADMIN' && JSON.parse(lunas.badan).p_komisi === 65000,
      'pesanan_lunaskan dipanggil dengan nominal, komisi, dan siapa yang mengonfirmasi');
  cek(r.isi?.token?.length === 1 && r.isi?.slug === 'budi-sari', 'jawabannya membawa link panitia untuk serah-terima');

  // ---------- konfirmasi: surel gagal → sandi cadangan ----------
  awal(); undanganGagal = true;
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S1', nominal: 159000, komisi: 0 });
  const dibuat = data.users.find(u => u.email === 'baru@contoh.com');
  cek(r.s === 201 && r.isi?.diundang === false && /^[A-Za-z2-9]{14}$/.test(r.isi?.sandi || '') && dibuat,
      `surel gagal: akun dibuat dengan sandi acak 14 huruf untuk diserahkan manual → ${r.s}`);

  // ---------- konfirmasi: database menolak → akun baru dibuang ----------
  awal(); lunaskanGagal = true;
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S1', nominal: 159000, komisi: 0 });
  cek(r.s === 400 && !data.users.some(u => u.email === 'baru@contoh.com') && ada('/auth/v1/invite'),
      `pesanan_lunaskan gagal: akun yang baru diundang dihapus lagi → ${r.s}`);

  // ---------- konfirmasi: email klien sudah punya akun ----------
  awal(); lunaskanGagal = true;
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S3', nominal: 69000, komisi: 0 });
  cek(r.s === 400 && data.users.some(u => u.id === 'LAMA'), 'gagal dengan akun lama: akun lama TIDAK dihapus');
  awal();
  r = await minta('jwt-admin', { aksi: 'konfirmasi', pesanan_id: 'S3', nominal: 69000, komisi: 0 });
  cek(r.s === 201 && r.isi?.akun_baru === false && r.isi?.diundang === false && !ada('/auth/v1/invite'),
      `akun lama dipakai, tidak diundang ulang → ${r.s}`);
} finally {
  deno.kill(); tiruan.close();
}
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
