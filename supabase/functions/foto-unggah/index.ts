// foto-unggah — satu-satunya jalan menulis ke bucket `foto`.
//
// Kenapa perlu fungsi ini sama sekali: peramban cuma memegang anon key dan
// token panitia. RLS storage hanya bisa melihat auth.role(), ia tidak punya
// cara memeriksa token kita. Jadi pilihannya cuma dua — mengizinkan anon
// menulis (artinya siapa pun di internet boleh menitipkan berkas di bucket
// ini), atau menaruh satu pemeriksa di depan. Ini pemeriksanya.
//
// service_role tidak pernah keluar dari sini.
//
// POST   → unggah sepasang berkas (penuh + thumbnail), catat barisnya
// DELETE → hapus berkasnya sekaligus barisnya

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATAS_PENUH  = 2 * 1024 * 1024;   // 2 MB, sepadan dengan batas bucket
const BATAS_KECIL  = 512 * 1024;        // 512 KB, thumbnail tidak mungkin sebesar ini
const BATAS_JUMLAH = 100;               // per pasangan; penjaga kuota free tier
const MIME_BOLEH   = ['image/webp', 'image/jpeg'];

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-panitia-token',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

function jawab(isi: unknown, status = 200) {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Angka dari peramban cuma dipakai untuk memesan ruang di tata letak, tapi
// tetap tidak boleh ditelan mentah-mentah.
function angkaWajar(nilai: unknown): number | null {
  const n = Number(nilai);
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  return Math.round(n);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const token = req.headers.get('x-panitia-token');
  if (!token) return jawab({ pesan: 'Token panitia tidak disertakan' }, 401);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Token ditukar jadi pasangan_id. Fungsinya menolak token per-pihak, jadi
  // pemegang link keluarga berhenti di sini.
  const { data: pasanganId, error: salahToken } =
    await db.rpc('panitia_pasangan_penuh', { p_token: token });

  if (salahToken || !pasanganId) {
    return jawab({ pesan: salahToken?.message ?? 'Token tidak dikenal' }, 403);
  }

  try {
    if (req.method === 'POST')   return await unggah(db, pasanganId, req);
    if (req.method === 'DELETE') return await hapus(db, pasanganId, req);
    return jawab({ pesan: 'Metode tidak didukung' }, 405);
  } catch (e) {
    console.error('foto-unggah gagal:', e);
    return jawab({ pesan: 'Gagal memproses berkas' }, 500);
  }
});

async function unggah(db: any, pasanganId: string, req: Request) {
  const { count } = await db
    .from('foto')
    .select('id', { count: 'exact', head: true })
    .eq('pasangan_id', pasanganId);

  if ((count ?? 0) >= BATAS_JUMLAH) {
    return jawab({ pesan: `Sudah mencapai batas ${BATAS_JUMLAH} foto` }, 409);
  }

  const form   = await req.formData();
  const penuh  = form.get('berkas');
  const kecil  = form.get('kecil');

  if (!(penuh instanceof File)) return jawab({ pesan: 'Berkas tidak ada' }, 400);

  // Tipe dan ukuran diperiksa lagi di sini. Yang dikirim peramban tidak
  // pernah jadi dasar keputusan, sekalipun assets/gambar.js sudah
  // mengecilkannya — jalur ini terbuka untuk siapa saja yang punya token.
  if (!MIME_BOLEH.includes(penuh.type)) {
    return jawab({ pesan: `Jenis berkas ${penuh.type || 'tidak dikenal'} tidak diterima` }, 415);
  }
  if (penuh.size > BATAS_PENUH) {
    return jawab({ pesan: 'Berkas terlalu besar, kecilkan dulu di peramban' }, 413);
  }
  if (kecil instanceof File && (!MIME_BOLEH.includes(kecil.type) || kecil.size > BATAS_KECIL)) {
    return jawab({ pesan: 'Thumbnail tidak sah' }, 400);
  }

  const ext       = penuh.type === 'image/jpeg' ? 'jpg' : 'webp';
  const nama      = crypto.randomUUID();
  const jalur     = `${pasanganId}/${nama}.${ext}`;
  const jalurKecil = kecil instanceof File ? `${pasanganId}/${nama}-kecil.${ext}` : null;

  const naik = await db.storage.from('foto').upload(jalur, penuh, {
    contentType: penuh.type,
    cacheControl: '31536000',   // setahun; nama berkasnya uuid, tidak pernah dipakai ulang
    upsert: false,
  });
  if (naik.error) throw naik.error;

  if (jalurKecil) {
    const naikKecil = await db.storage.from('foto').upload(jalurKecil, kecil as File, {
      contentType: (kecil as File).type,
      cacheControl: '31536000',
      upsert: false,
    });
    // Thumbnail gagal bukan alasan membatalkan yang utama; halaman masih
    // bisa memakai versi penuh.
    if (naikKecil.error) console.error('thumbnail gagal:', naikKecil.error);
  }

  const { data: baris, error: gagalCatat } = await db
    .from('foto')
    .insert({
      pasangan_id: pasanganId,
      jalur,
      jalur_kecil: jalurKecil,
      lebar:  angkaWajar(form.get('lebar')),
      tinggi: angkaWajar(form.get('tinggi')),
      bita:   penuh.size,
      // Urutan diberi nilai berurutan sejak awal. Kalau dibiarkan 0
      // semua, galeri jatuh ke urutan unggah dan tombol naik/turun di
      // halaman panitia tidak punya apa-apa untuk ditukar.
      urutan: count ?? 0,
      keterangan: (form.get('keterangan') as string | null)?.slice(0, 280) || null,
    })
    .select('id, jalur, jalur_kecil, lebar, tinggi, bita, urutan, keterangan, tampil')
    .single();

  if (gagalCatat) {
    // Barisnya gagal dicatat, jadi berkasnya jangan ditinggal jadi sampah
    // yang tidak terhubung ke apa pun.
    await db.storage.from('foto').remove(jalurKecil ? [jalur, jalurKecil] : [jalur]);
    throw gagalCatat;
  }

  return jawab({ foto: baris, terpakai: (count ?? 0) + 1, batas: BATAS_JUMLAH }, 201);
}

async function hapus(db: any, pasanganId: string, req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jawab({ pesan: 'id foto tidak disebut' }, 400);

  // Saringan pasangan_id ikut di sini, bukan cuma di id-nya — supaya
  // pemegang token satu pasangan tidak bisa menghapus foto pasangan lain
  // sekalipun ia menebak id yang benar.
  const { data: baris, error } = await db
    .from('foto')
    .select('jalur, jalur_kecil')
    .eq('id', id)
    .eq('pasangan_id', pasanganId)
    .maybeSingle();

  if (error) throw error;
  if (!baris) return jawab({ pesan: 'Foto tidak ditemukan' }, 404);

  const berkas = [baris.jalur, baris.jalur_kecil].filter(Boolean) as string[];
  const buang = await db.storage.from('foto').remove(berkas);
  if (buang.error) throw buang.error;

  const { error: gagalHapus } = await db
    .from('foto').delete().eq('id', id).eq('pasangan_id', pasanganId);
  if (gagalHapus) throw gagalHapus;

  return jawab({ dihapus: id });
}
