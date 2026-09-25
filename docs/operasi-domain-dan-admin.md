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
sekaligus dipindah — lihat bagian 3.

## 3. Pindah nameserver ke Vercel — urutannya menentukan

Keputusannya sudah diambil: nameserver `mengundang.id` pindah ke Vercel,
supaya sertifikat wildcard bisa terbit sendiri dan seluruh DNS diurus di
satu tempat.

**Yang tidak bisa dikerjakan dari sisi ini.** Token MCP Vercel yang
dipakai boleh mengatur domain milik proyek, tapi TIDAK boleh menyentuh
zona DNS — endpoint DNS-nya menjawab 401 di scope pribadi dan 403 di
scope tim `rianaditros-projects`. Jadi pengisian zona dan penggantian
nameserver dua-duanya lewat tangan.

### Kenapa urutannya tidak boleh dibalik

Delegasi NS `mengundang.id` punya **TTL 21600 detik — 6 jam**. Begitu
nameserver diganti di Hostinger, selama sampai 6 jam sebagian resolver
masih bertanya ke Hostinger dan sebagian sudah bertanya ke Vercel.

Selama **kedua sisi menjawab hal yang sama**, tidak ada yang terasa.
Kalau sisi Vercel masih kosong, sebagian pengunjung dapat SERVFAIL —
dan yang paling mahal bukan halaman depan, melainkan
`rian-aini.mengundang.id`: undangan sungguhan yang tautannya sudah
dipegang 415 tamu.

Jadi: **isi zona di Vercel dulu, buktikan jawabannya sama, baru pindah.**

### Rekaman yang harus ada di zona Vercel sebelum pindah

Cerminan zona yang sekarang, plus dua yang baru:

| Tipe | Nama | Nilai | Kenapa |
|---|---|---|---|
| CNAME | `rian-aini` | `db6d4fd625182504.vercel-dns-017.com` | **wajib** — undangan yang sudah tersebar |
| A | `@` | `76.76.21.21` | apex, supaya `mengundang.id` → `/mulai` |
| CNAME | `www` | `cname.vercel-dns.com` | www ikut ke aplikasi |
| CNAME | `*` | `cname.vercel-dns.com` | yang baru — subdomain per pasangan |

Tidak ada MX, TXT, maupun CAA yang perlu dibawa; zona lamanya memang
kosong selain yang di atas.

Kalau dasbor Vercel menawarkan nilai lain untuk apex atau www, pakai yang
dari dasbor — Vercel memberi sebagian domain target khusus per-domain,
persis seperti yang sudah terjadi pada `rian-aini`.

### Langkahnya

1. **Vercel → Domains → `mengundang.id` → pakai Vercel DNS.** Ini yang
   membuat zonanya ada. Catat nameserver yang diberikan (biasanya
   `ns1.vercel-dns.com` dan `ns2.vercel-dns.com`).
2. **Isi keempat rekaman di atas** di zona itu, masih di Vercel.
3. **Periksa**: `python3 alat/periksa-dns.py` — dari komputermu sendiri,
   bukan dari sesi Claude (alasannya di bawah). Jangan lanjut sebelum
   tulisannya `SIAP`.
4. **Hostinger → ganti nameserver** ke yang dicatat di langkah 1.
5. **Periksa lagi**, sesekali selama 6 jam berikutnya. Kolom kiri dan
   kanan harus sama-sama terisi sepanjang masa itu.
6. Sesudah delegasi benar-benar pindah, buka `https://mengundang.id`
   dan `https://rian-aini.mengundang.id`. Lalu tunggu sertifikat
   wildcard terbit, dan uji satu subdomain pasangan sungguhan lewat
   HTTPS sebelum menjual paket premium.

### Soal `alat/periksa-dns.py`

Berkas itu membandingkan apa yang dilihat dunia sekarang dengan apa yang
akan dijawab nameserver Vercel, dengan bertanya langsung ke keduanya.

Ia **menolak menjawab** kalau kueri ke nameserver otoritatif ternyata
tidak sampai. Itu bukan kehati-hatian berlebihan: sandbox tempat berkas
ini ditulis membelokkan semua UDP/53 ke resolvernya sendiri, dan
gejalanya halus — jawabannya terlihat masuk akal, cuma datang dari
tempat yang salah. Saya sempat tertipu olehnya dan melaporkan "zona
Vercel masih kosong" sebagai fakta, padahal yang terbaca cuma resolver
lokal yang gagal. Pemeriksaannya sekarang: nameserver otoritatif harus
menjawab `vercel.com` dengan bendera `aa=1`; kalau tidak, jalurnya
tersadap dan kolom Vercel tidak boleh dipercaya.

Karena itu langkah 3 dan 5 dijalankan dari komputermu, bukan dari sini.

**Jadi yang sampai detik ini BELUM diketahui:** apakah Vercel sudah
memegang zona untuk `mengundang.id`. Yang pasti cuma bahwa delegasinya
masih di Hostinger.

## Urutan yang disarankan

1. Masuk ke `/admin`, pastikan akunnya bekerja, ganti sandinya.
2. Pindah nameserver mengikuti enam langkah di bagian 3 — zona dulu,
   periksa, baru nameserver.
3. Sesudah delegasinya pindah dan `https://mengundang.id` terbuka, buat
   pasangan kedua lewat `/admin` dengan paket **standar**, buka
   undangannya, kirim satu link tamu ke diri sendiri.
4. Terakhir, uji satu subdomain pasangan sungguhan lewat HTTPS. Sebelum
   itu terbukti, jangan menjual paket premium.
