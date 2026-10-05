# Halaman Kenangan — /terimakasih sebagai CMS

Disetujui 29 September 2026. Melanjutkan `docs/platform.md` dan
`docs/alur-pengguna.md`.

Halaman `/terimakasih` yang sekarang memajang satu grid foto di bawah
satu paragraf ucapan. Yang diminta: halaman yang membuat pengunjung
**merasa ikut hadir** — potongan momen acara jadi latar, bukan galeri
yang ditempel — dan seluruhnya bisa disusun sendiri oleh pasangan,
menyesuaikan acara dan bahan yang mereka punya.

---

## 1. Ide pokok: membalik figure-ground

Undangan itu **janji**. Ia belum boleh memperlihatkan apa pun dari
acaranya, karena acaranya belum ada. Latarnya nila dan kapur, isinya
tipografi dan ukir.

Halaman kenangan itu **ingatan**. Kerangkanya sama persis — sampul,
seksi berselang gelap-terang, ukir, `reveal`, gulir otomatis — tapi
hubungan gelap-terangnya dibalik: **latar belakangnya acaranya sendiri**,
dan teks ornamennya mengambang di atasnya.

Galeri grid yang sekarang tetap ada, turun pangkat jadi arsip.

## 2. Gulir = waktu berjalan

Seksinya diurutkan menurut jam di hari itu. Menggulir ke bawah berarti
hari itu berjalan.

Tamu yang datang siang tidak melihat akadnya. Tamu yang datang sore
tidak melihat keduanya. Halaman ini memberi mereka seluruh harinya,
berurutan. **Itu** yang mengubah galeri jadi kehadiran — bukan jumlah
klipnya.

## 3. Babak = baris `acara`, bukan konsep baru

Usulan pertama menetapkan empat babak tetap: akad, resepsi,
salam-salaman, tutup. Itu salah untuk platform — orang Jawa punya
siraman dan midodareni, ada yang akadnya di KUA dan resepsinya dua kali
di dua kota. Empat babak tetap adalah memaksakan satu pernikahan ke
semua orang.

Pasangan **sudah** mengetik rangkaian acaranya di panel 3 dasbor, untuk
undangannya. Halaman kenangan memakai baris yang sama persis: tidak ada
daftar kedua, tidak ada ketik ulang, dan tidak mungkin melenceng — kalau
jam resepsi diperbaiki, kedua halaman ikut berubah.

Yang ditambahkan cuma dua penanda per baris:

| kolom | gunanya |
|---|---|
| `acara.di_undangan` | "Salam-salaman" boleh ada di kenangan tanpa muncul di undangan |
| `acara.di_terimakasih` | "Ngunduh mantu" yang batal bisa dimatikan tanpa dihapus |

Satu daftar "apa yang terjadi hari itu", dua halaman membacanya dengan
mata berbeda.

## 4. Yang boleh dikustom, dan yang sengaja tidak

Godaan CMS selalu sama: semuanya bisa digeser, lalu penggunanya
menghasilkan halaman jelek dan menyalahkan alatnya.

**Bebas diatur — ini milik mereka:** urutan dan isi babak, foto/klip di
tiap babak, judul dan satu kalimat per babak, blok mana yang tampil,
angka mana yang dipajang, tema.

**Tidak bisa digeser, disengaja:** urutan blok rangka. Sampul selalu
pertama, penutup selalu terakhir, ucapan selalu sesudah momen. Bukan
karena sulit dibuat bisa digeser, tapi karena galeri sebelum pembuka itu
halaman yang rusak, dan tidak ada gunanya menyediakan tombol untuk
merusak. Yang bisa dilakukan: **mematikan** blok yang tidak dipakai.

## 5. Halaman menyesuaikan bahan

| Bahan yang ada | Yang halamannya lakukan |
|---|---|
| Klip video | latar bergerak, 1–2 detik, loop, bisu |
| Foto saja | latar diam dengan pan lambat — hidup, nol biaya video |
| 1–2 foto per babak | satu foto besar, penuh layar |
| 8+ foto per babak | satu jadi latar, sisanya ke galeri |
| Satu babak kosong | jadi kartu teks di atas nila — rapi, bukan kotak kosong |
| Tidak ada apa-apa | halaman = versi sekarang + angka hari itu |

**Tidak pernah ada halaman kosong.** Itu syarat, bukan fitur. Pasangan
yang tidak menyentuh apa pun tetap dapat halaman utuh dengan teks bawaan
yang masuk akal.

## 6. Satu dasbor

Panel `/dasbor` sesudah perubahan — ◆ baru atau berubah:

```
  1 · Mempelai
  2 · Tempat
  3 · Rangkaian acara          ◆  + centang: tampil di undangan / di kenangan
  4 · Dompet digital
  5 · Penutup
  6 · Acara & tampilan
  7 · Terbitkan undangan
  8 · Foto & Klip              ◆  satu pustaka
  9 · Halaman Kenangan         ◆  blok hidup/mati, teks, latar, pratinjau
 10 · Terbitkan kenangan       ◆  saklar sendiri, terpisah dari undangan
```

Panel 8–10 **selalu terlihat**, juga sebelum hari-H, dengan keterangan
pra-acara: sebelum acaranya lewat panel-panel itu menjelaskan apa yang
nanti bisa diisi, bukan menyembunyikan diri. Pasangan jadi tahu sejak
awal bahwa halaman kenangan itu ada dan termasuk yang dibeli.

### Panel 8 — satu pustaka, bukan folder per babak

Foto tanpa babak tetap masuk galeri; tidak ada yang hilang gara-gara
lupa dilabeli. Panelnya memajang pemakaian kuota.

### Panel 9 — CMS-nya

Centang blok rangka, geser urutan babak, pilih latar tiap babak, ubah
satu kalimatnya. Pratinjau membuka halaman sungguhan dalam mode draf.

## 7. Data

```
acara       + di_undangan      bool  default true
            + di_terimakasih   bool  default true
            + kenangan_teks    text  satu kalimat, kosong = bawaan

foto        + klip             text  jalur .webm, null = foto biasa
            + klip_ms          int
            + acara_id         uuid  null = lepas, galeri saja
            + latar            bool  jadikan latar babaknya

pasangan    + kenangan_terbit  bool  default false

kenangan_blok (pasangan_id, kunci, tampil, judul, teks)
              kunci: sampul | pembuka | angka | galeri | ucapan | penutup
              baris tidak ada = pakai bawaan; tidak perlu disemai
```

`foto` tetap **satu tabel**: klip selalu punya poster, dan poster itu
sebuah foto. Satu urutan, satu galeri, satu RLS.

Bucket baru `klip`: `video/webm`, batas 1 MB per berkas.

## 8. Unggah pindah ke `/dasbor`

`foto-unggah` sekarang menuntut token panitia cakupan penuh. Ia perlu
jalan kedua: JWT pemilik → `pasangan_saya()`. Polanya sudah ada di
`admin-pasangan`.

**Panel unggah di `/kirim` dihapus.** Dua tempat unggah berarti dua
perilaku yang cepat atau lambat beda. Konsekuensinya disadari dan
diterima: pengantin harus login email untuk mengunggah, tidak cukup
membuka link panitia.

## 9. Yang paling berisiko: klip video

Bucket `foto` menolak video, dan `assets/gambar.js` sudah menetapkan
prinsipnya: **peramban mengecilkan, server tidak pernah menerima berkas
mentah.** Video 2 detik dari HP itu 10–50 MB, jadi prinsip itu harus
dipegang — `<video>` tersembunyi → canvas → `MediaRecorder` → WebM
sekitar 200–400 KB.

Ini bagian paling rapuh dari seluruh rencana. `MediaRecorder`
perilakunya beda-beda antar HP, dan tidak bisa diuji dari sandbox
tempat ini dikerjakan. Karena itu ia **dikerjakan paling akhir**,
sesudah semua yang lain jalan dengan foto saja. Kalau gagal di HP
sungguhan, yang hilang cuma klip; halamannya sudah utuh tanpa itu.

Anggaran: 50 MB per pasangan, maksimal 6 klip jadi latar, total klip
≤ 2 MB. Supabase tier gratis 1 GB — 20 pasangan sudah mentok, dan itu
masuk daftar Tahap 5 yang sudah ada.

## 10. Keputusan saat membangun langkah 3 (5 Oktober)

- **Urutan babak tidak diatur di panel 9.** Babak adalah baris `acara`,
  jadi urutannya urutan kotak 3 — yang memang urutan hari itu. Tombol
  geser kedua di panel 9 akan berarti dua urutan untuk satu daftar.
- **Sampul dan penutup wajib**, tulisannya tetap bisa diganti.
- **Tulisan bawaan duduk di `assets/kenangan.js`**, dibaca halaman
  sebagai bawaan dan dasbor sebagai placeholder.
- **Blok yang tidak diubah tidak ditulis ke database.** Baris yang
  menyalin bawaan akan membekukannya; tanpa baris, perbaikan tulisan
  bawaan sampai ke semua pasangan sekaligus.
- **Pembuka diam kalau tidak ada babak** — "inilah hari itu, berurutan"
  tanpa satu babak pun adalah janji yang tidak ditepati.
- **Angka kehadiran pindah dari sampul ke blok angka**, bersama jumlah
  ucapan, foto, dan babak. Nol tetap tidak pernah dipajang.
- **Pratinjau** membuka halaman yang dilihat tamu. Selama undangan masih
  draf ia menjawab "belum tersedia"; mode draf untuk pemilik datang
  bersama saklar terbit kenangan (langkah 4).

## 11. Urutan kerja

1. `acara.di_undangan` / `di_terimakasih` + panel 3
2. Panel 8 unggah foto di `/dasbor`, `foto-unggah` terima JWT pemilik,
   panel unggah `/kirim` dihapus
3. `kenangan_blok` + panel 9 + halaman kenangan baru, **foto saja**,
   dengan pan lambat
4. Saklar terbit kenangan
5. Klip video — terpisah, boleh gagal tanpa merusak apa pun

Langkah 1–4 sudah menghasilkan halaman yang jauh lebih baik dari
sekarang, dan tidak satu pun bergantung pada transcode video.
