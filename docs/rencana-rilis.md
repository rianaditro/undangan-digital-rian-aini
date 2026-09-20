# mengundang.id — rencana menuju rilis

Disusun 19 September 2026, sesudah acara Rian & 'Aini selesai.
Melanjutkan `docs/platform.md`, `docs/arsitektur.md`, `docs/alur-pengguna.md`.

Target yang dikejar: **platform bisa dijual ke pasangan kedua**, lalu
sisanya marketing dan bikin template.

---

## 0. Titik berangkat, per hari ini

Yang **sudah** ada dan terbukti jalan:

| | |
|---|---|
| Undangan hidup | `rian-aini.mengundang.id`, sudah dipakai sungguhan |
| Tamu | 436 (163 pria, 273 wanita) |
| Undangan terkirim | 415 dari 436 |
| Ucapan masuk | 29 |
| Skema multi-penyewa | migrasi 001–008, sudah diterapkan |
| `undangan_isi(slug)` | **sudah jalan**, mengembalikan seluruh isi undangan sebagai jsonb |
| Isolasi antar penyewa | RLS per `pasangan_id`, sudah diuji dengan peran anon |
| Akses tanpa login | 5 link bertoken, cakupan penuh dan per pihak |
| Dasar motion | `.reveal` + `prefers-reduced-motion` sudah dihormati |

Yang **belum**:

- Frontend masih membaca `assets/varian.js`, bukan `undangan_isi()`.
  Tabelnya sudah terisi dan sepadan, tinggal kabelnya dipindah.
- Belum ada resolusi penyewa. Halaman tidak tahu "ini pasangan siapa";
  jawabannya masih hardcode.
- Belum ada penyimpanan foto sama sekali.
- `ucapan` belum punya kolom balasan.
- `tamu.datang` dan tabel `pemberian` masih kosong — rekap kehadiran dan
  amplop belum pernah diisi.
- Belum ada halaman klien. Tabel `pemilik` sudah ada tapi masih kosong,
  jadi jalur login email belum pernah dipakai.

Satu hal yang perlu Anda konfirmasi: **jumlah tamu turun dari 680 ke 436.**
Kemungkinan besar itu Anda sendiri yang merapikan duplikat lintas pihak
sebelum mengirim — 415 dari 436 terkirim memang pola daftar yang sudah
bersih. Tapi kalau bukan Anda, ini perlu ditengok.

---

## 1. Dua keputusan yang baru diambil

**`/terimakasih` dibangun sebagai fitur per-pasangan**, bukan satu halaman
pajangan. Tiap klien dapat `{slug}.mengundang.id/terimakasih`. Punya Rian &
'Aini jadi yang pertama sekaligus etalase jualan.

**Motion, auto-scroll, dan silsilah dibangun sebagai sistem tema**, bukan
ditempel ke `index.html`. Ini jalur yang lebih lambat kelihatan hasilnya,
tapi ia yang bikin "tinggal bikin template" jadi benar-benar murah.
Menempelkan tiga fitur lagi ke satu halaman hardcode justru menambah yang
harus dibongkar nanti.

---

## 2. Kenapa urutannya begini

Satu temuan yang menentukan seluruh urutan: **`/terimakasih` tidak butuh
Fase 0 selesai.**

Isinya cuma perlu nama pasangan (sudah dijawab `undangan_isi()`), ucapan
(sudah ada), balasan (kolom baru), dan foto (tabel baru). Penyewanya sudah
ketahuan dari `Host` — `rian-aini.mengundang.id` memang sudah subdomain.
Resolusi penyewa dari segmen path baru perlu waktu ada pasangan kedua.

Jadi prioritas Anda bisa dituruti tanpa menumpuk utang: `/terimakasih`
duluan, dan pekerjaannya tetap terpakai seluruhnya nanti.

Urutannya:

```
Tahap 1  /terimakasih                    ← prioritas Anda, bisa mulai sekarang
Tahap 2  Pisahkan isi dari tampilan      ← tulang punggung, semua sesudahnya menempel di sini
Tahap 3  Tema + motion + auto-scroll + silsilah
Tahap 4  Halaman klien isi detil acara
Tahap 5  Siap jual
```

Tahap 2 sengaja ditaruh sesudah tahap 1 dan sebelum sisanya. Ia tidak
menghasilkan apa pun yang kelihatan, tapi tahap 3 dan 4 dua kali lebih
mahal kalau dikerjakan sebelum ini.

Ukuran di bawah pakai satuan **sesi kerja** (satu sesi ≈ satu duduk),
kasar, bukan janji.

---

## 3. Tahap 1 — `/terimakasih`

Ada alasan kenapa ini memang pantas duluan, di luar permintaan Anda:
halaman terima kasih punya jendela kesegaran. Tamu peduli sekarang, bukan
dua bulan lagi. Balasan ke ucapan juga paling wajar ditulis selagi ingat.

### 1a. Penyimpanan foto — 1 sesi

Bucket Supabase Storage `foto`, path `{pasangan_id}/{uuid}.webp`.

Yang tidak boleh dilewat: **kecilkan gambar di browser sebelum diunggah.**
Canvas → WebP, sisi terpanjang 1600px, target di bawah 200KB, plus varian
thumbnail untuk grid. Foto mentah dari fotografer bisa 8MB per lembar;
tanpa ini kuota habis di satu pasangan.

Yang perlu diawasi bukan ruang simpannya, tapi **egress**. Halaman ini
justru dibuat untuk disebar sebagai bahan marketing, artinya trafiknya
tidak bisa ditebak. Cek kuota bandwidth paket Supabase Anda sebelum
menyebarkannya luas.

Akses: baca publik hanya untuk pasangan yang sudah terbit; tulis hanya
lewat token panitia atau pemilik. Aturannya menempel di storage policy,
sepola dengan RLS tabel.

### 1b. Balasan ucapan — 1 sesi

Tambah ke `ucapan`:

| Kolom | Guna |
|---|---|
| `balasan text` | isi balasan pengantin |
| `dibalas_pada timestamptz` | kapan dibalas |
| `tampil boolean default true` | sembunyikan dari halaman publik |

`tampil` bukan hiasan. 29 ucapan itu akan terpampang di halaman yang
sengaja disebar untuk jualan — harus ada tombol menyembunyikan satu ucapan
tanpa menghapusnya.

RPC baru: `ucapan_balas(token, ucapan_id, teks)` dan
`ucapan_tampil(token, ucapan_id, tampil)`, sepola dengan RPC panitia yang
sudah ada — periksa token, saring per pasangan, security definer.

### 1c. Halaman publik — 2 sesi

`/terimakasih`, dibaca siapa saja, tanpa token.

Isi: sampul singkat, galeri foto, lalu daftar ucapan dengan balasan di
bawahnya. Rekap angka (berapa tamu, berapa hadir) **ditunda** — `datang`
masih kosong, jadi tidak ada yang bisa ditampilkan. Ini tersambung ke
tahap 4.

Satu jebakan di `vercel.json`: rewrite `/(.*)` → `/index.html` menangkap
segalanya. Aturan `/terimakasih` harus ditaruh **sebelum** baris itu, atau
halamannya tidak akan pernah terpanggil dan yang muncul malah undangan
dengan nama tamu "terimakasih".

RPC `terimakasih_isi(slug)` — satu panggilan, kembalikan foto + ucapan yang
`tampil` + balasannya. Alasan digabung jadi satu: halaman publik tidak
boleh bisa mengintip tabel mana pun langsung.

### 1d. Tempat mengisinya — 1 sesi

Unggah foto dan tulis balasan dari `/kirim` dengan token cakupan penuh.
Sengaja menumpang halaman yang sudah ada, bukan bikin dasbor baru —
dasbornya urusan tahap 4.

**Selesai bila** Anda bisa mengunggah foto acara, membalas ucapan, dan
mengirim satu link ke grup keluarga yang bisa dibuka siapa saja.

---

## 4. Tahap 2 — pisahkan isi dari tampilan — 2–3 sesi

Tidak ada fitur baru. Ini tulang punggungnya.

- `index.html` berhenti membaca `assets/varian.js`, ganti ke
  `undangan_isi(slug)`. Tabelnya sudah sepadan, sudah diverifikasi.
- Penyewa ditentukan dari `Host`, dan kalau tidak ketemu, dari segmen path
  pertama. `rian-aini.mengundang.id` tetap jalan lewat jalur Host; pasangan
  baru bisa lewat path tanpa menunggu DNS.
- `canonical_host` disimpan, bentuk non-kanonik dibalas 301.
- `varian.js` menyusut jadi konfigurasi platform saja (URL Supabase, anon
  key). Seluruh isi pernikahan pindah ke database.

**Selesai bila** undangan Rian & 'Aini tampil persis sama seperti sekarang,
tapi seluruh isinya datang dari database — dan satu baris `pasangan` kedua
yang dibuat manual langsung punya undangan sendiri yang hidup.

Itu ujiannya. Kalau pasangan kedua belum bisa hidup di sini, tahap ini
belum selesai, seberapa pun rapi kodenya.

---

## 5. Tahap 3 — tema, motion, auto-scroll, silsilah

### 3a. Kerangka tema — 2 sesi

```
tema/
  klasik/           ← index.html sekarang, dipindah ke sini apa adanya
    gaya.css
    tema.json       ← bagian mana yang tampil, preset motion mana yang dipakai
```

Kolom `pasangan.tema` memilih yang mana. Struktur HTML-nya satu, dipakai
bersama; yang berbeda cuma CSS dan konfigurasi. Tema kedua nanti tinggal
menyalin folder, bukan menyalin halaman.

Sesuai `docs/platform.md`: **jangan bangun editor tema visual.** Tema
sebagai kode, konfigurasi sebagai data.

### 3b. Motion — 1–2 sesi

Dasarnya sudah ada dan sudah benar: `.reveal` plus
`prefers-reduced-motion`. Yang ditambah — stagger berurutan per bagian,
parallax tipis di sampul, angka hitung mundur yang berputar naik, dan
garis ukir yang tergambar.

Batasnya keras, dan ini bukan formalitas: **tamu kondangan membuka undangan
dari HP Android murah di jaringan desa.** Hanya `transform` dan `opacity`
yang boleh dianimasikan — begitu menyentuh properti yang memicu layout,
ponsel kelas bawah langsung tersendat. Jumlah animasi berbarengan dibatasi.
`prefers-reduced-motion` yang sudah dihormati jangan sampai bocor.

### 3c. Auto-scroll — 1 sesi

Tombol putar/jeda, undangan bergulir pelan seperti cerita, berhenti sendiri
di ujung.

Yang bikin fitur ini sering terasa rusak: ia berebut dengan jari pengguna.
Jadi begitu ada `wheel`, `touchstart`, atau `keydown`, gulirannya menyerah
seketika. Jangan mulai otomatis kalau `prefers-reduced-motion` menyala.
Pasangkan dengan tombol musik yang sudah ada.

### 3d. Silsilah keluarga — 1–2 sesi

Tabel `silsilah`: `pasangan_id`, `sisi` (pria/wanita), `urutan`, `peran`,
`nama`, `foto_path`, `keterangan` (Alm/Almh).

Dua hal yang perlu diputuskan benar sejak awal:

**Bukan pohon sungguhan.** Undangan pernikahan menampilkan dua generasi,
bukan silsilah marga. Grid dua kolom per sisi sudah cukup dan jauh lebih
mudah dibaca di layar HP. Membangun pohon beneran itu kerja berlipat untuk
tampilan yang justru lebih buruk di lebar 400px.

**Jangan bikin sumber ganda.** `mempelai` sudah menyimpan `ayah`, `ibu`,
`ayahKet`, `ibuKet`, dan nilainya sudah dipakai di tanda tangan penutup.
Kalau silsilah menyimpan ayah-ibu lagi, cepat atau lambat keduanya beda dan
tidak ada yang tahu mana yang benar. Pilih satu: entah `silsilah` menampung
semua lalu `mempelai` membacanya dari sana, atau `silsilah` khusus generasi
di atas orang tua. Saya sarankan yang pertama — lebih bersih, dan migrasinya
cuma memindahkan empat nilai.

---

## 6. Tahap 4 — halaman klien isi detil acara — 3–4 sesi

Ini yang Anda minta sebagai halaman pertama, dan ini juga yang sebenarnya
membuka pintu jualan: tanpa ini, tiap klien baru berarti Anda yang mengetik
datanya.

`/dasbor`, login email. Tabel `pemilik` sudah ada dari migrasi 006 dan
sampai sekarang masih kosong — di sinilah ia akhirnya terpakai.

Isinya: mempelai, tempat, acara, dompet, silsilah, foto, pilih tema,
pratinjau, terbitkan. Plus rekap sesudah acara — tandai siapa datang, catat
amplop dan barang — yang mengisi `tamu.datang` dan `pemberian`, dan dari
situ baru angka di `/terimakasih` bisa ditampilkan.

**Selesai bila** Anda bisa membuatkan akun untuk pasangan kedua, lalu
mereka mengisi sendiri sampai terbit tanpa Anda sentuh lagi.

### Sudah jalan

`/dasbor` (migrasi `015`) dan rekap sesudah acara (migrasi `016`).

Rekapnya berakhir bukan di `/dasbor` melainkan di `/kirim` kotak 6 —
daftar tamunya sudah ada di sana, dan memindahkan 436 baris ke halaman
lain cuma menyalin masalah yang sudah selesai. Ia hidup di kedua jalur
masuk, login email maupun link bercakupan penuh; link per-pihak ditolak
server karena rekap memuat jumlah amplop.

Yang sampai ke `/terimakasih` cuma satu angka: berapa orang tercatat
hadir. Rinciannya di `README.md` bagian 1i.

Rekapnya diperluas di migrasi `018` sesudah dipakai: sepuluh kategori
pemberian (rokok berikut mereknya, parsel, seserahan, jasa vendor,
transfer bagi yang tidak bisa hadir), takaran per satuan, berkat dengan
dua keadaan (dijatah / diberikan), serta alamat, relasi, dan kelompok
keluarga supaya satu keluarga yang datang terpencar bisa dilihat
sekaligus.

### Yang ditemukan sambil jalan

Migrasi `017` menutup lubang lintas penyewa di seluruh keluarga
`panitia_*`: token pasangan A bisa melihat, mengganti nama, bahkan
**menghapus** tamu pasangan B, dan tamu yang ditambahkan pasangan B
mendarat di daftar pasangan A. Belum ada yang bocor karena baru ada satu
pasangan — dan itu justru sebabnya ini harus beres sebelum pasangan kedua
dibuat, bukan sesudah. Rinciannya di `README.md` bagian 3.

Yang tersisa dari tahap ini: membuatkan akun untuk pasangan kedua dan
membiarkan mereka mengisi sendiri sampai terbit. Tabel `pemilik` masih
kosong — jalur login email sudah diuji terhadap database sungguhan, tapi
belum pernah dipakai orang.

---

## 7. Tahap 5 — siap jual

Bukan fitur, tapi tanpa ini jangan terima uang orang.

**Naikkan Supabase dari free tier.** Ini yang paling keras. Project free
tier tidur sendiri kalau sepi, dan project ini **sudah pernah ditemukan
`INACTIVE`**. Selama tidur, undangan dan buku ucapan mati total. Untuk
undangan sendiri itu bikin panik; untuk klien yang membayar, itu tamat.
Naikkan sebelum pasangan kedua terbit, bukan sesudah.

Sisanya:

- Cadangan otomatis dan satu kali uji pemulihan sungguhan
- Syarat layanan dan kebijakan privasi
- Jalur permintaan hapus data untuk tamu — tamu tidak pernah memberi
  persetujuan kepada platform, dan ini sudah dicatat di `docs/arsitektur.md`
- Retensi berjalan: daftar tamu masa aktif + 90 hari, slug selamanya
- Uji coba dengan satu pasangan sungguhan sebelum dibuka umum

---

## 8. Yang masih menggantung

| Perkara | Kenapa perlu diputuskan |
|---|---|
| Subdomain atau path untuk pasangan baru | Wildcard `*.mengundang.id` di Vercel biasanya menuntut paket berbayar. Path-based jalan di paket apa pun. Link Rian & 'Aini yang sudah beredar tetap aman di kedua pilihan. |
| Berapa foto per pasangan | Menentukan batas unggah dan perkiraan egress |
| Harga dan paket | Tahap 5 tidak bisa ditutup tanpa ini |
| Reseller | Masih ditunda sesuai `docs/platform.md`. Lima orang masih bisa dilayani manual. |

---

## 9. Jujur soal urutannya

Anda minta rilis secepatnya. Dari empat yang Anda sebut, yang benar-benar
membuka jualan cuma satu: **halaman klien isi detil acara.** Selama itu
belum ada, tiap klien baru tetap berarti Anda yang mengetik.

`/terimakasih` tidak menjual, tapi ia bahan jualan — dan jendelanya sempit,
jadi wajar didahulukan. Motion, auto-scroll, dan silsilah tidak menjual
apa-apa; ia bikin demo enak dilihat. Di rencana Anda sendiri ketiganya ada
di Fase 4.

Jadi kalau di tengah jalan waktunya mepet dan harus memilih, urutan yang
dikorbankan: tahap 3 dulu, baru tahap 1. Tahap 2 dan 4 jangan disentuh —
itu jalan satu-satunya menuju "platform jalan".
