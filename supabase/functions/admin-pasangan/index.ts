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
// POST { aksi: 'buat',  slug, email, sandi, pria, wanita, tanggal, kota }
// POST { aksi: 'sandi', email, sandi }
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
    .from('admin').select('user_id').eq('user_id', siapa.user.id).maybeSingle();
  if (!adm) return jawab({ pesan: 'Halaman ini hanya untuk admin' }, 403);

  let badan: any = {};
  try { badan = await req.json(); } catch { /* biarkan kosong, divalidasi di bawah */ }

  try {
    if (badan.aksi === 'sandi') return await gantiSandi(db, badan);
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

  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 40)
    return jawab({ pesan: 'Slug hanya huruf kecil, angka, dan tanda hubung (3–40 huruf)' }, 400);
  if (!EMAIL.test(email))
    return jawab({ pesan: 'Email klien tidak sah' }, 400);
  if (!pria || !wanita)
    return jawab({ pesan: 'Nama panggilan kedua mempelai harus diisi' }, 400);
  if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return jawab({ pesan: 'Tanggal acara harus berbentuk YYYY-MM-DD' }, 400);

  // Slug diperiksa DULU. Kalau tidak, akun klien terlanjur dibuat lalu
  // pasangan_siapkan() gagal — dan yang tersisa adalah akun yatim yang
  // tidak akan pernah ada yang tahu harus diapakan.
  const { data: sudahAda } = await db
    .from('pasangan').select('id').eq('slug', slug).maybeSingle();
  if (sudahAda) return jawab({ pesan: `Slug "${slug}" sudah dipakai pasangan lain` }, 409);

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
    p_tanggal: tanggal, p_kota: kota,
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

  return jawab({ pasangan_id: pasanganId, slug, email, akun_baru: akunBaru, token: token ?? [] }, 201);
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
