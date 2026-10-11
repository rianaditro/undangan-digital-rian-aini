// bersih-storage di Deno, dengan Supabase Storage dan Worker /media
// tiruan. Yang dipastikan: hanya berkas yang ada di R2 dengan ukuran sama
// yang dihapus; bawaannya cuma laporan; hanya service role.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const akar = fileURLToPath(new URL('..', import.meta.url));
let lulus = 0, gagal = 0;
const cek = (ok, pesan, k) => { ok ? lulus++ : gagal++; console.log(`${ok ? 'ok   ' : 'GAGAL'}  ${pesan}${!ok && k ? '  — ' + k : ''}`); };
const DENO = process.env.DENO || 'deno';
try { execFileSync(DENO, ['--version'], { stdio: 'ignore' }); }
catch { console.log('GAGAL  deno tidak ditemukan — isi DENO=/jalur/ke/deno'); console.log('0 lulus, 1 gagal'); process.exit(1); }

const SERVIS = 'kunci-servis-uji';
const P = '6b161239-b345-4558-9e16-83961276a564';
let simpanan = { [`${P}/a.webp`]: 100, [`${P}/b.webp`]: 200, [`${P}/c.webp`]: 300, [`${P}/d.webp`]: 400 };
const r2 = { [`${P}/a.webp`]: 100, [`${P}/b.webp`]: 999 /* beda ukuran */ };   // c: belum tersalin → disalin saat HEAD
const dihapus = [];
const sb = http.createServer(async (req, res) => {
  let badan = ''; for await (const c of req) badan += c;
  const json = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url.startsWith('/storage/v1/object/list/foto')) {
    const { prefix } = JSON.parse(badan);
    if (!prefix) return json(200, [{ name: P, id: null, metadata: null }]);
    return json(200, Object.entries(simpanan).filter(([k]) => k.startsWith(prefix + '/'))
      .map(([k, v]) => ({ name: k.slice(prefix.length + 1), id: 'x', metadata: { size: v } })));
  }
  if (req.method === 'DELETE' && req.url.startsWith('/storage/v1/object/foto')) {
    const { prefixes } = JSON.parse(badan);
    prefixes.forEach(p => { dihapus.push(p); delete simpanan[p]; });
    return json(200, prefixes.map(name => ({ name })));
  }
  json(404, {});
});
await new Promise(r => sb.listen(0, '127.0.0.1', r));
const media = http.createServer((req, res) => {
  const k = decodeURIComponent(req.url.replace('/media/', ''));
  if (!(k in r2) && k.endsWith('c.webp')) r2[k] = simpanan[k];      // salin malas
  if (!(k in r2)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-length': String(r2[k]) }); res.end();
});
await new Promise(r => media.listen(0, '127.0.0.1', r));

const port = 19900 + Math.floor(Math.random() * 90);
const p = spawn(DENO, ['run', '--allow-net', '--allow-env', '--quiet', 'supabase/functions/bersih-storage/index.ts'], {
  cwd: akar, env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${sb.address().port}`, SUPABASE_SERVICE_ROLE_KEY: SERVIS,
    MEDIA_ASAL: `http://127.0.0.1:${media.address().port}`, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}` } });
let log = ''; p.stderr.on('data', d => log += d);
const FN = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) { try { await fetch(FN, { method: 'OPTIONS' }); break; } catch { if (i > 300) { console.log(log); process.exit(1); } await new Promise(r => setTimeout(r, 100)); } }

try {
  let r = await fetch(FN, { headers: { Authorization: 'Bearer kunci-anon' } });
  cek(r.status === 403, 'anon key ditolak');
  r = await fetch(FN, { headers: { Authorization: 'Bearer ' + SERVIS } });
  let j = await r.json();
  cek(r.status === 200 && j.aman_dihapus === 2 && j.terhapus === 0 && dihapus.length === 0,
      'bawaan laporan saja: 2 aman (a, c yang baru tersalin), tidak ada yang dihapus', JSON.stringify(j));
  cek(j.tidak_aman.map(x => x.jalur.split('/')[1]).sort().join(',') === 'b.webp,d.webp',
      'tidak aman: b (ukuran di R2 beda), d (tidak ada di R2)', JSON.stringify(j.tidak_aman));
  r = await fetch(FN + '/?jalankan=1', { headers: { Authorization: 'Bearer ' + SERVIS } });
  j = await r.json();
  cek(r.status === 200 && j.terhapus === 2 && dihapus.sort().join(',') === `${P}/a.webp,${P}/c.webp`
      && `${P}/b.webp` in simpanan && `${P}/d.webp` in simpanan,
      '?jalankan=1: hanya a dan c dihapus; b dan d tetap di Supabase', JSON.stringify({ j, dihapus }));
} finally { p.kill(); sb.close(); media.close(); }
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
