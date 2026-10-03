# Laporan dev dan rencana platform

Diperiksa 2 Oktober 2026, di branch `claude/platform-lengkap`.
Melanjutkan `docs/rencana-rilis.md` (19 September), yang sebagian
besar tahapnya sudah dilewati.

Semua angka di bawah diukur hari itu — ke git, ke Vercel, ke database,
dan dengan menjalankan uji — bukan disalin dari catatan sebelumnya.

---

## Ringkasan

1. **Produksi rusak sebagian sejak 20 September, dan penyebabnya
   pekerjaan platform.** Empat kerusakan, semuanya karena migrasi untuk
   branch platform diterapkan ke database yang **sama** dengan yang
   dipakai produksi, sementara kode produksi (`main`) tertinggal 33
   commit. Rincian dan buktinya di bagian 1.
2. **Kode platform sudah jauh, tapi belum pernah dilihat siapa pun di
   luar uji.** `main` masih undangan satu pasangan. Seluruh platform —
   admin, dasbor, rekap, paket, dua bentuk alamat — hidup di branch.
3. **Uji baru masuk repo hari ini.** 305 uji peramban selama ini hidup
   di folder sementara sesi Claude. Sekarang di `uji/`, dan dijalankan
   dari dalam repo: 305 dari 305 lulus.
4. **Langkah 2 halaman kenangan:** kodenya selesai dan teruji, tapi
   **belum diterapkan** — migrasi 026 dan `foto-unggah` versi baru belum
   dipasang.

---

## 1. Keadaan produksi

Yang berjalan di `rian-aini.mengundang.id`: commit `63bb4f6` dari
`main`, dideploy 8 September. Database-nya sudah menerima migrasi 001
sampai 025 dari branch platform.

| | Kerusakan | Bukti | Sejak |
|---|---|---|---|
| 1 | **Buku tamu tampil kosong.** 29 ucapan ada, tidak satu pun terlihat | kode produksi membaca `ucapan` langsung sebagai anon; migrasi 021 mencabut policy baca anon. RLS aktif, jadi bacaannya diam-diam kosong — bukan galat | 20 Sep |
| 2 | **Ucapan baru tidak bisa dikirim** | kode produksi `INSERT` langsung ke `ucapan`; tidak ada lagi policy tulis anon. Policy itu dicabut migrasi **012**, bukan 021 — ditemukan 3 Okt oleh pemeriksa kompatibilitas (Fase 1). Ucapan terakhir masuk 15 Sep, jadi tidak ada tamu yang tertolak di antara keduanya | 19 Sep |
| 3 | **Nama tamu tidak lagi diambil dari database** | kode produksi memanggil `undangan_tamu` dengan satu argumen; migrasi 022 membuang tanda tangan itu. Halaman jatuh ke nama dari alamat — huruf kecil — dan pihaknya ke `?p=` atau bawaan | 20 Sep |
| 4 | **Tombol Berkat di `/kirim` gagal** | produksi mengirim berkat `terkirim`; migrasi 018 membatasi berkat jadi `belum / dijatah / diberikan` | 20 Sep |

**Seberapa parah, sejujurnya.** Acara berlangsung 15 September, dan
ucapan terakhir masuk hari itu juga. 414 undangan sudah terkirim jauh
sebelum kerusakan. Jadi tidak ada tamu yang tertolak waktu menulis
ucapan. Yang terjadi sejak 20 September: siapa pun yang membuka ulang
undangannya melihat buku tamu kosong dan namanya ditulis huruf kecil.
Data berkat cuma satu baris, berstatus `belum` — tidak ada yang hilang.

**Yang TIDAK rusak:** seluruh jalur `/kirim` lewat token (`panitia_*`)
— tanda tangan ketujuh fungsinya diperiksa satu per satu dan cocok
dengan yang dikirim produksi.

**Akarnya** bukan satu migrasi yang salah — 021 dan 022 menambal lubang
lintas-pasangan sungguhan dan tidak boleh dicabut. Akarnya: **satu
database untuk produksi dan pengembangan.** Selama itu masih begitu,
setiap migrasi platform adalah perubahan produksi, dan uji yang distub
tidak akan pernah menangkapnya.

---

## 2. Apa yang sudah ada

### Halaman

| Halaman | Untuk | Keadaan di branch |
|---|---|---|
| `/` dan `/<pasangan>/<tamu>` | tamu undangan | multi-pasangan, dua bentuk alamat, isi dari database |
| `/coba`, `/mulai` | calon klien | demo tanpa jaringan, landing yang bisa mengirim undangan contoh |
| `/kirim?t=…` | panitia, tanpa login | daftar tamu per pihak, kirim WA, rekap pasca-acara, unduh Excel, silsilah, balasan ucapan |
| `/dasbor` | pengantin, login email | data diri, tempat, rangkaian acara, dompet, penutup, tema, terbit, **pustaka foto** |
| `/admin` | admin platform | buka pasangan + akun klien, paket, status, link panitia, sandi klien |
| `/terimakasih` | tamu, sesudah acara | versi lama — grid foto + ucapan. Desain barunya di `docs/kenangan.md` |

### Database

26 migrasi, **25 diterapkan**. 49 fungsi, 2 edge function
(`admin-pasangan` v3, `foto-unggah` v3 — versi lama). Satu admin
(`rianaditro@gmail.com`), satu pasangan.

### Infrastruktur

| | |
|---|---|
| Vercel | paket **hobby**. Domain `mengundang.id`, `www`, `*.mengundang.id` sudah terdaftar di proyek |
| DNS | masih di Hostinger. Apex menunjuk halaman parkir; wildcard belum ada |
| Supabase | paket **gratis**, organisasi Bysca, dua proyek |

---

## 3. Utang dan risiko yang ditemukan hari ini

### Diperbaiki hari ini

| | |
|---|---|
| Uji cuma ada di folder sementara | dipindah ke `uji/`, 305/305 dari dalam repo |
| Galat JS di dasbor lolos uji | pendengar klik dokumen menelan tombol panel foto. Suite dasbor sekarang **menghitung** galat halaman sebagai kegagalan — sebelumnya cuma mencetak, dan galat ini lolos 26/26 |
| Situs statis menerbitkan seluruh repo | tanpa `.vercelignore`, begitu branch ini digabung `docs/operasi-domain-dan-admin.md` — berisi email dan user_id admin — jadi berkas publik |
| `main` punya commit yang tidak dikenal branch | digabungkan. Konfliknya cuma konstanta dompet yang di branch sudah pindah ke database, dengan nomor yang sama |

### Diperbaiki di Fase 1 (3 Oktober, sore)

| | |
|---|---|
| Repo tidak sama dengan produksi | migrasi **027 garis dasar**: `silsilah_hapus` dipulihkan, empat fungsi yang beda komentar disamakan dengan produksi, dan bentuk asli tabel `ucapan` dicatat (lihat di bawah). Database sekarang bisa dibangun ulang dari berkas migrasi, dan hasilnya identik dengan produksi — diperiksa per fungsi, kolom, batasan, indeks, kebijakan, dan pemicu. Satu-satunya selisih: 026, yang memang belum dipasang |
| Tidak ada staging | `uji/db/`: Postgres biasa + tiruan Supabase, dibangun dari nol dalam ±1 detik |
| Tidak ada yang mencegah migrasi mematahkan `main` | `uji/db/kompat.mjs` — lihat Fase 1 |
| Galat halaman lolos di sepuluh suite | runner menghitung setiap `[pageerror]` sebagai gagal |
| Belum ada CI | `.github/workflows/uji.yml`: database dan peramban di tiap push |
| Uji SQL hidup di riwayat percakapan | `uji/sql/`: 022 (nama tamu per pasangan), hak fungsi, 026 (satu latar per babak). Masing-masing dibuktikan merah terhadap kode yang dirusak sengaja |

**Temuan baru dari garis dasar.**
- Tabel `ucapan` di produksi lebih tua dari migrasi pertama, dan 001
  membuatnya dengan `create table if not exists` — jadi di produksi baris
  itu tidak pernah berbuat apa-apa, dan bentuk aslinya tidak pernah
  tercatat. Repo membangun `id uuid`; produksi `id bigint`. Database yang
  dibangun dari repo akan membuat `ucapan_balas(p_id bigint)` tidak bisa
  dipakai. 027 memperbaikinya hanya di database baru.
- `ucapan_tulis` menerima nama sampai 60 huruf dan ucapan sampai 800,
  tapi tabelnya membatasi 40 dan 500. Tamu tidak pernah kena — formulirnya
  juga 40/500 — tapi pemanggil lain akan mendapat galat batasan mentah,
  bukan pesan yang rapi. Kecil; dicatat untuk Fase 3.

**027 belum tercatat di riwayat migrasi produksi.** Pemasangannya
menunggu persetujuan Anda (dua kali habis waktu, sekali dibatalkan).
Sudah diperiksa sesudahnya: tidak ada yang berubah dan tidak ada yang
menggantung. Karena 027 tidak mengubah apa pun di produksi, yang tertunda
hanya catatannya.

### Belum diperbaiki

**Data Rian & 'Aini di kerangka halaman.** `index.html` masih memuat
alamat rumah, nama lengkap, dan nomor DANA kalian sebagai markup statis.
Di platform, itu tampil di undangan pasangan lain sebelum JS jalan, di
sumber halaman, dan kalau JS gagal. `/kirim` juga masih berjudul
"Panitia — Rian & 'AINI" untuk semua pasangan.

**Advisor keamanan Supabase:**
- Ketujuh fungsi `admin_*` bisa **dipanggil** anon. Penjaganya ada di
  dalam (`_admin_wajib()` menolak), jadi tidak bocor — tapi pertahanan
  berlapis menuntut hak anon-nya dicabut.
- Perlindungan sandi bocor (HaveIBeenPwned) mati. Satu sakelar di
  pengaturan Auth.
- 32 fungsi lain yang bisa dipanggil anon memang disengaja: anon key itu
  publik, dan penjaganya token atau slug di dalam fungsi.

**Belum pernah ada uji HTTP sungguhan.** Semua uji menstub Supabase, dan
sandbox tempat platform ini dibangun tidak bisa menjangkau `supabase.co`.
Satu-satunya bukti jalur nyata adalah uji SQL di dalam transaksi.

---

## 4. Rencana

Satuan: **sesi kerja**, kasar, bukan janji. Urutannya disengaja —
penjelasannya di bawah tabel.

```
Fase 0  Hentikan kerusakan produksi           selesai
Fase 1  Fondasi: staging, CI, drift           selesai (versi gratis)
Fase 2  Halaman kenangan, langkah 2–5         4–5 sesi
Fase 3  Bersihkan sisa satu-pasangan          1–2 sesi
Fase 4  Domain dan DNS                        ½ sesi   ← tangan Anda
Fase 5  Siap jual                             3–4 sesi
Fase 6  Gabung ke main, rilis                 1 sesi
```

### Fase 0 — hentikan kerusakan produksi — **SELESAI 3 Oktober**

Jalan A dipilih. `main` @ `5dacdd1`, deploy produksi READY. Diuji di
database sungguhan sebagai anon (8/8) dan di peramban (18/18); uji
peramban yang sama merah di kode sebelum tambalan. Yang belum: satu
kali dibuka mata manusia di produksi — sandbox dan konektor Vercel
sama-sama tidak bisa membaca halaman yang tersaji.

Uraian pilihan yang dipertimbangkan, untuk catatan:


Dua jalan, dan **ini keputusan Anda**, karena menyentuh produksi:

**A. Tambal `main` langsung (disarankan).** Tiga perubahan kecil di kode
produksi: buku tamu lewat `ucapan_publik` dan `ucapan_tulis`,
`undangan_tamu` dengan slug pasangan, berkat `diberikan`. Produksi
pulih hari ini, tanpa menunggu platform selesai. Branch platform tidak
tersentuh.

**B. Tunggu platform digabung.** Tidak ada kerja tambahan, tapi produksi
tetap rusak sampai Fase 6 — berminggu-minggu.

Yang tidak boleh: mencabut migrasi 021/022. Keduanya menambal lubang
lintas-pasangan sungguhan.

### Fase 1 — fondasi — **SELESAI 3 Oktober, versi gratis**

Supaya Fase 0 tidak terulang.

Supabase berbayar **ditunda sampai ada klien yang cukup untuk membayar
servernya** (keputusan 3 Okt). Tanpa itu tidak ada proyek kedua dan tidak
ada Branching, jadi staging diganti dua hal yang gratis dan, untuk jenis
kerusakan September, sama kuatnya:

1. **Bangun ulang lokal** (`uji/db/bangun.sh`). Setiap migrasi dijalankan
   di Postgres kosong sebelum menyentuh produksi. Yang ditangkap: migrasi
   yang gagal, hak yang bocor (tiruan meniru default privileges Supabase
   persis — tanpa itu, uji lokal lebih aman daripada produksi), dan
   semua uji SQL.
2. **Aturan kompatibilitas** (`uji/db/kompat.mjs`). Staging pun tidak
   akan menangkap 021/022, karena yang patah bukan migrasinya — migrasinya
   benar — melainkan halaman di `main` yang masih memanggil bentuk lama.
   Pemeriksa ini membaca setiap panggilan Supabase di halaman `main`
   dan memastikan skema baru masih melayaninya. Terhadap kode `main`
   sebelum tambalan, ia menemukan tepat tiga dari empat kerusakan
   September, dan menunjuk migrasi yang benar untuk masing-masing.
   Yang keempat (nilai status berkat) adalah nilai data saat berjalan
   dan tidak terbaca dari kode.

   Aturannya sendiri: **tambah dulu, buang belakangan.** Fungsi atau
   kolom yang masih dipanggil `main` tidak boleh hilang atau berganti
   tanda tangan sampai `main` berhenti memakainya.

Ditambah: **pemeriksa selisih** repo vs produksi (`uji/db/banding.sh`),
dijalankan tangan sebelum memasang migrasi; **CI** di tiap push; semua
suite menghitung galat halaman; uji SQL jadi berkas.

**Yang hilang dibanding staging sungguhan:** edge function dan Auth tidak
ikut teruji (masih distub), dan data produksi tidak pernah dicoba
terhadap migrasi baru — batasan baru yang ditolak baris lama hanya
ketahuan di produksi. Untuk yang kedua, kebiasaannya: sebelum memasang
migrasi yang menambah batasan, hitung dulu baris yang melanggar dengan
`select` di produksi.

**Risiko paket gratis yang tetap ada:** proyek gratis ditidurkan Supabase
sesudah sepekan tanpa aktivitas — proyek ini pernah ditemukan tertidur.
Selama Rian & 'Aini masih dikunjungi, itu tidak terjadi. Kalau sepi,
undangan klien pertama bisa mati diam-diam sampai dibangunkan tangan dari
dasbor Supabase. Jalan murahnya nanti: workflow terjadwal yang membaca
satu RPC publik tiap beberapa hari. Belum dipasang — keputusan Anda,
karena ia menyentuh produksi tiap minggu.

### Fase 2 — halaman kenangan

Lanjutan `docs/kenangan.md`:

| Langkah | | Keadaan |
|---|---|---|
| 1 | dua penanda di `acara` | **selesai**, diterapkan |
| 2 | pustaka foto di dasbor | kode dan uji selesai; **tinggal diterapkan** — migrasi 026, deploy `foto-unggah`, uji SQL pemicu satu-latar |
| 3 | `kenangan_blok`, panel 9, halaman baru (foto saja) | belum |
| 4 | saklar terbit kenangan | belum |
| 5 | klip video | belum. Paling rapuh — `MediaRecorder` di HP sungguhan |

Langkah 2 menunggu Fase 1, dan Fase 1 sudah ada: 026 lulus bangun ulang,
uji SQL-nya (7/7, merah bila pemicunya dicabut), dan aturan
kompatibilitas terhadap `main`. Tinggal dipasang — bersama 027, begitu
Anda menyetujui pemasangan ke produksi.

### Fase 3 — sisa satu pasangan

- Kerangka statis `index.html` dikosongkan: nama netral atau kerangka
  kosong, bukan data Rian & 'Aini.
- Judul `/kirim` dari database.
- Editor silsilah pindah dari `/kirim` ke `/dasbor` — diputuskan 3
  Oktober. Fotonya juga unggahan, dan "satu dasbor" sudah jadi prinsip.
  Sesudahnya `foto-unggah` tidak lagi butuh jalur token sama sekali.
- Cabut hak anon dari `admin_*`, nyalakan perlindungan sandi bocor.
- Samakan batas `ucapan_tulis` (60/800) dengan tabel dan formulir (40/500).

### Fase 4 — domain dan DNS

Menunggu langkah di `docs/operasi-domain-dan-admin.md`: isi zona di
Vercel, periksa dengan `alat/periksa-dns.py` dari komputer Anda, baru
pindahkan nameserver. Sesudahnya: uji satu subdomain pasangan lewat
HTTPS sebelum menjual paket premium — akunnya hobby, dan apakah
sertifikat wildcard terbit di sana belum ketahuan.

### Fase 5 — siap jual

Dari `docs/rencana-rilis.md` bagian 7, masih berlaku seluruhnya:

- Supabase naik dari paket gratis — proyek ini sudah pernah ditemukan
  tertidur
- Cadangan otomatis, dan satu kali uji pemulihan sungguhan
- Syarat layanan dan kebijakan privasi
- Jalur hapus data untuk tamu
- Retensi berjalan
- Harga dan paket
- Uji coba dengan satu pasangan sungguhan

### Fase 6 — gabung ke main

PR `claude/platform-lengkap` → `main`. Sesudah Fase 0 jalan A, gabungan
ini juga yang mengganti tambalan sementara dengan versi platform.

### Kenapa urutannya begini

Fase 0 dulu karena produksi sedang rusak sekarang, dan tambalannya
setengah sesi.

Fase 1 sebelum fitur apa pun karena **setiap** fitur di Fase 2 dan 3
berarti migrasi, dan tanpa staging setiap migrasi adalah perubahan
produksi yang ujinya tidak bisa menangkap. Itu persis yang terjadi
dengan 012, 018, 021, dan 022.

Fase 4 bisa dikerjakan kapan saja dan tidak bergantung pada yang lain —
yang menunggu hanya tangan Anda di Hostinger.

---

## 5. Yang perlu Anda putuskan

1. ~~Fase 0: tambal `main` sekarang?~~ **Ya, selesai** (3 Okt).
2. ~~Paket Supabase berbayar sekarang?~~ **Ditunda** sampai ada klien
   yang membayarnya (3 Okt). Fase 1 dikerjakan versi gratis.
4. **Penjaga agar proyek gratis tidak tertidur** — pasang sekarang, atau
   tunggu klien pertama? Lihat Fase 1.
3. ~~Editor silsilah ikut pindah ke `/dasbor`?~~ **Ya** (3 Okt) — masuk Fase 3.
