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

## 2. Domain — sisi Vercel **selesai**, DNS-nya belum

Proyek `undangan-digital-rian-aini` (`prj_v2pjgv1UlJV0NLeAt4BZlE7NhDG5`)
sekarang memegang:

| Domain | Keadaan |
|---|---|
| `rian-aini.mengundang.id` | jalan, sudah lama |
| `mengundang.id` | terdaftar di proyek, **DNS belum mengarah** |
| `www.mengundang.id` | terdaftar di proyek, **DNS belum mengarah** |
| `*.mengundang.id` | terdaftar di proyek, **DNS belum ada** |
| `undangan-rian-aini.vercel.app` | jalan |

### DNS yang berlaku sekarang

```
mengundang.id            NS     nebula.dns-parking.com, aurora.dns-parking.com   (Hostinger)
mengundang.id            A      2.57.91.91        ← halaman parkir, bukan Vercel
www.mengundang.id        →      2.57.91.91
rian-aini.mengundang.id  CNAME  db6d4fd625182504.vercel-dns-017.com  → Vercel
*.mengundang.id          —      tidak ada (NXDOMAIN)
MX                       —      tidak ada
TXT                      —      tidak ada
CAA                      —      tidak ada
```

Artinya zona ini praktis kosong: tidak ada email yang bisa rusak, dan tidak
ada CAA yang menghalangi penerbitan sertifikat.

Rekaman yang kurang TIDAK ditambahkan di Hostinger, karena zonanya
sekaligus dipindah ke Cloudflare — lihat bagian 3.

## 3. Pindah ke Cloudflare — DNS dan hosting

Keputusan (2026-10-10): `mengundang.id` pindah seluruhnya ke
**Cloudflare**. Nameserver pindah dari Hostinger ke Cloudflare (paket
Free), hosting pindah dari Vercel ke **Cloudflare Workers**. Domain tetap
terdaftar di Hostinger; yang pindah hanya nameserver-nya.

### Kenapa Workers

- **Subdomain pasangan premium jadi otomatis.** Satu rekaman `*` berproxy
  plus rute `*.mengundang.id/*` menangkap semua subdomain, dan
  sertifikat Universal SSL Cloudflare mencakup `mengundang.id` dan
  `*.mengundang.id`. Di Vercel dengan DNS luar, setiap subdomain harus
  ditambahkan satu per satu.
- **Bukan Pages:** domain kustom Pages tidak bisa wildcard; rute Workers
  bisa.
- **Gratis untuk situs ini:** berkas statis dilayani lapisan aset tanpa
  menghitung kuota. Kode Worker hanya berjalan untuk jalur `/` (satu
  kali per buka undangan), jauh di bawah batas 100.000 per hari.
- Situsnya tidak memakai fitur server Vercel apa pun: semua halaman
  statis, data diambil peramban langsung dari Supabase, edge function
  menerima origin mana pun, dan login dasbor memakai email+sandi tanpa
  tautan redirect — jadi Supabase tidak perlu diubah.

### Berkasnya

| Berkas | Isi |
|---|---|
| `wrangler.jsonc` | aset = folder repo, `drop-trailing-slash`, `single-page-application`, rute `mengundang.id/*` dan `*.mengundang.id/*` |
| `.assetsignore` | yang TIDAK terbit: `docs/`, `supabase/`, `uji/`, `alat/`, konfigurasi. Cermin `.vercelignore`. |
| `_headers` | `X-Robots-Tag: noindex` untuk `/kirim`, `/dasbor`, `/admin` |
| `cloudflare/pintu.js` | Worker: `mengundang.id/` → `/mulai`, `www.mengundang.id/` → `https://mengundang.id/mulai`; selain itu langsung ke aset |
| `uji/server.mjs` | peniru Workers untuk uji, menjalankan `pintu.js` yang sama |
| `uji/uji-pintu.mjs` | uji jawaban HTTP: alih per host, SPA, noindex, berkas internal tidak terbit |

Perilakunya dicocokkan dengan `wrangler dev` (runtime workerd
sungguhan). Satu hal yang tidak bisa diuji di `wrangler dev`: ia
mengganti host setiap permintaan dengan host rute pertama, jadi keputusan
per host diuji lewat `uji-pintu.mjs`.

### Prinsip urutannya: setiap langkah bisa dibatalkan

Rute Worker hanya mengambil alih sebuah nama kalau rekaman DNS-nya
**diproxy (awan oranye)**. Selama awannya abu-abu, nama itu tetap ke
Vercel seperti sekarang. Jadi:

1. Zona Cloudflare diisi dengan rekaman abu-abu yang sama persis dengan
   sekarang → pindah nameserver tanpa mengubah apa pun yang dilihat tamu.
2. Sesudah zona aktif, setiap nama dipindah ke Workers dengan membalik
   awannya jadi oranye — **satu nama demi satu nama**, dan
   `rian-aini` paling akhir. Membatalkan = membalik lagi ke abu-abu.
3. Vercel baru dimatikan sesudah semuanya stabil.

`rian-aini.mengundang.id` adalah undangan sungguhan yang tautannya
dipegang 415 tamu. Delegasi NS punya TTL 6 jam, jadi sisi Cloudflare
harus menjawab sama dengan Hostinger SEBELUM nameserver diganti.

### Tahap A — siapkan, tanpa risiko

1. **Merge PR #1** (`claude/dev-without-laptop-0pfxk6` → `main`). PR itu
   membawa halaman `/mulai` dan berkas Cloudflare ke `main`.
2. **Cloudflare → Add a site → `mengundang.id` → Free.** Catat dua
   nameserver yang diberikan (`xxx.ns.cloudflare.com`).
3. **DNS → Records**, semuanya **DNS only (abu-abu)**:

   | Tipe | Nama | Nilai |
   |---|---|---|
   | CNAME | `rian-aini` | `db6d4fd625182504.vercel-dns-017.com` |
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |
   | CNAME | `*` | `cname.vercel-dns.com` |

   Hapus rekaman hasil impor yang menunjuk `2.57.91.91` (parkir
   Hostinger).
4. **Workers & Pages → Create → Import a repository** →
   `rianaditro/undangan-digital-rian-aini`, branch produksi `main`.
   Build command kosong; deploy command bawaan (`npx wrangler deploy`).
   Nama Worker diambil dari `wrangler.jsonc`: `mengundang`.
   Kalau deploy pertama gagal karena rute (zona masih "Pending"),
   lanjutkan saja ke tahap B dan klik "Retry deployment" sesudah zona
   aktif.
5. **Uji di `https://mengundang.<akun>.workers.dev`**: `/mulai`,
   `/rian-aini/bapak-ahmad` (contoh tautan tamu bentuk path), `/kirim`.

### Tahap B — pindah nameserver

6. Dari komputer sendiri:
   `python3 alat/periksa-dns.py xxx.ns.cloudflare.com` → harus `SIAP`.
7. **Hostinger → Domain → DNSSEC**: kalau menyala, matikan dulu.
8. **Hostinger → nameserver** → dua nameserver Cloudflare.
9. Tunggu sampai Cloudflare menyatakan zona **Active** (email), lalu
   **SSL/TLS → Edge Certificates**: tunggu sertifikat Universal
   (`mengundang.id, *.mengundang.id`) berstatus Active.
   **SSL/TLS → Overview**: mode **Full (strict)**.

Sampai titik ini semua masih dilayani Vercel.

### Tahap C — pindah hosting, satu nama demi satu nama

10. `@` dan `www` → oranye. Buka `https://mengundang.id` → harus
    berakhir di `/mulai`.
11. `*` → oranye. Buka `https://coba-acak.mengundang.id` → harus
    "Undangan belum tersedia" (halaman undangan tanpa data), bukan
    galat sertifikat.
12. `rian-aini` → oranye, di jam sepi. Langsung buka satu tautan tamu
    sungguhan dari HP (data seluler, bukan Wi-Fi rumah). Kalau ada yang
    aneh: balik ke abu-abu, selesai.
    Sesudah stabil, rekaman `rian-aini` boleh dihapus — wildcard `*`
    yang oranye sudah menangkapnya.

### Tahap D — matikan Vercel

13. Sesudah beberapa hari tanpa masalah: hapus domain `mengundang.id`,
    `www`, `*.mengundang.id`, `rian-aini.mengundang.id` dari proyek
    Vercel, lalu **pause** proyeknya (bisa dikerjakan Claude lewat MCP
    Vercel, atau Settings → General di dasbor).
    Akibatnya: `undangan-rian-aini.vercel.app` ikut mati. Tautan tamu
    yang dikirim dalam bentuk itu tidak terbuka lagi.
14. Buang `vercel.json` dan `.vercelignore` dari repo, dan cabut
    integrasi GitHub Vercel.

### Soal `alat/periksa-dns.py`

Berkas itu membandingkan apa yang dilihat dunia sekarang (Google DNS)
dengan apa yang akan dijawab nameserver tujuan, dengan bertanya langsung
ke keduanya. Argumennya nameserver tujuan; tanpa argumen, ia memakai
`ns1.vercel-dns.com` seperti rencana lama.

Ia **menolak menjawab** kalau nameserver tujuan tidak menjawab SOA
`mengundang.id` dengan `aa=1` — artinya zonanya belum dibuat di sana,
atau kueri tidak sampai. Yang kedua bukan teori: sandbox tempat berkas
ini ditulis membelokkan semua UDP/53 ke resolvernya sendiri. Jalankan
dari komputermu sendiri.

Peringatan `PROXY ORANYE` dari berkas itu berlaku untuk **tahap B**:
sebelum nameserver dipindah, semua rekaman harus abu-abu. Di tahap C
awan oranye memang tujuannya, dan di sana berkas itu tidak dipakai lagi.

## Urutan yang disarankan

1. Masuk ke `/admin`, pastikan akunnya bekerja, ganti sandinya.
2. Pindah ke Cloudflare mengikuti tahap A–D di bagian 3 — zona abu-abu
   dulu, nameserver, baru hosting satu nama demi satu nama.
3. Sesudah delegasinya pindah dan `https://mengundang.id` terbuka, buat
   pasangan kedua lewat `/admin` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Terakhir, uji satu subdomain pasangan sungguhan lewat HTTPS. Sebelum
   itu terbukti, jangan menjual paket premium.
