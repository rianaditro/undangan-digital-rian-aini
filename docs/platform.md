# mengundang.id — rancangan platform

Disusun 7 September 2026, di atas apa yang sudah jalan di
`rian-aini.mengundang.id`.

Dokumen ini menjawab tiga hal: entitas apa saja yang dibutuhkan, aktivitas
siapa saja yang harus dilayani, dan data apa yang harus ada sebelum orang
pertama bisa memakainya. Lalu usulan pembagian fase.

---

## 0. Titik berangkat

Undangan Rian & 'Aini bukan prototipe yang harus dibuang. Sebagian besar
bagian tersulitnya sudah jadi dan sudah dipakai di acara nyata:

| Sudah jalan | Bentuknya sekarang | Nasibnya di platform |
|---|---|---|
| Empat varian undangan per pihak | `assets/varian.js`, konstanta | **jadi data**, per pasangan |
| Alamat per acara (akad ≠ resepsi) | kunci `tempat` di tiap acara | dipertahankan, pindah ke tabel |
| Tracking dua jalur | tabel `pengiriman` | dipertahankan hampir apa adanya |
| Impor `.vcf` + dedupe + normalisasi nomor | `assets/vcf.js` | dipertahankan apa adanya |
| Akses per pihak tanpa login | `panitia_akses` + 7 RPC | **inilah multi-admin**, tinggal digeneralisasi |
| RLS: anon tidak bisa baca daftar tamu | policy + RPC `undangan_tamu` | polanya dipakai ulang |
| Nama undangan ≠ nama kontak, slug beku | `panitia_ubah_nama` | dipertahankan |

Yang perlu diakui juga: **kode saat ini single-tenant sampai ke tulangnya.**
Konfigurasi pasangan ada sebagai konstanta di berkas JS, dan tidak ada satu
pun kolom `pasangan_id`. Itu pekerjaan terbesar fase pertama, bukan
tambal-sulam.

Ukuran sekarang: ~3.000 baris, tanpa build step, tanpa dependensi.

---

## 1. Entitas

Dikelompokkan per wilayah. Yang **tebal** sudah ada dalam bentuk apa pun.

### 1.1 Penyewa dan orang

| Entitas | Isi pokok | Catatan |
|---|---|---|
| `pasangan` | slug, canonical_host, paket, status, tanggal_acara, masa_aktif, reseller_id | inti multi-tenant; slug **tidak pernah dilepas** |
| `pengguna` | dari Supabase Auth | klien, reseller, admin |
| **`akses`** | pengguna/token → pasangan + cakupan + peran | generalisasi `panitia_akses`; cakupan sekarang `pihak`, nanti juga `buku` |
| `pihak` | kode, label, urutan nama, dompet, ttd | sekarang konstanta 4 baris; jadi baris tabel supaya pasangan bisa punya susunan sendiri |

### 1.2 Isi undangan

| Entitas | Isi pokok | Catatan |
|---|---|---|
| `mempelai` | pasangan_id, sisi, nama lengkap, panggilan, ayah, ibu, keterangan alm | 2 baris per pasangan |
| `tempat` | pasangan_id, nama, alamat, ringkas, maps, lat/lng | bisa lebih dari dua |
| `acara` | pasangan_id, nama, mulai, selesai, tempat_id, **tempat_terkunci** | `tempat_terkunci` itu pelajaran dari akad: satu acara bisa dipaksa ke satu tempat lepas dari pihak tamunya |
| `dompet` | pasangan_id, jenis, label, nomor, atas_nama, urutan_per_pihak | sistem **tidak pernah** memegang uang |
| `tema` | kode, nama, aset, paket minimum | milik platform, bukan pasangan |
| `media` | pasangan_id, kunci R2, tipe, ukuran | semua gambar ke R2 |

### 1.3 Tamu dan pengiriman

| Entitas | Isi pokok | Catatan |
|---|---|---|
| **`tamu`** | pasangan_id, nama, slug, telepon, pihak, alamat, rt, catatan | nama boleh "sekeluarga"; slug beku setelah dibuat |
| `tamu_sesi` | tamu_id, acara_id | segmentasi sesi: siapa diundang ke akad/resepsi/ngunduh |
| **`pengiriman`** | tamu_id, jenis (undangan\|berkat), status, waktu, oleh | dua jalur, saling bebas |
| `rsvp` | tamu_id, hadir, jumlah_orang, waktu | sekarang menempel di `ucapan`, harus dipisah |
| **`ucapan`** | tamu_id, nama, teks, waktu, disembunyikan | satu daftar untuk semua pihak |
| `dibuka` | tamu_id, waktu pertama, jumlah | belum ada; murah dan berguna untuk WO |

### 1.4 Dagang

| Entitas | Isi pokok | Catatan |
|---|---|---|
| `reseller` | nama, kontak, status, saldo_komisi | |
| `transaksi` | pasangan_id, reseller_id, paket, nominal, komisi, status | |
| `pembayaran` | transaksi_id, penyedia, referensi, status | split payment, jangan pegang dana |
| `pencairan` | reseller_id, nominal, status, bukti | |

### 1.5 Buku kondangan — nanti, tapi siapkan kolomnya

| Entitas | Isi pokok | Catatan |
|---|---|---|
| `buku` | pasangan_id, nama pemilik (bapak/ibu/pengantin/besan) | sumbunya **penerima**, bukan rumah tangga |
| `sumbangan` | buku_id, tamu_id, jenis, nominal, barang, fase | satu tamu boleh muncul di dua buku dengan angka beda |

Data paling sensitif di seluruh produk. Tidak pernah publik, tidak masuk
analytics, **reseller tidak boleh bisa melihatnya.**

### 1.6 Operasional

`slug_terlarang`, `jejak_audit`, `pekerjaan` (antrean kirim), `retensi`.

---

## 2. Aktivitas

### Klien (pengantin)
Daftar → isi 6 kolom → publish di bawah 3 menit → lengkapi kapan saja tanpa
mengubah link → impor kontak → bagi link ke keluarga → kirim bertahap →
lacak dua jalur → baca ucapan → ekspor setelah acara.

### Keluarga (bapak, ibu, mertua) — **tanpa login**
Buka link → lihat hanya bagiannya → tambah tamu → kirim → tandai.

Sudah jalan hari ini. Ini pembeda nomor tiga di ringkasan, dan ternyata
yang paling murah dibangun.

### Tamu
Buka undangan personal → lihat varian sesuai pihaknya → RSVP → tulis ucapan
→ lihat amplop digital → "cari undangan saya" kalau linknya hilang.

### Reseller
Login → buat pesanan → pantau statusnya → lihat komisi → tarik.
**Tidak boleh** melihat daftar tamu, RSVP, atau buku kondangan klien.

### Pemilik platform
Kelola tema dan paket → moderasi ucapan → tangani sengketa → pantau
pemakaian → jalankan retensi.

---

## 3. Data yang harus ada sebelum orang pertama masuk

Bukan fitur, tapi tanpa ini platform tidak bisa dinyalakan:

1. **Daftar slug terlarang** — `www, app, api, admin, login, help, blog,
   docs, status, mail, cdn, static, assets`, bisa diperluas tanpa migrasi.
2. **Paket dan harga** beserta komisinya — Basic 69k/30k, Lengkap
   159k/65k, Custom 479k/160k, plus add-on.
3. **Minimal 3 tema** yang benar-benar jadi. Tema ukir Jepara yang ada
   sekarang jadi satu di antaranya.
4. **Template pesan WhatsApp** per paket dan per pihak.
5. **Daftar bank dan e-wallet** untuk amplop digital.
6. **Teks hukum**: syarat layanan, kebijakan privasi (UU PDP), perjanjian
   reseller satu halaman.
7. **Kebijakan retensi** tertulis: berapa lama disimpan, apa yang terjadi
   saat masa aktif habis, cara orang minta namanya dihapus.

Nomor 6 dan 7 belum ada sama sekali, dan nomor 6 harus ada **sebelum**
reseller pertama masuk.

---

## 4. Perlukah pembagian fase?

Ya, dan bukan sekadar untuk kerapian — ada satu urutan yang salah kalau
dibalik.

Ringkasan Anda sendiri sudah menyimpulkan ruang lingkup P0 terlalu besar
untuk 6 minggu, dan kalau harus dipotong: **buang dulu sistem reseller**,
karena baru 5 orang dan masih bisa dilayani manual. Saya setuju, dan
menambahkan satu alasan: sistem reseller menyeret pembayaran, komisi,
pencairan, dan perjanjian hukum sekaligus. Itu bukan satu fitur, itu satu
produk kedua.

### Fase 0 — Multi-tenant (fondasi)
Membongkar asumsi single-tenant. Tidak ada fitur baru sama sekali.

- `pasangan` sebagai akar; `pasangan_id` di semua tabel
- Resolusi tenant dari `Host` + segmen path pertama
- `canonical_host` disimpan sejak sekarang, 301 untuk bentuk non-kanonik
- Konfigurasi pindah dari `varian.js` ke tabel: `mempelai`, `tempat`,
  `acara`, `dompet`, `pihak`
- RLS ditulis ulang: setiap policy menyaring per `pasangan_id`
- Migrasi Rian & 'Aini jadi baris pertama — sekaligus uji nyata

**Selesai bila** dua pasangan berbeda bisa hidup berdampingan tanpa saling
melihat, dan undangan Rian & 'Aini tetap identik dengan sekarang.

### Fase 1 — Klien bisa jalan sendiri
Onboarding masih manual (Anda yang buatkan akun), tapi setelah itu klien
mandiri penuh.

- Pendaftaran dan isian awal 6 kolom, publish di bawah 3 menit
- Turunan otomatis: koordinat dari link Maps, hitung mundur, pasaran Jawa
- Editor mandiri tanpa mengubah link
- Impor kontak (sudah ada), generator link massal
- Tracking dua jalur (sudah ada), ekspor
- Link keluarga tanpa login (sudah ada, tinggal per-pasangan)
- RSVP dipisah dari ucapan
- Halaman "cari undangan saya"
- Mode hemat data dan mode font besar
- 3 tema

**Ini titik jual pertama.** Bisa dijual manual, tanpa reseller.

### Fase 2 — Reseller dan uang
- Pendaftaran reseller, pesanan, status
- Pembayaran split lewat Midtrans/Xendit — **jangan pernah pegang dana**
- Komisi tercatat otomatis, pencairan
- Perjanjian reseller, syarat layanan, kebijakan privasi
- Dasbor reseller yang **tidak** bisa melihat data tamu

**Prasyarat**: angka satuan per pesanan sudah dihitung, dan alur uang sudah
diputuskan (DP atau lunas, kapan komisi cair, apa yang terjadi kalau nikah
batal setelah undangan tersebar).

### Fase 3 — Buku kondangan
Produk tersendiri, bisa dijual tanpa undangan. Butuh offline-first sync —
itu masalah teknis paling sulit di seluruh rencana ini, jangan dicampur
dengan fase lain.

- Fase 1 pencatatan di meja penerima tamu: offline, di bawah 3 tap
- Fase 2 pembukaan amplop: pencocokan longgar, di bawah 10 detik
- Rekap per buku, akses terkunci terpisah

### Fase 4 — Skala
Subdomain custom (`{slug}.mengundang.id`), bahasa Jawa dan Inggris, motion
graphic parallax, tema tambahan, silsilah, cetakan pendamping.

---

## 5. Tiga keputusan — sudah diambil

Ketiganya diputuskan 7 September 2026. Rinciannya di
`docs/arsitektur.md`.

**Hosting: VPS sendiri sebagai tujuan akhir.** Vercel dan Supabase
sementara. Cloudflare Workers dicoret — alasan aslinya adalah
keterbatasan Cloudflare Pages, dan itu tidak relevan lagi. Konsekuensinya
untuk fase 0: jangan menambah ketergantungan khas penyedia, dan sisipkan
server API sendiri di antara peramban dan database selagi permukaannya
masih kecil.

**Dedupe lintas pihak: jangan dihalangi.** Dua pihak boleh mengundang
orang yang sama — menghalanginya berarti membocorkan keberadaan tamu
pihak lain. Tampilan penuh milik pengantin memunculkan penanda duplikat
supaya bisa dirapikan manual.

**Retensi: daftar tamu masa aktif + 90 hari**, slug selamanya, transaksi
10 tahun. Ditambah satu hal yang tidak boleh lupa — **jalur permintaan
hapus untuk tamu**, karena tamu tidak pernah memberi persetujuan kepada
platform.

---

## 6. Yang sengaja tidak dibangun

Sudah ditolak di ringkasan, dicatat ulang supaya tidak dibahas lagi:
marketplace persiapan pernikahan, foto pre-wed AI, video AI, hosting video
sendiri, kuota reseller prabayar, menghimpun dana reseller, kuota undangan
per pihak, peran pengantar undangan terpisah.

Tambahan dari pengalaman membangun yang sekarang: **jangan bangun editor
tema visual.** Tema sebagai kode dengan konfigurasi sebagai data sudah
cukup jauh, dan editor visual adalah lubang tanpa dasar.
