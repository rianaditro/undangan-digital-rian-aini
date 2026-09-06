# Undangan Pernikahan — Rian & 'Aini

Situs statis. Tidak ada build step, tidak perlu framework.

```
.
├── index.html            ← halaman undangan
├── kirim/index.html      ← halaman panitia (daftar tamu & pengiriman)
├── assets/
│   ├── varian.js         ← SEMUA konfigurasi ada di sini
│   └── backsound.mp3
├── supabase/schema.sql   ← skema tabel + row level security
└── vercel.json
```

Satu tempat untuk semua isian: **`assets/varian.js`**. Halaman undangan dan
halaman panitia sama-sama membacanya, jadi mengubah alamat acara atau nomor
dompet cukup sekali.

---

## 1. Siapkan database

Supabase → **SQL Editor** → tempel isi `supabase/schema.sql` → **Run**.
Aman dijalankan berulang kali.

Lalu, masih di Supabase:

1. **Authentication → Users → Add user.** Isi email dan kata sandi panitia.
   Ini yang dipakai untuk masuk ke `/kirim`.
2. **Authentication → Sign In / Providers → matikan "Allow new users to
   sign up".** Tanpa ini, siapa pun bisa mendaftar sendiri lalu ikut membaca
   daftar tamu beserta nomor teleponnya.

Kalau URL atau anon key project-nya berbeda dari yang sudah tertulis, ganti
di `assets/varian.js` bagian `SB`. Anon key memang aman ditaruh di file ini:
dengan key itu saja, tabel `tamu` dan `pengiriman` tidak bisa dibaca.

---

## 2. Deploy

```bash
npm i -g vercel
vercel --prod
```

Pilih **Other** saat ditanya framework, build command dikosongkan, output
directory titik (`.`).

Tanpa terminal: buka vercel.com/new, seret folder ini ke sana.

### Memasang domain `rian-aini.mengundang.id`

1. Vercel → project → **Settings → Domains → Add** → isi
   `rian-aini.mengundang.id`.
2. Di Cloudflare (tempat `mengundang.id` dikelola), tambahkan record `CNAME`
   dengan nama `rian-aini` mengarah ke `cname.vercel-dns.com`, proxy
   **dimatikan** (awan abu-abu).
3. Tunggu Vercel menerbitkan sertifikatnya, biasanya beberapa menit.

**Selama domainnya belum siap,** ganti `SITUS` di `assets/varian.js` menjadi
alamat `.vercel.app` bawaan. Link yang disusun halaman panitia mengikuti
nilai itu — jadi jangan menyebar undangan sebelum nilainya benar, karena
link yang sudah beredar di grup WhatsApp tidak bisa ditarik lagi.

---

## 3. Sebar undangan

Buka `/kirim`, masuk dengan akun panitia tadi.

1. **Tambah tamu.** Pilih pihak pengundang, lalu tempel daftarnya, satu tamu
   per baris: `Nama, 08xxxxxxxxxx`. Nomor dirapikan otomatis (`08`, `62`,
   `+62`, spasi, tanda hubung semuanya diterima). Nama atau nomor yang sudah
   ada di daftar akan dilewati, dan yang dilewati dicatat di console browser.
2. **Kirim.** Tombol *Kirim* membuka WhatsApp dengan pesan yang sudah
   disesuaikan pihak tamu, lalu menandai undangannya terkirim.
3. **Berkat** ditandai terpisah dari undangan — dua jalur yang statusnya
   tidak saling memengaruhi.

Semuanya tersimpan di Supabase. Menutup browser, berganti HP, atau dibuka
bergantian oleh beberapa orang — progresnya tetap sama.

Link personal tamu berbentuk:

```
https://rian-aini.mengundang.id/bapak-ahmad-fauzi?p=kw
```

Bagian `?p=` menyebutkan pihak tamu supaya sampul tidak perlu menunggu
jaringan. Bila bagian itu hilang atau dihapus orang, halaman menanyakan
sendiri ke database berdasarkan nama di alamat, jadi undangannya tetap
benar.

---

## 4. Empat varian undangan

Yang **berbeda** antar pihak:

| | Pengantin Pria | Keluarga Pria | Pengantin Wanita | Keluarga Wanita |
|---|---|---|---|---|
| Urutan nama | Rian & 'Aini | Rian & 'Aini | 'Aini & Rian | 'Aini & Rian |
| Alamat & peta | sisi pria | sisi pria | sisi wanita | sisi wanita |
| Rangkaian acara | sisi pria | sisi pria | sisi wanita | sisi wanita |
| Dompet digital | SeaBank dulu | SeaBank dulu | DANA dulu | DANA dulu |
| Tanda tangan | Kami yang berbahagia | Keluarga Bapak Joko Sudarno | Kami yang berbahagia | Keluarga Bapak Surahmad |

Yang **disatukan**: kartu ucapan. Semua varian menulis dan membaca daftar
ucapan yang sama, jadi tamu dari pihak mana pun melihat doa yang sama.

### Dua alamat, satu jadwal

Tanggal dan jamnya sama untuk semua tamu — 15 September 2026, akad 13.00,
resepsi 16.00. Yang berpindah hanya lokasi resepsinya:

| Acara | Tamu pihak wanita | Tamu pihak pria |
|---|---|---|
| Akad 13.00 | Kediaman Mempelai Putri, RT 03 / RW 04 | Kediaman Mempelai Putri, RT 03 / RW 04 |
| Resepsi 16.00 | Kediaman Mempelai Putri, RT 03 / RW 04 | **Kediaman Mempelai Putra, RT 01 / RW 04** |

Akad hanya digelar sekali, jadi dikunci ke kediaman mempelai putri lewat
`tempat: 'wanita'` pada acara itu di `assets/varian.js`. Resepsi tidak
dikunci, sehingga mengikuti pihak tamunya.

Tampilannya menyesuaikan sendiri: bila semua acara jatuh di satu tempat
(tamu pihak wanita), alamatnya ditulis sekali di bawah rangkaian acara.
Bila berbeda (tamu pihak pria), tiap acara membawa alamat dan tombol
petanya masing-masing. Hal yang sama berlaku di pesan WhatsApp yang
disusun halaman panitia.

Peta: sisi wanita `maps.app.goo.gl/xSdwqbrQoHadeU2A6`, sisi pria
`goo.gl/maps/HbCrjVDvgopegQHW8`.

---

## Memantau ucapan

Supabase → **Table Editor → ucapan**. Baris bisa dihapus dari sana bila ada
yang tidak pantas.
