# Undangan Pernikahan — Rian & Nurul

Situs statis. Tidak ada build step, tidak perlu framework.

```
undangan/
├── index.html      ← seluruh situs
├── supabase.sql    ← skema tabel ucapan
└── assets/
    └── backsound.mp3   (opsional)
```

## 1. Siapkan database

Buka Supabase → **SQL Editor** → tempel isi `supabase.sql` → **Run**.

Lalu ke **Project Settings → API**, salin dua nilai:
- Project URL
- anon public key

## 2. Sambungkan ke situs

Buka `index.html`, cari blok konfigurasi di dalam `<script>`:

```js
var SB_URL   = 'https://XXXXXXXXXXXX.supabase.co';
var SB_KEY   = 'GANTI_DENGAN_ANON_PUBLIC_KEY';
```

Isi keduanya. Anon key memang aman ditaruh di sini — RLS hanya mengizinkan
baca dan tulis, bukan ubah atau hapus.

## 3. Musik latar (opsional)

```js
var BACKSOUND_URL = 'assets/backsound.mp3';
```

Dikosongkan = memakai gamelan sintetis bawaan. Pastikan lagu yang dipakai
bebas royalti.

## 4. Deploy

```bash
npm i -g vercel
cd undangan
vercel --prod
```

Pilih **Other** saat ditanya framework, biarkan build command kosong,
output directory titik (`.`).

Alternatif tanpa terminal: buka vercel.com/new, seret folder ini ke halaman
tersebut.

## 5. Sebar undangan

Nama tamu diambil dari parameter URL:

```
https://undangan-rian-nurul.vercel.app/?to=Bapak%20Ahmad%20Fauzi
```

Spasi ditulis `%20`. Tanpa parameter, tertulis "Tamu Undangan".

## Memantau ucapan

Supabase → **Table Editor → ucapan**. Baris bisa dihapus dari sana bila ada
yang tidak pantas.
