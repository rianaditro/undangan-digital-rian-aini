// foto-unggah — satu-satunya jalan menulis ke bucket `foto`.
//
// Kenapa perlu fungsi ini sama sekali: RLS storage hanya bisa melihat
// auth.role(), bukan tabel `pemilik`. Pilihannya cuma dua — mengizinkan
// setiap pengguna yang login menulis ke seluruh bucket, atau menaruh satu
// pemeriksa di depan yang tahu pasangan mana milik siapa. Ini
// pemeriksanya.
//
// Satu jalan masuk: JWT pemilik, dari /dasbor. Dulu ada jalan kedua —
// token link panitia, dipakai /kirim untuk foto silsilah. Sejak Fase 3
// editor silsilah pindah ke dasbor, dan jalan itu ditutup: link panitia
// bisa diteruskan siapa saja, pemilik undangan tidak.
//
// service_role tidak pernah keluar dari sini.
//
// POST   → unggah sepasang berkas (penuh + thumbnail), catat barisnya.
//          Video (033): berkasnya apa adanya, `kecil` jadi posternya —
//          wajib, dipotret peramban dari salah satu bingkainya.
// DELETE → hapus berkasnya sekaligus barisnya
//
// Dua tujuan, satu pintu. `untuk=acara` (bawaan) menaruh barisnya di
// tabel `foto`; `untuk=silsilah&id=…` menempelkan fotonya ke satu baris
// silsilah. Dipisah jadi dua fungsi berarti dua salinan pemeriksa token
// dan dua salinan batas ukuran — dan salinan seperti itu selalu berakhir
// beda perilaku dari induknya.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATAS_PENUH  = 2 * 1024 * 1024;   // 2 MB per foto
const BATAS_VIDEO  = 20 * 1024 * 1024;  // 20 MB per video, sepadan dengan batas bucket (033)
const BATAS_KECIL  = 512 * 1024;        // 512 KB, thumbnail/poster tidak mungkin sebesar ini
const BATAS_JUMLAH = 100;               // per pasangan, foto + video; penjaga kuota free tier
const BATAS_JUMLAH_VIDEO = 12;          // video jauh lebih berat; 12 × 20 MB sudah seperempat kuota
const MIME_BOLEH   = ['image/webp', 'image/jpeg'];
const MIME_VIDEO   = ['video/mp4', 'video/webm'];
// Bab kenangan yang bukan baris acara (migrasi 033).
const BAGIAN = ['sampul', 'pria', 'wanita', 'kedatangan', 'sungkem', 'keluarga', 'tamu', 'berdua'];

// x-panitia-token tetap diizinkan di preflight walau jalannya sudah
// ditutup: tanpa itu peramban yang masih memuat /kirim lama gagal di CORS
// dan tidak pernah membaca penolakan yang menjelaskan ke mana harus pergi.
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

function durasiWajar(nilai: unknown): number | null {
  const n = Number(nilai);
  if (!Number.isFinite(n) || n < 0 || n > 600000) return null;
  return Math.round(n);
}

// Pemilik, dan pasangan mana yang sedang diurusnya.
async function siapa(db: any, req: Request): Promise<[string | null, Response | null]> {
  // Halaman /kirim lama masih mengirim token panitia. Ditolak terang-
  // terangan, bukan diabaikan: tanpa ini ia jatuh ke pemeriksaan JWT,
  // anon key-nya gagal di sana, dan pesannya "Sesi tidak sah" — benar,
  // tapi tidak memberi tahu ke mana harus pergi.
  if (req.headers.get('x-panitia-token')) {
    return [null, jawab({ pesan: 'Foto sekarang diunggah dari dasbor pengantin, bukan dari link panitia.' }, 403)];
  }

  // anon key ITU SENDIRI JWT yang sah, jadi keberadaan header Authorization
  // tidak membuktikan apa pun. Yang membuktikan: getUser() berhasil
  // menukarnya jadi seorang pengguna. Anon key gagal di langkah itu.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return [null, jawab({ pesan: 'Belum masuk' }, 401)];

  const { data: sesi, error: salahJwt } = await db.auth.getUser(jwt);
  if (salahJwt || !sesi?.user) return [null, jawab({ pesan: 'Sesi tidak sah' }, 401)];

  const { data: milik } = await db
    .from('pemilik').select('pasangan_id').eq('user_id', sesi.user.id);

  const daftar: string[] = (milik ?? []).map((m: any) => m.pasangan_id);
  if (!daftar.length) {
    return [null, jawab({ pesan: 'Akun ini belum dihubungkan ke undangan mana pun' }, 403)];
  }

  // Satu akun boleh memegang lebih dari satu pasangan — reseller, atau
  // keluarga yang menikahkan dua anak. Kalau begitu, penyebutannya harus
  // datang dari pemanggil, dan tetap diperiksa terhadap daftar miliknya.
  const diminta = new URL(req.url).searchParams.get('pasangan');
  if (diminta) {
    if (!daftar.includes(diminta)) return [null, jawab({ pesan: 'Bukan undangan Anda' }, 403)];
    return [diminta, null];
  }
  if (daftar.length > 1) {
    return [null, jawab({ pesan: 'Akun ini memegang beberapa undangan; sebutkan yang mana' }, 409)];
  }
  return [daftar[0], null];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const [pasanganId, tolakan] = await siapa(db, req);
  if (tolakan) return tolakan;

  const url   = new URL(req.url);
  const untuk = url.searchParams.get('untuk') ?? 'acara';
  if (untuk !== 'acara' && untuk !== 'silsilah') {
    return jawab({ pesan: 'Tujuan unggahan tidak dikenal' }, 400);
  }

  try {
    if (req.method === 'POST')   return await unggah(db, pasanganId!, req, untuk);
    if (req.method === 'DELETE') return await hapus(db, pasanganId!, req, untuk);
    return jawab({ pesan: 'Metode tidak didukung' }, 405);
  } catch (e) {
    console.error('foto-unggah gagal:', e);
    return jawab({ pesan: 'Gagal memproses berkas' }, 500);
  }
});

// Nilai dari peramban tidak pernah jadi dasar keputusan. Acara yang
// disebut harus benar-benar milik pasangan ini; kalau bukan, fotonya tetap
// terunggah tapi jadi foto lepas — bukan digagalkan, karena yang salah
// cuma labelnya dan berkasnya sudah terlanjur naik.
async function acaraSah(db: any, pasanganId: string, nilai: unknown): Promise<string | null> {
  const id = typeof nilai === 'string' ? nilai.trim() : '';
  if (!id) return null;
  const { data } = await db
    .from('acara').select('id').eq('id', id).eq('pasangan_id', pasanganId).maybeSingle();
  return data ? id : null;
}

async function unggah(db: any, pasanganId: string, req: Request, untuk: string) {
  const { count } = await db
    .from('foto')
    .select('id', { count: 'exact', head: true })
    .eq('pasangan_id', pasanganId);

  // Batas jumlah hanya berlaku untuk galeri acara. Foto silsilah
  // menempel pada baris yang sudah ada, jadi jumlahnya sudah dibatasi
  // oleh banyaknya anggota keluarga yang diisi.
  if (untuk === 'acara' && (count ?? 0) >= BATAS_JUMLAH) {
    return jawab({ pesan: `Sudah mencapai batas ${BATAS_JUMLAH} foto` }, 409);
  }

  const form   = await req.formData();
  const penuh  = form.get('berkas');
  const kecil  = form.get('kecil');

  if (!(penuh instanceof File)) return jawab({ pesan: 'Berkas tidak ada' }, 400);

  // Tipe dan ukuran diperiksa lagi di sini. Yang dikirim peramban tidak
  // pernah jadi dasar keputusan, sekalipun assets/gambar.js sudah
  // mengecilkannya — pemilik yang login pun bisa mengirim apa saja.
  const video = MIME_VIDEO.includes(penuh.type);
  if (video && untuk !== 'acara') {
    return jawab({ pesan: 'Video hanya untuk halaman kenangan' }, 415);
  }
  if (!video && !MIME_BOLEH.includes(penuh.type)) {
    return jawab({ pesan: `Jenis berkas ${penuh.type || 'tidak dikenal'} tidak diterima` }, 415);
  }
  if (penuh.size > (video ? BATAS_VIDEO : BATAS_PENUH)) {
    return jawab({ pesan: video ? 'Video lebih dari 20 MB' : 'Berkas terlalu besar, kecilkan dulu di peramban' }, 413);
  }
  if (kecil instanceof File && (!MIME_BOLEH.includes(kecil.type) || kecil.size > BATAS_KECIL)) {
    return jawab({ pesan: 'Thumbnail tidak sah' }, 400);
  }
  if (video && !(kecil instanceof File)) {
    return jawab({ pesan: 'Video harus disertai poster' }, 400);
  }
  if (video) {
    const { count: nVideo } = await db
      .from('foto').select('id', { count: 'exact', head: true })
      .eq('pasangan_id', pasanganId).eq('jenis', 'video');
    if ((nVideo ?? 0) >= BATAS_JUMLAH_VIDEO) {
      return jawab({ pesan: `Sudah mencapai batas ${BATAS_JUMLAH_VIDEO} video` }, 409);
    }
  }

  const ext       = video ? (penuh.type === 'video/webm' ? 'webm' : 'mp4')
                  : penuh.type === 'image/jpeg' ? 'jpg' : 'webp';
  const nama      = crypto.randomUUID();
  const jalur     = `${pasanganId}/${nama}.${ext}`;
  const extKecil  = kecil instanceof File && kecil.type === 'image/jpeg' ? 'jpg' : 'webp';
  const jalurKecil = kecil instanceof File ? `${pasanganId}/${nama}-kecil.${extKecil}` : null;

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
    // bisa memakai versi penuh. Poster video lain cerita: tanpa poster,
    // dasbor dan halaman tidak punya gambar untuk ditampilkan.
    if (naikKecil.error) {
      console.error('thumbnail gagal:', naikKecil.error);
      if (video) {
        await db.storage.from('foto').remove([jalur]);
        throw naikKecil.error;
      }
    }
  }

  if (untuk === 'silsilah') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      await db.storage.from('foto').remove(jalurKecil ? [jalur, jalurKecil] : [jalur]);
      return jawab({ pesan: 'id baris silsilah tidak disebut' }, 400);
    }

    // Foto lama dibuang supaya bucket tidak menyimpan berkas yatim tiap
    // kali fotonya diganti.
    const { data: lama } = await db
      .from('silsilah').select('foto_jalur, foto_kecil')
      .eq('id', id).eq('pasangan_id', pasanganId).maybeSingle();

    const { data: barisS, error: gagalS } = await db
      .from('silsilah')
      .update({
        foto_jalur: jalur,
        foto_kecil: jalurKecil,
        lebar:  angkaWajar(form.get('lebar')),
        tinggi: angkaWajar(form.get('tinggi')),
      })
      .eq('id', id).eq('pasangan_id', pasanganId)
      .select('id, peran, nama, foto_jalur, foto_kecil, lebar, tinggi')
      .maybeSingle();

    if (gagalS || !barisS) {
      await db.storage.from('foto').remove(jalurKecil ? [jalur, jalurKecil] : [jalur]);
      return jawab({ pesan: 'Baris silsilah tidak ditemukan' }, 404);
    }

    if (lama?.foto_jalur) {
      const buang = [lama.foto_jalur, lama.foto_kecil].filter(Boolean) as string[];
      await db.storage.from('foto').remove(buang);
    }
    return jawab({ silsilah: barisS }, 201);
  }

  const nilaiBagian = String(form.get('bagian') ?? '').trim();
  const bagian = BAGIAN.includes(nilaiBagian) ? nilaiBagian : null;

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
      // Babaknya boleh disebut sejak awal — panel 8 mengunggah per babak
      // kalau salah satu sedang dipilih. Yang disebut tetap diperiksa
      // milik pasangan ini; tanpa itu, pemilik satu pasangan bisa
      // menempelkan fotonya ke acara pasangan lain.
      acara_id: bagian ? null : await acaraSah(db, pasanganId, form.get('acara_id')),
      bagian,
      jenis: video ? 'video' : 'foto',
      durasi_ms: video ? durasiWajar(form.get('durasi_ms')) : null,
    })
    .select('id, jalur, jalur_kecil, lebar, tinggi, bita, urutan, keterangan, tampil, acara_id, latar, bagian, jenis, durasi_ms')
    .single();

  if (gagalCatat) {
    // Barisnya gagal dicatat, jadi berkasnya jangan ditinggal jadi sampah
    // yang tidak terhubung ke apa pun.
    await db.storage.from('foto').remove(jalurKecil ? [jalur, jalurKecil] : [jalur]);
    throw gagalCatat;
  }

  return jawab({ foto: baris, terpakai: (count ?? 0) + 1, batas: BATAS_JUMLAH }, 201);
}

async function hapus(db: any, pasanganId: string, req: Request, untuk: string) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jawab({ pesan: 'id foto tidak disebut' }, 400);

  if (untuk === 'silsilah') {
    const { data: baris } = await db
      .from('silsilah').select('foto_jalur, foto_kecil')
      .eq('id', id).eq('pasangan_id', pasanganId).maybeSingle();
    if (!baris) return jawab({ pesan: 'Baris silsilah tidak ditemukan' }, 404);

    const berkas = [baris.foto_jalur, baris.foto_kecil].filter(Boolean) as string[];
    if (berkas.length) await db.storage.from('foto').remove(berkas);

    // Barisnya tetap ada; yang dilepas cuma fotonya.
    await db.from('silsilah')
      .update({ foto_jalur: null, foto_kecil: null, lebar: null, tinggi: null })
      .eq('id', id).eq('pasangan_id', pasanganId);
    return jawab({ fotoDilepas: id });
  }

  // Saringan pasangan_id ikut di sini, bukan cuma di id-nya — supaya
  // pemilik satu pasangan tidak bisa menghapus foto pasangan lain
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
