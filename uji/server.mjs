// Peniru Vercel seadanya: BERKAS DULU, baru rewrites. Urutan itu yang
// dulu bikin /assets/varian.js disajikan sebagai HTML di harness lama.
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

// Akar repo, satu tingkat di atas folder uji ini — bukan jalur absolut,
// supaya suite jalan di komputer siapa pun yang meng-clone repo.
const AKAR = path.resolve(new URL('.', import.meta.url).pathname, '..');
const konf = JSON.parse(fs.readFileSync(path.join(AKAR,'vercel.json'),'utf8'));
const rewrites = konf.rewrites || [];
const redirects = konf.redirects || [];

// Urutan Vercel: redirects DULU, baru berkas, baru rewrites. Urutan itu
// yang membuat redirect '/' bisa bekerja sementara rewrite '/' tidak —
// index.html ada di akar, jadi berkasnya keburu ketemu.
function cocokHas(r, req){
  if (!Array.isArray(r.has)) return true;
  const host = (req.headers.host || '').split(':')[0];
  return r.has.every(h => h.type === 'host' ? h.value === host : false);
}

const MIME = {'.html':'text/html;charset=utf-8', '.js':'text/javascript;charset=utf-8',
  '.css':'text/css;charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.mjs':'text/javascript;charset=utf-8', '.woff2':'font/woff2'};

function kirimBerkas(res, f){
  const b = fs.readFileSync(f);
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  res.end(b);
}

export function mulai(port){
  const srv = http.createServer((req,res)=>{
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);

    // 0. redirects, sebelum apa pun
    for (const r of redirects){
      if (!cocokHas(r, req)) continue;
      const re = new RegExp('^' + r.source.replace(/\/$/, '\\/?') + '$');
      if (re.test(p)){
        res.writeHead(r.permanent ? 308 : 307, { Location: r.destination });
        return res.end();
      }
    }

    // 1. berkas apa adanya
    let f = path.join(AKAR, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return kirimBerkas(res, f);
    // 2. direktori → index.html
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()){
      const i = path.join(f,'index.html');
      if (fs.existsSync(i)) return kirimBerkas(res, i);
    }
    // 3. baru rewrites, berurutan
    for (const r of rewrites){
      // `has` host disaring seperti Vercel: aturan akar domain apex tidak
      // boleh mengenai subdomain pasangan
      if (!cocokHas(r, req)) continue;
      const re = new RegExp('^' + r.source.replace(/\/$/, '\\/?') + '$');
      if (re.test(p)){
        const d = path.join(AKAR, r.destination);
        if (fs.existsSync(d)) return kirimBerkas(res, d);
      }
    }
    res.writeHead(404); res.end('404');
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', ()=>r(srv)));
}
