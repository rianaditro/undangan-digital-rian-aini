// admin-pasangan — satu-satunya jalan membuat akun klien.
//
// Kenapa perlu edge function sama sekali: membuat pengguna di
// Supabase Auth menuntut service_role, dan service_role tidak boleh ada
// di peramban. Semua yang TIDAK menuntutnya — daftar pasangan, link
// panitia, ganti status — tetap lewat RPC biasa di migrasi 020, karena
// menyalurkan semuanya ke sini berarti menaruh lebih banyak kuasa di
// belakang satu pintu daripada yang diperlukan.
//
// service_role tidak pernah keluar dari sini.
//
// POST { aksi: 'buat',  slug, email, sandi, pria, wanita, tanggal, kota, paket }
// POST { aksi: 'sandi', email, sandi }
// POST { aksi: 'pemilik', slug, email, sandi }
// POST { aksi: 'konfirmasi', pesanan_id, nominal, komisi }      — pesanan → lunas
// POST { aksi: 'reseller', email, sandi, kode, nama, kontak, rekening }   — owner
// POST { aksi: 'admin', email, sandi, nama }                    — owner
//
// PENJAGANYA ADA DI DALAM, bukan di gerbang. Fungsi ini sengaja
// dipasang dengan verify_jwt = false, dan itu BUKAN pelonggaran:
//
//   · verify_jwt hanya memastikan tokennya JWT yang sah — dan anon key
//     ITU SENDIRI adalah JWT yang sah. Gerbangnya saja akan meloloskan
//     siapa pun yang pernah membuka halaman mana pun di situs ini.
//   · Pemeriksaan di bawah lebih ketat: token ditukar jadi pengguna
//     lewat auth.getUser(), lalu pengguna itu harus ada di tabel
//     `admin`. Anon key gagal di langkah pertama.
//   · Halaman admin ada di asal yang berbeda dari Supabase, jadi POST
//     ber-JSON selalu didahului preflight OPTIONS yang tidak membawa
//     token sama sekali. Gerbang yang menolaknya akan mematahkan
//     seluruh halaman sebelum pemeriksa yang sebenarnya sempat jalan.
//
// Pola yang sama dipakai foto-unggah.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jawab(isi: unknown, status = 200) {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

function rapi(t: unknown): string {
  return String(t ?? '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jawab({ pesan: 'Metode tidak didukung' }, 405);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ---- siapa yang memanggil ----
  const kepala = req.headers.get('Authorization') ?? '';
  const jwt = kepala.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jawab({ pesan: 'Belum masuk' }, 401);

  const { data: siapa, error: salahJwt } = await db.auth.getUser(jwt);
  if (salahJwt || !siapa?.user) return jawab({ pesan: 'Sesi tidak sah' }, 401);

  const { data: adm } = await db
    .from('admin').select('user_id, peran').eq('user_id', siapa.user.id).maybeSingle();
  if (!adm) return jawab({ pesan: 'Halaman ini hanya untuk admin' }, 403);
  const owner = adm.peran === 'owner';

  let badan: any = {};
  try { badan = await req.json(); } catch { /* biarkan kosong, divalidasi di bawah */ }

  try {
    if (badan.aksi === 'sandi')   return await gantiSandi(db, badan);
    if (badan.aksi === 'pemilik') return await pasangPemilik(db, badan);
    if (badan.aksi === 'konfirmasi') return await konfirmasi(db, badan, siapa.user.id);
    if (badan.aksi === 'reseller' || badan.aksi === 'admin') {
      if (!owner) return jawab({ pesan: 'Hanya owner yang boleh membuat akun ' + badan.aksi }, 403);
      return badan.aksi === 'reseller' ? await buatReseller(db, badan) : await buatAdmin(db, badan);
    }
    return await buat(db, badan);
  } catch (e) {
    console.error('admin-pasangan gagal:', e);
    return jawab({ pesan: (e as Error).message || 'Gagal memproses' }, 500);
  }
});

async function cariEmail(db: any, email: string) {
  // listUsers tidak bisa menyaring per email, jadi disapu per halaman.
  // Jumlah pengguna platform ini masih puluhan; kalau suatu saat ribuan,
  // inilah yang pertama harus diganti.
  for (let hal = 1; hal <= 20; hal++) {
    const { data, error } = await db.auth.admin.listUsers({ page: hal, perPage: 200 });
    if (error) throw error;
    const ada = data.users.find((u: any) => (u.email ?? '').toLowerCase() === email);
    if (ada) return ada;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function buat(db: any, b: any) {
  const slug    = rapi(b.slug).toLowerCase();
  const email   = rapi(b.email).toLowerCase();
  const sandi   = String(b.sandi ?? '');
  const pria    = rapi(b.pria);
  const wanita  = rapi(b.wanita);
  const tanggal = rapi(b.tanggal) || null;
  const kota    = rapi(b.kota) || null;
  const paket   = (rapi(b.paket) || 'standar').toLowerCase();

  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 40)
    return jawab({ pesan: 'Slug hanya huruf kecil, angka, dan tanda hubung (3–40 huruf)' }, 400);
  if (!EMAIL.test(email))
    return jawab({ pesan: 'Email klien tidak sah' }, 400);
  if (!pria || !wanita)
    return jawab({ pesan: 'Nama panggilan kedua mempelai harus diisi' }, 400);
  if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return jawab({ pesan: 'Tanggal acara harus berbentuk YYYY-MM-DD' }, 400);
  // Paket menentukan bentuk alamat undangan (migrasi 023). Diperiksa di
  // sini juga supaya akun klien tidak terlanjur dibuat untuk sesuatu
  // yang sudah pasti ditolak database.
  if (paket !== 'premium' && paket !== 'standar')
    return jawab({ pesan: 'Paket harus "premium" atau "standar"' }, 400);

  // Slug diperiksa DULU, keduanya. Kalau tidak, akun klien terlanjur
  // dibuat lalu penyimpanannya gagal — dan yang tersisa adalah akun yatim
  // yang tidak akan pernah ada yang tahu harus diapakan.
  const { data: sudahAda } = await db
    .from('pasangan').select('id').eq('slug', slug).maybeSingle();
  if (sudahAda) return jawab({ pesan: `Slug "${slug}" sudah dipakai pasangan lain` }, 409);

  // Pemicu pasangan_sah juga menolaknya, dan itu penjaga yang
  // sebenarnya. Yang di sini semata-mata supaya akunnya tidak sempat
  // dibuat lebih dulu untuk sesuatu yang sudah pasti ditolak.
  const { data: terlarang } = await db
    .from('slug_terlarang').select('slug').eq('slug', slug).maybeSingle();
  if (terlarang) return jawab({ pesan: `Slug "${slug}" dipakai halaman platform, pilih yang lain` }, 409);

  let akunBaru = false;
  let pengguna = await cariEmail(db, email);

  if (!pengguna) {
    if (sandi.length < 10)
      return jawab({ pesan: 'Kata sandi minimal 10 huruf' }, 400);
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: sandi,
      email_confirm: true,      // tidak ada surel konfirmasi; admin yang menyerahkan sandinya
    });
    if (error) return jawab({ pesan: error.message }, 400);
    pengguna = data.user;
    akunBaru = true;
  }

  const { data: pasanganId, error: gagal } = await db.rpc('pasangan_siapkan', {
    p_slug: slug, p_email: email, p_pria: pria, p_wanita: wanita,
    p_tanggal: tanggal, p_kota: kota, p_paket: paket,
  });

  if (gagal) {
    // Akun yang baru saja dibuat dibatalkan lagi. Kalau akunnya sudah ada
    // sebelum ini, jangan disentuh — ia mungkin memegang pasangan lain.
    if (akunBaru && pengguna?.id) {
      await db.auth.admin.deleteUser(pengguna.id).catch(() => {});
    }
    return jawab({ pesan: gagal.message }, 400);
  }

  const { data: token } = await db
    .from('panitia_akses').select('nama, token, pihak')
    .eq('pasangan_id', pasanganId)
    .order('pihak', { nullsFirst: true });

  // canonical_host dibaca BALIK dari database, bukan disusun lagi di
  // sini: pemicu pasangan_sah yang menentukannya, dan teks serah-terima
  // harus memuat alamat yang benar-benar berlaku — bukan tebakan kedua.
  const { data: pas } = await db
    .from('pasangan').select('canonical_host, paket').eq('id', pasanganId).maybeSingle();

  return jawab({
    pasangan_id: pasanganId, slug, email, akun_baru: akunBaru,
    paket: pas?.paket ?? paket,
    canonical_host: pas?.canonical_host ?? null,
    token: token ?? [],
  }, 201);
}

async function gantiSandi(db: any, b: any) {
  const email = rapi(b.email).toLowerCase();
  const sandi = String(b.sandi ?? '');

  if (!EMAIL.test(email)) return jawab({ pesan: 'Email tidak sah' }, 400);
  if (sandi.length < 10)  return jawab({ pesan: 'Kata sandi minimal 10 huruf' }, 400);

  const pengguna = await cariEmail(db, email);
  if (!pengguna) return jawab({ pesan: 'Akun dengan email itu tidak ada' }, 404);

  const { error } = await db.auth.admin.updateUserById(pengguna.id, { password: sandi });
  if (error) return jawab({ pesan: error.message }, 400);

  return jawab({ email, diganti: true });
}

// Akun pemilik untuk pasangan yang SUDAH ada — yang dibuat sebelum ada
// admin panel (rian-aini, hasil migrasi 003), atau yang pemiliknya perlu
// ditambah: pengantin kedua dengan email sendiri. Pasangan, mempelai,
// dan token panitianya tidak disentuh sama sekali.
async function pasangPemilik(db: any, b: any) {
  const slug  = rapi(b.slug).toLowerCase();
  const email = rapi(b.email).toLowerCase();
  const sandi = String(b.sandi ?? '');

  if (!SLUG.test(slug)) return jawab({ pesan: 'Slug tidak sah' }, 400);
  if (!EMAIL.test(email)) return jawab({ pesan: 'Email klien tidak sah' }, 400);

  const { data: pas } = await db
    .from('pasangan').select('id, slug, canonical_host').eq('slug', slug).maybeSingle();
  if (!pas) return jawab({ pesan: `Pasangan "${slug}" tidak ada` }, 404);

  let akunBaru = false;
  let pengguna = await cariEmail(db, email);

  if (!pengguna) {
    if (sandi.length < 10)
      return jawab({ pesan: 'Kata sandi minimal 10 huruf' }, 400);
    const { data, error } = await db.auth.admin.createUser({
      email, password: sandi, email_confirm: true,
    });
    if (error) return jawab({ pesan: error.message }, 400);
    pengguna = data.user;
    akunBaru = true;
  }

  const { data: sudah } = await db
    .from('pemilik').select('user_id')
    .eq('user_id', pengguna.id).eq('pasangan_id', pas.id).maybeSingle();

  if (!sudah) {
    const { error: gagal } = await db
      .from('pemilik').insert({ user_id: pengguna.id, pasangan_id: pas.id });
    if (gagal) {
      // Sama dengan buat(): akun yang baru dibuat di panggilan ini
      // dibatalkan; akun lama tidak disentuh.
      if (akunBaru) await db.auth.admin.deleteUser(pengguna.id).catch(() => {});
      return jawab({ pesan: gagal.message }, 400);
    }
  }

  return jawab({
    slug: pas.slug, email, akun_baru: akunBaru, sudah_pemilik: !!sudah,
    canonical_host: pas.canonical_host ?? null,
  }, sudah ? 200 : 201);
}

// Sandi acak untuk cadangan kalau surel undangan tidak bisa dikirim.
// Tanpa huruf yang mirip (0/O, 1/l/I) — sandi ini dibacakan lewat WhatsApp.
function sandiAcak(): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const acak = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(acak, (n) => huruf[n % huruf.length]).join('');
}

// Akun untuk email ini: yang sudah ada dipakai; kalau belum ada, dibuat
// dengan sandi yang diketik admin.
async function akunDenganSandi(db: any, email: string, sandi: string) {
  const ada = await cariEmail(db, email);
  if (ada) return { pengguna: ada, akunBaru: false };
  if (sandi.length < 10) throw new GalatPengguna('Kata sandi minimal 10 huruf');
  const { data, error } = await db.auth.admin.createUser({ email, password: sandi, email_confirm: true });
  if (error) throw new GalatPengguna(error.message);
  return { pengguna: data.user, akunBaru: true };
}

class GalatPengguna extends Error {}

// Pembayaran dikonfirmasi → akun klien → pasangan aktif.
//
// Akun klien yang belum ada diundang lewat surel: Supabase mengirim
// tautan, klien memilih sandinya sendiri di /dasbor. Kalau surel tidak
// bisa dikirim (SMTP belum dipasang, batas kirim habis), akun dibuat
// dengan sandi acak dan sandinya dikembalikan ke admin untuk
// diserahkan lewat WhatsApp — pesanan tidak boleh tertahan karena surel.
async function konfirmasi(db: any, b: any, oleh: string) {
  const id      = rapi(b.pesanan_id);
  const nominal = Number(b.nominal);
  const komisi  = Number(b.komisi ?? 0);
  if (!Number.isInteger(nominal) || nominal < 0 || !Number.isInteger(komisi) || komisi < 0)
    return jawab({ pesan: 'Nominal dan komisi harus angka bulat rupiah' }, 400);

  const { data: s } = await db.from('pesanan')
    .select('id, nomor, status, slug, email_klien, pria, wanita').eq('id', id).maybeSingle();
  if (!s) return jawab({ pesan: 'Pesanan tidak ada' }, 404);
  if (s.status !== 'menunggu') return jawab({ pesan: `Pesanan #${s.nomor} sudah ${s.status}` }, 409);

  const { data: dipakai } = await db.from('pasangan').select('id').eq('slug', s.slug).maybeSingle();
  if (dipakai) return jawab({ pesan: `Slug "${s.slug}" sudah dipakai pasangan lain` }, 409);

  let pengguna = await cariEmail(db, s.email_klien);
  let akunBaru = false, diundang = false, sandi: string | null = null;

  if (!pengguna) {
    const { data, error } = await db.auth.admin.inviteUserByEmail(s.email_klien, {
      redirectTo: 'https://mengundang.id/dasbor',
    });
    if (!error && data?.user) {
      pengguna = data.user; akunBaru = true; diundang = true;
    } else {
      console.error('undangan surel gagal, pakai sandi cadangan:', error?.message);
      sandi = sandiAcak();
      const dibuat = await db.auth.admin.createUser({ email: s.email_klien, password: sandi, email_confirm: true });
      if (dibuat.error) return jawab({ pesan: dibuat.error.message }, 400);
      pengguna = dibuat.data.user; akunBaru = true;
    }
  }

  const { data: pasanganId, error: gagal } = await db.rpc('pesanan_lunaskan', {
    p_id: id, p_nominal: nominal, p_komisi: komisi, p_oleh: oleh,
  });
  if (gagal) {
    if (akunBaru) await db.auth.admin.deleteUser(pengguna.id).catch(() => {});
    return jawab({ pesan: gagal.message }, 400);
  }

  const { data: pas } = await db.from('pasangan')
    .select('canonical_host').eq('id', pasanganId).maybeSingle();
  const { data: token } = await db.from('panitia_akses').select('nama, token, pihak')
    .eq('pasangan_id', pasanganId).order('pihak', { nullsFirst: true });

  return jawab({
    pasangan_id: pasanganId, nomor: s.nomor, slug: s.slug, email: s.email_klien,
    pria: s.pria, wanita: s.wanita,
    akun_baru: akunBaru, diundang, sandi,
    canonical_host: pas?.canonical_host ?? null, token: token ?? [],
  }, 201);
}

async function buatReseller(db: any, b: any) {
  const email = rapi(b.email).toLowerCase();
  const kode  = rapi(b.kode).toLowerCase();
  const nama  = rapi(b.nama);
  if (!EMAIL.test(email)) return jawab({ pesan: 'Email tidak sah' }, 400);
  if (!/^[a-z0-9]{2,20}$/.test(kode)) return jawab({ pesan: 'Kode hanya huruf kecil dan angka, 2–20' }, 400);
  if (!nama) return jawab({ pesan: 'Nama reseller harus diisi' }, 400);

  const { data: kembar } = await db.from('reseller').select('id').eq('kode', kode).maybeSingle();
  if (kembar) return jawab({ pesan: `Kode "${kode}" sudah dipakai` }, 409);

  let akun;
  try { akun = await akunDenganSandi(db, email, String(b.sandi ?? '')); }
  catch (e) { if (e instanceof GalatPengguna) return jawab({ pesan: e.message }, 400); throw e; }

  const { error } = await db.from('reseller').insert({
    user_id: akun.pengguna.id, kode, nama,
    kontak: rapi(b.kontak) || null, rekening: rapi(b.rekening) || null,
  });
  if (error) {
    if (akun.akunBaru) await db.auth.admin.deleteUser(akun.pengguna.id).catch(() => {});
    return jawab({ pesan: error.code === '23505' ? 'Akun itu sudah reseller' : error.message }, 400);
  }
  return jawab({ email, kode, nama, akun_baru: akun.akunBaru }, 201);
}

async function buatAdmin(db: any, b: any) {
  const email = rapi(b.email).toLowerCase();
  const nama  = rapi(b.nama) || null;
  if (!EMAIL.test(email)) return jawab({ pesan: 'Email tidak sah' }, 400);

  let akun;
  try { akun = await akunDenganSandi(db, email, String(b.sandi ?? '')); }
  catch (e) { if (e instanceof GalatPengguna) return jawab({ pesan: e.message }, 400); throw e; }

  const { error } = await db.from('admin').insert({ user_id: akun.pengguna.id, nama, peran: 'admin' });
  if (error) {
    if (akun.akunBaru) await db.auth.admin.deleteUser(akun.pengguna.id).catch(() => {});
    return jawab({ pesan: error.code === '23505' ? 'Akun itu sudah admin' : error.message }, 400);
  }
  return jawab({ email, nama, akun_baru: akun.akunBaru }, 201);
}
