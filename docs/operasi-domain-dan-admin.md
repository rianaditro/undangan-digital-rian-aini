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

## 2. Domain — sisi Vercel **selesai**, sisi DNS menunggu Hostinger

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

### Yang perlu ditambahkan di Hostinger

Untuk **paket standar** (`mengundang.id/rian-aini/bapak-ahmad`) cukup dua:

| Tipe | Nama | Nilai |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Keduanya nilai yang disebut dokumentasi Vercel. Kalau dasbor Vercel
menampilkan nilai lain untuk domain ini, yang di dasbor yang dipakai —
Vercel memberi sebagian domain CNAME khusus per-domain, seperti yang sudah
terjadi pada `rian-aini` (`db6d4fd625182504.vercel-dns-017.com`).

Sesudah itu `mengundang.id` akan dialihkan ke `/mulai` oleh `vercel.json`.

### Untuk paket premium: wildcard

Ini yang belum bisa diselesaikan tanpa satu keputusan lagi.

Menambahkan `CNAME *` ke Vercel membuat `budi-sari.mengundang.id`
*terjangkau*. Yang tidak otomatis adalah **sertifikatnya**: sertifikat
wildcard hanya bisa diterbitkan lewat tantangan DNS-01, yaitu rekaman TXT
`_acme-challenge` yang harus ditulis Vercel sendiri. Selama nameserver
masih di Hostinger, Vercel tidak bisa menulisnya — dokumentasi Vercel
menyediakan jalur manual untuk ini
(`vercel certs issue "*.mengundang.id" --challenge-only`), tapi jalur itu
harus diulang tangan setiap perpanjangan.

Dua pilihan:

1. **Pindahkan nameserver `mengundang.id` ke Vercel.** Zona ini hampir
   kosong — tidak ada MX, tidak ada TXT — jadi risikonya kecil, dan
   sesudahnya seluruh DNS bisa diurus dari satu tempat, termasuk wildcard
   dan perpanjangan sertifikatnya. Ini yang saya sarankan kalau premium
   memang mau dijual.
2. **Tetap di Hostinger, jual paket standar dulu.** Bentuk jalur tidak
   perlu wildcard sama sekali, dan kodenya sudah siap. Premium menyusul
   kalau ada yang membelinya.

Satu hal lagi yang perlu dipastikan sendiri: akun Vercel ini **paket
hobby**. API-nya menerima `*.mengundang.id` tanpa menolak, tapi halaman
harga Vercel menyebut wildcard sebagai fitur berbayar. Apakah sertifikatnya
benar-benar terbit di paket hobby baru ketahuan sesudah rekaman DNS-nya ada
— jadi jangan menjual premium sebelum satu subdomain pasangan sungguhan
terbukti terbuka lewat HTTPS.

---

## Urutan yang disarankan

1. Masuk ke `/admin`, pastikan akunnya bekerja, ganti sandinya.
2. Tambahkan A `@` dan CNAME `www` di Hostinger. Tunggu propagasi, lalu
   buka `https://mengundang.id` — harusnya mendarat di `/mulai`.
3. Buat pasangan kedua lewat `/admin` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Baru sesudah itu putuskan soal wildcard dan nameserver.
