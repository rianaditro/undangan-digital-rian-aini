/* ============================================================
   Penjaga batas gerak
   Jalankan:  node tema/periksa-gerak.mjs

   Tamu kondangan membuka undangan ini dari HP Android murah. Yang boleh
   dianimasikan cuma `transform` dan `opacity` — keduanya dikerjakan
   compositor dan tidak memicu peramban menghitung ulang tata letak.
   Begitu sebuah animasi menyentuh width, height, top, atau margin,
   ponsel kelas bawah langsung tersendat.

   Aturan seperti itu tidak bertahan kalau cuma ditulis di komentar.
   Berkas ini memeriksanya: memindai tiap tema, membaca setiap
   `transition` dan `@keyframes`, dan gagal kalau ada properti pemicu
   tata letak yang dianimasikan. Ia juga menolak tema yang tidak
   menghormati prefers-reduced-motion.

   Catatan satu jebakan: daftar transition dipecah pada koma TINGKAT
   ATAS saja. Memecah mentah pada tiap koma akan membelah
   cubic-bezier(.22,.8,.3,1) jadi potongan sampah — dan lebih gawat,
   properti terlarang yang ditulis sesudah koma itu jadi lolos tanpa
   diperiksa.
   ============================================================ */
import fs from 'node:fs'; import path from 'node:path';
const AKAR = path.resolve(new URL('..', import.meta.url).pathname);
const TEMA = path.join(AKAR, 'tema');

// Memicu peramban menghitung ulang tata letak — terlarang.
const TATA_LETAK=new Set(['width','height','min-width','min-height','max-width','max-height',
  'top','right','bottom','left','margin','margin-top','margin-right','margin-bottom','margin-left',
  'padding','padding-top','padding-right','padding-bottom','padding-left',
  'font-size','line-height','letter-spacing','word-spacing','border-width','inset',
  'flex','flex-basis','flex-grow','flex-shrink','gap','row-gap','column-gap','order',
  'grid-template-columns','grid-template-rows','columns','column-count','aspect-ratio']);
// Aman dan murah.
const KOMPOSIT=new Set(['transform','opacity','filter','backdrop-filter','translate','rotate','scale']);

const salah=[], catat=[];

function bersih(t){ return t.replace(/\/\*[\s\S]*?\*\//g,''); }

/* Memecah daftar transition pada koma TINGKAT ATAS saja. Memecah mentah
   pada setiap koma akan membelah cubic-bezier(.22,.8,.3,1) jadi potongan
   sampah — dan lebih gawat, properti terlarang yang ditulis sesudah koma
   itu jadi tidak terperiksa. */
function pecahKoma(teks){
  const bagian=[]; let dalam=0, kini='';
  for(const c of teks){
    if(c==='(')dalam++;
    else if(c===')')dalam--;
    if(c===','&&dalam===0){ bagian.push(kini); kini=''; }
    else kini+=c;
  }
  if(kini.trim())bagian.push(kini);
  return bagian;
}

for(const tema of fs.readdirSync(TEMA)){
  const f=path.join(TEMA,tema,'gaya.css');
  if(!fs.existsSync(f)) continue;
  const css=bersih(fs.readFileSync(f,'utf8'));

  // --- transition: ---
  for(const m of css.matchAll(/transition\s*:\s*([^;}]+)/g)){
    for(const bagian of pecahKoma(m[1])){
      const prop=bagian.trim().split(/\s+/)[0];
      if(!prop||prop==='none') continue;
      if(prop==='all'){ salah.push(`${tema}: transition:all — wajib sebut propertinya`); continue; }
      if(prop.startsWith('--')) continue;                 // custom property → dipakai stroke, paint saja
      if(TATA_LETAK.has(prop)) salah.push(`${tema}: transition "${prop}" memicu tata letak`);
      else if(KOMPOSIT.has(prop)) catat.push(`${tema}: transition ${prop} (komposit)`);
      else catat.push(`${tema}: transition ${prop} (cat ulang saja)`);
    }
  }

  // --- @keyframes ---
  for(const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)){
    // ambil isi blok dengan menghitung kurung
    let i=m.index+m[0].length, dalam=1, isi='';
    while(i<css.length&&dalam>0){ const c=css[i];
      if(c==='{')dalam++; else if(c==='}')dalam--;
      if(dalam>0)isi+=c; i++; }
    const props=new Set();
    for(const d of isi.matchAll(/([\w-]+)\s*:/g)) props.add(d[1]);
    for(const p of props){
      if(/^\d/.test(p)) continue;                          // "0%" dsb
      if(p.startsWith('--')) continue;
      if(TATA_LETAK.has(p)) salah.push(`${tema}: @keyframes ${m[1]} menganimasikan "${p}" — memicu tata letak`);
      else catat.push(`${tema}: @keyframes ${m[1]} → ${p}`);
    }
  }

  // --- prefers-reduced-motion harus ada ---
  if(!/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/.test(css))
    salah.push(`${tema}: tidak menghormati prefers-reduced-motion`);
}

// motion.js juga tidak boleh menyentuh properti tata letak
const js=fs.readFileSync(path.join(AKAR,'assets/motion.js'),'utf8');
for(const m of js.matchAll(/style\.(\w+)\s*=/g)){
  const p=m[1].replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  if(TATA_LETAK.has(p)) salah.push(`motion.js menulis style.${m[1]} — memicu tata letak`);
}
for(const m of js.matchAll(/\btransform:\s*'([^']+)'/g)){
  if(!/^translate3d|^translateY|^translate\(/.test(m[1]))
    catat.push(`motion.js transform: ${m[1]}`);
}

console.log('--- yang dianimasikan ---');
[...new Set(catat)].sort().forEach(x=>console.log('  ',x));
console.log(salah.length?'\nGAGAL:\n- '+salah.join('\n- '):'\nTidak ada properti pemicu tata letak yang dianimasikan.');
process.exit(salah.length?1:0);
