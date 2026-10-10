# Operasi: domain dan admin pertama

Diperiksa 22 September 2026, langsung ke Vercel, ke Supabase, dan ke DNS
yang sedang berlaku. Angka dan nilai di bawah bukan kutipan dokumentasi —
kecuali yang disebut begitu, semuanya hasil pemeriksaan hari itu.

---

## 1. Admin pertama — **selesai**

Ayam-dan-telur yang memblokir seluruh platform: `/pemilik` (dulu `/admin`) menolak siapa pun
yang tidak ada di tabel `admin`, dan satu-satunya jalan membuat akun —
edge function `admin-pasangan` — juga menuntut pemanggilnya sudah admin.

Dibuka lewat `public.admin_pertama(email, sandi, nama)` di migrasi 024.
Fungsi itu hanya bekerja selagi tabel `admin` masih kosong, jadi sesudah
dipakai sekali ia mengunci diri sendiri.

| | |
|---|---|
| Email | `rianaditro@gmail.com` |
| Nama di tabel `admin` | Rian |
| `user_id` | `9416d859-e9da-4aab-a630-ae03ce2b5740` |
| Sandi | **diserahkan di luar repo — ganti lewat Supabase → Authentication** |

Yang sudah diperiksa di database: sandinya terverifikasi ulang oleh bcrypt
yang sama dengan yang dipakai GoTrue, sandi lain ditolak, `email_confirmed_at`
dan `confirmed_at` terisi, akun tidak diblokir dan tidak dihapus, satu baris
`auth.identities` bertipe `email` tersambung, `is_admin()` menerimanya
sementara akun lain tetap ditolak, `admin_pertama()` menolak panggilan
kedua tanpa membuat baris apa pun, dan anon tidak boleh memanggilnya.

**Yang belum bisa diperiksa dari sini:** satu putaran masuk sungguhan lewat
GoTrue. Sandbox tempat ini dikerjakan tidak bisa menjangkau `supabase.co`.
Kalau ternyata gagal masuk, jalan keluarnya pendek: Supabase → Authentication
→ akun itu → *Reset password*. Barisnya sudah ada dan sudah benar bentuknya;
yang paling mungkin salah cuma sandinya.

---

## 2. Domain — dari Hostinger + Vercel ke Cloudflare

Sampai Oktober 2026 nameserver `mengundang.id` di Hostinger dan
undangannya dilayani Vercel (`rian-aini` CNAME ke Vercel). Keputusan
2026-10-10: **Vercel dilepas seluruhnya.** DNS dan hosting sama-sama di
Cloudflare; Hostinger tinggal registrar.

Yang hilang bersama Vercel: tidak ada. Semua URL `*.vercel.app` sudah
lama terkunci di balik login Vercel (Vercel Authentication, *all except
custom domains*), jadi tidak ada tamu yang memegang tautan itu.

## 3. Pindah ke Cloudflare — langsung

### Kenapa Workers

- **Subdomain pasangan premium otomatis.** Rekaman `*` berproxy plus rute
  `*.mengundang.id/*` menangkap semua subdomain, dan Universal SSL
  mencakup `mengundang.id` dan `*.mengundang.id`.
- **Bukan Pages:** domain kustom Pages tidak bisa wildcard; rute Workers
  bisa.
- **Gratis:** berkas statis tidak menghitung kuota. Kode Worker hanya
  berjalan untuk `/`, jauh di bawah batas 100.000 per hari.
- Tidak ada fitur server yang ditinggalkan: halaman statis, data dari
  Supabase langsung di peramban, edge function menerima origin mana pun,
  login dasbor email+sandi tanpa redirect — Supabase tidak perlu diubah.

### Berkasnya

| Berkas | Isi |
|---|---|
| `wrangler.jsonc` | aset = folder repo, `drop-trailing-slash`, `single-page-application`, rute `mengundang.id/*` dan `*.mengundang.id/*` |
| `.assetsignore` | yang TIDAK terbit: `docs/`, `supabase/`, `uji/`, `alat/`, konfigurasi |
| `_headers` | `X-Robots-Tag: noindex` untuk `/kirim`, `/dasbor`, `/admin`, `/pemilik` |
| `_redirects` | alamat lama: `/reseller` → `/admin` |
| `cloudflare/pintu.js` | `mengundang.id/` → `/mulai`, `www.mengundang.id/` → `https://mengundang.id/mulai` |
| `uji/server.mjs`, `uji/uji-pintu.mjs` | peniru Workers dan uji jawabannya per host |

### Harga jalur langsung

Tidak ada masa tumpang-tindih. Begitu Vercel dilepas dan sebelum
nameserver Cloudflare berlaku di resolver tamu (sampai 6 jam, TTL NS
Hostinger), `rian-aini.mengundang.id` tidak terbuka. Sesudah zona aktif,
sertifikat Universal SSL biasanya terbit dalam belasan menit, kadang
beberapa jam; selama itu HTTPS gagal. Jalankan di hari tanpa penyebaran
undangan.

### Langkahnya

1. **Cloudflare → Add a site → `mengundang.id` → Free.** Catat dua
   nameserver (`xxx.ns.cloudflare.com`).
2. **Workers & Pages → Create → Import a repository** →
   `rianaditro/undangan-digital-rian-aini`, branch `main`, build command
   kosong. Uji di `https://mengundang.<akun>.workers.dev/mulai` dan
   `/rian-aini/bapak-ahmad`. Kalau deploy gagal karena zona masih
   Pending, lanjut dulu dan "Retry deployment" sesudah zona aktif.
3. **DNS → Records**: hapus semua rekaman, isi hanya

   | Type | Name | IPv6 | Proxy |
   |---|---|---|---|
   | AAAA | `@` | `100::` | oranye |
   | AAAA | `*` | `100::` | oranye |

   `www` dan `rian-aini` ditangkap `*`.
4. **SSL/TLS → Edge Certificates → Always Use HTTPS**: on.
5. **Hostinger**: DNSSEC dimatikan kalau menyala; nameserver diganti ke
   dua nameserver Cloudflare.
6. **Vercel**: hapus domain `mengundang.id`, `www`, `*.mengundang.id`,
   `rian-aini.mengundang.id` dari proyek, lalu hapus proyeknya
   (Settings → General → Delete Project). Cabut juga aplikasi GitHub
   Vercel dari repo ini.
7. Sesudah email "Active" dan sertifikat Universal berstatus Active, buka:
   `https://mengundang.id` (→ `/mulai`), `https://www.mengundang.id`,
   satu tautan tamu `https://rian-aini.mengundang.id/…` dari HP dengan
   data seluler, dan `https://coba-acak.mengundang.id` ("Undangan belum
   tersedia").

`alat/periksa-dns.py` dibuat untuk rencana bertahap (zona abu-abu yang
mencerminkan Hostinger) dan tidak dipakai di jalur ini.

## 4. Pemilik dan admin (migrasi 031, istilah 032)

### Peran

| Peran | Halaman | Di database | Boleh |
|---|---|---|---|
| **Pemilik** | `/pemilik` | tabel `admin`, peran `owner` | semua: pasangan, konfirmasi pembayaran, menambah admin, mencatat pencairan |
| **Admin** (mitra penjual) | `/admin` | tabel `reseller` | tautan rujukan, mencatat pesanan, melihat status dan komisinya |
| Pengantin | `/dasbor` | tabel `pemilik` | mengisi dan menerbitkan undangannya sendiri |

Nama tabel dan fungsi di database sengaja tidak diganti (`reseller_*`,
`admin_*`, `is_admin()` = "pemilik platform"); yang berganti hanya yang
terbaca orang. Alamat lama `/reseller` dialihkan 301 ke `/admin` lewat
`_redirects`. Meja pemilik yang dulu di `/admin` sekarang di `/pemilik`.

Pemilik dibuat lewat SQL, tidak pernah dari halaman. Peran "admin staf"
dari 031 dihapus di 032 — tabel `admin` hanya boleh berisi `owner`.

Admin **tidak pernah** melihat daftar tamu, RSVP, ucapan, atau amplop
kliennya; `uji-admin.mjs` memeriksa halaman itu tidak meminta satu pun.

### Alur penjualan lewat admin

1. Admin membagikan `https://mengundang.id/?r=<kode>`. Pengunjungnya
   dicatat (satu peramban, satu kali sehari) dan kodenya ikut di pesan
   WhatsApp dari halaman depan selama 90 hari.
2. Klien setuju; admin mencatat pesanan di `/admin`
   (status *menunggu pembayaran*). Penjualan yang masuk langsung lewat
   WhatsApp dicatat pemilik di `/pemilik` panel 4, dengan kode admin
   kalau pesannya membawa "Kode rujukan".
3. Klien membayar ke rekening pemilik — satu pembayaran.
4. Pemilik di panel 4 mengisi nominal dan komisi, lalu **Lunas**:
   akun klien dibuat, email undangan dikirim, pasangan langsung
   **aktif**. Teks serah-terima (alamat, /dasbor, link panitia) muncul
   untuk dikirim lewat WhatsApp juga.
5. Klien membuka email, membuat sandinya sendiri di `/dasbor`, mengisi
   undangannya.
6. Kapan pun, pemilik mentransfer komisi yang belum cair ke rekening
   admin dan menekan **Catat Pencairan** dengan nomor transaksinya.
   Semua komisi yang tertahan saat itu menjadi *cair* dengan nomor itu.

Harga dan komisi belum ditetapkan, jadi keduanya diisi per pesanan saat
konfirmasi.

### Lupa sandi

`/pemilik`, `/admin`, dan `/dasbor` punya tombol **Lupa sandi?**
(`assets/akun.js`). Supabase mengirim email berisi tautan kembali ke
halaman itu, dan halaman meminta sandi baru. Supaya tautannya tidak
dibelokkan ke Site URL, ketiga alamat harus diizinkan — cukup satu baris
di Redirect URLs: `https://mengundang.id/**`.

### Email undangan — perlu dipasang sekali

Pengirim email bawaan Supabase hanya mengirim ke anggota tim proyek dan
dibatasi beberapa email per jam. Untuk klien sungguhan:

1. **Supabase → Authentication → URL Configuration**:
   Site URL `https://mengundang.id/dasbor`, dan di Redirect URLs
   `https://mengundang.id/**` (mencakup /dasbor, /admin, /pemilik).
2. **Supabase → Authentication → Emails → SMTP Settings**: pasang SMTP
   sendiri (mis. Resend atau Brevo, ada paket gratisnya). Pengirim
   `undangan@mengundang.id` butuh verifikasi domain di penyedia SMTP —
   rekaman TXT/CNAME-nya ditambahkan di DNS Cloudflare (abu-abu).
3. **Authentication → Emails → Templates → Invite user**: ganti teksnya
   ke bahasa Indonesia, mis. "Undangan digital Anda sudah aktif — klik
   untuk membuat kata sandi". `{{ .ConfirmationURL }}` tetap dipakai.

Sebelum langkah-langkah ini, konfirmasi pesanan **tetap jalan**: kalau
email gagal terkirim, akun dibuat dengan sandi acak dan sandinya tampil
di teks serah-terima untuk dikirim lewat WhatsApp.

## 5. Foto dan video di Cloudflare R2

Kuota gratis Supabase: 1 GB simpanan dan 5 GB egress per bulan. Satu
halaman kenangan dengan video bisa puluhan MB per tamu, jadi berkas
pasangan dipindah ke R2 (10 GB gratis, egress tidak dihitung).

**Alurnya**

```
dasbor ──izin (jenis+ukuran)──▶ foto-unggah ── periksa pemilik, kuota, jenis
   │                               └─ tiket HMAC per berkas
   ├──PUT isi berkas──▶ /media/<jalur>  (Worker, cloudflare/media.js) ──▶ R2
   └──catat──▶ foto-unggah ── HEAD /media/<jalur> (ukuran & jenis dari R2) ── baris foto
tamu ──GET /media/<jalur>──▶ cache edge Cloudflare ──▶ R2
```

- Isi berkas tidak pernah lewat Supabase. Database hanya menyimpan
  jalurnya; `M.fotoUrl()` merakit `/media/<jalur>` di host mana pun
  halaman dibuka (mengundang.id, subdomain pasangan, workers.dev).
- Berkas lama di Supabase Storage disalin ke R2 saat pertama dibuka. Tidak
  ada skrip pindahan.
- Hapus foto: `foto-unggah` membuang dari R2 (tiket `hapus`) dan dari
  Supabase Storage.
- Kalau R2 atau rahasia belum disiapkan, `izin` atau Worker menjawab 503
  dan dasbor otomatis memakai jalan lama (multipart → Supabase Storage).

**Menyiapkan (sekali)**

1. Cloudflare → **R2 Object Storage** → aktifkan (meminta kartu pembayaran
   walau pemakaian masih di jatah gratis).
2. Bucket `mengundang-media` (dibuat Claude lewat MCP sesudah R2 aktif).
   Binding-nya `MEDIA` di `wrangler.jsonc`. Bucket TIDAK perlu dibuat
   publik dan tidak perlu domain sendiri: semua lewat Worker.
3. Rahasia `MEDIA_KUNCI` (acak, 32+ karakter), nilai yang SAMA di dua tempat:
   - Cloudflare → Workers & Pages → `mengundang` → Settings → Variables
     and Secrets → Add → tipe *Secret*, nama `MEDIA_KUNCI`.
   - Supabase → Edge Functions → Secrets → `MEDIA_KUNCI` (opsional
     `MEDIA_ASAL`, bawaan `https://mengundang.id`).
4. Deploy `foto-unggah` versi R2.

Urutan aman: bucket dulu (tanpa bucket, build Worker gagal), baru merge,
baru rahasia + deploy fungsi. Sebelum rahasia terpasang, unggahan tetap
jalan lewat jalan lama.

## Urutan yang disarankan

1. Masuk ke `/pemilik`, pastikan akunnya bekerja, ganti sandinya.
2. Pindah ke Cloudflare mengikuti langkah di bagian 3.
3. Sesudah delegasinya pindah dan `https://mengundang.id` terbuka, buat
   pasangan kedua lewat `/pemilik` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Terakhir, uji satu subdomain pasangan sungguhan lewat HTTPS. Sebelum
   itu terbukti, jangan menjual paket premium.
