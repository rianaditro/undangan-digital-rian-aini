#!/usr/bin/env node
// Aturan kompatibilitas: database baru harus tetap bisa melayani halaman
// yang sedang tayang.
//
// Produksi dan pengembangan memakai satu database. Migrasi dari cabang
// mana pun langsung mengenai halaman di `main` — begitulah 021/022
// mematahkan buku tamu dan nama tamu di September. Alat ini membaca semua
// panggilan Supabase di halaman pada satu ref git (bawaan: origin/main),
// lalu memeriksa skema hasil bangun.sh: fungsinya masih ada, nama
// argumennya masih cocok, argumen wajibnya dikirim, perannya masih boleh
// menjalankan, kolom tabelnya masih ada.
//
//   PGURL=postgres://.../bangun node uji/db/kompat.mjs [ref ...]
//
// Keluar 1 kalau ada satu saja panggilan yang akan patah.
//
// Pembacaannya statis dan sengaja sempit: hanya bentuk panggilan yang
// memang dipakai di repo ini — fetch('/rest/v1/rpc/x', {body:
// JSON.stringify({...})}), rpc('x', {...}), api('tabel?...', {...}), dan
// fetch('/rest/v1/' + TABEL). Panggilan yang tidak terbaca dilaporkan,
// bukan dilewati diam-diam.

import { execFileSync } from 'node:child_process';

const PGURL = process.env.PGURL;
if (!PGURL) { console.error('PGURL belum diisi (database hasil bangun.sh)'); process.exit(2); }
const refs = process.argv.slice(2);
if (!refs.length) refs.push('origin/main');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const sql = (q) => execFileSync('psql', [PGURL, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' });

// ---------- membaca kode ----------

// Ambil isi { ... } yang dimulai di posisi `i` (harus '{'), sadar string.
function ambilObjek(s, i) {
  let d = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') d++;
    else if (c === '}' || c === ')' || c === ']') { d--; if (d === 0) return s.slice(i, j + 1); }
  }
  return null;
}

// Kunci tingkat pertama dari teks objek literal.
function kunci(obj) {
  const out = []; let d = 0, q = null, awal = true;
  for (let j = 0; j < obj.length; j++) {
    const c = obj[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('{(['.includes(c)) { d++; if (d === 1) awal = true; continue; }
    if ('})]'.includes(c)) { d--; continue; }
    if (d !== 1) continue;
    if (c === ',') { awal = true; continue; }
    if (awal && /[A-Za-z_]/.test(c)) {
      const m = /^([A-Za-z_]\w*)\s*:/.exec(obj.slice(j));
      if (m) out.push(m[1]);
      awal = false;
    } else if (!/\s/.test(c)) awal = false;
  }
  return out;
}

const baris = (s, i) => s.slice(0, i).split('\n').length;

function bacaRef(ref) {
  const berkas = git('ls-tree', '-r', '--name-only', ref).split('\n')
    .filter(f => /\.(html|js|mjs)$/.test(f) && !/^(uji|alat|supabase|docs)\//.test(f));
  const panggilan = [], gagal = [];
  for (const f of berkas) {
    const s = git('show', `${ref}:${f}`);
    let m;

    // fetch(... '/rest/v1/rpc/nama', { ... body: JSON.stringify({...}) })
    const reFetch = /\/rest\/v1\/rpc\/([a-z_]\w*)['"`]/g;
    while ((m = reFetch.exec(s))) {
      const sisa = s.slice(m.index, m.index + 1500);
      const b = /JSON\.stringify\(\s*\{/.exec(sisa);
      const obj = b && ambilObjek(sisa, b.index + b[0].length - 1);
      if (!obj) { gagal.push(`${f}:${baris(s, m.index)} rpc/${m[1]} — argumen tidak terbaca`); continue; }
      // Peran ditentukan header Authorization yang benar-benar dikirim:
      // anon key (M.SB.key, SB_KEY, …) atau tanpa Authorization sendiri
      // → anon; selain itu (JWT sesi pemilik) → authenticated.
      const auth = /Authorization['"]?\s*:\s*([^,\n}]+)/i.exec(sisa.slice(0, b.index));
      const peran = auth && !/key/i.test(auth[1]) ? 'authenticated' : 'anon';
      panggilan.push({ jenis: 'rpc', nama: m[1], arg: kunci(obj), peran, di: `${f}:${baris(s, m.index)}` });
    }

    // rpc('nama', {...})  — bentuk pembantu di /kirim dan /dasbor
    const reRpc = /\brpc\(\s*'([a-z_]\w*)'\s*,\s*\{/g;
    while ((m = reRpc.exec(s))) {
      const obj = ambilObjek(s, m.index + m[0].length - 1);
      if (!obj) { gagal.push(`${f}:${baris(s, m.index)} rpc(${m[1]}) — argumen tidak terbaca`); continue; }
      // Pembantu rpc() di /kirim selalu memakai anon key + token panitia.
      panggilan.push({ jenis: 'rpc', nama: m[1], arg: kunci(obj), peran: 'anon', di: `${f}:${baris(s, m.index)}` });
    }

    // Panggilan tabel. Dua bentuk: lewat pembantu api() milik /kirim dan
    // /dasbor (membawa JWT, peran authenticated), dan fetch langsung ke
    // /rest/v1/tabel dengan kunci anon — bentuk lama buku tamu, yang patah
    // ketika 021 mencabut kebijakan anon di ucapan.
    const tabel = (nama, qs, opsi, peran, di) => {
      const kol = [], rel = [];
      const q = new URLSearchParams((qs || '').replace(/^\?/, ''));
      const sel = q.get('select');
      if (sel) {
        // a,b,rel(c,d) → kolom a,b di tabel; c,d di rel
        let d = 0, cur = '', relNama = null, relKol = [];
        for (const c of sel + ',') {
          if (c === '(') { d++; relNama = cur.trim(); cur = ''; continue; }
          if (c === ')') { d--; if (cur.trim()) relKol.push(cur.trim()); rel.push([relNama, relKol]); relKol = []; cur = ''; continue; }
          if (c === ',') { if (cur.trim()) (d ? relKol : kol).push(cur.trim()); cur = ''; continue; }
          cur += c;
        }
      }
      let upsert = false;
      for (const [k, v] of q) {
        if (k === 'on_conflict') { kol.push(...v.split(',')); upsert = true; }
        else if (!['select', 'order', 'limit', 'offset'].includes(k)) kol.push(k);
      }
      const b = opsi && /body:\s*JSON\.stringify\(\s*\{/.exec(opsi);
      const obj = b && ambilObjek(opsi, b.index + b[0].length - 1);
      if (obj) kol.push(...kunci(obj));
      const metode = ((opsi && /method:\s*['"](\w+)['"]/.exec(opsi)) || [, 'GET'])[1].toUpperCase();
      const perintah = { GET: ['SELECT'], POST: upsert ? ['INSERT', 'UPDATE'] : ['INSERT'],
                         PATCH: ['UPDATE'], DELETE: ['DELETE'] }[metode] || ['SELECT'];
      panggilan.push({ jenis: 'tabel', nama, kolom: [...new Set(kol)], perintah, peran, di });
      for (const [r, k] of rel) panggilan.push({ jenis: 'tabel', nama: r, kolom: k, perintah: ['SELECT'], peran, di: di + ' (embed)' });
    };

    // api('tabel?select=a,b,rel(c,d)&on_conflict=x,y', { method, body })
    const reApi = /\bapi\(\s*'([a-z_]\w*)(\?[^']*)?'\s*(,\s*\{)?/g;
    while ((m = reApi.exec(s))) {
      if (m[1] === 'rpc') continue;
      const opsi = m[3] ? ambilObjek(s, m.index + m[0].length - 1) : null;
      tabel(m[1], m[2], opsi, 'authenticated', `${f}:${baris(s, m.index)}`);
    }

    // fetch(... '/rest/v1/' + NAMA + '?...', { ... })  dan  '/rest/v1/tabel?...'
    const reLangsung = /\/rest\/v1\/(?:(['"`])\s*\+\s*([A-Za-z_]\w*)|(?!rpc\/)([a-z_]\w*)(\?[^'"`]*)?['"`])/g;
    while ((m = reLangsung.exec(s))) {
      const di = `${f}:${baris(s, m.index)}`;
      let nama = m[3], qs = m[4];
      if (m[2]) {
        // Parameter pembantu api()/rpc() sendiri bukan panggilan.
        if (new RegExp(`function\\s+\\w+\\(\\s*${m[2]}\\b`).test(s)) continue;
        const def = new RegExp(`\\b${m[2]}\\s*=\\s*'([a-z_]\\w*)'`).exec(s);
        if (!def) { gagal.push(`${di} /rest/v1/ + ${m[2]} — nama tabel tidak terbaca`); continue; }
        nama = def[1];
        const lanjut = /^\s*\+\s*'(\?[^']*)'/.exec(s.slice(m.index + m[0].length));
        if (lanjut) qs = lanjut[1];
      }
      // Opsi fetch: argumen kedua dari fetch( yang memuat alamat ini, atau
      // fetch( pertama sesudahnya kalau alamatnya disimpan dulu di variabel.
      const sebelum = s.lastIndexOf('fetch(', m.index);
      let i = sebelum >= 0 && !s.slice(sebelum, m.index).includes(';') ? sebelum : s.indexOf('fetch(', m.index);
      const args = i >= 0 ? ambilObjek(s, i + 5) : null;
      const o = args && args.indexOf('{');
      const opsi = args && o > 0 ? ambilObjek(args, o) : null;
      tabel(nama, qs, opsi, 'anon', di);
    }
  }
  return { panggilan, gagal };
}

// ---------- membaca skema ----------

const fungsi = JSON.parse(sql(`
  select coalesce(json_agg(json_build_object(
           'nama', p.proname,
           'arg',  coalesce(p.proargnames[1:p.pronargs], '{}'),
           'wajib', p.pronargs - p.pronargdefaults,
           'anon', has_function_privilege('anon', p.oid, 'execute'),
           'authenticated', has_function_privilege('authenticated', p.oid, 'execute'))), '[]')
    from pg_proc p where p.pronamespace = 'public'::regnamespace`));
const kolom = new Map();
for (const r of JSON.parse(sql(`
  select coalesce(json_agg(json_build_array(table_name, column_name)), '[]')
    from information_schema.columns where table_schema = 'public'`))) {
  if (!kolom.has(r[0])) kolom.set(r[0], new Set());
  kolom.get(r[0]).add(r[1]);
}

// Hak tabel dan kebijakan RLS per peran dan perintah.
const hak = JSON.parse(sql(`
  select coalesce(json_object_agg(c.relname || '|' || r.peran || '|' || x.cmd,
    has_table_privilege(r.peran, c.oid, x.cmd)
    and (not c.relrowsecurity or exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = c.relname
         and p.cmd in (x.cmd, 'ALL')
         and (r.peran = any (p.roles) or 'public' = any (p.roles))))), '{}')
    from pg_class c,
         (values ('anon'), ('authenticated')) r(peran),
         (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) x(cmd)
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`));

// ---------- memeriksa ----------

let patah = 0;
for (const ref of refs) {
  const { panggilan, gagal } = bacaRef(ref);
  const masalah = [...gagal];
  for (const p of panggilan) {
    if (p.jenis === 'rpc') {
      const calon = fungsi.filter(f => f.nama === p.nama);
      if (!calon.length) { masalah.push(`${p.di} rpc/${p.nama} — fungsinya tidak ada`); continue; }
      // PostgREST memilih fungsi berdasarkan nama argumen yang dikirim.
      const cocok = calon.filter(f =>
        p.arg.every(a => f.arg.includes(a)) &&
        f.arg.slice(0, f.wajib).every(a => p.arg.includes(a)));
      if (!cocok.length) {
        masalah.push(`${p.di} rpc/${p.nama}(${p.arg.join(', ')}) — tidak ada versi dengan argumen ini; ` +
          `yang ada: ${calon.map(f => `(${f.arg.join(', ')})`).join(' ')}`);
        continue;
      }
      if (cocok.length > 1) {
        masalah.push(`${p.di} rpc/${p.nama} — ${cocok.length} versi cocok, PostgREST akan menolak (ambigu)`);
        continue;
      }
      if (!cocok[0][p.peran]) masalah.push(`${p.di} rpc/${p.nama} — ${p.peran} tidak lagi boleh menjalankannya`);
    } else {
      const k = kolom.get(p.nama);
      if (!k) { masalah.push(`${p.di} tabel ${p.nama} — tabelnya tidak ada`); continue; }
      const hilang = p.kolom.filter(c => c !== '*' && !k.has(c));
      if (hilang.length) masalah.push(`${p.di} tabel ${p.nama} — kolom hilang: ${hilang.join(', ')}`);
      const ditolak = p.perintah.filter(c => !hak[`${p.nama}|${p.peran}|${c}`]);
      if (ditolak.length) masalah.push(`${p.di} tabel ${p.nama} — ${p.peran} tidak boleh ${ditolak.join('/')} (hak tabel atau kebijakan RLS)`);
    }
  }
  const rpc = panggilan.filter(p => p.jenis === 'rpc').length;
  const tbl = panggilan.length - rpc;
  if (masalah.length) {
    console.log(`✗ ${ref}: ${masalah.length} panggilan akan patah (dari ${rpc} rpc, ${tbl} tabel)`);
    for (const m of masalah) console.log('   ' + m);
    patah += masalah.length;
  } else {
    console.log(`✓ ${ref}: ${rpc} panggilan rpc dan ${tbl} panggilan tabel cocok dengan skema`);
  }
}
process.exit(patah ? 1 : 0);
