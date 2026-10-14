---
name: full-custom
description: Mengerjakan pesanan paket Full Custom mengundang.id — membaca brief pasangan, membuat atau menurunkan tema custom di tema/custom/<kode>/, mengujinya, membuka PR dengan tangkapan layar, dan menandai revisi selesai. Pakai setiap kali diminta membuat, merevisi, atau memasang desain khusus untuk satu pasangan.
---

# Full Custom

Rujukan lengkap: `docs/halaman-khusus.md` (bagian 2, 6, 7, 10, 11). Skill
ini urutan kerjanya, supaya setiap sesi mengerjakannya dengan cara yang
sama.

## Aturan yang tidak ditawar

- **Tidak ada data pasangan di folder tema.** Nama, tanggal, alamat,
  foto — semuanya datang dari `undangan_isi`. Folder tema hanya berisi
  CSS, SVG, JS, dan `tema.json`. `tema/periksa-palet.mjs` menolak gambar
  raster, alamat `/media/`, dan kata dari slug pemesan asal.
- **Warna dan huruf lewat token** (`--latar`, `--aksen`, `--judul`, …)
  yang ditulis sebagai palet dan gaya teks di `tema.json`. Dengan begitu
  pembeli berikutnya bisa ganti warna tanpa menyentuh CSS.
- **Halaman terima kasih ikut**: setiap tema custom wajib punya
  `kenangan.css` yang suasananya sama dengan `gaya.css`.
- **HTML tetap `index.html` bersama** (anak tangga 2). Naik ke halaman
  custom (anak tangga 3, `custom/<kode>/`) hanya kalau yang diminta tidak
  bisa dicapai dengan menata ulang bagian yang ada — dan itu butuh kit
  (tahap K4, belum ada). Tanyakan pemilik dulu.
- **Tidak menulis ke Supabase produksi tanpa izin pemilik** di sesi itu.
  Membaca brief boleh.
- **Tidak mengubah tema custom yang sudah dipakai pasangan lain.**
  Perubahan CSS/HTML untuk pembeli kedua = turunan baru
  (`custom/<kode>-2`, `"turunan": "<kode>"`), supaya pemakai pertama
  tidak ikut berubah. Perubahan yang bisa dinyatakan sebagai data
  (palet tambahan, `pasangan.khusus`, setelan) cukup lewat data.

## 1. Baca brief

Lewat Supabase MCP (`execute_sql`, hanya membaca):

```sql
select p.slug, p.tanggal_acara, p.tema, p.khusus, b.status, b.isi, b.tenggat, b.pratinjau
  from public.pasangan p left join public.brief_custom b on b.pasangan_id = p.id
 where p.paket = 'full_custom' order by p.tanggal_acara nulls last;

select r.id, r.isi, r.status, r.dibuat from public.revisi_custom r
  join public.pasangan p on p.id = r.pasangan_id
 where p.slug = '<slug>' and r.status = 'baru' order by r.dibuat;
```

Tanpa MCP: minta pemilik menempelkan brief dari halaman /pemilik → Full
Custom. Foto acuan (`isi.foto_acuan`) adalah id baris `foto`; lihat
`jalur`-nya di tabel `foto` kalau perlu melihat gambarnya
(`https://mengundang.id/media/<jalur>`).

## 2. Putuskan titik awal

- Brief menyebut karya dari katalog custom (`tema/custom.json`) dan
  permintaannya bisa dinyatakan sebagai data → tidak perlu tema baru;
  cukup pasang temanya (langkah 6).
- Menyebut karya katalog tapi perlu ubahan CSS → turunan:
  `cp -r tema/custom/<kode> tema/custom/<kode>-2`, isi `"turunan"`.
- Dari nol → `cp -r tema/custom/_contoh tema/custom/<kode-baru>`.
  Kode tema dinamai suasananya (`teras-jati`, `batik-pesisir`), **bukan**
  nama pasangan — tema ini akan dijual ulang.

Tuliskan keputusan dan alasannya di deskripsi PR.

## 3. Bangun

1. `tema.json`: `kode` = `custom/<kode>`, `nama`, `untuk`, `asal` (slug
   pemesan pertama), palet (minimal satu, lulus kontras), gaya teks
   (maks. 3 keluarga huruf Google), `ornamen` bila ada SVG sendiri.
   `isi_khusus`: daftar `{ "kunci": "...", "ket": "..." }` bila tema
   memakai `pasangan.khusus`.
2. `gaya.css` dan `kenangan.css`: `:root` = palet + gaya teks bawaan
   persis, `@import` huruf bawaan persis. Cetak keduanya dengan
   `node tema/cetak-root.mjs custom/<kode>` dan tempel ke kedua berkas;
   `periksa-palet` menyebut setiap selisih. Token selain itu (ukuran,
   bayangan, `--sudut-foto`, …) bebas ditambah di blok `:root` kedua.
3. Ornamen: SVG dengan `<symbol id="pemisah">` / `id="sudut"`; komentar
   XML tanpa `--`.
4. Gerak: hanya `transform`, `opacity`, `clip-path`, `filter`; selalu ada
   `@media (prefers-reduced-motion:reduce)`.

## 4. Uji

```bash
node tema/bangun-daftar.mjs          # menulis tema/custom.json
node tema/periksa-palet.mjs
node tema/periksa-gerak.mjs
cd uji && node uji-tema.mjs          # tema custom ikut semua uji + uji pakai ulang
```

`uji-tema` mengambil tangkapan layar `uji/tema-custom-<kode>-*.png`
(sampul, mempelai, galeri, kisah, kenangan; 360 dan 1280 px). **Lihat
gambarnya** — uji hanya menangkap yang bisa salah diam-diam, bukan yang
jelek.

Untuk melihat dengan data pasangan sungguhan, pakai pratinjau:
`https://<alamat-pratinjau>/?pratinjau=1&tema=custom/<kode>` saat login
sebagai pasangan itu, atau stub `uji/undangan-isi.json` dengan isi dari
`undangan_isi('<slug>')`.

## 5. PR

- Satu PR per pesanan; revisi berikutnya = komit baru di PR yang sama.
- Deskripsi: brief singkat, keputusan titik awal, tangkapan layar HP dan
  desktop (undangan + halaman terima kasih), daftar catatan revisi yang
  dikerjakan.
- Workers Builds memberi alamat pratinjau. Berikan ke pemilik untuk diisi
  di /pemilik → Full Custom → status `pratinjau`.

## 6. Revisi dan terbit

- Kerjakan **semua** catatan revisi `baru` dalam satu komit.
- Sesudah dipush, beri tahu pemilik hash komitnya; ia mencentang catatan
  itu di /pemilik dan mengisi hash-nya (atau, dengan izinnya, lewat SQL:
  `select public.admin_revisi_selesai(...)` hanya bisa dari sesi pemilik —
  dari MCP pakai `update public.revisi_custom set status='selesai',
  komit='<hash>', selesai=now() where id in (...)`).
- Terbit: PR digabung ke `main`, lalu pemilik memasang temanya di
  /pemilik → Full Custom → Pasang tema (`admin_tema`), dan mengubah
  status ke `terbit`. Urutannya penting: tema yang foldernya belum ada di
  `main` jatuh ke tema bawaan.

## 7. Selesai berarti

- [ ] `periksa-palet`, `periksa-gerak`, `uji-tema` hijau
- [ ] tangkapan layar dilihat, HP dan desktop, undangan dan terima kasih
- [ ] tidak ada nama/foto pasangan di folder tema
- [ ] `tema/custom.json` ikut dikomit
- [ ] PR berisi brief, keputusan, tangkapan layar
