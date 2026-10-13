# Variasi tema: palet warna dan gaya teks

Disusun 12 Oktober 2026, lanjutan dari `docs/riset-tema-prewed.md` dan
`docs/rencana-tema.md`.

Tiap tema mendapat **4 palet + 3 gaya teks** pilihan, ditambah palet
**"Dari foto"** di tema yang cocok. Jadi 7 tema menghasilkan ±90 tampilan
berbeda tanpa menambah satu pun template.

---

## 1. Kenapa dikurasi, bukan pemilih warna bebas

- Pemilih warna bebas menghasilkan undangan yang tidak terbaca (teks emas di
  atas krem) dan itu yang dilihat tamu, bukan pengaturannya.
- Palet kurasi bisa **diuji kontrasnya** satu kali di repo. Semua palet di
  bawah sudah dihitung: teks utama ≥ 10:1, aksen ≥ 3:1 (batas WCAG untuk
  teks besar dan ornamen).
- Kebutuhan "warna sesuai foto" sudah dilayani oleh palet **Dari foto**,
  yang juga dikoreksi kontrasnya secara otomatis.

Kalau nanti ada permintaan kuat, langkah berikutnya adalah **aksen bebas**
saja (latar dan teks tetap dari palet), dengan kontras dicek langsung di
dasbor.

---

## 2. Cara kerjanya

### 2.1 Token bersama

Semua tema memakai nama variabel CSS yang sama. Palet dan gaya teks hanya
mengisi variabel ini; `gaya.css` tiap tema tidak pernah menulis warna atau
nama huruf secara langsung.

| Token | Isi |
|---|---|
| `--latar`, `--latar-2` | latar utama, latar kartu/bagian selang-seling |
| `--teks`, `--teks-2` | teks utama, teks keterangan |
| `--aksen` | ornamen, garis, judul besar, tombol |
| `--judul` | huruf judul bagian |
| `--naskah` | huruf nama mempelai |
| `--isi` | huruf isi |
| `--judul-kapital` | `uppercase` atau `none` |
| `--judul-jarak` | jarak antar huruf judul |

`--latar-2` dan `--teks-2` diturunkan otomatis saat `tema/daftar.json`
dibangkitkan, jadi tiap palet cukup ditulis 3 warna. Tidak memakai
`color-mix()` di peramban, karena WebView Android lama belum mendukungnya.

`ukir-jepara` sekarang memakai nama sendiri (`--nila`, `--kuningan`,
`--kapur`, …). Di Tahap A nama itu dipetakan ke token bersama.

### 2.2 Manifest

```json
{
  "kode": "senja-alam",
  "palet_foto": true,
  "palet": [
    { "kode": "pantai", "nama": "Senja Pantai",
      "latar": "#F6EDE3", "teks": "#3A2A20", "aksen": "#C0612F" }
  ],
  "huruf": [
    { "kode": "organik", "nama": "Organik",
      "naskah": "Cormorant Garamond", "judul": "Cormorant Garamond", "isi": "Karla",
      "kapital": false,
      "google": "family=Cormorant+Garamond:ital,wght@0,500;1,400&family=Karla:wght@400;600" }
  ],
  "bawaan": { "palet": "pantai", "huruf": "organik" }
}
```

Pilihan pasangan disimpan di `pasangan.tema_setel`:
`{ "palet": "pantai" | "foto", "huruf": "organik" }`. Kode yang tidak dikenal
(misal palet dihapus dari tema) jatuh ke `bawaan`, tidak pernah ke halaman
tanpa warna.

### 2.3 Di halaman

`gantiTema()` di `assets/varian.js` sudah menunggu `gaya.css` termuat
sebelum sampul dibuka. Ia ditambah dua langkah, di dalam penantian yang
sama:

1. Pasang token palet sebagai `style` di `<html>`.
2. Pasang **hanya** tautan Google Font untuk gaya teks terpilih, lalu tunggu
   `document.fonts.ready` (dengan batas waktu 1,5 detik, sesudah itu jalan
   terus dengan huruf cadangan).

Tautan huruf yang sekarang ditulis keras di `<head>` `index.html` dihapus.
Setiap gaya teks dibatasi **maks. 3 keluarga dan 4 ketebalan**, supaya HP
murah tidak mengunduh ratusan KB huruf.

### 2.4 Di dasbor

- Palet tampil sebagai deretan bulatan 3 warna. "Dari foto" memakai warna
  foto sampul pasangan sendiri, dan nonaktif sampai ada foto sampul.
- Gaya teks tampil sebagai kartu bertuliskan **nama pasangan itu sendiri**,
  bukan "Romeo & Juliet".
- Pratinjau (iframe) berubah langsung saat bulatan atau kartu ditekan.

### 2.5 Uji

- **`tema/periksa-palet.mjs` (baru)**, berdampingan dengan
  `periksa-gerak.mjs`: setiap palet di setiap manifest harus lulus teks ≥ 7:1
  dan aksen ≥ 3:1, setiap gaya teks ≤ 3 keluarga, setiap `bawaan` menunjuk
  palet dan huruf yang ada.
- `uji-tema.mjs` memotret setiap tema dengan palet dan gaya teks bawaannya,
  plus satu kombinasi acak per jalan (bijinya dicetak supaya bisa diulang).

---

## 3. Variasi per tema

Angka di kolom kontras: teks utama / aksen terhadap latar.

### 3.1 Kisah — album keluarga · *Dari foto: ya*

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Sepia Klasik (bawaan) | `#F4ECDD` | `#3B2A1E` | `#A0522D` | 11.6 / 4.8 |
| Zaitun | `#EFEDE3` | `#2F3324` | `#6B7A3A` | 11.0 / 4.0 |
| Biru Pudar | `#EEF1F2` | `#23313A` | `#4F6D7A` | 11.8 / 4.9 |
| Mawar Kering | `#F5ECEA` | `#3D2626` | `#A35D5D` | 12.0 / 4.2 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Tulisan Tangan (bawaan) | Caveat | Lora | Lora | catatan di balik foto |
| Buku Cerita | Playfair Display *italic* | Playfair Display | Lora | buku dongeng |
| Mesin Ketik | Special Elite | Special Elite | Courier Prime | surat lama, arsip |

### 3.2 Senja di Alam — earthy, golden hour · *Dari foto: ya (disarankan)*

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Senja Pantai (bawaan) | `#F6EDE3` | `#3A2A20` | `#C0612F` | 11.8 / 3.6 |
| Hutan Pinus | `#ECEEE6` | `#22301F` | `#5E7A4A` | 11.9 / 4.1 |
| Sawah | `#F3F0DE` | `#2E3320` | `#8A7A2E` | 11.4 / 3.7 |
| Ilalang | `#F2EADB` | `#3A3226` | `#A07B4C` | 10.6 / 3.2 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Organik (bawaan) | Cormorant Garamond *italic* | Cormorant Garamond | Karla | lembut, alami |
| Petualang | DM Serif Display | DM Sans KAPITAL | DM Sans | tegas, jurnal perjalanan |
| Hangat | Fraunces *italic* | Fraunces | Nunito Sans | ramah, membulat |

### 3.3 Monokrom — editorial · *Dari foto: tidak (warna akan merusak konsep)*

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Arang (bawaan) | `#F7F5F0` | `#141414` | `#141414` | 16.9 / 16.9 |
| Negatif (gelap) | `#121212` | `#F2F0EA` | `#BDBDBD` | 16.4 / 10.0 |
| Emas Tipis | `#F7F5F0` | `#141414` | `#9C7A42` | 16.9 / 3.7 |
| Merah Bibir | `#F7F5F0` | `#141414` | `#9E1B1B` | 16.9 / 7.3 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Majalah (bawaan) | Bodoni Moda | Bodoni Moda KAPITAL berjarak | Inter | Vogue, kontras tinggi |
| Galeri | Italiana | Jost KAPITAL berjarak | Jost | pameran seni, tipis |
| Klasik | Cormorant Garamond | Cormorant Garamond KAPITAL | Karla | film hitam putih lama |

Palet beraksen (Emas Tipis, Merah Bibir) hanya mewarnai garis dan satu
kata. Foto tetap hitam putih.

### 3.4 Dua Bingkai — syar'i, teduh · *Dari foto: tidak (foto bisa tidak ada)*

> **Terpasang (13 Okt).** Palet dan gaya teks seperti tabel di bawah,
> dengan tiga perbedaan: tiap palet juga menulis warna kartu (`kertas`,
> `kertas_aksen`) karena tema ini berlatar terang; gaya teks Kaligrafi
> memakai Lora untuk judul dan isi, Alex Brush untuk nama; dan Amiri
> selalu ikut dimuat untuk ayat apa pun gaya teksnya.

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Sage (bawaan) | `#F1F2EB` | `#2B3326` | `#6F805A` | 11.6 / 3.8 |
| Krem Biru | `#F4F1E8` | `#1F2A44` | `#9C7B4A` | 12.6 / 3.5 |
| Mawar Debu | `#F6EEEC` | `#3E2A2E` | `#A0646E` | 11.7 / 4.0 |
| Zamrud Malam (gelap) | `#10261F` | `#EDE6D3` | `#C8A96A` | 12.8 / 7.1 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Teduh (bawaan) | Amiri | Amiri | Lato | naskah klasik, serasi dengan teks Arab |
| Anggun | Cormorant Garamond | Cormorant Garamond KAPITAL | Karla | ringan, modern |
| Kaligrafi | Alex Brush | Lora | Lora | romantis tanpa berlebihan |

Ayat (Ar-Rum 21) selalu memakai **Amiri** apa pun gaya teksnya. Hanya
huruf Arab yang diambil (`subset=arabic` + `text=`), jadi ukurannya kecil.

> **Terpasang (13 Okt) untuk `ukir-jepara`** — tema dua permukaan, jadi
> paletnya menulis permukaan gelap dan kertas sekaligus:
>
> | Palet | Latar | Teks | Aksen | Kertas aksen | Kontras teks / aksen / kertas-aksen |
> |---|---|---|---|---|---|
> | Nila Kuningan (bawaan, = tampilan lama) | `#131E33` | `#EDE7D9` | `#C39A5C` | `#8C6A3A` | 13.5 / 6.4 / 4.0 |
> | Sogan | `#3B2416` | `#F1E7D3` | `#CDA162` | `#87602D` | 11.8 / 6.1 / 4.6 |
> | Marun Keraton | `#4A1520` | `#F5ECE2` | `#D4AF6A` | `#8C6A33` | 12.7 / 7.1 / 4.3 |
> | Hijau Pupus | `#1F3A2C` | `#F2EEDF` | `#C8A456` | `#80662B` | 10.6 / 5.2 / 4.7 |
>
> Gaya teks: **Keraton** (Marcellus · Cormorant · Karla, bawaan), **Prasasti**
> (Cinzel · EB Garamond), **Sastra** (Cormorant Garamond · Lora — bukan EB
> Garamond saja seperti di tabel bawah, supaya tidak kembar dengan Prasasti).
> Angka pasti setiap palet dihitung ulang oleh `tema/periksa-palet.mjs`.

### 3.5 Adat Nusantara — palet per daerah · *Dari foto: tidak (warna adat bermakna)*

Di tema ini palet **mengikuti daerah**: memilih daerah memilih ornamen dan
membatasi palet ke milik daerah itu. Daerah berikutnya menambah palet di
sini, bukan tema baru.

| Daerah | Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|---|
| Jawa | Nila Kuningan (= `ukir-jepara` sekarang, bawaan) | `#131E33` | `#EDE7D9` | `#C39A5C` | 13.5 / 6.4 |
| Jawa | Sogan | `#F1E7D3` | `#3B2416` | `#8E622A` | 11.8 / 4.4 |
| Sunda | Hijau Siger | `#F2EEDF` | `#1F3A2C` | `#9C7A34` | 10.6 / 3.4 |
| Bugis-Makassar | Marun Songket | `#F5ECE2` | `#4A1520` | `#A8823E` | 12.7 / 3.0 |
| Bali | Prada | `#F6EBDD` | `#5A1F14` | `#A87F22` | 10.9 / 3.1 |

Tiap daerah nantinya punya 2 palet (terang dan gelap). Marun Songket tepat
di batas 3:1, jadi aksennya hanya untuk ornamen, tidak untuk teks.

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Keraton (bawaan) | Cormorant *italic* | Marcellus | Karla | = `ukir-jepara` sekarang |
| Prasasti | Cinzel | Cinzel KAPITAL | EB Garamond | ukiran batu, agung |
| Sastra | EB Garamond *italic* | EB Garamond | EB Garamond | serat, naskah lama |

### 3.6 Dokumenter — film, scrapbook · *Dari foto: ya*

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Film Hangat (bawaan) | `#F3EBDD` | `#2B2622` | `#C4561F` | 12.6 / 3.8 |
| Fuji Hijau | `#EEF0EA` | `#23282A` | `#3F7D6E` | 13.0 / 4.2 |
| Malam Flash (gelap) | `#151515` | `#F2EFE9` | `#E8C547` | 15.9 / 10.9 |
| Pastel Kafe | `#F8EFEA` | `#33302E` | `#B4606C` | 11.6 / 3.8 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Catatan (bawaan) | Caveat | Karla | Karla | spidol di polaroid |
| Ketik | Courier Prime | Courier Prime KAPITAL | Work Sans | label kaset, cap tanggal |
| Poster | Space Grotesk tebal | Space Grotesk | Space Grotesk | zine, gig poster |

Aksen di tema ini juga dipakai untuk **cap tanggal** ala kamera saku di
pojok foto.

### 3.7 Studio Anggun — formal, mewah · *Dari foto: ya (latar polos mudah diambil warnanya)*

| Palet | Latar | Teks | Aksen | Kontras |
|---|---|---|---|---|
| Gading Emas (bawaan) | `#FBF7EF` | `#2E2A24` | `#9C7A48` | 13.3 / 3.7 |
| Navy Emas (gelap) | `#14213D` | `#F3EEE3` | `#C9A86A` | 13.8 / 7.1 |
| Champagne | `#F6EFE7` | `#3B302A` | `#A67C5C` | 11.2 / 3.3 |
| Hitam Mewah (gelap) | `#0F0F10` | `#EDE7DB` | `#C5A46D` | 15.6 / 8.1 |

| Gaya teks | Nama | Judul | Isi | Kesan |
|---|---|---|---|---|
| Romantis (bawaan) | Great Vibes | Cormorant Garamond | Lato | kaligrafi, klasik |
| Royal | Cinzel | Cinzel KAPITAL berjarak | Lato | kerajaan, resmi |
| Modern Elegan | Playfair Display *italic* | Montserrat KAPITAL | Montserrat | hotel bintang lima |

---

## 4. Dampak ke urutan kerja

| Tahap | Tambahan |
|---|---|
| A. Fondasi | token bersama, `ukir-jepara` dipetakan ke token, palet + huruf di manifest, `gantiTema()` memasang palet dan huruf, tautan huruf keras di `<head>` dihapus, `periksa-palet.mjs`, pemilih palet & gaya teks di dasbor |
| D. Senja di Alam | palet **Dari foto** (sudah direncanakan) |
| Setiap tema | 4 palet + 3 gaya teks dari tabel di atas, masuk bersama temanya |

Palet dan gaya teks di dokumen ini adalah titik awal. Ubah atau tambah
cukup di `tema.json`; `periksa-palet.mjs` yang menjaga agar tetap terbaca.
