# mengundang.id — keputusan brand dan harga

Disepakati 12 Oktober 2026. Dokumen ini jadi pegangan untuk semua tulisan
yang dilihat orang luar: halaman `/mulai`, caption media sosial, pesan
WhatsApp pembuka, dan bahan untuk calon mitra. Kalau ada tulisan yang
bertentangan dengan dokumen ini, tulisannya yang diubah.

Yang teknis tetap di `docs/platform.md` dan `docs/rencana-rilis.md`.

---

## 1. Posisi

Undangan digital di pasaran dijual Rp 60–70 ribu: template cantik, cepat
jadi, murah. mengundang.id **tidak ikut bersaing di sana.**

Nama kita kata kerja, bukan kata benda. Itu posisinya:

> **Yang lain menjual undangan. mengundang.id mengurus seluruh proses
> mengundang.**

Kalimat itu pegangan internal. Di halaman publik kita tidak menyebut
pesaing; kalimat publiknya:

> **Dari undangan pertama terkirim sampai terima kasih terakhir
> tersampaikan.**

Akibatnya:

- Pembanding kita **undangan cetak dan repotnya panitia**, bukan undangan
  digital 60 ribu. Cetak 300–500 lembar di Rp 5–15 ribu per lembar
  sudah Rp 1,5–7,5 juta, belum termasuk mengantarnya; Rp 329 ribu terasa
  wajar di sebelahnya.
- Kita tidak tampil di katalog bersama template 60 ribu. Begitu sejajar,
  orang membandingkan harga dan kita kalah.

## 2. Siapa yang kita layani

- Pasangan dan keluarga dengan **tamu banyak** (300 ke atas).
- **Lebih dari satu pihak yang mengundang**: keluarga pria dan wanita,
  kadang bapak dan ibu masing-masing punya daftar sendiri.
- **Lebih dari satu sesi**: akad, resepsi, ngunduh mantu, kadang di
  tempat berbeda.
- Hajatan yang masih mengenal **berkat dan buwuh/amplop** — tradisi yang
  justru tidak dilayani undangan digital lain.
- Kelas menengah ke atas, biasanya sebelumnya mencetak undangan.

Yang **bukan** sasaran: pasangan yang cuma butuh satu tautan untuk
disebar ke 50 teman. Mereka lebih cocok di template 60 ribu, dan itu
tidak apa-apa.

## 3. Senjata utama: pengiriman, bukan desain

Desain bisa ditiru dan dijual 60 ribu. Yang tidak diselesaikan pesaing:
**ratusan kontak, dikirim tiga–empat orang dari dua keluarga, tanpa ada
yang terlewat atau terkirim dua kali.**

Karena itu, di setiap tempat kita berbicara, urutan penekanannya:

1. Pengiriman terlacak + keluarga ikut menyebar (tanpa login)
2. Isi undangan menyesuaikan pihak yang mengundang
3. Rekap amplop, barang, dan berkat sesudah acara
4. Halaman kenangan dan video story
5. Baru desain/tema

## 4. Fitur dijual sebagai hasil

Jangan menyebut nama fitur tanpa hasilnya.

| Fitur | Cara menyebutnya |
|---|---|
| Varian per pihak | Satu undangan, tapi keluarga pria dan wanita masing-masing tampil dengan urutan nama, alamat acara, dan tamunya sendiri. Tidak ada yang merasa numpang. |
| Pelacak pengiriman | Tidak ada tamu yang terlewat, tidak ada yang dikirimi dua kali. |
| Akses panitia per pihak | Bapak, ibu, dan mertua ikut menyebar dari HP-nya sendiri, tanpa daftar akun, tanpa melihat daftar pihak lain. |
| Pelacak berkat | Tahu siapa yang sudah dijatah dan sudah menerima berkat. |
| Rekap amplop dan barang | Sesudah acara, catatan buwuh langsung jadi Excel yang bisa dijumlahkan — bukan buku tulis yang dihitung ulang semalaman. |
| Halaman kenangan | Tamu yang tidak bisa datang tetap merasa ikut hadir. |
| Video story | Kenangan yang siap dibagikan ke status dan story keesokan harinya. |

## 5. Kepribadian dan bahasa

- **Tenang, santun, rapi, berakar budaya.** Seperti juru bicara keluarga
  yang dipercaya, bukan penjual di pasar.
- Visual tetap memakai bahasa tema Ukir Jepara: nila, kapur, kuningan,
  jati; Marcellus, Cormorant, Karla. Tidak ada warna neon, tidak ada stiker.
- **Kata yang dipakai:** keluarga, tenang, rapi, tidak ada yang terlewat,
  terhormat, kenangan, hajatan, pihak, panitia.
- **Kata yang dilarang:** murah, termurah, promo, diskon, gratis ongkir,
  template, "cuma", tanda seru beruntun, huruf kapital semua.
- "Coba gratis" tetap boleh — itu mencoba, bukan menawar.

## 6. Paket dan harga

Tiga paket. Paket tengah yang paling ingin dijual, dan diberi tanda.

| Paket | Harga | Isi |
|---|---|---|
| **Undangan** | Rp 179.000 | Undangan dengan nama tiap tamu, acara dan peta, buku tamu, konfirmasi hadir, dompet digital, alamat `mengundang.id/nama` |
| **Mengundang** ⭐ | Rp 329.000 | Semua di Undangan + varian per pihak, sebar lewat WhatsApp terlacak, halaman panitia per pihak keluarga, pelacak berkat, rekap amplop dan barang ke Excel |
| **Kenangan** | Rp 549.000 | Semua di Mengundang + halaman kenangan, video story, alamat `nama.mengundang.id` |

Tambahan untuk paket Undangan dan Mengundang:

- Halaman kenangan + video story sesudah acara: **Rp 249.000.**
  Ditawarkan **sesudah** acara, saat foto sudah ada dan emosinya masih
  tinggi. Ini momen penjualan terbaik.
- Alamat `nama.mengundang.id`: **Rp 50.000.**

Aturan harga:

1. **Paket Undangan sengaja dua kali harga pasar.** Ia pintu masuk, bukan
   pesaing template 60 ribu.
2. **Tidak ada diskon publik.** Kalau perlu dorongan, beri tambahan
   (misalnya video story), jangan potong harga.
3. Harga ditulis lengkap (`Rp 329.000`), bukan `329k`.

Catatan teknis: kolom `paket` di database saat ini cuma mengenal
`standar` (alamat path) dan `premium` (alamat subdomain), dan semua fitur
terbuka untuk semua pasangan. Pemetaan tiga paket ke database dan
pembatasan fitur per paket **belum dikerjakan**. Sampai itu jadi, paket
dicatat manual oleh admin; `premium` dipakai untuk Kenangan atau yang
membeli tambahan alamat.

## 7. Jalur B2B: tertutup

mengundang.id **tidak dipasarkan sebagai platform B2B.** Di halaman
publik tidak ada kata reseller, mitra, white label, atau komisi. Brand
konsumen tetap bersih.

Mitra (admin/reseller) dicari lewat relasi, dan ditawari lewat
komunikasi tertutup: WhatsApp pribadi dan satu dokumen tawaran.

- **Siapa:** WO, MUA, fotografer, percetakan undangan, pengurus gedung
  dan katering.
- **Pintu masuk alami:** pita vendor di halaman kenangan. Vendor yang
  namanya tampil di sana sudah melihat nilainya sendiri, jadi ajakan
  bermitra terasa wajar.
- **Nilai jualnya alat kerja, bukan sekadar komisi:** halaman panitia dan
  rekap membuat klien WO terlihat rapi, dan WO-nya terlihat profesional.
- **Harga jual minimum wajib.** Mitra tidak boleh menjual di bawah harga
  publik di bagian 6. Margin mitra datang dari harga mitra, bukan dari
  banting harga. Satu mitra yang menjual 75 ribu merusak posisi seluruh
  brand.
- Kode rujukan (`mengundang.id/?r=kode`) sudah ada dan ikut di pesan
  WhatsApp; itu cukup untuk mencatat penjualan mitra tanpa halaman publik.

## 8. Konten

- **Tunjukkan prosesnya, bukan templatenya.** Rekaman layar halaman
  panitia ("Ibu centang, Bapak kirim, semua tercatat") lebih menjual
  daripada slideshow tema.
- **Undangan Rian & 'Aini jadi studi kasus pertama**, dengan angka nyata:
  berapa tamu, berapa pihak, berapa pengiriman tercatat. Angka nyata
  lebih meyakinkan daripada kata "premium".
- **Halaman kenangan dan video story adalah iklan gratis.** Setiap tamu
  yang menonton calon pembeli. Tanda kecil "dikirim lewat mengundang.id"
  di sana, elegan, tidak mengganggu.
- Tidak memakai foto orang sungguhan tanpa izin tertulis. Contoh di
  `/mulai` tetap pasangan rekaan.

## 9. Rencana 90 hari

1. ~~Tulis ulang `/mulai` dengan posisi "mengurus proses mengundang",
   pelacak pengiriman di layar kedua.~~ Selesai 12 Oktober 2026.
2. Petakan tiga paket ke database dan dasbor (bagian 6, catatan teknis).
3. Buat 3–5 video pendek dari halaman panitia dan halaman kenangan.
4. Sepuluh klien pertama dengan harga penuh, plus izin dijadikan studi
   kasus.
5. Dekati 3–5 WO/fotografer secara personal, dengan harga mitra dan harga
   jual minimum tertulis.
