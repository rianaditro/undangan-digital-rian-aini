/* Matriks bentuk alamat: slugPasangan / slugTamuDari / linkTamu.
   Dijalankan di Node dengan location palsu — varian.js membaca
   global.location setiap kali dipanggil, jadi bisa diganti-ganti. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const kode = readFileSync(new URL('../assets/varian.js', import.meta.url), 'utf8');

/* URLSearchParams dan URL TIDAK otomatis ada di dalam vm context.
   Tanpa keduanya, pembacaan ?pasangan= diam-diam gagal dan ujinya
   menyalahkan kode yang sebenarnya benar. */
const sandbox = {
  console, setTimeout, URL, URLSearchParams,
  fetch: async () => { throw new Error('tidak boleh jaringan'); }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(kode, sandbox, { filename: 'varian.js' });
const M = sandbox.MENGUNDANG;

let lulus = 0, gagal = 0;
function cek(nama, dapat, harap) {
  if (dapat === harap) { lulus++; console.log('  ok    ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + '\n          dapat : ' + JSON.stringify(dapat) + '\n          harap : ' + JSON.stringify(harap)); }
}

function alamat(host, jalur, protokol) {
  protokol = protokol || 'https:';
  const port = host.includes(':') ? '' : '';
  sandbox.location = {
    hostname: host.split(':')[0],
    pathname: jalur,
    origin: protokol + '//' + host,
    href: protokol + '//' + host + jalur
  };
}

console.log('\n--- slugPasangan() ---');
const kasusPasangan = [
  ['rian-aini.mengundang.id', '/',                        'rian-aini'],
  ['rian-aini.mengundang.id', '/bapak-ahmad',             'rian-aini'],
  ['rian-aini.mengundang.id', '/bapak-ahmad/',            'rian-aini'],
  ['mengundang.id',           '/rian-aini/bapak-ahmad',   'rian-aini'],
  ['mengundang.id',           '/budi-sari/ibu-rahayu',    'budi-sari'],
  ['mengundang.id',           '/',                        'rian-aini'],  // cadangan
  ['www.mengundang.id',       '/budi-sari/ibu-rahayu',    'budi-sari'],
  ['localhost:8000',          '/rian-aini/bapak-ahmad',   'rian-aini'],
  ['127.0.0.1:8000',          '/budi-sari/x',             'budi-sari'],
  // satu segmen di domain bersama = nama PASANGAN, bukan nama tamu
  ['mengundang.id',           '/budi-sari',               'budi-sari'],
  ['mengundang.id',           '/budi-sari/',              'budi-sari'],
  ['mengundang.id',           '/Budi-Sari',               'budi-sari'],
  // jalur milik platform bukan nama pasangan
  ['mengundang.id',           '/terimakasih',             'rian-aini'],
  ['mengundang.id',           '/kirim',                   'rian-aini'],
  ['mengundang.id',           '/dasbor',                  'rian-aini'],
  ['mengundang.id',           '/admin',                   'rian-aini'],
  ['mengundang.id',           '/mulai',                   'rian-aini'],
  // host pratinjau Vercel: domain bersama, bukan subdomain pasangan
  ['undangan-rian-aini.vercel.app', '/',                      'rian-aini'],
  ['undangan-rian-aini.vercel.app', '/budi-sari/ibu-rahayu',  'budi-sari'],
  ['undangan-rian-aini.vercel.app', '/terimakasih',           'rian-aini']
];
for (const [h, j, harap] of kasusPasangan) cek(h + j, M.slugPasangan(h.split(':')[0], j, ''), harap);

console.log('\n--- slugTamuDari() ---');
const kasusTamu = [
  // subdomain: segmen PERTAMA itu tamu
  ['rian-aini.mengundang.id', '/bapak-ahmad',                'bapak-ahmad'],
  ['rian-aini.mengundang.id', '/bapak-ahmad/',               'bapak-ahmad'],
  ['rian-aini.mengundang.id', '/Bapak%20Ahmad%20Fauzi',      'bapak-ahmad-fauzi'],
  ['rian-aini.mengundang.id', '/',                           ''],
  ['rian-aini.mengundang.id', '/index.html',                 ''],
  // domain bersama: segmen KEDUA itu tamu
  ['mengundang.id',           '/rian-aini/bapak-ahmad',      'bapak-ahmad'],
  ['mengundang.id',           '/rian-aini/bapak-ahmad/',     'bapak-ahmad'],
  ['mengundang.id',           '/rian-aini/Bapak%20Ahmad',    'bapak-ahmad'],
  ['mengundang.id',           '/rian-aini',                  ''],   // pasangan saja, tanpa tamu
  ['mengundang.id',           '/rian-aini/',                 ''],
  ['mengundang.id',           '/',                           ''],
  ['mengundang.id',           '/index.html',                 ''],
  ['www.mengundang.id',       '/rian-aini/bapak-ahmad',      'bapak-ahmad'],
  ['localhost',               '/rian-aini/bapak-ahmad',      'bapak-ahmad'],
  ['127.0.0.1',               '/rian-aini/bapak-ahmad',      'bapak-ahmad'],
  // segmen berlebih diabaikan, bukan digabung
  ['mengundang.id',           '/rian-aini/bapak-ahmad/entah','bapak-ahmad'],
  ['rian-aini.mengundang.id', '/bapak-ahmad/entah',          'bapak-ahmad'],
  // jalur platform tidak punya tamu
  ['mengundang.id',           '/terimakasih',                ''],
  ['mengundang.id',           '/kirim',                      ''],
  ['undangan-rian-aini.vercel.app', '/terimakasih',  ''],
  ['undangan-rian-aini.vercel.app', '/rian-aini/bapak-ahmad', 'bapak-ahmad']
];
for (const [h, j, harap] of kasusTamu) cek(h + j, M.slugTamuDari(h, j), harap);

console.log('\n--- regresi: bentuk path TIDAK boleh menggabung dua segmen ---');
cek('bukan rian-aini-bapak-ahmad',
    M.slugTamuDari('mengundang.id', '/rian-aini/bapak-ahmad') === 'rian-aini-bapak-ahmad', false);

console.log('\n--- linkTamu(): pasangan punya subdomain sendiri ---');
M.KONF.slug = 'rian-aini';
M.KONF.canonicalHost = 'rian-aini.mengundang.id';
M.KONF.situs = 'https://rian-aini.mengundang.id';
M.VARIAN['keluarga-wanita'] = { kode: 'kw' };
M.VARIAN['keluarga-pria']   = { kode: 'kp' };
M.KONF.pihakBawaan = 'keluarga-wanita';

alamat('mengundang.id', '/rian-aini/');
cek('canonical menang walau dibuka dari domain bersama',
    M.linkTamu('bapak-ahmad', 'keluarga-wanita'),
    'https://rian-aini.mengundang.id/bapak-ahmad?p=kw');
alamat('rian-aini.mengundang.id', '/');
cek('canonical dari subdomainnya sendiri',
    M.linkTamu('bapak-ahmad', 'keluarga-pria'),
    'https://rian-aini.mengundang.id/bapak-ahmad?p=kp');
cek('tanpa pihak, tanpa ?p=',
    M.linkTamu('bapak-ahmad', null),
    'https://rian-aini.mengundang.id/bapak-ahmad');

console.log('\n--- linkTamu(): pasangan TANPA subdomain (domain bersama) ---');
M.KONF.canonicalHost = '';
M.KONF.slug = 'budi-sari';

alamat('mengundang.id', '/budi-sari/');
cek('slug pasangan ikut di jalur',
    M.linkTamu('ibu-rahayu', 'keluarga-pria'),
    'https://mengundang.id/budi-sari/ibu-rahayu?p=kp');

alamat('mengundang.id', '/budi-sari/tamu-lama');
cek('tidak terpengaruh jalur tamu yang sedang dibuka',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'https://mengundang.id/budi-sari/ibu-rahayu?p=kw');

alamat('www.mengundang.id', '/budi-sari/');
cek('www ikut apa adanya (bukan subdomain pasangan)',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'https://www.mengundang.id/budi-sari/ibu-rahayu?p=kw');

alamat('localhost:8000', '/budi-sari/', 'http:');
cek('localhost saat mengembangkan',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'http://localhost:8000/budi-sari/ibu-rahayu?p=kw');

console.log('\n--- linkTamu(): host subdomain tapi canonical_host belum diisi ---');
M.KONF.canonicalHost = '';
M.KONF.slug = 'budi-sari';
alamat('budi-sari.mengundang.id', '/');
cek('di subdomain, tamu langsung di akar (slug pasangan tidak diulang)',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'https://budi-sari.mengundang.id/ibu-rahayu?p=kw');

console.log('\n--- putar balik: link yang dibuat bisa dibaca lagi ---');
for (const [host, slugPas, canon] of [
  ['rian-aini.mengundang.id', 'rian-aini', 'rian-aini.mengundang.id'],
  ['mengundang.id',           'budi-sari', '']
]) {
  M.KONF.canonicalHost = canon;
  M.KONF.slug = slugPas;
  alamat(host, '/');
  const tautan = M.linkTamu('bapak-ahmad', 'keluarga-pria');
  const u = new URL(tautan);
  cek('putar balik ' + tautan + ' -> tamu',     M.slugTamuDari(u.hostname, u.pathname), 'bapak-ahmad');
  cek('putar balik ' + tautan + ' -> pasangan', M.slugPasangan(u.hostname, u.pathname, u.search), slugPas);
}

console.log('\n--- mode coba tidak ikut terseret ---');
cek('/coba di domain bersama dikenali sebagai mode coba', M.jalurCoba('mengundang.id', '/coba'), true);
cek('/coba di subdomain pasangan BUKAN mode coba',        M.jalurCoba('rian-aini.mengundang.id', '/coba'), false);

console.log('\n--- ?pasangan= untuk halaman platform di domain bersama ---');
cek('/terimakasih?pasangan=budi-sari',
    M.slugPasangan('mengundang.id', '/terimakasih', '?pasangan=budi-sari'), 'budi-sari');
cek('/kirim?t=abc&pasangan=budi-sari',
    M.slugPasangan('mengundang.id', '/kirim', '?t=abc&pasangan=budi-sari'), 'budi-sari');
cek('huruf besar di ?pasangan= dirapikan',
    M.slugPasangan('mengundang.id', '/terimakasih', '?pasangan=Budi-Sari'), 'budi-sari');
cek('tanpa ?pasangan=, jalur platform jatuh ke cadangan',
    M.slugPasangan('mengundang.id', '/terimakasih', ''), 'rian-aini');
cek('JALUR menang atas query — query tidak boleh menimpa pasangan di jalur',
    M.slugPasangan('mengundang.id', '/rian-aini/bapak-ahmad', '?pasangan=budi-sari'), 'rian-aini');
cek('subdomain menang atas query',
    M.slugPasangan('rian-aini.mengundang.id', '/bapak-ahmad', '?pasangan=budi-sari'), 'rian-aini');

console.log('\n--- alamatUndangan(): dua paket ---');
alamat('mengundang.id', '/');
cek('premium -> subdomainnya',
    M.alamatUndangan({ slug:'rian-aini', canonical_host:'rian-aini.mengundang.id' }),
    'https://rian-aini.mengundang.id');
cek('standar -> jalur di domain bersama',
    M.alamatUndangan({ slug:'budi-sari', canonical_host:'' }),
    'https://mengundang.id/budi-sari');
cek('canonical_host null diperlakukan sama dengan kosong',
    M.alamatUndangan({ slug:'budi-sari', canonical_host:null }),
    'https://mengundang.id/budi-sari');
cek('skema di canonical_host tidak digandakan',
    M.alamatUndangan({ slug:'x', canonical_host:'https://x.mengundang.id/' }),
    'https://x.mengundang.id');
alamat('budi-sari.mengundang.id', '/');
cek('dibuka DI subdomain tapi canonical_host kosong: tidak mengulang slug',
    M.alamatUndangan({ slug:'budi-sari', canonical_host:'' }),
    'https://budi-sari.mengundang.id');

console.log('\n--- alamatPlatform(): /terimakasih dan /kirim ---');
alamat('mengundang.id', '/');
cek('premium: langsung di subdomainnya',
    M.alamatPlatform({ slug:'rian-aini', canonical_host:'rian-aini.mengundang.id' }, '/terimakasih'),
    'https://rian-aini.mengundang.id/terimakasih');
cek('standar: pasangannya disebut lewat ?pasangan=',
    M.alamatPlatform({ slug:'budi-sari', canonical_host:'' }, '/terimakasih'),
    'https://mengundang.id/terimakasih?pasangan=budi-sari');
cek('standar: query lain tetap ikut',
    M.alamatPlatform({ slug:'budi-sari', canonical_host:'' }, '/kirim', 't=abc123'),
    'https://mengundang.id/kirim?t=abc123&pasangan=budi-sari');
cek('premium: query lain tanpa ?pasangan=',
    M.alamatPlatform({ slug:'rian-aini', canonical_host:'rian-aini.mengundang.id' }, '/kirim', 't=abc123'),
    'https://rian-aini.mengundang.id/kirim?t=abc123');
cek('tanda tanya berlebih dibersihkan',
    M.alamatPlatform({ slug:'budi-sari', canonical_host:'' }, 'kirim', '?t=abc'),
    'https://mengundang.id/kirim?t=abc&pasangan=budi-sari');

console.log('\n--- putar balik halaman platform ---');
for (const pas of [{ slug:'rian-aini', canonical_host:'rian-aini.mengundang.id' },
                   { slug:'budi-sari', canonical_host:'' }]) {
  alamat('mengundang.id', '/');
  const t = M.alamatPlatform(pas, '/terimakasih');
  const u = new URL(t);
  cek('putar balik ' + t, M.slugPasangan(u.hostname, u.pathname, u.search), pas.slug);
}

console.log('\n--- alamatPratinjau(): selalu di asal dasbor ---');
const premium = { slug:'rian-aini', canonical_host:'rian-aini.mengundang.id' };
alamat('mengundang.id', '/dasbor');
cek('dasbor di domain bersama, pasangan premium: TIDAK pindah ke subdomain (sesinya tidak ada di sana)',
    M.alamatPratinjau(premium, '/terimakasih'),
    'https://mengundang.id/terimakasih?pasangan=rian-aini&pratinjau=1');
alamat('rian-aini.mengundang.id', '/dasbor');
cek('dasbor dibuka di subdomain pasangan: tetap di subdomain, tanpa ?pasangan=',
    M.alamatPratinjau(premium, 'terimakasih'),
    'https://rian-aini.mengundang.id/terimakasih?pratinjau=1');
alamat('mengundang.id', '/dasbor');
{
  const u = new URL(M.alamatPratinjau({ slug:'budi-sari', canonical_host:'' }, '/terimakasih'));
  cek('putar balik pratinjau', M.slugPasangan(u.hostname, u.pathname, u.search), 'budi-sari');
}

console.log('\n--- KONF.situs ikut paket (linkTamu memakainya) ---');
M.KONF.slug = 'budi-sari'; M.KONF.canonicalHost = '';
alamat('mengundang.id', '/budi-sari/');
cek('standar: link tamu memuat slug pasangan',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'https://mengundang.id/budi-sari/ibu-rahayu?p=kw');
cek('standar: link platform memuat ?pasangan=',
    M.linkPlatform('/terimakasih'),
    'https://mengundang.id/terimakasih?pasangan=budi-sari');
M.KONF.canonicalHost = 'budi-sari.mengundang.id';
cek('premium: link tamu langsung di subdomain',
    M.linkTamu('ibu-rahayu', 'keluarga-wanita'),
    'https://budi-sari.mengundang.id/ibu-rahayu?p=kw');
cek('premium: link platform tanpa ?pasangan=',
    M.linkPlatform('/terimakasih'),
    'https://budi-sari.mengundang.id/terimakasih');

console.log('\nLULUS ' + lulus + '  GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
