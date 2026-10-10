# Uji

Uji peramban untuk seluruh halaman, dijalankan terhadap salinan lokal
situs dengan Supabase **distub** — tidak ada satu pun permintaan yang
sampai ke database sungguhan.

```
cd uji
npm install
npm test                    # semua suite
node semua.mjs dasbor       # hanya suite yang namanya mengandung "dasbor"
```

Playwright butuh Chromium. Kalau `npm install` tidak memasangnya sendiri:
`npx playwright install chromium`.

## Isinya

| Suite | Yang diuji |
|---|---|
| `uji-alamat` | aturan alamat — subdomain, jalur, `?pasangan=`, slug tamu, link yang dibuat bisa dibaca lagi. Node murni, tanpa peramban |
| `uji-undangan` | halaman undangan lewat kedua bentuk alamat, nama tamu dari database, buku tamu per pasangan |
| `uji-coba` | `/coba` dan `/mulai`: demo tanpa jaringan, redirect akar domain |
| `uji-asap` | tiap halaman dibuka tanpa stub; yang dicari cuma galat waktu memuat |
| `uji-dasbor` | `/dasbor`: rangkaian acara, pustaka foto, panel 9 halaman kenangan (latar, kalimat babak, blok, upsert hanya yang berubah), keterangan pra/pasca-acara |
| `uji-admin` | `/admin`: gerbang admin, buat pasangan, paket, link panitia |
| `uji-rekap`, `uji-018` | rekap pasca-acara di `/kirim`: kehadiran, pemberian, berkat, kelompok |
| `uji-lihat` | halaman kenangan: babak berfoto vs kartu teks, latar sampul, pan hanya saat terlihat, blok dari panel 9, angka nol tidak dipajang, jawaban bentuk lama, escape, gerak dikurangi. Foto latarnya dibuat di peramban (canvas) supaya tangkapan layarnya bisa dinilai mata |
| `uji-fungsi-foto` | edge function `foto-unggah` **dijalankan sungguhan di Deno** dengan Supabase ditiru di belakangnya: token panitia vs JWT pemilik, pasangan mana yang kena, pembersihan berkas saat gagal. Butuh `deno` di PATH atau `DENO=` |
| `uji-xlsx`, `uji-unduh` | menghasilkan berkas `.xlsx`; isinya diperiksa terpisah (lihat di bawah) |

Galat JavaScript di halaman (`[pageerror]`) dihitung gagal oleh `semua.mjs`,
walaupun semua cek suite-nya lulus.

`server.mjs` meniru Cloudflare Workers: konfigurasi dari `wrangler.jsonc`,
`.assetsignore`, dan `_headers`, dan untuk `/` menjalankan
`cloudflare/pintu.js` yang sama dengan produksi. Aturan lapisan asetnya
dicocokkan dengan `wrangler dev`. `stub.mjs` dan `undangan-isi.json`
memegang data tiruan.

## Database

Supabase di paket gratis tidak punya database staging, jadi penggantinya
ada di `db/`: skema dibangun ulang dari nol di Postgres biasa, lalu diuji.
Tidak ada yang menyentuh produksi.

```
PGURL=postgres://postgres@localhost:5432/postgres db/uji.sh
```

| Berkas | Gunanya |
|---|---|
| `db/supabase-tiruan.sql` | peran, default privileges, `auth.*`, `storage.*`, pgcrypto — sekecil yang dibutuhkan migrasi |
| `db/bangun.sh` | tiruan + semua migrasi ke database `bangun`. `SAMPAI=020` berhenti di migrasi itu |
| `sql/*.sql` | uji SQL. Masing-masing satu blok `do` yang diakhiri `raise` berisi `LULUS n GAGAL m`, jadi transaksinya selalu dibatalkan — aman juga dijalankan di produksi |
| `db/kompat.mjs` | **aturan kompatibilitas**: membaca setiap panggilan Supabase di halaman pada satu ref git (bawaan `origin/main`) dan memastikan skema hasil bangun masih melayaninya — fungsi dan nama argumennya, argumen wajib, hak peran pemanggilnya (anon atau authenticated, dibaca dari header Authorization yang dikirim, juga lewat fungsi pembantu), kolom tabel, kebijakan RLS per peran |
| `db/sidik.sql`, `db/banding.sh` | **pemeriksa selisih** repo vs produksi (di bawah) |
| `db/uji.sh` | semua di atas, berurutan. Ini yang dijalankan CI |

`kompat.mjs` membaca commit, bukan berkas yang belum di-commit.

### Aturan kompatibilitas, dan kenapa

Produksi dan pengembangan memakai satu database, dan halaman di `main`
tayang terus. Maka migrasi dari cabang mana pun harus **menambah dulu,
membuang belakangan**: fungsi atau kolom yang masih dipanggil `main` tidak
boleh hilang atau berubah tanda tangan sampai `main` berhenti memakainya.

Pemeriksanya diuji terhadap kejadian sungguhan: kode `main` sebelum
tambalan `5dacdd1` sah terhadap skema sampai migrasi 011, dan patah di tiga
tempat terhadap skema sekarang — buku tamu baca (021), buku tamu tulis
(012), nama tamu (022). Yang keempat dari September, nilai status berkat,
adalah nilai data saat program berjalan dan tidak terlihat dari membaca
kode.

### Repo vs produksi

```
PGURL=... db/banding.sh > /tmp/banding.sql
```

lalu jalankan isi `/tmp/banding.sql` di produksi (SQL editor Supabase).
Hash setiap fungsi, kolom, batasan, indeks, kebijakan, dan pemicu hasil
bangun ditanam ke dalam kueri; produksi hanya mengembalikan yang berbeda.
Kosong berarti repo dan produksi identik. Migrasi yang sengaja belum
dipasang di produksi muncul sebagai "hanya di repo".

## Yang belum otomatis

- **Isi berkas `.xlsx`.** `uji-xlsx` dan `uji-unduh` cuma memastikan
  berkasnya terbentuk. Isinya — sel, gaya, lembar — dulu diperiksa dengan
  openpyxl dari Python, dan pemeriksaan itu belum ikut dipindahkan ke sini.
- **Jalur HTTP sungguhan.** Karena Supabase distub, tidak ada uji di sini
  yang membuktikan RPC benar-benar menjawab seperti yang ditiru stub-nya.
  `db/kompat.mjs` menutup sebagian: ia memastikan yang dipanggil halaman
  memang ada di skema, dengan hak yang benar. `foto-unggah` sendiri
  dijalankan sungguhan (`uji-fungsi-foto`); `admin-pasangan` belum.
- **Selisih dengan produksi** dijalankan tangan, karena CI tidak memegang
  kunci produksi — dan sebaiknya memang tidak.
