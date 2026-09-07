# Undangan Pernikahan — Rian & 'Aini

Situs statis. Tidak ada build step, tidak perlu framework.

```
.
├── index.html            ← halaman undangan
├── kirim/index.html      ← halaman panitia (daftar tamu & pengiriman)
├── assets/
│   ├── varian.js         ← SEMUA konfigurasi ada di sini
│   ├── vcf.js            ← pembaca berkas kontak .vcf
│   └── backsound.mp3
├── supabase/schema.sql   ← skema tabel + row level security
└── vercel.json
```

Satu tempat untuk semua isian: **`assets/varian.js`**. Halaman undangan dan
halaman panitia sama-sama membacanya, jadi mengubah alamat acara atau nomor
dompet cukup sekali.

---

## 1. Siapkan database

Skema ini **sudah diterapkan** ke project `undangan-digital-rian-aini`
(ref `mavjlhlyrtacxleulbom`) pada 6 September 2026. Berkas
`supabase/schema.sql` disimpan sebagai catatan dan untuk memasang ulang
bila project berpindah — SQL Editor → tempel → **Run**, aman dijalankan
berulang kali.

Catatan: project free tier tidur sendiri setelah beberapa hari tanpa
lalu lintas, dan project ini sempat ditemukan dalam keadaan `INACTIVE`.
Selama tidur, buku ucapan dan halaman panitia mati total. Periksa
statusnya sehari sebelum acara.

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

### Domain `rian-aini.mengundang.id`

Sudah terpasang. `mengundang.id` dikelola di **Hostinger**, dan subdomainnya
diarahkan ke Vercel lewat satu record:

| Kolom | Isi |
|---|---|
| Type | CNAME |
| Name | `rian-aini` (tanpa nama domain di belakangnya) |
| Target | `cname.vercel-dns.com` |

Kalau suatu saat perlu dipasang ulang: tambahkan dulu domainnya di Vercel →
Settings → Domains, baru buat record di hPanel Hostinger → Domains →
`mengundang.id` → DNS Records.

**Vercel Authentication sengaja dibiarkan menyala** dengan mode
*all except custom domains*. Efeknya semua URL `*.vercel.app` terkunci di
balik login Vercel, sementara `rian-aini.mengundang.id` terbuka untuk umum.
Itu yang diinginkan: tamu tidak bisa nyasar lewat alamat lama, dan link
panitia hanya hidup di domain yang benar.

`SITUS` di `assets/varian.js` harus selalu sama dengan domain yang aktif.
Link yang disusun halaman panitia mengikuti nilai itu, dan link yang sudah
beredar di grup WhatsApp tidak bisa ditarik lagi.

---

## 3. Siapa membuka apa

Ada dua cara masuk ke `/kirim`, dan keduanya membatasi apa yang terlihat:

| Cara masuk | Untuk siapa | Yang terlihat |
|---|---|---|
| Login email | Rian &amp; 'Aini | seluruh tamu, semua pihak |
| `/kirim?t=…` | tiap pihak | hanya tamu pihaknya sendiri |

Link bertoken tidak perlu login sama sekali — cocok untuk bapak, ibu,
dan mertua. **Pembatasannya mengikat di server, bukan di tampilan.**
Halaman hanya memegang anon key, dan anon tidak bisa membaca tabel
`tamu` sama sekali; semua lewat RPC yang memeriksa token lalu menyaring
hasilnya. Pemegang link satu pihak tidak bisa melihat, menandai, atau
menghapus tamu pihak lain sekalipun ia mengubah alamat atau memanggil
API langsung. Tamu yang ia tambahkan otomatis masuk ke pihaknya —
menyebut pihak lain di data kiriman pun akan diabaikan server.

Yang perlu diingat: **link itu sendiri adalah kuncinya.** Siapa pun yang
menerima teruskan link tersebut ikut bisa masuk. Kalau satu link bocor,
ganti tokennya lewat perintah di bagian bawah `supabase/schema.sql` —
link lama langsung mati tanpa mengganggu yang lain.

## 4. Sebar undangan

Buka `/kirim`, masuk dengan akun panitia atau lewat link pihak Anda.

1. **Tambah tamu.** Pilih pihak pengundang, lalu tempel daftarnya, satu tamu
   per baris: `Nama, 08xxxxxxxxxx`. Nomor dirapikan otomatis (`08`, `62`,
   `+62`, spasi, tanda hubung semuanya diterima). Nama atau nomor yang sudah
   ada di daftar akan dilewati, dan yang dilewati dicatat di console browser.

   Atau tekan **Ambil dari .vcf** dan pilih berkas ekspor kontak dari HP.
   Isinya dituangkan ke kotak daftar — belum tersimpan, jadi bisa dirapikan
   dan dibuang yang tidak diundang sebelum menekan Simpan. Parser-nya ada di
   `assets/vcf.js` dan sudah menangani vCard 2.1 (termasuk
   QUOTED-PRINTABLE dari Android), 3.0, dan 4.0; nomor bertipe seluler
   didahulukan bila satu kontak punya beberapa nomor, kontak tanpa nama
   dilewati, dan koma pada gelar dirapikan supaya tidak terbaca sebagai
   pemisah kolom.
2. **Kirim.** Tombol *Kirim* membuka WhatsApp dengan pesan yang sudah
   disesuaikan pihak tamu, lalu menandai undangannya terkirim.
3. **Berkat** ditandai terpisah dari undangan — dua jalur yang statusnya
   tidak saling memengaruhi.
4. **Rekap per pihak** di kotak nomor 2 memperlihatkan berapa tamu dan
   berapa yang sudah dikirimi undangan serta berkat, dipecah per pihak.
   Angka besar di atasnya mengikuti saringan yang sedang aktif, jadi
   selalu cocok dengan baris yang terlihat di bawah.

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

## 5. Empat varian undangan

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
