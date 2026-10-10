# mengundang.id — alur tiap pengguna

Pelengkap `docs/platform.md` (entitas dan fase) dan `docs/arsitektur.md`
(stack dan keamanan). Dokumen ini merinci apa yang dilakukan tiap orang,
apa yang dikerjakan sistem, dan data apa yang berubah di tiap langkah.

Ada **lima pelaku**: pengantin, reseller, keluarga, tamu, dan admin.
Petugas meja penerima tamu sempat dimasukkan sebagai pelaku keenam —
lihat bagian 5 untuk alasan kenapa itu dibatalkan.

---

## Status sebuah pasangan

Hampir semua alur di bawah adalah perpindahan antar status ini:

```
draf → menunggu_bayar → aktif → lewat → arsip → kedaluwarsa
         ↓                ↓
      hangus            batal → kredit → (pasangan baru, slug baru)
```

| Status | Artinya | Undangan bisa dibuka? |
|---|---|---|
| `draf` | dibuat reseller/klien, belum bayar | tidak |
| `menunggu_bayar` | tagihan terbit, belum lunas | tidak |
| `aktif` | lunas, klien bisa mengisi dan menerbitkan | ya, setelah `terbit` |
| `lewat` | tanggal acara sudah berlalu | ya |
| `arsip` | acara lewat + 90 hari, hanya baca | ya, tanpa RSVP |
| `kedaluwarsa` | masa aktif habis | tidak — halaman "undangan tidak aktif" |
| `hangus` | tagihan tidak pernah dibayar | tidak; slug dilepas kembali |
| `batal` | nikah batal setelah lunas, bayaran jadi kredit | tidak — halaman "undangan tidak aktif" |

`terbit` adalah penanda terpisah, bukan status: klien boleh menahan
undangannya walaupun sudah `aktif`.

`hangus` dan `batal` sengaja dibedakan. Yang tidak pernah dibayar boleh
melepas slug-nya kembali — belum ada link yang tersebar. Yang batal
setelah lunas **memegang slug-nya selamanya**, karena undangannya sudah
beredar.

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
Mengetik `rian-aini`. Sistem memeriksa daftar terlarang dan bentrokan.
Tidak ada penahanan, tidak ada kedaluwarsa — **diperiksa saat mengetik,
dikunci saat lunas.**

Slug di sini adalah nama pasangan itu sendiri, bukan kata benda umum yang
bernilai jual. Tidak ada yang mau memborong `budi-siti`. Kekhawatiran
memborong nama tidak berlaku di sini.

Satu-satunya bentrokan nyata adalah dua pasangan yang kebetulan
sama namanya. Tangani seperti bentrokan biasa: tawarkan `rian-aini-2`,
atau biarkan mereka menambahkan sesuatu sendiri.

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
Melihat RSVP masuk dan ucapan. Tidak ada pencatatan langsung di meja —
keluarga tetap memakai buku tulis seperti biasa.

### 1.16 Setelah acara — rekap
Pengantin duduk dengan buku tulis dari meja penerima tamu, lalu menyusuri
daftar tamunya sendiri. Untuk tiap tamu ia menandai dua hal:

**Datang atau tidak** — daftar yang sama yang dipakai mengirim undangan,
sekarang dipakai mencatat kehadiran. Kolomnya jadi tiga: diundang, RSVP,
benar-benar datang.

**Memberi apa** — satu tamu bisa memberi lebih dari satu:

| Jenis | Yang dicatat |
|---|---|
| Uang | nominal |
| Transfer | nominal |
| Barang | keterangan bebas — gula, rokok, beras, kain |
| Tenaga | rewang, tanpa nominal |

Lalu keluar:

- Rekap kehadiran: diundang / RSVP hadir / benar-benar datang
- Rekap pemberian: total uang, dan daftar barang
- Ekspor CSV
- Buku ucapan jadi PDF kenangan

**Tidak butuh sinkronisasi offline.** Ini pengetikan setelah acara, di
rumah, dengan sinyal normal. Itu membuatnya masuk fase 1 tanpa menyeret
bagian tersulit buku kondangan.

Entitas yang dibutuhkan cuma satu tabel baru: `pemberian` — `tamu_id`,
`jenis`, `nominal`, `barang`, `catatan`. Ditambah kolom `datang` di
`tamu`. Siapkan juga `buku_id` yang boleh kosong, supaya saat buku
kondangan penuh datang nanti tidak perlu migrasi data.

### 1.17 Masa aktif habis
H-30 dan H-7 diingatkan, dengan tombol ekspor dan tombol perpanjang.
Lewat itu → `arsip` → `kedaluwarsa`. Slug **tidak pernah** dilepas.

### 1.18 Nikah batal
Tidak ada pengembalian uang. Yang dibayar **disimpan sebagai hak pakai
untuk pernikahan berikutnya.**

Sederhana di permukaan, tapi ada satu jebakan yang harus dihindari:

> **Jangan pakai ulang slug yang sama.** Kalau `rian-aini` batal lalu
> dipakai lagi untuk `rian` dengan orang lain, tamu yang menyimpan link
> lama akan membuka undangan pernikahan yang berbeda — lengkap dengan
> nama mempelai yang baru. Ini persis skenario yang dicegah aturan "slug
> tidak pernah dilepas", dan justru lebih parah karena mempelainya
> memang orang yang sama.

Jadi bentuknya:

1. Pasangan lama → status `batal`. Slug-nya tetap dipegang selamanya,
   menampilkan halaman "undangan tidak aktif". Tidak pernah dialihkan.
2. Hak pakai berpindah: satu baris `kredit` — pemilik, paket, add-on yang
   sudah dibayar, dan masa berlaku.
3. Saat menikah lagi, klien membuat pasangan baru dengan **slug baru**,
   dan kreditnya menutup tagihan.
4. Daftar tamunya bisa disalin — kemungkinan besar sebagian besar orang
   yang sama, dan mengetik ulang 300 nama itu kejam.

Yang perlu diputuskan: **berapa lama kredit berlaku, dan boleh berpindah
tangan atau tidak.** Usulan: berlaku 2 tahun, tidak bisa dipindahkan ke
orang lain, dan reseller asal tidak mendapat komisi kedua kali karena
tidak ada uang baru yang masuk.

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

## 5. Petugas meja penerima tamu — belum jadi pelaku

Saya sempat memasukkan ini sebagai pelaku keenam, hasil membaca
spesifikasi buku kondangan di ringkasan. **Itu berlebihan untuk apa yang
sebenarnya dibutuhkan.**

Yang diminta adalah rekap setelah acara oleh pengantin — bukan
pencatatan langsung di meja saat acara. Selama itu yang dibutuhkan,
petugas meja tidak menyentuh sistem sama sekali. Ia memakai buku tulis,
seperti selalu.

Peran ini baru hidup kalau buku kondangan penuh dibangun (fase 3), dan
saat itu syaratnya tetap berlaku: wajib offline karena sinyal mati saat
300 orang berkumpul, di bawah tiga ketukan per tamu, petugas tidak boleh
melihat total, dan amplop hanya ditandai diterima dengan nominal
dikosongkan untuk dibuka keluarga inti setelah acara.

Dicatat di sini supaya tidak hilang, bukan untuk dibangun sekarang.

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

## 7. Buku kondangan: sudah diputuskan

Rekap yang diminta adalah **pengetikan setelah acara oleh pengantin**,
bukan pencatatan langsung di meja. Itu menjawab pertanyaan fase yang
sempat terbuka: jalan B.

| | Fase 1 | Fase 3 |
|---|---|---|
| Siapa mencatat | pengantin | petugas meja |
| Kapan | setelah acara, di rumah | saat acara, di meja depan |
| Sinyal | normal | **wajib jalan offline** |
| Yang dicatat | datang, uang, barang | amplop diterima, nominal menyusul |
| Buku | satu | paralel per penerima |

Fase 1 mendapat seluruh nilai rekapnya — siapa datang, siapa memberi apa,
bisa dicari bertahun kemudian — tanpa menyentuh sinkronisasi offline yang
merupakan bagian tersulit di seluruh rencana.

Yang perlu dijaga sejak sekarang cuma satu: tabel `pemberian` sudah punya
kolom `buku_id` yang boleh kosong, supaya buku paralel bisa menyusul
tanpa migrasi data.

## 8. Keputusan

Sudah diputuskan 7 September 2026:

| # | Pertanyaan | Keputusan |
|---|---|---|
| 2 | Slug ditahan sebelum bayar? | **tidak** — diperiksa saat mengetik, dikunci saat lunas. Nama pasangan tidak punya nilai borong |
| 5 | Nikah batal? | **tidak ada refund**; jadi kredit untuk pernikahan berikutnya, dengan **slug baru** |
| 6 | Buku kondangan fase berapa? | **B** — rekap setelah acara di fase 1, pencatatan di meja menyusul di fase 3 |

Masih menunggu:

| # | Pertanyaan | Usulan |
|---|---|---|
| 1 | Atribusi reseller bertahan berapa lama, dan cadangannya apa? | cookie 90 hari + kode manual + konfirmasi sebelum bayar |
| 3 | Komisi cair kapan? | H+7 setelah tanggal acara, bukan setelah bayar |
| 4 | Add-on yang dibeli belakangan tetap berkomisi? | ya, dibatasi 6 bulan |
| 7 | Kredit nikah batal berlaku berapa lama? | 2 tahun, tidak bisa dipindahtangankan, tanpa komisi kedua |
