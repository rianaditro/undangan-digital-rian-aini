/* Palet dari foto (MENGUNDANG.tema.paletDariPiksel), di Node murni.
   Piksel buatan meniru foto yang paling sering datang: senja di pantai,
   hutan pinus, sawah, foto hitam putih, foto hampir putih, foto gelap.
   Yang diuji: setiap hasil LULUS periksaPalet (terbaca), dan ronanya
   memang dari foto (senja → jingga, hutan → hijau, hitam putih → netral). */
import { createRequire } from 'node:module';
createRequire(import.meta.url)('../assets/varian.js');
const T = globalThis.MENGUNDANG.tema;

let lulus = 0, gagal = 0;
const cek = (n, ok, k) => ok ? (lulus++, console.log('OK    ' + n))
                             : (gagal++, console.log('GAGAL ' + n + (k ? '  — ' + k : '')));

/* foto 48×48 dari beberapa warna dengan bobot, plus derau */
function foto(campuran, derau = 18, seed = 7) {
  let x = seed; const acak = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const d = new Uint8ClampedArray(48 * 48 * 4);
  const total = campuran.reduce((a, c) => a + c[1], 0);
  for (let i = 0; i < 48 * 48; i++) {
    let r = acak() * total, w = campuran[0][0];
    for (const [warna, bobot] of campuran) { if ((r -= bobot) <= 0) { w = warna; break; } }
    const c = [1, 3, 5].map(j => parseInt(w.slice(j, j + 2), 16));
    for (let j = 0; j < 3; j++) d[i * 4 + j] = c[j] + (acak() - 0.5) * derau;
    d[i * 4 + 3] = 255;
  }
  return d;
}
function rona(hex) {
  const [r, g, b] = [1, 3, 5].map(j => parseInt(hex.slice(j, j + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: d / (1 - Math.abs(mx + mn - 1)) };
}

const KASUS = [
  ['senja di pantai', [['#E8894A', 4], ['#F2B66D', 3], ['#3B4A6B', 2], ['#F4E6D2', 2]], h => h >= 10 && h <= 45],
  ['hutan pinus',     [['#2F4A2A', 4], ['#5E7A4A', 3], ['#C9D2B8', 2], ['#3A3226', 1]], h => h >= 70 && h <= 150],
  ['sawah',           [['#8FA33A', 4], ['#C6C27A', 3], ['#7FA6C9', 2]],                 h => h >= 50 && h <= 90],
  ['hitam putih',     [['#202020', 3], ['#808080', 3], ['#E8E8E8', 3]],                 null],
  ['hampir putih',    [['#FAFAF7', 8], ['#F2EFE8', 2]],                                 null],
  ['sangat gelap',    [['#0A0A12', 6], ['#1E1A2E', 3], ['#3A2A50', 1]],                 h => h >= 230 && h <= 300]
];

for (const [nama, campuran, ronaBenar] of KASUS) {
  const p = T.paletDariPiksel(foto(campuran));
  const salah = T.periksaPalet(p);
  cek(`${nama}: palet lulus syarat kontras`, !salah.length, salah.join('; ') + ' ' + JSON.stringify(p));
  const a = rona(p.aksen), l = rona(p.latar);
  if (ronaBenar) cek(`${nama}: aksen bernada foto (rona ${a.h.toFixed(0)}°)`, ronaBenar(a.h) && a.s > 0.25, JSON.stringify(p));
  else cek(`${nama}: foto tanpa rona → palet netral`, a.s < 0.15 && l.s < 0.1, JSON.stringify(p));
}

{
  const kosong = T.paletDariPiksel(new Uint8ClampedArray(0));
  cek('tanpa piksel sama sekali: tetap palet netral yang sah', !T.periksaPalet(kosong).length, JSON.stringify(kosong));
  const bening = T.paletDariPiksel(new Uint8ClampedArray(48 * 48 * 4));
  cek('foto bening (alfa 0): tetap sah', !T.periksaPalet(bening).length);
}

/* pilihan: palet "foto" dipakai hanya bila temanya mengizinkan dan lulus */
{
  const m = { palet: [{ kode: 'a', nama: 'A', latar: '#F6EDE3', teks: '#3A2A20', aksen: '#C0612F' }],
              huruf: [{ kode: 'h', nama: 'H' }], bawaan: { palet: 'a', huruf: 'h' }, palet_foto: true };
  const pf = T.paletDariPiksel(foto(KASUS[0][1]));
  let p = T.pilihan(m, { palet: 'foto', palet_foto: pf });
  cek('palet "foto" dipakai, lengkap dengan warna kertasnya', p.palet.kode === 'foto' && p.palet.kertas === pf.kertas);
  p = T.pilihan({ ...m, palet_foto: false }, { palet: 'foto', palet_foto: pf });
  cek('tema yang tidak mengizinkan palet foto: jatuh ke bawaan', p.palet.kode === 'a');
  p = T.pilihan(m, { palet: 'foto', palet_foto: { latar: '#FFFFFF', teks: '#EEEEEE', aksen: '#FFFFFF' } });
  cek('palet foto yang tidak terbaca (disunting tangan): jatuh ke bawaan', p.palet.kode === 'a');
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
