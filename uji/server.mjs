// Peniru Cloudflare Workers seadanya — cukup untuk uji.
//
// Yang ditiru bukan tebakan: setiap aturan di bawah dicocokkan dengan
// `wrangler dev` (workerd sungguhan) terhadap konfigurasi repo ini.
// Satu hal yang TIDAK bisa diuji di wrangler dev: ia mengganti host
// setiap permintaan dengan host rute pertama, jadi Worker selalu
// melihat "mengundang.id". Karena itu keputusan berdasarkan host diuji
// di sini, dengan menjalankan modul Worker yang sama persis
// (cloudflare/pintu.js) dan host yang benar-benar dikirim.
//
// Urutan Cloudflare:
//   1. run_worker_first cocok → Worker dulu; Worker memanggil ASSETS.
//   2. selain itu lapisan aset:
//        berkas apa adanya, kirim/ → kirim/index.html (tanpa garis
//        miring), /kirim/ → 307 /kirim, /x/index.html → 307 /x
//   3. tidak ada berkas → index.html, 200 (single-page-application)
//   4. _headers dipasang di atas jawaban aset.
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

// Akar repo, satu tingkat di atas folder uji ini — bukan jalur absolut,
// supaya suite jalan di komputer siapa pun yang meng-clone repo.
const AKAR = path.resolve(new URL('.', import.meta.url).pathname, '..');

const konf = JSON.parse(fs.readFileSync(path.join(AKAR, 'wrangler.jsonc'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, ''));
const ASET = path.resolve(AKAR, konf.assets.directory);
const pintu = (await import(path.join(AKAR, konf.main))).default;

// .assetsignore: setiap baris nama — cocok di tingkat mana pun, seperti
// .gitignore tanpa garis miring.
const ABAIKAN = new Set(['_headers', '_redirects', ...fs.readFileSync(path.join(ASET, '.assetsignore'), 'utf8')
  .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))]);
const diabaikan = p => p.split('/').some(s => ABAIKAN.has(s));

// _headers: baris tanpa indentasi = pola jalur, berindentasi = header.
const HEADERS = [];
for (const baris of fs.readFileSync(path.join(ASET, '_headers'), 'utf8').split('\n')) {
  if (!baris.trim() || baris.trim().startsWith('#')) continue;
  if (!/^\s/.test(baris)) {
    const re = new RegExp('^' + baris.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    HEADERS.push({ re, isi: [] });
  } else {
    const i = baris.indexOf(':');
    HEADERS.at(-1).isi.push([baris.slice(0, i).trim(), baris.slice(i + 1).trim()]);
  }
}

const POLA_WORKER = (konf.assets.run_worker_first || []).map(p =>
  new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));

const MIME = {'.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8',
  '.css':'text/css;charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.mjs':'text/javascript;charset=utf-8', '.woff2':'font/woff2'};

const adaBerkas = rel => !diabaikan(rel) && fs.existsSync(path.join(ASET, rel))
                         && fs.statSync(path.join(ASET, rel)).isFile();

// → { berkas } | { alih } | null
function cariAset(p) {
  if (p === '/') return { berkas: 'index.html' };
  const rel = p.slice(1);
  if (p.endsWith('/index.html') && adaBerkas(rel)) return { alih: p.slice(0, -'/index.html'.length) || '/' };
  if (p.endsWith('.html') && adaBerkas(rel)) return { alih: p.slice(0, -'.html'.length) };
  if (p.endsWith('/')) {
    const dasar = rel.slice(0, -1);
    if (adaBerkas(dasar + '/index.html') || adaBerkas(dasar + '.html')) return { alih: '/' + dasar };
    return null;
  }
  if (adaBerkas(rel)) return { berkas: rel };
  if (adaBerkas(rel + '/index.html')) return { berkas: rel + '/index.html' };
  if (adaBerkas(rel + '.html')) return { berkas: rel + '.html' };
  return null;
}

const ASSETS = {
  async fetch(req) {
    const u = new URL(req.url);
    let p;
    try { p = decodeURIComponent(u.pathname); } catch { p = u.pathname; }
    const hasil = cariAset(p) || { berkas: 'index.html' };
    if (hasil.alih) return new Response(null, { status: 307, headers: { Location: hasil.alih + u.search } });
    const h = new Headers({ 'Content-Type': MIME[path.extname(hasil.berkas)] || 'application/octet-stream' });
    for (const aturan of HEADERS) if (aturan.re.test(p)) for (const [k, v] of aturan.isi) h.set(k, v);
    return new Response(fs.readFileSync(path.join(ASET, hasil.berkas)), { status: 200, headers: h });
  }
};

export function mulai(port){
  const srv = http.createServer(async (req, res) => {
    const host = req.headers.host || ('127.0.0.1:' + port);
    const permintaan = new Request('http://' + host + req.url, { method: req.method, headers: req.headers });
    const p = new URL(permintaan.url).pathname;
    let jwb;
    try {
      jwb = POLA_WORKER.some(re => re.test(p))
        ? await pintu.fetch(permintaan, { ASSETS })
        : await ASSETS.fetch(permintaan);
    } catch (e) {
      res.writeHead(500); return res.end(String(e));
    }
    res.writeHead(jwb.status, Object.fromEntries(jwb.headers));
    res.end(Buffer.from(await jwb.arrayBuffer()));
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', ()=>r(srv)));
}
