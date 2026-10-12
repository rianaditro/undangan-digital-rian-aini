# Rencana: membangun 7 tema prewed

Disusun 12 Oktober 2026, lanjutan dari `docs/riset-tema-prewed.md`.

---

## 0. Titik berangkat — apa yang sudah ada, apa yang belum

| Sudah ada | Di mana |
|---|---|
| Tema = satu folder berisi `gaya.css`, ditukar tanpa kedipan | `tema/ukir-jepara/`, `gantiTema()` di `assets/varian.js` |
| Kolom `pasangan.tema`, dikembalikan `undangan_isi` | migrasi 002, 025 |
| Penjaga gerak untuk semua tema (hanya `transform`/`opacity`, wajib hormati gerak dikurangi) | `tema/periksa-gerak.mjs` |
| Pustaka foto per pasangan + potongan (`fokus_x/y`, `zum`) + mode `isi`/`utuh` | migrasi 009, 034, 035; `/dasbor` |
| Pengecil foto di peramban | `assets/gambar.js` |
| Parallax, runtun, gulir otomatis — disetel lewat variabel CSS tema | `assets/motion.js` |

**Celah terbesar:** halaman undangan (`index.html`) **belum menampilkan
foto prewed sama sekali**. Satu-satunya foto di sana adalah foto silsilah.
`undangan_isi` juga tidak mengirim foto pustaka. Pustaka foto sekarang
hanya dipakai halaman kenangan (`/terimakasih`).

Padahal 6 dari 7 tema hidup dari foto. Jadi pekerjaan pertama bukan tema,
melainkan **slot foto di halaman undangan** — dan itu menguntungkan
`ukir-jepara` juga.

Celah kedua: pemilih tema di dasbor masih daftar keras `['ukir-jepara']`
(`dasbor/index.html:654`).

---

## 1. Prinsip yang dipertahankan

1. **Satu `index.html` untuk semua tema.** Struktur dan isi tidak menyebut
   warna; tema tidak menyebut isi. Tema yang butuh susunan berbeda
   mencapainya lewat CSS (grid, `order`, `display:none` pada slot yang
   tidak dipakai), bukan HTML sendiri.
2. **Tema = folder.** Menambah tema tidak menyentuh halaman.
3. **JS tema opsional dan kecil.** Hanya untuk perilaku yang memang tidak
   bisa CSS (strip film yang bisa diseret, kemiringan polaroid acak).
   Halaman harus tetap utuh kalau berkas itu gagal dimuat.
4. **Setiap tema lulus 0 foto, 1 foto, banyak foto.**
5. **HP Android murah tetap patokan.** `periksa-gerak.mjs` berlaku tanpa
   pengecualian.

---

## 2. Arsitektur

### 2.1 Isi folder tema

```
tema/<kode>/
├── gaya.css      ← wajib. Semua tampilan.
├── tema.json     ← wajib. Manifest, dibaca dasbor dan uji.
├── tata.js       ← opsional. Perilaku khusus tema.
└── aset/         ← opsional. SVG ornamen, tekstur.
```

`tema.json`:

```json
{
  "kode": "dua-bingkai",
  "nama": "Dua Bingkai",
  "untuk": "Foto terpisah, atau tanpa foto",
  "foto_min": 0,
  "slot": ["sampul", "mempelai", "galeri"],
  "setelan": {
    "mode_mempelai": ["foto", "siluet", "monogram"]
  },
  "paket_min": "dasar"
}
```

Dasbor membangun pemilih tema dari manifest ini (daftar manifest dibangkitkan
jadi satu `tema/daftar.json` lewat skrip kecil, karena situs ini statis dan
tidak bisa membaca isi folder).

### 2.2 Slot baru di `index.html`

Ditambahkan sekali, dipakai semua tema. Slot kosong disembunyikan oleh
halaman (bukan oleh tema), jadi tema tidak perlu menebak.

| Slot | Isi | Dipakai tema |
|---|---|---|
| `#sampulFoto` | satu foto latar sampul (+ `fokus`, `zum`) | semua kecuali Dua Bingkai mode tanpa foto |
| foto per mempelai di `#pasangan` | foto/siluet/monogram per sisi | Dua Bingkai, Studio, Kisah |
| `#galeri` | daftar foto bertanda `galeri` | semua |
| `#kisah` | bab: tahun, judul, kalimat, foto opsional | Kisah (tema lain boleh menampilkan) |

`<body data-tema="…">` diisi supaya `tata.js` dan uji tahu tema aktif.

### 2.3 Data (migrasi 036, 037)

**036 — peran foto di undangan**

```
foto.peran  text  null | 'sampul' | 'mempelai_pria' | 'mempelai_wanita' | 'galeri'
```

- Satu `sampul` per pasangan dijaga pemicu, sama pola dengan
  `_foto_satu_latar()` di 026.
- `undangan_isi` menambah kunci `foto` (sampul, mempelai, galeri) membawa
  `jalur`, `kecil`, `fokus_x/y`, `zum`, `tampilan`, `lebar`, `tinggi`.
  Hanya menambah kunci — halaman lama mengabaikannya.
- `pasangan.tema_setel jsonb not null default '{}'` — setelan per tema:
  palet hasil ekstraksi, mode mempelai, daerah adat, aksen monokrom.
  Divalidasi di halaman terhadap `tema.json`, bukan di database (supaya
  tema baru tidak butuh migrasi).

**037 — kisah** (baru dikerjakan saat tema Kisah)

```
kisah (id, pasangan_id, urutan, tahun, judul, teks ≤140, foto_id → foto on delete set null)
```

RLS mengikuti pola `silsilah`: pemilik menulis lewat REST, anon membaca
lewat `undangan_isi`.

Kedua migrasi lewat jalur staging seperti di `docs/laporan-dev-dan-rencana.md`.

### 2.4 Palet dari foto

Di `assets/gambar.js`, saat foto ditandai `sampul`: gambar dikecilkan ke
32×32 di canvas, warna dikelompokkan, ambil 3 dominan, cek kontras teks
(WCAG AA) — bila gagal, gelapkan/terangkan. Hasilnya disimpan di
`tema_setel.palet` dan dipasang sebagai variabel CSS (`--palet-1..3`) di
`:root` sebelum sampul dibuka. Tema memutuskan sendiri mau memakainya
atau tidak (Senja di Alam memakai; Monokrom mengabaikan).

Tanpa server, tanpa pustaka.

### 2.5 Dasbor

- **Pemilih tema** jadi kartu bergambar, diawali pertanyaan *"Foto prewed
  kalian seperti apa?"* (tabel bagian 4 riset). Galeri lengkap di bawahnya.
- **Pratinjau** di iframe `/?pasangan=<slug>&tema=<kode>` sebelum disimpan.
- **Peran foto** di pustaka: tombol "jadikan sampul", "foto pria/wanita",
  "masuk galeri" — memakai panel potongan yang sudah ada (034).
- **Setelan tema** dibangkitkan dari `tema.json → setelan`.
- Peringatan lunak bila foto kurang dari `foto_min` — bukan larangan.

### 2.6 Uji

- `periksa-gerak.mjs` — sudah otomatis mencakup folder baru.
- **`uji/uji-tema.mjs` (baru):** untuk tiap tema × {0, 1, 8 foto} × {360px,
  1280px}: tidak ada galat JS, tidak ada gulir horizontal, slot kosong
  tersembunyi, gerak dikurangi dihormati, tangkapan layar disimpan untuk
  dinilai mata. Foto uji dibuat di canvas seperti `uji-lihat`.
- Uji manifest: setiap folder punya `tema.json` yang sah dan tercantum di
  `daftar.json`.

---

## 3. Urutan kerja

| Tahap | Isi | Kenapa di urutan ini |
|---|---|---|
| **A. Fondasi** | migrasi 036, slot di `index.html`, `undangan_isi` + foto, peran foto & pemilih tema di dasbor, `tema.json` + `daftar.json`, `uji-tema.mjs`, `ukir-jepara` diberi manifest dan gaya untuk slot baru | semua tema bergantung padanya; langsung menambah nilai ke tema yang sudah ada |
| **B. Dua Bingkai** | tema + mode foto/siluet/monogram per mempelai + aset SVG mihrab & siluet | celah pasar paling jelas; menguji setelan per tema; jalan dengan 0 foto |
| **C. Monokrom** | tema + `grayscale` + grid majalah | paling sederhana; membuktikan satu HTML bisa berganti susunan total lewat CSS |
| **D. Senja di Alam** | tema + ekstraksi palet (2.4) | menguji palet dari foto, yang lalu bisa dipakai tema lain |
| **E. Adat Nusantara** | `ukir-jepara` jadi varian Jawa; tambah Sunda, Bugis, Bali sebagai paket ornamen + palet lewat `tema_setel.daerah` | menata ulang yang sudah ada sebelum menambah; aset ornamen paling banyak |
| **F. Studio Anggun** | tema | tidak ada fitur baru; tema "aman" untuk katalog |
| **G. Dokumenter** | tema + `tata.js` pertama (strip film, polaroid) | menguji kontrak JS tema |
| **H. Kisah** | migrasi 037, editor bab di dasbor, tema | satu-satunya yang butuh tabel dan editor baru; paling banyak kerja dasbor |

Setiap tahap = satu PR kecil ke `main`, dengan uji hijau
dan tangkapan layar di deskripsinya.

---

## 4. Yang perlu diputuskan

1. **Mulai dari Tahap A sekarang?** Tanpa A, tidak ada tema yang bisa
   menampilkan foto prewed.
2. **Tema per paket?** Manifest menyiapkan `paket_min`. Usul: Dua Bingkai,
   Monokrom, Studio di paket dasar; Senja, Adat, Dokumenter, Kisah di
   paket atas.
3. **Aset ilustrasi** (siluet, ornamen daerah, tekstur): digambar sendiri
   sebagai SVG garis (murah, ringan, konsisten) atau beli aset? Usul: SVG
   garis buatan sendiri; ornamen adat perlu dicek orang yang paham
   motifnya.
4. **Huruf:** sekarang huruf `ukir-jepara` (Marcellus, Cormorant, Karla)
   ditautkan keras di `<head>` `index.html`. Di Tahap A tautan itu pindah
   ke manifest (`tema.json → huruf`) dan dipasang oleh `gantiTema()`
   bersama `gaya.css`, supaya tema lain tidak ikut mengunduh huruf yang
   tidak dipakainya. Bila ukuran jadi masalah di HP murah, huruf di-host
   sendiri di R2.
