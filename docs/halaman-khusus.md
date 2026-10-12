# Halaman khusus: jalan keluar dari template

Disusun 12 Oktober 2026. Untuk paket tertinggi: pemilik platform sendiri
yang membuat tampilan undangan per pasangan, dengan bantuan AI (sesi Claude
Code di repo ini).

---

## 0. Titik berangkat

- Paket sekarang ada dua (migrasi 023): **`standar`** di jalur domain
  bersama (`mengundang.id/budi-sari/…`) dan **`premium`** di subdomain sendiri
  (`budi-sari.mengundang.id/…`).
- Situsnya statis, terbit dari repo lewat Cloudflare Workers. Setiap PR
  mendapat **alamat pratinjau** sendiri (`preview_urls` di `wrangler.jsonc`).
- Tema = folder. Halaman undangan satu `index.html`, isinya dari
  `undangan_isi(slug)`.

> **Nama paket bertabrakan.** "Premium" sudah dipakai untuk paket
> subdomain. Paket baru ini perlu nama lain, misalnya **`eksklusif`**:
> semua yang premium punya, ditambah halaman khusus. Lihat bagian 7.

---

## 1. Tiga anak tangga

Tidak semua permintaan "custom" butuh halaman dari nol. Kebanyakan cukup
anak tangga kedua, yang jauh lebih murah dikerjakan dan dirawat.

| | Apa yang bisa diubah | Fitur bawaan (nama tamu, acara, ucapan, RSVP, hadiah, musik) | Waktu kerja kira-kira |
|---|---|---|---|
| **1. Tema + variasi** | palet, gaya teks, setelan tema | otomatis jalan | menit, oleh pasangan sendiri |
| **2. Tema khusus** | seluruh tampilan: warna bebas, huruf bebas, ornamen dan ilustrasi buatan, animasi, susunan bagian, perilaku kecil lewat JS | otomatis jalan | beberapa jam |
| **3. Halaman khusus** | struktur HTML bebas: bagian baru, alur baru (misal undangan berbentuk surat yang dibuka, peta interaktif, mini game) | dipakai lewat **kit**, wajib lulus kontrak | sekitar sehari |

Aturan praktis: mulai dari anak tangga 2. Naik ke 3 hanya bila yang diminta
memang tidak bisa dicapai dengan menata ulang bagian yang sudah ada.

---

## 2. Anak tangga 2 — tema khusus

```
tema/khusus/<slug>/
├── gaya.css
├── tema.json     ← "khusus": "<slug>", tanpa palet/huruf pilihan
├── tata.js       ← opsional
└── aset/
```

- Dipasang dengan `pasangan.tema = 'khusus/<slug>'`. `gantiTema()` sudah
  memuat `/tema/<nama>/gaya.css`, jadi cukup diperketat: nama harus cocok
  `^(khusus/)?[a-z0-9-]+$`.
- Tidak masuk `tema/daftar.json`, jadi tidak muncul di pemilih tema
  pasangan lain. Di dasbor pasangan pemiliknya tampil sebagai satu kartu
  "Tema khusus kalian" yang tidak bisa disetel.
- Semua penjaga berlaku: `periksa-gerak.mjs`, `periksa-palet.mjs` (untuk
  token yang dipakai), dan `uji-tema.mjs` (0/1/banyak foto, 360px/1280px).

Karena HTML-nya sama, setiap perbaikan platform di `index.html` (misal
perbaikan ucapan) otomatis sampai ke tema khusus.

---

## 3. Anak tangga 3 — halaman khusus

### 3.1 Bentuk

```
khusus/<slug>/
├── index.html    ← bebas
├── gaya.css
├── halaman.js
└── aset/
```

Hanya untuk paket bersubdomain. Alasannya keamanan: di subdomain sendiri,
halaman khusus punya **origin** yang berbeda dari `mengundang.id/dasbor`,
jadi skrip apa pun di dalamnya tidak bisa menyentuh sesi login dasbor.
Di paket standar (domain bersama) origin-nya sama, sehingga kesalahan
sekecil apa pun di halaman khusus bisa membaca token pasangan yang sedang
login.

### 3.2 Kit — bagian yang tidak dibuat ulang

Halaman khusus **tidak** berbicara langsung ke Supabase. Ia memakai kit,
yaitu permukaan publik `assets/varian.js` yang dibakukan dan diberi versi:

```js
const u = await Kit.muat();          // isi undangan + nama tamu dari alamat
u.mempelai, u.acara, u.tempat, u.foto, u.dompet, u.khusus
Kit.tamu()                           // nama tamu, sudah di-escape
Kit.ucapan.daftar() / .kirim({...})  // buku tamu + RSVP
Kit.musik(tombol)                    // musik latar + tombolnya
Kit.fotoUrl(f, 'kecil')              // alamat foto dari R2
Kit.gerak.runtun(el) / .parallax(el) // dari motion.js, sudah hormati gerak dikurangi
```

Dengan kit, AI cukup mengurus tampilan. Logika yang sudah teruji (alamat dan slug tamu,
buku tamu, escape, pemuatan tema tanpa kedipan) tidak ditulis ulang per
pasangan.

Kit diberi versi (`Kit.versi = 1`). Perubahan yang mematahkan permukaan
ini menaikkan versi, dan halaman lama tetap memakai versi lamanya.

### 3.3 Kontrak — syarat terbit

Diperiksa oleh `uji/uji-khusus.mjs`, yang menjalankan **setiap** folder di
`khusus/` dengan data stub:

1. Nama tamu dari alamat tampil.
2. Semua acara dan tempatnya tampil, dengan tautan peta.
3. Ucapan bisa dikirim, dan RSVP tercatat.
4. Hadiah/dompet tampil bila pasangan mengisinya.
5. Tidak ada galat JS. Tidak ada gulir horizontal di 360px.
6. Animasi lulus `periksa-gerak.mjs`, gerak dikurangi dihormati.
7. Skrip luar hanya dari daftar izin (Google Fonts, cdnjs). Tidak ada
   pelacak pihak ketiga.
8. Ukuran total halaman pertama (tanpa foto) ≤ 500 KB.

Karena uji ini jalan di setiap PR, **perubahan platform yang mematahkan
halaman khusus mana pun langsung merah**. Inilah yang membuat halaman
khusus tetap bisa dirawat bertahun-tahun.

### 3.4 Rute

Sekarang Worker hanya dipanggil untuk `/` dan `/media/*`. Alamat lain
(`/bapak-ahmad`) jatuh ke `index.html` lewat penanganan SPA tanpa melewati
Worker.

Perubahannya:

- `run_worker_first` diperluas ke navigasi halaman, dengan pengecualian
  untuk folder berkas (`!/assets/*`, `!/tema/*`, `!/khusus/*`, …), supaya
  satu kunjungan tamu = satu panggilan Worker, bukan belasan. Pola
  pengecualian `!` perlu dipastikan didukung versi wrangler yang dipakai;
  bila tidak, semua permintaan lewat Worker dan kuota gratis (100 ribu/hari)
  tetap cukup untuk skala sekarang.
- Worker membaca slug dari subdomain, atau dari segmen pertama jalur di
  alamat pratinjau, lalu mencoba `/khusus/<slug>/index.html` dari lapisan
  aset. Ada → disajikan. Tidak ada → `index.html` seperti biasa.

Tidak perlu peta atau kolom database untuk rute: keberadaan folder
adalah sakelarnya. Menghapus folder = kembali ke template.

---

## 4. Isi khusus tanpa migrasi

Halaman khusus sering butuh isi yang tidak punya kolom: kutipan favorit,
lirik lagu, daftar "10 hal tentang kami", tautan siaran langsung.

- Kolom baru `pasangan.khusus jsonb not null default '{}'`.
- Dikirim apa adanya oleh `undangan_isi` sebagai kunci `khusus`.
- Diisi pemilik dari `/pemilik` (editor JSON sederhana dengan validasi
  sintaks), bukan oleh pasangan. Bentuk isinya ditentukan halaman
  khususnya sendiri.

Satu kolom, satu migrasi, untuk semua kebutuhan isi aneh selamanya.

---

## 5. Alur kerja pemilik + AI

### 5.1 Brief dari pasangan

Di dasbor paket eksklusif muncul panel **Brief halaman khusus**:

- referensi (tautan Pinterest/Instagram, unggah tangkapan layar)
- foto acuan dari pustaka foto mereka
- warna, suasana, hal yang **tidak** diinginkan
- tenggat

Disimpan di tabel `brief_khusus` (pasangan_id, isi jsonb, status: `baru` →
`dikerjakan` → `pratinjau` → `revisi` → `terbit`, riwayat revisi). Pemilik
melihat antreannya di `/pemilik`.

### 5.2 Mengerjakan

Repo diberi skill `.claude/skills/halaman-khusus/SKILL.md`, supaya setiap
sesi AI bekerja dengan cara yang sama:

1. Baca brief (lewat Supabase MCP, atau ditempel).
2. Putuskan anak tangga 2 atau 3, beserta alasannya.
3. Salin kerangka `tema/khusus/_contoh/` atau `khusus/_contoh/`.
4. Ambil data pasangan sungguhan sebagai stub uji (pola `uji/undangan-isi.json`).
5. Bangun, jalankan `periksa-gerak`, `periksa-palet`, `uji-tema` /
   `uji-khusus`, ambil tangkapan layar HP dan desktop.
6. Buka PR dengan tangkapan layar. Workers Builds memberi alamat pratinjau.

### 5.3 Revisi dan terbit

- Pemilik mengirim alamat pratinjau ke pasangan (status `pratinjau`).
- Revisi = komit baru di PR yang sama. Batas putaran revisi ditentukan
  di paket (usul: 2 putaran).
- Gabung ke `main` → terbit. Untuk anak tangga 2, sekaligus mengisi
  `pasangan.tema = 'khusus/<slug>'`.

### 5.4 Yang sengaja tidak dibuat

**Unggah HTML lewat web.** Kelihatannya lebih cepat, tetapi kode AI masuk
ke produksi tanpa uji, tanpa riwayat, tanpa pratinjau, dan tanpa ada yang
tahu kalau perubahan platform berikutnya mematahkannya. Lewat repo, setiap
halaman khusus punya PR, riwayat, uji yang terus jalan, dan bisa dikembalikan
dengan satu `git revert`.

---

## 6. Urutan kerja

Halaman khusus bergantung pada Tahap A di `docs/rencana-tema.md` (slot foto,
token, manifest). Sesudahnya:

| Tahap | Isi |
|---|---|
| **K1** | tema khusus: validasi nama `khusus/…`, kerangka `_contoh`, pengecualian dari `daftar.json`, kartu di dasbor |
| **K2** | migrasi: paket `eksklusif`, kolom `pasangan.khusus`, tabel `brief_khusus`; panel brief di dasbor, antrean di `/pemilik` |
| **K3** | skill `halaman-khusus` + satu tema khusus percontohan (misal untuk Rian & 'Aini) |
| **K4** | kit v1 (dibakukan dari `varian.js`), rute di Worker, `uji-khusus.mjs`, kerangka `khusus/_contoh/` |

K1–K3 sudah cukup untuk mulai menjual paket. K4 menyusul saat ada
permintaan yang memang butuh struktur HTML sendiri.

---

## 7. Yang perlu diputuskan

1. **Nama paket**: `eksklusif`, atau nama lain? Paket `premium` yang ada
   tetap berarti subdomain sendiri.
2. **Batas revisi** per pesanan (usul 2 putaran), dan apa yang terjadi
   sesudahnya (biaya tambahan per putaran?).
3. **Halaman kenangan** (`/terimakasih`) ikut dibuat khusus, atau tetap
   template? Usul: tetap template, dengan palet dan huruf diambil dari tema
   khususnya.
4. **Hak pakai ulang**: boleh tidak sebuah tema khusus, setelah acara,
   dijadikan tema katalog (dengan izin pasangan)? Ini cara murah menambah
   katalog dari pekerjaan yang sudah dibayar.
