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
├── gaya.css      ← wajib. Tampilan halaman undangan.
├── kenangan.css  ← wajib. Tampilan halaman terima kasih (lihat docs/halaman-khusus.md bagian 5).
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
  }
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

**038 — kisah** (baru dikerjakan saat tema Kisah)

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
| **A. Fondasi** | migrasi 036, slot di `index.html`, `undangan_isi` + foto, peran foto & pemilih tema di dasbor, `tema.json` + `daftar.json`, `uji-tema.mjs`, `ukir-jepara` diberi manifest dan gaya untuk slot baru, token bersama + palet & gaya teks per tema (`docs/variasi-tema.md`), gaya `/terimakasih` dipindah ke `tema/ukir-jepara/kenangan.css` dan dimuat menurut tema pasangan | semua tema bergantung padanya; langsung menambah nilai ke tema yang sudah ada |
| **B. Dua Bingkai** | tema + mode foto/siluet/monogram per mempelai + aset SVG mihrab & siluet | celah pasar paling jelas; menguji setelan per tema; jalan dengan 0 foto |
| **C. Monokrom** | tema + `grayscale` + grid majalah | paling sederhana; membuktikan satu HTML bisa berganti susunan total lewat CSS |
| **D. Senja di Alam** | tema + ekstraksi palet (2.4) | menguji palet dari foto, yang lalu bisa dipakai tema lain |
| **E. Adat Nusantara** | `ukir-jepara` jadi varian Jawa; tambah Sunda, Bugis, Bali sebagai paket ornamen + palet lewat `tema_setel.daerah` | menata ulang yang sudah ada sebelum menambah; aset ornamen paling banyak |
| **F. Studio Anggun** | tema | tidak ada fitur baru; tema "aman" untuk katalog |
| **G. Dokumenter** | tema + `tata.js` pertama (strip film, polaroid) | menguji kontrak JS tema |
| **H. Kisah** | migrasi 038, editor bab di dasbor, tema | satu-satunya yang butuh tabel dan editor baru; paling banyak kerja dasbor |

Setiap tema masuk bersama `kenangan.css`-nya: halaman terima kasih selalu
mengikuti template undangannya.

Setiap tahap = satu PR kecil ke `main`, dengan uji hijau
dan tangkapan layar di deskripsinya.

---

## 3a. Tahap A — selesai (13 Oktober 2026)

Terpasang di cabang ini, belum di produksi. Yang berbeda dari rencana di
atas, dan kenapa:

| Rencana | Jadinya | Sebab |
|---|---|---|
| Palet = 3 warna (latar, teks, aksen) | 3 warna **wajib** + turunan yang boleh ditulis sendiri: `latar_2`, `latar_tengah`, `latar_3`, `bayang`, `aksen_terang`, `aksen_redup`, `kertas`, `kertas_2`, `kertas_teks`, `kertas_aksen`, `ornamen` | `ukir-jepara` punya **dua permukaan** (nila gelap dan kertas terang). Turunan otomatis untuk tema satu permukaan; ditulis tangan bila warna lama harus dijaga persis |
| Turunan dihitung saat `daftar.json` dibangun | Dihitung di peramban oleh `MENGUNDANG.tema` (`assets/varian.js`) | Satu rumus dipakai halaman, dasbor, dan `periksa-palet.mjs`; tidak ada berkas hasil bangun yang bisa tertinggal |
| Warna transparan lewat token turunan | Token `-rgb` (`rgba(var(--aksen-rgb),.3)`) | Tampilan lama terjaga **persis** — gaya terhitung 230 elemen undangan dan 120 elemen halaman terima kasih identik sebelum dan sesudah |
| Huruf dipasang `gantiTema()` | Huruf **bawaan** di-`@import` oleh `gaya.css`/`kenangan.css`; hanya gaya teks lain yang dipasang JS | Halaman tetap berhuruf benar walau `tema.json` gagal dimuat atau JS mati |
| Pratinjau di iframe | Contoh kecil di dasbor + tautan "Buka undangan dengan pilihan ini" (`?pratinjau=1&tema=…&palet=…&huruf=…`) | `undangan_isi` menolak undangan yang belum terbit, jadi iframe kosong untuk pasangan yang paling butuh pratinjau: yang masih draf |
| Slot `#kisah` | Belum | Ikut Tahap H bersama tabelnya |
| — | Tema tanpa `tema.json` jatuh ke `ukir-jepara` | Ditemukan uji: lapisan aset menjawab berkas yang tidak ada dengan `index.html`, dan peramban menukar tema yang sah dengan "stylesheet" kosong |

### Urutan terbit ke produksi

Dipindah ke bagian **Langkah manual** di bawah — satu daftar untuk semua
tahap yang belum terbit.

### Menambah tema berikutnya (Tahap B dst.)

1. Salin `tema/ukir-jepara/` ke `tema/<kode>/`, ganti `tema.json`.
2. Tulis `gaya.css` dan `kenangan.css` hanya dengan token; `:root` keduanya
   = palet dan gaya teks bawaan.
3. `node tema/bangun-daftar.mjs`, lalu `node tema/periksa-palet.mjs` dan
   `node tema/periksa-gerak.mjs`.
4. `cd uji && node semua.mjs tema` — tema baru otomatis diuji dengan 0/1/
   banyak foto, setiap palet, setiap gaya teks, dan halaman terima kasihnya.

---

## 3b. Tahap B — Dua Bingkai, selesai (13 Oktober 2026)

`tema/dua-bingkai/`: tema terang pertama. 4 palet (Sage, Krem Biru, Mawar
Debu, Zamrud Malam), 3 gaya teks (Teduh, Anggun, Kaligrafi), ornamen
geometri sendiri, halaman terima kasih sendiri. Tidak butuh migrasi —
setelannya tinggal di `pasangan.tema_setel` (036).

Yang ditambahkan ke mesin tema, dan sekarang tersedia untuk tema
berikutnya:

| Tambahan | Gunanya |
|---|---|
| Token `--gelap` / `--terang` (+ `-rgb`) | teks di atas foto pada tema berlatar terang: foto diredam `gelap`, tulisannya `terang`. Syarat kontrasnya ≥ 7:1 ikut diperiksa |
| `tema.json → setelan` | setelan khas tema yang tampil otomatis di dasbor. Dua Bingkai: potret pria / wanita = foto, siluet, atau huruf awal — dipilih tiap mempelai sendiri. "Foto" tanpa foto jatuh ke huruf awal |
| `tema.json → ornamen` | tema menunjuk berkas ornamennya (`ornamen.svg#pemisah`); `<use href="#ukir-…">` di halaman ditukar ke sana, juga ornamen yang digambar belakangan di halaman terima kasih |

Ditemukan sambil jalan, ikut diperbaiki: **sesudah hari-H, kotak hitung
mundur tetap tampil berisi "—"** di samping "hari bahagia telah tiba".
`display:grid` tema mengalahkan atribut `hidden`. Ini juga terjadi di
undangan Rian & 'Aini yang sedang tayang; perbaikannya (`[hidden]{display:
none!important}` di kedua tema) ikut terbit bersama cabang ini, dan
`uji-tema` sekarang memeriksanya untuk setiap tema.

Template katalog tidak dibatasi paket (keputusan 13 Okt, bagian 4).

---

## 3c. Tahap C — Monokrom, selesai (13 Oktober 2026)

`tema/monokrom/`: gaya majalah hitam putih. 4 palet (Arang, Negatif,
Emas Tipis, Merah Bibir), 3 gaya teks (Majalah, Galeri, Klasik — ketiganya
judul kapital berjarak), garis tipis sebagai ornamen, halaman terima
kasih sendiri. Tanpa migrasi baru.

Yang membuktikan rencana di bagian 3 ("satu HTML bisa berganti susunan
total lewat CSS"): dengan `index.html` yang sama, Monokrom menyusun
mempelai berselang foto-kiri / foto-kanan, sampul rata kiri dengan nama
raksasa di bawah foto, acara sebagai daftar bernomor 01 / 02, galeri
sebagai halaman majalah, penutup dibalik hitam. Tidak ada satu baris
HTML pun yang ditambahkan untuk tema ini.

Tambahan mesin tema:

| Tambahan | Gunanya |
|---|---|
| Gaya teks `kapital` / `jarak` → token `--judul-kapital`, `--judul-jarak` | judul kapital berjarak ditentukan gaya teks, bukan tema |
| Setelan tema jadi atribut `<html data-…>` | CSS tema bisa membaca setelan. Monokrom: `warna_foto` = hitam putih (bawaan) atau warna asli |
| `periksa-gerak.mjs` ikut memeriksa `kenangan.css` | sebelumnya hanya `gaya.css` |

Animasi muncul Monokrom memakai `clip-path` (disingkap, bukan diangkat) —
termasuk "cat ulang saja", tidak memicu tata letak.

---

## 3d. Tahap D — Senja di Alam, selesai (13 Oktober 2026)

`tema/senja-alam/`: prewed luar ruangan. 4 palet (Senja Pantai, Hutan
Pinus, Sawah, Ilalang) **+ "Dari foto"**, 3 gaya teks (Organik, Petualang,
Hangat), ornamen batang ilalang, halaman terima kasih sendiri. Sampul
berfoto dengan cahaya sore dari bawah; tanpa foto, sampulnya langit sore
dengan matahari tenggelam. Potret mempelai berbentuk batu kali, galeri
mengutamakan foto mendatar, hitung mundur berlatar senja. Tanpa migrasi.

**Palet dari foto** (rencana 2.4), sekarang terpasang:

- `MENGUNDANG.tema.paletDariPiksel(rgba)` — fungsi murni: rona yang
  paling banyak dan paling hidup di foto → latar & kertas sangat terang
  dari rona itu, teks sangat gelap, aksen digelapkan sampai kontrasnya
  cukup. Foto hitam putih → palet netral. Hasilnya selalu lulus
  `periksaPalet`; `uji/uji-palet.mjs` membuktikannya untuk foto senja,
  hutan, sawah, hitam putih, hampir putih, sangat gelap, dan foto kosong.
- Dasbor: bulatan **"Dari foto"** muncul untuk tema yang mengizinkan
  (`palet_foto: true`), mati sampai ada foto sampul, dan begitu dipilih
  mengecilkan sampul ke 48×48 di canvas, menghitung paletnya, dan
  menyimpannya di `tema_setel.palet_foto`. Mengganti sampul memperbarui
  warnanya sendiri.
- Halaman memakai `palet_foto` hanya bila temanya mengizinkan dan
  warnanya lulus kontras; selain itu jatuh ke palet bawaan.

Ditemukan uji, ikut diperbaiki: panel tema tidak digambar ulang sesudah
foto sampul dipilih, jadi "Dari foto" tetap mati sampai halaman dimuat
ulang.

Ikut di tahap ini: petak kosong di galeri (sisa Tahap C) diperbaiki
untuk semua tema — foto tegak tanpa pasangan dilebarkan (`.sendiri`).

---

## 3e. Tahap E — Adat Nusantara, selesai (13 Oktober 2026)

`ukir-jepara` **tidak dipecah dan tidak diganti nama** — undangan Rian &
'Aini dan semua tautannya memakai kode itu. Ia mendapat setelan **Daerah**
dan tampil di dasbor sebagai **Adat Nusantara**:

| Daerah | Ornamen | Palet |
|---|---|---|
| Jawa (bawaan) | ukiran Jepara yang tertanam di halaman — **tidak berubah sedikit pun** | Nila Kuningan, Sogan, Hijau Pupus |
| Sunda | siger dan awan bergulung (`ornamen-sunda.svg`) | Hijau Siger, Biru Priangan |
| Bugis-Makassar | sulapa eppa, belah ketupat empat sisi (`ornamen-bugis.svg`) | Marun Songket, Ungu Lontara |
| Bali | patra, sulur bergulung dengan kuncup (`ornamen-bali.svg`) | Prada, Poleng |

- Mesin tema: berkas ornamen boleh bergantung pada setelan
  (`"ornamen-{daerah}.svg#pemisah"`); pilihan bertanda `ornamen_bawaan`
  memakai ornamen yang tertanam di halaman.
- Palet bertanda `daerah`: dasbor hanya menawarkan warna daerah yang
  dipilih; mengganti daerah sekaligus memilih warna pertamanya. Di halaman,
  daerah tanpa warna tersimpan memakai warna pertama daerah itu.
- Setelan bertanda `"letak": "atas"` tampil di atas pilihan warna.
- Menambah daerah = satu `ornamen-<daerah>.svg` + palet bertanda daerah +
  satu pilihan setelan. Tidak ada tema baru.

Ditemukan sambil jalan, ikut diperbaiki: **ornamen Dua Bingkai tidak
pernah tergambar.** Komentar di `ornamen.svg`-nya berisi `--` (dari nama
`--ukir-garis`), dan XML melarangnya — berkasnya tidak sah, `<use>` yang
merujuknya kosong tanpa galat. Uji lama hanya memeriksa rujukannya. Sekarang
`periksa-palet.mjs` menolak komentar seperti itu, dan `uji-tema` mengukur
ornamen yang benar-benar tergambar (`getBBox`) di setiap tema; uji itu
terbukti merah terhadap berkas lama.

Belum: teks pembuka di `index.html` (basmalah, "Walimatul 'Ursy",
Ar-Rum 21, salam) tertulis untuk pasangan muslim — lihat bagian 4.

---

## Langkah manual — dikumpulkan sampai siap terbit

Semua yang tidak bisa dikerjakan dari repo, untuk seluruh tahap yang
belum terbit. Dikerjakan sekali, berurutan, waktu cabang ini akan
digabung.

1. **Migrasi 036, lalu 037** — tempel
   `supabase/migrations/036_tema_foto_setel.sql`, kemudian
   `037_pembuka.sql`, di SQL editor Supabase, berurutan. Aman untuk `main`
   yang sedang tayang: `db/kompat.mjs` memastikan kode `main` masih sah
   terhadap skema 037, dan kunci baru `undangan_isi` diabaikan halaman
   lama. 037 berbawaan `pembuka = 'islam'`, jadi pasangan yang sudah ada
   tidak berubah.
2. **Gabungkan cabang ini ke `main`** — sesudah langkah 1, bukan sebelum:
   dasbor baru menulis `foto.peran`, `pasangan.tema_setel`, dan
   `pasangan.pembuka`.
3. **Cocokkan produksi dengan repo** — `PGURL=… uji/db/banding.sh >
   /tmp/banding.sql`, jalankan isinya di SQL editor; hasil kosong = sama.
4. **Periksa sekali di HP** — buka undangan Rian & 'Aini: tampilannya
   harus sama seperti sebelumnya, kecuali kotak hitung mundur yang kini
   hilang (acaranya sudah lewat).

Tahap A sampai E tidak butuh langkah manual lain (tidak ada edge function,
rahasia, atau DNS yang berubah).

---

## 4. Yang perlu diputuskan

1. ~~Mulai dari Tahap A sekarang?~~ **Ya** (13 Okt) — selesai, lihat 3a.
2. ~~Tema per paket?~~ **Tidak** (13 Okt). Semua template katalog
   terbuka untuk semua pasangan. Premium adalah penambahan **fitur**, bukan
   template: template yang dikunci tidak terlihat pengguna, dan belum
   tentu sepadan dengan harganya. `paket_min` dihapus dari manifest.
3. ~~Teks pembuka untuk pasangan non-muslim?~~ **Ya** (14 Okt) — migrasi
   037, `pasangan.pembuka`: Islam (bawaan), Kristen, Katolik, Hindu,
   Buddha, Umum (tanpa teks keagamaan). Teksnya di `assets/varian.js` →
   `MENGUNDANG.PEMBUKA`: salam, ayat/kutipan kitab, doa, label sampul,
   pilihan "hadir", contoh ucapan, salam penutup, dan salam di pesan
   WhatsApp dari `/kirim`. Kutipan kitab memakai terjemahan yang lazim
   di undangan — **sebaiknya dibaca ulang oleh orang dari tiap umat
   sebelum ditawarkan luas.**
4. **Aset ilustrasi** (siluet, ornamen daerah, tekstur): digambar sendiri
   sebagai SVG garis (murah, ringan, konsisten) atau beli aset? Usul: SVG
   garis buatan sendiri; ornamen adat perlu dicek orang yang paham
   motifnya.
5. **Huruf:** sekarang huruf `ukir-jepara` (Marcellus, Cormorant, Karla)
   ditautkan keras di `<head>` `index.html`. Di Tahap A tautan itu pindah
   ke manifest (`tema.json → huruf`) dan dipasang oleh `gantiTema()`
   bersama `gaya.css`, supaya tema lain tidak ikut mengunduh huruf yang
   tidak dipakainya. Bila ukuran jadi masalah di HP murah, huruf di-host
   sendiri di R2.
