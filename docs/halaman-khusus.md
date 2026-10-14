# Full Custom: jalan keluar dari template

Disusun 12 Oktober 2026, keputusan pemilik ditambahkan hari yang sama.
Untuk paket tertinggi, **Full Custom**: pemilik platform sendiri yang membuat
tampilan undangan per pasangan, dengan bantuan AI (sesi Claude Code di repo
ini), bebas revisi.

| Keputusan (12 Okt) | |
|---|---|
| Nama paket | **Full Custom** (kode `full_custom`) — subdomain seperti premium, plus halaman khusus |
| Revisi | **tanpa batas** |
| Halaman terima kasih | **mengikuti template undangannya** — berlaku untuk semua tema, katalog maupun custom |
| Pakai ulang | hasil custom disimpan sebagai **katalog kategori custom**: dijual ulang dengan harga custom tanpa kerja ulang, **tidak** tampil di daftar template |

---

## 0. Titik berangkat

- Paket sekarang ada dua (migrasi 023): **`standar`** di jalur domain
  bersama (`mengundang.id/budi-sari/…`) dan **`premium`** di subdomain sendiri
  (`budi-sari.mengundang.id/…`).
- Situsnya statis, terbit dari repo lewat Cloudflare Workers. Setiap PR
  mendapat **alamat pratinjau** sendiri (`preview_urls` di `wrangler.jsonc`).
- Tema = folder. Halaman undangan satu `index.html`, isinya dari
  `undangan_isi(slug)`.

Paket `premium` yang ada tetap berarti subdomain sendiri. `full_custom`
ditambahkan sebagai nilai ketiga; pemicu alamat di 023 sudah memperlakukan
semua yang bukan `standar` sebagai subdomain, jadi tidak perlu diubah.

---

## 1. Tiga anak tangga

Tidak semua permintaan "custom" butuh halaman dari nol. Kebanyakan cukup
anak tangga kedua, yang jauh lebih murah dikerjakan dan dirawat.

| | Apa yang bisa diubah | Fitur bawaan (nama tamu, acara, ucapan, RSVP, hadiah, musik) | Waktu kerja kira-kira |
|---|---|---|---|
| **1. Tema + variasi** | palet, gaya teks, setelan tema | otomatis jalan | menit, oleh pasangan sendiri |
| **2. Tema custom** | seluruh tampilan: warna bebas, huruf bebas, ornamen dan ilustrasi buatan, animasi, susunan bagian, perilaku kecil lewat JS | otomatis jalan | beberapa jam |
| **3. Halaman custom** | struktur HTML bebas: bagian baru, alur baru (misal undangan berbentuk surat yang dibuka, peta interaktif, mini game) | dipakai lewat **kit**, wajib lulus kontrak | sekitar sehari |

Aturan praktis: mulai dari anak tangga 2. Naik ke 3 hanya bila yang diminta
memang tidak bisa dicapai dengan menata ulang bagian yang sudah ada.

---

## 2. Anak tangga 2 — tema custom

```
tema/custom/<kode>/
├── gaya.css      ← halaman undangan
├── kenangan.css  ← halaman terima kasih (wajib, lihat bagian 5)
├── tema.json     ← "kategori": "custom", "asal": "<slug pemesan pertama>"
├── tata.js       ← opsional
└── aset/         ← ornamen dan ilustrasi saja, TIDAK ADA foto pasangan
```

- Folder dinamai **kode tema** (misal `custom/teras-jati`), bukan slug
  pasangan, karena tema ini akan dipakai ulang (bagian 6).
- Dipasang dengan `pasangan.tema = 'custom/<kode>'`. Tidak butuh terbit
  ulang: mengganti kolom sudah cukup. `gantiTema()` sudah memuat
  `/tema/<nama>/gaya.css`, jadi cukup diperketat: nama harus cocok
  `^(custom/)?[a-z0-9-]+$`.
- Tidak masuk `tema/daftar.json`, jadi tidak muncul di pemilih tema. Di
  dasbor pasangan pemakainya tampil sebagai satu kartu "Tema custom kalian"
  yang tidak bisa disetel.
- Semua penjaga berlaku: `periksa-gerak.mjs`, `periksa-palet.mjs` (untuk
  token yang dipakai), dan `uji-tema.mjs` (0/1/banyak foto, 360px/1280px).

Karena HTML-nya sama, setiap perbaikan platform di `index.html` (misal
perbaikan ucapan) otomatis sampai ke tema custom.

---

## 3. Anak tangga 3 — halaman custom

### 3.1 Bentuk

```
custom/<kode>/
├── index.html             ← undangan, bebas
├── terimakasih/index.html ← halaman terima kasih, wajib (bagian 5)
├── gaya.css
├── halaman.js
├── halaman.json           ← "asal", dan versi kit yang dipakai
└── aset/                  ← tanpa foto pasangan
```

Hanya untuk paket bersubdomain (`premium`, `full_custom`). Alasannya keamanan: di subdomain sendiri,
halaman khusus punya **origin** yang berbeda dari `mengundang.id/dasbor`,
jadi skrip apa pun di dalamnya tidak bisa menyentuh sesi login dasbor.
Di paket standar (domain bersama) origin-nya sama, sehingga kesalahan
sekecil apa pun di halaman khusus bisa membaca token pasangan yang sedang
login.

### 3.2 Kit — bagian yang tidak dibuat ulang

Halaman custom **tidak** berbicara langsung ke Supabase. Ia memakai kit,
yaitu permukaan publik `assets/varian.js` yang dibakukan dan diberi versi:

```js
const u = await Kit.muat();          // isi undangan + nama tamu dari alamat
u.mempelai, u.acara, u.tempat, u.foto, u.dompet, u.khusus
Kit.tamu()                           // nama tamu, sudah di-escape
Kit.ucapan.daftar() / .kirim({...})  // buku tamu + RSVP
Kit.kenangan()                       // isi halaman terima kasih: babak, foto, blok, angka hadir
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

Diperiksa oleh `uji/uji-custom.mjs`, yang menjalankan **setiap** folder di
`custom/` dengan data stub:

1. Nama tamu dari alamat tampil.
2. Semua acara dan tempatnya tampil, dengan tautan peta.
3. Ucapan bisa dikirim, dan RSVP tercatat.
4. Hadiah/dompet tampil bila pasangan mengisinya.
5. Tidak ada galat JS. Tidak ada gulir horizontal di 360px.
6. Animasi lulus `periksa-gerak.mjs`, gerak dikurangi dihormati.
7. Skrip luar hanya dari daftar izin (Google Fonts, cdnjs). Tidak ada
   pelacak pihak ketiga.
8. Ukuran total halaman pertama (tanpa foto) ≤ 500 KB.
9. **Siap dipakai ulang:** dijalankan dua kali, dengan data pemesan asal dan
   dengan data pasangan rekaan. Pada jalan kedua, tidak boleh ada nama,
   tanggal, alamat, atau foto pemesan asal yang tampil, dan berkas di
   folder tidak boleh memuat teks itu. Tema custom (anak tangga 2) ikut
   diperiksa dengan cara yang sama di `uji-tema.mjs`.
10. Halaman terima kasihnya ada dan lulus butir 5–8.

Karena uji ini jalan di setiap PR, **perubahan platform yang mematahkan
halaman custom mana pun langsung merah**. Inilah yang membuat halaman
custom tetap bisa dirawat bertahun-tahun, dan tetap bisa dijual ulang.

### 3.4 Rute

Sekarang Worker hanya dipanggil untuk `/` dan `/media/*`. Alamat lain
(`/bapak-ahmad`) jatuh ke `index.html` lewat penanganan SPA tanpa melewati
Worker.

Perubahannya:

- `run_worker_first` diperluas ke navigasi halaman, dengan pengecualian
  untuk folder berkas (`!/assets/*`, `!/tema/*`, `!/custom/*`, …), supaya
  satu kunjungan tamu = satu panggilan Worker, bukan belasan. Pola
  pengecualian `!` perlu dipastikan didukung versi wrangler yang dipakai;
  bila tidak, semua permintaan lewat Worker dan kuota gratis (100 ribu/hari)
  tetap cukup untuk skala sekarang.
- Worker membaca slug dari subdomain, atau dari segmen pertama jalur di
  alamat pratinjau, lalu mencarinya di **`custom/peta.json`**
  (`{ "budi-sari": "surat-merpati" }`), yang dibundel ke dalam Worker.
  Ada → `/custom/<kode>/index.html` (atau `/custom/<kode>/terimakasih/`
  untuk jalur `/terimakasih`). Tidak ada → halaman template seperti biasa.

Peta dibutuhkan karena satu halaman custom bisa dipakai banyak pasangan.
Memasang halaman custom yang sudah ada untuk pembeli baru = satu baris di
`peta.json` + satu PR kecil. Menghapus barisnya = kembali ke template.

---

## 4. Isi khusus tanpa migrasi

Halaman custom sering butuh isi yang tidak punya kolom: kutipan favorit,
lirik lagu, daftar "10 hal tentang kami", tautan siaran langsung.

- Kolom baru `pasangan.khusus jsonb not null default '{}'`.
- Dikirim apa adanya oleh `undangan_isi` sebagai kunci `khusus`.
- Diisi pemilik dari `/pemilik` (editor JSON sederhana dengan validasi
  sintaks), bukan oleh pasangan. Bentuk isinya ditentukan halaman
  custom-nya sendiri, dan dicatat di `tema.json` / `halaman.json` sebagai
  `isi_khusus` supaya pembeli berikutnya tahu apa yang perlu diisi.

Satu kolom, satu migrasi, untuk semua kebutuhan isi aneh selamanya.

---

## 5. Halaman terima kasih mengikuti template

Berlaku untuk **semua** tema, bukan hanya Full Custom. Tamu yang membuka
halaman terima kasih harus merasa berada di "undangan yang sama".

Sekarang `/terimakasih/index.html` membawa ±340 baris gaya sendiri di dalam
`<style>` dan huruf `ukir-jepara` yang ditulis keras. Perubahannya:

- Gaya itu dipindah ke `tema/ukir-jepara/kenangan.css`. Halaman terima
  kasih memuat `kenangan.css` milik tema pasangan, dengan `gantiTema()` yang
  sama (palet + gaya teks ikut).
- **Setiap folder tema wajib punya `kenangan.css`.** `uji-tema.mjs` membuka
  halaman terima kasih untuk setiap tema, dengan dan tanpa foto.
- Tema katalog baru (Dua Bingkai, Monokrom, …) menambah `kenangan.css`
  sebagai bagian dari tahapnya masing-masing di `docs/rencana-tema.md`.
- Halaman custom (anak tangga 3) membuat `terimakasih/index.html` sendiri
  lewat `Kit.kenangan()`.

---

## 6. Katalog custom — dijual ulang tanpa kerja ulang

Setiap tema dan halaman custom yang selesai otomatis menjadi barang katalog
**kategori custom**.

- **Tidak tampil** di pemilih tema dasbor maupun di halaman depan. Tidak ada
  di `tema/daftar.json`.
- Tercatat di `tema/custom.json` (dibangkitkan dari manifest, sama seperti
  `daftar.json`) dan hanya ditampilkan di **`/pemilik`**: tangkapan layar,
  kode, anak tangga (2/3), `isi_khusus` yang dibutuhkan, berapa kali sudah
  dipakai.
- **Harga custom** tetap berlaku penuh saat dijual ulang (sama dengan membuat dari nol). Pemilik menawarkannya ke
  calon pembeli Full Custom sebagai titik awal ("pilih dari karya kami, atau
  buat dari nol").
- **Memasang untuk pembeli baru:**
  - tema custom → ganti `pasangan.tema` di `/pemilik`, tidak perlu terbit;
  - halaman custom → satu baris di `custom/peta.json`, satu PR.
- **Revisi pembeli kedua**: yang bisa dinyatakan sebagai data (palet,
  `pasangan.khusus`, setelan) cukup lewat data. Yang menyentuh CSS/HTML
  dibuat sebagai **turunan** (`custom/teras-jati-2`, dengan
  `"turunan": "teras-jati"` di manifest), supaya pemakai pertama tidak ikut
  berubah. Turunan itu sendiri masuk katalog juga.
- Supaya jalur data itu ada, tema custom **boleh** memakai token palet
  (`docs/variasi-tema.md`) alih-alih warna tertulis langsung. Skill
  `full-custom` menyarankannya sebagai bawaan.
- Butir 9 kontrak (bagian 3.3) yang menjamin tidak ada sisa data pemesan
  asal di dalam tema.

**Izin pemesan asal** dimasukkan ke syarat paket Full Custom: desain boleh
dipakai ulang, data dan foto mereka tidak pernah ikut. Kolom
`tema.json → izin_ulang` (bawaan `true`) memberi jalan bila ada pemesan
yang menolak; tema seperti itu tidak muncul di katalog custom.

---

## 7. Alur kerja pemilik + AI

### 7.1 Brief dari pasangan

Di dasbor paket Full Custom muncul panel **Brief desain**:

- titik awal: dari nol, atau dari salah satu katalog custom yang ditawarkan
  pemilik

- referensi (tautan Pinterest/Instagram, unggah tangkapan layar)
- foto acuan dari pustaka foto mereka
- warna, suasana, hal yang **tidak** diinginkan
- tenggat

Disimpan di tabel `brief_custom` (pasangan_id, isi jsonb, status: `baru` →
`dikerjakan` → `pratinjau` → `revisi` → `terbit`). Pemilik melihat antreannya
di `/pemilik`, **diurutkan menurut tanggal acara** (yang paling dekat paling
atas).

### 7.2 Mengerjakan

Repo diberi skill `.claude/skills/full-custom/SKILL.md`, supaya setiap
sesi AI bekerja dengan cara yang sama:

1. Baca brief (lewat Supabase MCP, atau ditempel).
2. Putuskan anak tangga 2 atau 3, beserta alasannya; bila brief memilih
   katalog custom, mulai dari tema itu (atau turunannya).
3. Salin kerangka `tema/custom/_contoh/` atau `custom/_contoh/`.
4. Ambil data pasangan sungguhan sebagai stub uji (pola `uji/undangan-isi.json`).
5. Bangun undangan **dan** halaman terima kasihnya, jalankan
   `periksa-gerak`, `periksa-palet`, `uji-tema` / `uji-custom` (termasuk
   uji pakai ulang), ambil tangkapan layar HP dan desktop.
6. Buka PR dengan tangkapan layar. Workers Builds memberi alamat pratinjau.

### 7.3 Revisi dan terbit — bebas revisi

Karena revisi tidak dibatasi, setiap putaran harus murah bagi kedua pihak:

- Pemilik mengirim alamat pratinjau ke pasangan (status `pratinjau`).
- Pasangan menulis permintaan revisi **di dasbor**, bukan di WhatsApp:
  satu catatan per permintaan, boleh dengan tangkapan layar. Disimpan di
  tabel `revisi_custom` (brief_id, isi, status `baru`/`selesai`, komit).
  Satu tempat, satu riwayat, tidak ada permintaan yang tenggelam di chat.
- Sesi AI membaca semua catatan `baru` sekaligus, mengerjakannya dalam satu
  komit di PR yang sama, lalu menandainya `selesai` dengan hash komitnya.
  Alamat pratinjau yang sama langsung menampilkan versi terbaru.
- Gabung ke `main` → terbit. Untuk anak tangga 2, sekaligus mengisi
  `pasangan.tema = 'custom/<kode>'`.
- Revisi sesudah terbit tetap diterima: PR baru, alur yang sama.

### 7.4 Yang sengaja tidak dibuat

**Unggah HTML lewat web.** Kelihatannya lebih cepat, tetapi kode AI masuk
ke produksi tanpa uji, tanpa riwayat, tanpa pratinjau, dan tanpa ada yang
tahu kalau perubahan platform berikutnya mematahkannya. Lewat repo, setiap
halaman custom punya PR, riwayat, uji yang terus jalan, dan bisa dikembalikan
dengan satu `git revert`.

---

## 8. Urutan kerja

Full Custom bergantung pada Tahap A di `docs/rencana-tema.md` (slot foto,
token, manifest, `kenangan.css`). Sesudahnya:

| Tahap | Isi |
|---|---|
| **K1** ✅ | tema custom: validasi nama `custom/…`, kerangka `_contoh` (dengan `kenangan.css`), `tema/custom.json`, uji pakai ulang di `uji-tema.mjs`, kartu di dasbor |
| **K2** | migrasi: paket `full_custom`, kolom `pasangan.khusus`, tabel `brief_custom` + `revisi_custom`; panel brief & revisi di dasbor; antrean dan katalog custom di `/pemilik` |
| **K3** | skill `full-custom` + satu tema custom percontohan (misal untuk Rian & 'Aini) |
| **K4** | kit v1 (dibakukan dari `varian.js`, termasuk `Kit.kenangan()`), `custom/peta.json` + rute di Worker, `uji-custom.mjs`, kerangka `custom/_contoh/` |

K1–K3 sudah cukup untuk mulai menjual paket. K4 menyusul saat ada
permintaan yang memang butuh struktur HTML sendiri.

---

## 9. Keputusan lanjutan (12 Okt)

1. **Harga katalog custom = harga Full Custom.** Dijual ulang tanpa
   perubahan pun harganya sama dengan membuat dari nol.
2. **Perubahan pembeli kedua:** bila bisa dinyatakan sebagai data (palet,
   `pasangan.khusus`, setelan tema), pakai data dan temanya tetap sama.
   Bila menyentuh CSS/HTML, buat turunan (`custom/<kode>-2`, dengan
   `"turunan": "<kode>"` di manifest).

---

## 10. K1 — tema custom, selesai (14 Oktober 2026)

Belum ada tema custom sungguhan; yang terpasang jalannya, supaya tema
custom pertama tinggal dibuat.

- **Kerangka `tema/custom/_contoh/`** — salinan Studio Anggun dengan satu
  palet dan satu gaya teks, manifest berkategori `custom` (`asal`,
  `izin_ulang`, `isi_khusus`), dan petunjuk langkah di kepala `gaya.css`.
  Awalan `_` membuatnya bukan tema: tidak bisa dipasang ke pasangan
  (nama tidak lolos `KODE_TEMA`), tidak masuk daftar mana pun.
- **`tema/custom.json`** — katalog custom, dibangun `bangun-daftar.mjs`
  bersama `daftar.json`; dibaca `/pemilik` nanti (K2). Tema dengan
  `izin_ulang: false` tidak masuk. Kosong sampai tema custom pertama ada.
- **Penjaga** — `periksa-palet` dan `periksa-gerak` kini juga memeriksa
  `tema/custom/*` dan kerangkanya. Untuk tema custom, kontrak butir 9
  diperiksa dari berkasnya: `asal` wajib, tidak ada gambar raster di
  folder, tidak ada alamat `/media/`, dan kata dari slug pemesan asal
  tidak boleh muncul di berkas mana pun (utuh per kata).
- **`uji-tema`** menjalankan setiap tema custom — dan kerangkanya, sebagai
  `custom/contoh-uji` — melalui semua uji yang sama dengan tema katalog
  (0/1/banyak foto, HP/layar lebar, palet, gaya teks, halaman terima
  kasih, kisah). Ditambah **uji pakai ulang**: undangan dan halaman terima
  kasih dibuka dengan pasangan rekaan, dan tidak boleh ada nama pemesan
  asal yang tampil.
- **Dasbor** — pasangan pemakai tema custom melihatnya sebagai kartu
  pertama "Tema custom kalian". Kartu itu hilang begitu tema lain dipilih,
  jadi melepasnya ditanya dulu.

Memasang tema custom ke pasangan, sampai `/pemilik` punya tombolnya (K2):
`update pasangan set tema = 'custom/<kode>', tema_setel = '{}' where slug = '…';`
— sesudah foldernya ada di `main`.
