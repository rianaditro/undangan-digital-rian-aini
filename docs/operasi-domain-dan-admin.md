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

## 3. Pindah nameserver ke Cloudflare — urutannya menentukan

Keputusannya berubah (2026-10-10): nameserver `mengundang.id` pindah ke
**Cloudflare** (paket Free), bukan ke Vercel. Hosting tetap di Vercel;
Cloudflare cuma memegang DNS.

**Aturan nomor satu: semua rekaman DNS only (awan abu-abu).** Proxy
Cloudflare (awan oranye) di depan Vercel memutus penerbitan sertifikat
Vercel, menggandakan cache, dan membuat IP pengunjung yang dilihat
Vercel salah. Tidak ada yang kita butuhkan dari proxy itu.

### Harga yang dibayar: wildcard

Sertifikat wildcard `*.mengundang.id` di Vercel hanya terbit lewat
DNS-01, dan itu hanya bisa dikerjakan Vercel kalau nameserver-nya di
Vercel. Dengan DNS di Cloudflare:

- Rekaman `*` tetap dibuat, supaya setiap subdomain mengarah ke Vercel.
- Tapi sertifikatnya diterbitkan **per subdomain** (HTTP-01). Setiap
  pasangan premium (`nama-nama.mengundang.id`) harus **ditambahkan satu
  per satu** ke proyek Vercel — Settings → Domains → Add. Sertifikatnya
  terbit dalam hitungan menit.
- Domain `*.mengundang.id` yang sudah terdaftar di proyek boleh
  dibiarkan; statusnya akan "Invalid Configuration" dan tidak merugikan.
  Lebih rapi dihapus.
- Kelak: langkah "tambah domain" ini bisa diotomatiskan dari
  `admin-pasangan` lewat API Vercel saat pasangan premium dibuat.

### Kenapa urutannya tidak boleh dibalik

Delegasi NS `mengundang.id` punya **TTL 21600 detik — 6 jam**. Begitu
nameserver diganti di Hostinger, selama sampai 6 jam sebagian resolver
masih bertanya ke Hostinger dan sebagian sudah bertanya ke Cloudflare.

Selama **kedua sisi menjawab hal yang sama**, tidak ada yang terasa.
Kalau sisi Cloudflare kurang satu rekaman, sebagian pengunjung kehilangan
nama itu — dan yang paling mahal bukan halaman depan, melainkan
`rian-aini.mengundang.id`: undangan sungguhan yang tautannya sudah
dipegang 415 tamu.

Jadi: **isi zona di Cloudflare dulu, buktikan jawabannya sama, baru pindah.**

### Rekaman yang harus ada di zona Cloudflare sebelum pindah

| Tipe | Nama | Nilai | Proxy |
|---|---|---|---|
| CNAME | `rian-aini` | `db6d4fd625182504.vercel-dns-017.com` | DNS only — **wajib**, undangan yang sudah tersebar |
| A | `@` | `76.76.21.21` | DNS only |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only |
| CNAME | `*` | `cname.vercel-dns.com` | DNS only |

Cloudflare akan mengimpor rekaman lama dari Hostinger, termasuk A
`2.57.91.91` (halaman parkir) untuk `@` dan `www`. **Hapus atau ganti**
yang itu, dan periksa setiap rekaman hasil impor: Cloudflare cenderung
menyalakan proxy secara bawaan.

Tidak ada MX, TXT, maupun CAA yang perlu dibawa. Kalau dasbor Vercel
(Settings → Domains) menampilkan nilai lain untuk apex atau www, pakai
yang dari dasbor.

### Langkahnya

1. **Cloudflare → Add a site → `mengundang.id` → paket Free.** Catat dua
   nameserver yang diberikan (bentuknya `xxx.ns.cloudflare.com`).
2. **DNS → Records**: jadikan isinya persis empat rekaman di atas, semua
   awan abu-abu.
3. **Periksa** dari komputermu sendiri:
   `python3 alat/periksa-dns.py xxx.ns.cloudflare.com` (salah satu dari
   dua nameserver tadi). Jangan lanjut sebelum tulisannya `SIAP`.
   Berkas itu juga berteriak `PROXY ORANYE` kalau ada awan yang menyala.
4. **Hostinger → Domain → DNSSEC**: kalau menyala, matikan dulu, lalu
   tunggu beberapa jam. DNSSEC lama yang tertinggal saat nameserver
   pindah membuat domain gagal di resolver yang memvalidasi.
5. **Hostinger → ganti nameserver** ke dua nameserver Cloudflare.
6. **Periksa lagi**, sesekali selama 6 jam berikutnya. Cloudflare juga
   mengirim email begitu situsnya "Active".
7. **Vercel → Settings → Domains**: `mengundang.id`, `www` dan
   `rian-aini` harus "Valid Configuration". Hapus `*.mengundang.id`.
8. Buka `https://mengundang.id` (→ `/mulai`) dan
   `https://rian-aini.mengundang.id`.
9. Pasangan premium pertama: tambahkan subdomainnya di Vercel, tunggu
   sertifikatnya, uji lewat HTTPS sebelum tautannya dikirim.

### Soal `alat/periksa-dns.py`

Berkas itu membandingkan apa yang dilihat dunia sekarang (Google DNS)
dengan apa yang akan dijawab nameserver tujuan, dengan bertanya langsung
ke keduanya. Argumennya nameserver tujuan; tanpa argumen, ia memakai
`ns1.vercel-dns.com` seperti rencana lama.

Ia **menolak menjawab** kalau nameserver tujuan tidak menjawab SOA
`mengundang.id` dengan `aa=1` — artinya zonanya belum dibuat di sana,
atau kueri tidak sampai. Yang kedua bukan teori: sandbox tempat berkas
ini ditulis membelokkan semua UDP/53 ke resolvernya sendiri, dan
jawabannya terlihat masuk akal walau datang dari tempat yang salah.
Karena itu langkah 3 dan 6 dijalankan dari komputermu, bukan dari sini.

## Urutan yang disarankan

1. Masuk ke `/admin`, pastikan akunnya bekerja, ganti sandinya.
2. Pindah nameserver ke Cloudflare mengikuti langkah di bagian 3 —
   zona dulu, periksa, baru nameserver.
3. Sesudah delegasinya pindah dan `https://mengundang.id` terbuka, buat
   pasangan kedua lewat `/admin` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Terakhir, uji satu subdomain pasangan sungguhan lewat HTTPS. Sebelum
   itu terbukti, jangan menjual paket premium.
