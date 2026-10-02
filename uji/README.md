# Uji

Uji peramban untuk seluruh halaman, dijalankan terhadap salinan lokal
situs dengan Supabase **distub** — tidak ada satu pun permintaan yang
sampai ke database sungguhan.

```
cd uji
npm install
npm test                    # semua suite
node semua.mjs dasbor       # hanya suite yang namanya mengandung "dasbor"
```

Playwright butuh Chromium. Kalau `npm install` tidak memasangnya sendiri:
`npx playwright install chromium`.

## Isinya

| Suite | Yang diuji |
|---|---|
| `uji-alamat` | aturan alamat — subdomain, jalur, `?pasangan=`, slug tamu, link yang dibuat bisa dibaca lagi. Node murni, tanpa peramban |
| `uji-undangan` | halaman undangan lewat kedua bentuk alamat, nama tamu dari database, buku tamu per pasangan |
| `uji-coba` | `/coba` dan `/mulai`: demo tanpa jaringan, redirect akar domain |
| `uji-asap` | tiap halaman dibuka tanpa stub; yang dicari cuma galat waktu memuat |
| `uji-dasbor` | `/dasbor`: rangkaian acara, pustaka foto, keterangan pra/pasca-acara |
| `uji-admin` | `/admin`: gerbang admin, buat pasangan, paket, link panitia |
| `uji-rekap`, `uji-018` | rekap pasca-acara di `/kirim`: kehadiran, pemberian, berkat, kelompok |
| `uji-lihat` | halaman terima kasih |
| `uji-xlsx`, `uji-unduh` | menghasilkan berkas `.xlsx`; isinya diperiksa terpisah (lihat di bawah) |

`server.mjs` meniru urutan routing Vercel — redirect, lalu berkas, lalu
rewrite — karena urutan itulah yang dulu membuat redirect akar domain
bekerja sementara rewrite tidak. `stub.mjs` dan `undangan-isi.json`
memegang data tiruan.

## Yang belum otomatis

- **Isi berkas `.xlsx`.** `uji-xlsx` dan `uji-unduh` cuma memastikan
  berkasnya terbentuk. Isinya — sel, gaya, lembar — dulu diperiksa dengan
  openpyxl dari Python, dan pemeriksaan itu belum ikut dipindahkan ke sini.
- **Uji SQL.** Fungsi dan pemicu database diuji di dalam transaksi yang
  dibatalkan terhadap database sungguhan, lewat konektor Supabase. Baru
  satu yang tersimpan sebagai berkas (`sql/022-undangan-tamu.sql`); yang
  lain hidup di riwayat percakapan tempat ia dijalankan.
- **Jalur HTTP sungguhan.** Karena Supabase distub, tidak ada uji di sini
  yang membuktikan edge function atau RPC benar-benar menjawab seperti
  yang ditiru stub-nya.
