# Operasi: domain dan admin pertama

Diperiksa 22 September 2026, langsung ke Vercel, ke Supabase, dan ke DNS
yang sedang berlaku. Angka dan nilai di bawah bukan kutipan dokumentasi —
kecuali yang disebut begitu, semuanya hasil pemeriksaan hari itu.

---

## 1. Admin pertama — **selesai**

Ayam-dan-telur yang memblokir seluruh platform: `/admin` menolak siapa pun
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
| `_headers` | `X-Robots-Tag: noindex` untuk `/kirim`, `/dasbor`, `/admin` |
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

## Urutan yang disarankan

1. Masuk ke `/admin`, pastikan akunnya bekerja, ganti sandinya.
2. Pindah ke Cloudflare mengikuti langkah di bagian 3.
3. Sesudah delegasinya pindah dan `https://mengundang.id` terbuka, buat
   pasangan kedua lewat `/admin` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Terakhir, uji satu subdomain pasangan sungguhan lewat HTTPS. Sebelum
   itu terbukti, jangan menjual paket premium.
