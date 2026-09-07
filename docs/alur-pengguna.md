# mengundang.id — alur tiap pengguna

Pelengkap `docs/platform.md` (entitas dan fase) dan `docs/arsitektur.md`
(stack dan keamanan). Dokumen ini merinci apa yang dilakukan tiap orang,
apa yang dikerjakan sistem, dan data apa yang berubah di tiap langkah.

Ada **enam pelaku**, bukan lima. Alur "rekap nominal amplop" memunculkan
satu yang belum pernah kita sebut: petugas meja penerima tamu.

---

## Status sebuah pasangan

Hampir semua alur di bawah adalah perpindahan antar status ini:

```
draf → menunggu_bayar → aktif → lewat → arsip → kedaluwarsa
                ↓
            batal (kedaluwarsa tanpa bayar)
```

| Status | Artinya | Undangan bisa dibuka? |
|---|---|---|
| `draf` | dibuat reseller/klien, belum bayar | tidak |
| `menunggu_bayar` | tagihan terbit, belum lunas | tidak |
| `aktif` | lunas, klien bisa mengisi dan menerbitkan | ya, setelah `terbit` |
| `lewat` | tanggal acara sudah berlalu | ya |
| `arsip` | acara lewat + 90 hari, hanya baca | ya, tanpa RSVP |
| `kedaluwarsa` | masa aktif habis | tidak — halaman "undangan tidak aktif" |

`terbit` adalah penanda terpisah, bukan status: klien boleh menahan
undangannya walaupun sudah `aktif`.

---

## 1. Pengantin (klien)

### 1.1 Bertanya ke reseller
Calon pengantin bertanya-tanya ke percetakan langganan. Belum ada jejak
apa pun di sistem. **Reseller adalah kanal, bukan formulir** — jangan
paksa percakapan ini masuk aplikasi.

### 1.2 Membuka link reseller
Reseller mengirim `mengundang.id/r/percetakan-jepara`.

Sistem: mencatat kunjungan, menyimpan `reseller_id` di cookie
first-party berumur **90 hari**, lalu menampilkan halaman penawaran yang
memakai nama dan logo reseller itu.

> **Perlu diputuskan.** Cookie bisa hilang: ganti HP, mode penyamaran,
> atau klien menunda dua minggu. Kalau atribusi hilang, komisi hilang, dan
> reseller akan protes. Usulan: selain cookie, sediakan **kode reseller
> yang bisa diketik manual** di langkah pembayaran, dan tampilkan
> "Direkomendasikan oleh: Percetakan Jepara" di layar konfirmasi supaya
> klien bisa mengoreksi sebelum bayar. Bila dua sumber berbeda, yang
> diketik manual menang.

### 1.3 Memilih paket dan add-on
Melihat perbandingan Basic / Lengkap / Custom, mencentang add-on.

Sistem: menyusun ringkasan harga. Belum ada baris database.

### 1.4 Memilih slug
Mengetik `rian-aini`. Sistem memeriksa daftar terlarang dan bentrokan,
lalu **menahannya sementara selama 24 jam**.

> **Perlu diputuskan.** Menahan slug sebelum bayar berarti orang bisa
> memborong nama bagus tanpa membayar. Penahanan 24 jam plus batas
> beberapa penahanan per nomor HP sudah cukup untuk skala ini.

### 1.5 Membayar
Nama, nomor HP, email, lalu ke Midtrans/Xendit.

Sistem membuat `pasangan` status `menunggu_bayar`, `transaksi`, dan
`pembayaran`. **Sistem tidak pernah memegang uang** — split payment
langsung ke rekening pemilik dan komisi reseller.

Webhook lunas → `pasangan` jadi `aktif`, slug dikunci permanen, `komisi`
tercatat, akun dibuatkan, dan tautan masuk dikirim ke WhatsApp.

> **Catatan atas pilihan Anda.** Bayar dulu baru masuk dasbor itu
> keputusan yang sah dan menyederhanakan banyak hal. Konsekuensinya:
> klien tidak bisa mencoba dulu, jadi **halaman contoh undangan yang
> benar-benar bisa dibuka** jadi wajib, bukan tambahan. Tanpa itu orang
> membayar sesuatu yang belum pernah dilihatnya.

### 1.6 Masuk dasbor
Tautan sekali pakai dari WhatsApp, tanpa kata sandi. Sesudahnya masuk
lewat nomor HP.

### 1.7 Mengisi data
Enam kolom wajib: nama pria, nama wanita, waktu akad, waktu resepsi,
tautan Maps, satu foto.

Sistem menurunkan sendiri: koordinat dari tautan Maps, hitung mundur,
hari pasaran Jawa. Mengisi `mempelai`, `tempat`, `acara`, `dompet`.

Semua kolom lain opsional dan bisa ditambah kapan saja **tanpa mengubah
link**.

### 1.8 Menyesuaikan
Pilih tema, atur pihak (empat varian bawaan, bisa diubah), kunci tempat
per acara — pelajaran dari akad Rian & 'Aini: satu acara bisa dipaksa ke
satu tempat lepas dari pihak tamunya.

Pratinjau tiap varian sebelum terbit.

### 1.9 Menambah add-on di tengah jalan
Melihat fitur terkunci, menekan "aktifkan", membayar hanya selisihnya.

Sistem: `transaksi` baru, komisi tetap ke reseller yang sama.

> **Perlu diputuskan.** Apakah reseller dapat komisi untuk add-on yang
> dibeli klien sendiri berbulan-bulan kemudian, tanpa keterlibatannya?
> Usulan: ya, tapi dibatasi 6 bulan sejak pesanan pertama. Ini harus
> tertulis di perjanjian reseller, bukan diputuskan saat ada yang protes.

### 1.10 Menerbitkan
Sistem memeriksa kelengkapan minimum, lalu `terbit = true`. Undangan
hidup di `mengundang.id/rian-aini`.

### 1.11 Mengunggah kontak
Unggah `.vcf` atau tempel dari WhatsApp. Sistem merapikan nomor,
menggabungkan yang kembar, membuat slug per tamu.

**Sudah jalan hari ini**, tinggal dipasangkan ke `pasangan_id`.

### 1.12 Membagi link keluarga
Membuat link per pihak untuk bapak, ibu, mertua. Tanpa login.

**Sudah jalan hari ini.**

### 1.13 Mengirim undangan
Tombol kirim membuka WhatsApp dengan pesan yang sudah disesuaikan pihak
tamu, lalu menandai terkirim.

Peringatan pengiriman bertahap tetap ditampilkan — 20–30 per sesi.

### 1.14 Menandai berkat
Jalur kedua, terpisah dari undangan. **Sudah jalan hari ini.**

### 1.15 Selama acara
Melihat RSVP masuk dan ucapan. Petugas meja mencatat kehadiran dan
amplop — lihat pelaku nomor 5.

### 1.16 Setelah acara — rekap
Yang diminta di alur Anda:

- **Rekap kehadiran** — diundang, RSVP hadir, benar-benar datang
- **Rekap amplop** — per buku, per tamu, uang dan barang
- Ekspor CSV dan PDF
- Buku ucapan jadi PDF kenangan

> **Ini menggeser rencana fase.** Rekap amplop adalah buku kondangan, dan
> buku kondangan tadinya fase 3 karena butuh sinkronisasi offline. Kalau
> rekap amplop masuk alur inti pengantin, fase 3 naik jadi bagian dari
> penawaran pertama. Lihat bagian 7.

### 1.17 Masa aktif habis
H-30 dan H-7 diingatkan, dengan tombol ekspor dan tombol perpanjang.
Lewat itu → `arsip` → `kedaluwarsa`. Slug **tidak pernah** dilepas.

---

## 2. Reseller

1. **Mendaftar** — nama usaha, kontak, rekening. Status `menunggu` sampai
   disetujui manual. Menyetujui perjanjian reseller.
2. **Mendapat link dan kode** — `mengundang.id/r/percetakan-jepara` plus
   kode yang bisa diketik manual, ditambah bahan promosi.
3. **Membagikan** lewat WhatsApp, etalase, atau brosur cetak.
4. **Memantau pesanan** — daftar klien yang masuk lewat link-nya, status
   bayar, tanggal acara. **Hanya nama pasangan dan status. Tidak ada satu
   pun nama tamu.**
5. **Membuatkan pesanan** untuk klien yang gagap teknologi: mengisi data
   awal, mengirim tautan pembayaran. Setelah klien bayar, **akses
   reseller ke data itu berhenti** — ia hanya melihat statusnya.
6. **Melihat komisi** — terkumpul, tertahan, cair.
7. **Menarik komisi** — minimal penarikan, diproses manual dulu.

> **Perlu diputuskan.** Kapan komisi boleh cair? Usulan: **H+7 setelah
> tanggal acara**, bukan setelah pembayaran. Alasannya jendela refund:
> kalau nikah batal seminggu setelah bayar dan komisi sudah cair, uang
> itu susah ditarik kembali.

**Yang reseller tidak boleh bisa lakukan, selamanya:** melihat daftar
tamu, nomor telepon tamu, RSVP, isi ucapan, dan — paling penting — buku
kondangan.

---

## 3. Keluarga (bapak, ibu, mertua)

1. Menerima satu tautan lewat WhatsApp.
2. Membuka. **Tidak ada formulir masuk.** Langsung daftar tamunya.
3. Menambah tamu — ketik atau unggah `.vcf`. Pihaknya dipaksa server.
4. Mengirim lewat WhatsApp, menandai terkirim.
5. Menandai berkat.
6. Melihat rekap bagiannya saja.

Tidak pernah melihat pihak lain. **Sudah jalan hari ini.**

> Yang belum ada: token masih disimpan apa adanya dan belum kedaluwarsa.
> Keduanya masuk fase 0.

---

## 4. Tamu

1. Menerima pesan WhatsApp berisi link personal.
2. Membuka — namanya di sampul, varian sesuai pihaknya.
3. Membaca: mempelai, acara, alamat yang benar untuk pihaknya, peta.
4. **RSVP** — hadir / tidak / belum pasti, berapa orang.
5. **Menulis ucapan** — terbaca semua tamu, satu buku bersama.
6. **Melihat amplop digital** — hanya nomor atau QRIS pengantin. Sistem
   tidak pernah menerima uang.
7. **Kalau link hilang** — `mengundang.id/rian-aini/cari`, ketik nama.
8. **Kalau keberatan datanya ada di sana** — "Hapus data saya" di kaki
   undangan. Tidak perlu persetujuan pengantin.

Langkah 7 dan 8 keduanya baru.

> Langkah 7 adalah alat panen nama. Butuh pembatasan laju, minimal empat
> huruf, dan hanya mengembalikan satu hasil paling cocok — bukan daftar.

---

## 5. Petugas meja penerima tamu — pelaku baru

Muncul dari "rekap nominal amplop". Orangnya bukan pengantin dan bukan
keluarga inti: biasanya saudara atau tetangga yang diminta tolong,
memakai HP sendiri, berdiri di meja depan selama lima jam.

**Fase 1 — saat acara berlangsung**

1. Membuka link petugas. Tanpa login.
2. Tamu datang, petugas mengetik beberapa huruf namanya.
3. Menandai **hadir**, dan berapa orang.
4. Mencatat yang diterima: amplop (**ditandai diterima saja, nominal
   dikosongkan**), uang tunai, transfer, sembako, rokok, kain, atau
   tenaga rewang.
5. Memilih buku penerimanya — buku bapak, buku ibu, buku pengantin, buku
   besan.

Syarat yang tidak bisa ditawar:

- **Wajib jalan offline.** Sinyal di kampung mati saat 300 orang
  berkumpul. Simpan lokal, sinkronkan saat sinyal kembali.
- **Di bawah tiga ketukan per tamu.** Antrean tidak menunggu.
- **Petugas tidak boleh melihat total.** Ia tidak berhak tahu berapa yang
  masuk.
- Tamu tak dikenal harus bisa ditambah cepat.

**Fase 2 — setelah acara, membuka amplop**

Dikerjakan keluarga inti, bukan petugas meja. Tumpukan amplop tidak
berurutan dan nama di amplop sering tidak cocok dengan daftar.

1. Ambil amplop, ketik beberapa huruf, pencocokan longgar.
2. Pilih, isi nominal. **Target di bawah 10 detik per amplop.**
3. Jalur khusus: amplop tanpa nama, dan nama tak dikenal.
4. Rekonsiliasi: jumlah amplop fisik versus yang tercatat.

---

## 6. Admin platform (Anda)

1. Menyetujui reseller.
2. Mengelola tema dan paket.
3. Memproses pencairan komisi.
4. Menangani sengketa — nikah batal, refund, klien mengaku salah reseller.
5. Moderasi ucapan bila dilaporkan.
6. Memantau: pesanan masuk, tingkat penyelesaian, pasangan yang bayar tapi
   tidak pernah terbit.
7. Menjalankan retensi — otomatis, tapi diawasi.
8. Menanggapi permintaan hapus dari tamu.

---

## 7. Yang berubah dari rencana fase

Alur Anda memasukkan **rekap nominal amplop** ke perjalanan inti
pengantin. Itu buku kondangan, dan sebelumnya kita taruh di fase 3 karena
butuh sinkronisasi offline — bagian paling sulit di seluruh rencana.

Ada tiga jalan keluar:

**A. Tarik buku kondangan ke fase 1.** Penawaran lengkap sejak awal, tapi
fase 1 jadi jauh lebih lama dan risiko teknisnya menumpuk di depan.

**B. Pisahkan pencatatan dari rekap.** Fase 1 hanya menyediakan
**pencatatan setelah acara** — keluarga mengetik hasilnya dari buku
tulis, online, tanpa offline sync. Rekapnya tetap ada. Yang ditunda
hanya pencatatan langsung di meja saat acara.

**C. Tetap fase 3.** Fase 1 hanya merekap kehadiran dan RSVP, tanpa
nominal.

**Saya condong ke B.** Nilai terbesar buku kondangan ada di rekap dan
pencariannya bertahun kemudian, bukan di kecepatan input saat acara. Dan
kenyataannya keluarga tetap akan memegang buku tulis di meja depan pada
acara pertama, apa pun yang kita bangun. Offline sync bisa menyusul
setelah ada yang benar-benar memakainya.

Ini keputusan Anda, dan ini yang paling menentukan besarnya fase 1.

---

## 8. Keputusan yang menunggu

| # | Pertanyaan | Usulan |
|---|---|---|
| 1 | Atribusi reseller bertahan berapa lama, dan apa cadangannya kalau cookie hilang? | cookie 90 hari + kode manual + konfirmasi sebelum bayar |
| 2 | Slug ditahan sebelum bayar? | ditahan 24 jam, dibatasi per nomor HP |
| 3 | Komisi cair kapan? | H+7 setelah tanggal acara |
| 4 | Add-on yang dibeli belakangan tetap berkomisi? | ya, dibatasi 6 bulan |
| 5 | Nikah batal setelah undangan tersebar? | belum ada usulan — perlu aturan tertulis |
| 6 | Buku kondangan masuk fase berapa? | **B: rekap dulu, offline menyusul** |
