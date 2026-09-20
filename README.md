# Undangan Pernikahan — Rian & 'Aini

Situs statis. Tidak ada build step, tidak perlu framework.

```
.
├── index.html            ← halaman undangan
├── kirim/index.html      ← halaman panitia (daftar tamu & pengiriman)
├── terimakasih/index.html ← halaman terima kasih, publik
├── dasbor/index.html     ← halaman klien: isi & terbitkan undangannya sendiri
├── assets/
│   ├── varian.js         ← konfigurasi platform + pemuat isi + pembantu
│   ├── vcf.js            ← pembaca berkas kontak .vcf
│   ├── gambar.js         ← pengecil foto sebelum diunggah
│   ├── motion.js         ← runtun, parallax, angka bergulir
│   └── backsound.mp3
├── tema/
│   ├── ukir-jepara/
│   │   └── gaya.css      ← SELURUH tampilan undangan ada di sini
│   └── periksa-gerak.mjs ← penjaga: tolak animasi pemicu tata letak
├── supabase/
│   ├── migrations/       ← migrasi bernomor, dijalankan berurutan
│   └── functions/        ← edge function (jalur tulis yang dijaga)
└── vercel.json
```

Sejak tahap 2, **isi undangan tidak lagi ada di berkas ini.** Nama mempelai,
alamat acara, nomor dompet, dan varian per pihak semuanya datang dari
database lewat satu panggilan `undangan_isi(slug)`. Yang tersisa di
`assets/varian.js` cuma milik platform — alamat Supabase dan berkas musik —
plus pembantu yang bentuknya fungsi murni.

Artinya halaman ini sudah bisa melayani lebih dari satu pasangan. Menambah
klien baru berarti menambah baris di tabel, bukan menyalin berkas.

Urutan pakainya berubah satu langkah: tunggu dulu, baru baca.

```js
await MENGUNDANG.muat();
var v = MENGUNDANG.varian('keluarga-pria');
```

---

## 1. Siapkan database

Skema ini **sudah diterapkan** ke project `undangan-digital-rian-aini`
(ref `mavjlhlyrtacxleulbom`). Berkas migrasinya ada di
`supabase/migrations/`, bernomor dan dijalankan berurutan — SQL Editor →
tempel → **Run**. Semuanya idempoten, aman dijalankan berulang kali.

Migrasi `002` ke atas adalah Fase 0 platform mengundang.id: undangan ini
jadi baris pertama `pasangan`. Lihat `docs/platform.md`.

Catatan: project free tier tidur sendiri setelah beberapa hari tanpa
lalu lintas, dan project ini sempat ditemukan dalam keadaan `INACTIVE`.
Selama tidur, buku ucapan dan halaman panitia mati total. Periksa
statusnya sehari sebelum acara.

Lalu, masih di Supabase:

**Matikan "Allow new users to sign up"** di Authentication → Sign In /
Providers. Ini tetap dianjurkan, tapi sejak migrasi `006` ia bukan lagi
satu-satunya penjaga: mendaftar sendiri tidak lagi memberi akses apa pun,
karena kebijakan RLS sekarang menuntut baris di tabel `pemilik`, bukan
sekadar peran `authenticated`. Tabel itu sengaja kosong.

Panitia masuk lewat link bertoken (bagian 3), jadi akun email tidak perlu
dibuat sama sekali. Kalau suatu saat mau dipakai juga: buat user di
Authentication → Users, lalu jalankan perintah `insert into pemilik` yang
ada di bagian bawah `supabase/migrations/006_fase0_pemilik_dan_rls_penyewa.sql`.
Tanpa perintah itu, akun barunya tidak melihat apa pun.

Kalau URL atau anon key project-nya berbeda dari yang sudah tertulis, ganti
di `assets/varian.js` bagian `SB`. Anon key memang aman ditaruh di file ini:
dengan key itu saja, tabel `tamu` dan `pengiriman` tidak bisa dibaca.

---

## 1b. Foto acara

Bucket `foto` di Supabase Storage, dibaca publik, ditulis **hanya** lewat
edge function `foto-unggah`.

Bucket-nya sengaja publik: foto resepsi memang untuk dilihat orang banyak,
dan signed URL yang kedaluwarsa akan mematikan link yang sudah diteruskan
orang. Gantinya nama berkasnya uuid acak. Konsekuensinya harus disadari —
sekali sebuah URL foto bocor, ia tetap bisa dibuka walau fotonya sudah
disembunyikan dari halaman. Jangan taruh apa pun yang lebih peka di sini.

Menulisnya lain cerita. `storage.objects` dibiarkan **tanpa satu pun
policy**, jadi anon dan authenticated ditolak secara bawaan. Sebabnya: RLS
storage cuma bisa melihat `auth.role()`, ia tidak punya cara memeriksa token
panitia kita. Kalau anon diizinkan menulis, siapa pun di internet bisa
menitipkan berkas. Maka satu-satunya pintu adalah edge function, yang
memeriksa token dulu lalu menulis dengan service_role — dan service_role
tidak pernah keluar dari sana.

Token yang dipakai harus **bercakupan penuh**. Pemegang link keluarga tidak
bisa mengunggah maupun menghapus foto acara; itu urusan pengantin.

Sebelum berangkat, `assets/gambar.js` mengecilkan gambarnya di HP
pengunggah: sisi terpanjang 1600px untuk versi penuh dan 480px untuk
thumbnail, diekspor WebP. Foto 12 MB dari kamera turun ke sekitar 180 KB.
Ini bukan kemewahan — tanpa itu kuota habis di satu pasangan, dan tiap tamu
yang membuka halaman ikut menarik berkas sebesar aslinya.

Redeploy edge function-nya:

```bash
supabase functions deploy foto-unggah
```

---

## 1c. Halaman terima kasih

`/terimakasih` — publik, tanpa token. Isinya foto acara, ucapan tamu, dan
balasan dari pengantin. Seluruhnya datang dari satu panggilan,
`terimakasih_isi(slug)`, supaya halaman publik tidak perlu diberi izin
membaca tabel mana pun secara langsung.

Fungsi itu `security definer`, jadi RLS tidak berlaku di dalamnya. Artinya
`and f.tampil` dan `and u.tampil` di dalamnya adalah **satu-satunya** yang
menahan foto dan ucapan yang disembunyikan. Hapus salah satunya dan justru
halaman publik inilah yang membocorkan apa yang sengaja disembunyikan.

Pasangan mana yang ditampilkan ditentukan `MENGUNDANG.slugPasangan()`,
dipakai bersama halaman undangan. Lihat bagian 1d.

### Jebakan routing

`vercel.json` punya rewrite penangkap segalanya, `/(.*)` → `/index.html`,
yang dipakai untuk link personal tamu. Aturan `/terimakasih` **harus**
ditaruh sebelum baris itu — kalau tidak, yang muncul bukan halaman terima
kasih melainkan undangan dengan nama tamu "terimakasih".

Berkas statis tetap dilayani lebih dulu oleh Vercel sebelum rewrite
diterapkan, jadi `/assets/*.js` tidak ikut tertelan.

### Yang belum bisa

`og:image` masih kosong. Halaman ini statis, sementara foto pertamanya baru
diketahui sesudah JS jalan — mengisinya butuh render di server. Efeknya:
waktu link-nya dibagikan di WhatsApp, pratinjaunya belum memunculkan foto.
Untuk halaman yang memang dibuat sebagai bahan jualan, ini layak
dibereskan di tahap 2.

---

## 1d. Satu halaman, banyak pasangan

Pasangan mana yang ditampilkan ditentukan `MENGUNDANG.slugPasangan()`:

| Alamat | Slug |
|---|---|
| `rian-aini.mengundang.id/…` | `rian-aini` (subdomain) |
| `mengundang.id/budi-sari/…` | `budi-sari` (segmen path pertama) |
| selain itu | slug cadangan |

Alamat IP sengaja tidak dibaca sebagai subdomain — `127.0.0.1` akan
terbaca sebagai slug `127` dan halamannya diam-diam kosong waktu dites
lokal.

Penentu ini dipakai bersama oleh halaman undangan dan halaman terima
kasih. Sebelumnya disalin di dua tempat, dan salinan seperti itu selalu
berakhir beda perilaku dari induknya.

### Alamat kanonik

`canonical_host` dipasang sebagai `<link rel="canonical">`, **bukan**
sebagai pengalihan. Undangan ini sudah tersebar ke ratusan orang; sebuah
pengalihan yang salah arah akan mematikan semuanya sekaligus, sementara
tag ini paling buruk cuma diabaikan. Pengalihan 301 yang sebenarnya
urusan lapisan server nanti, waktu pindah dari Vercel.

### Harga yang dibayar

Dulu isi undangan tertanam di `index.html` sehingga halaman langsung
tampil. Sekarang ia menunggu jawaban database dulu. Supaya tidak
menumpuk, panggilan `undangan_isi` dan `undangan_tamu` dijalankan
**berbarengan**, bukan berurutan — tamu membuka ini dari HP di jaringan
desa, dan satu perjalanan bolak-balik yang bisa dihemat sebaiknya
dihemat. Sampulnya sengaja tidak dibuka sampai isinya siap: lebih baik
sampul tertutup sebentar daripada nama yang salah sekejap. Ada jaring
pengaman 2,5 detik supaya sampul tidak pernah tertahan selamanya.

### Menulis ucapan

Tamu tidak lagi POST langsung ke tabel `ucapan`; sejak migrasi `012`
policy INSERT-nya dicabut sama sekali. Satu-satunya jalan masuk adalah
`ucapan_tulis(slug, …)`, yang menetapkan `pasangan_id` sendiri dari slug.
Sebabnya: kalau peramban yang menentukan pasangan_id, sebuah tulisan bisa
dititipkan ke undangan pasangan lain. Ini utang dari migrasi `010` yang
baru bisa dilunasi setelah ada resolusi penyewa.

---

## 1e. Tema

`index.html` tidak lagi memuat satu pun aturan tampilan. Semuanya ada di
`tema/{nama}/gaya.css`, dipilih lewat kolom `pasangan.tema`. Struktur HTML
dan isinya dipakai bersama; yang berbeda antar tema cuma berkas itu.

Menambah tema berarti menyalin foldernya, bukan menyalin halaman.

Berkasnya dimuat sebagai `<link>` biasa di HTML dengan nama tema bawaan,
jadi tidak ada kedipan pada kasus yang paling lazim. Kalau database
menyebut tema lain, `gantiTema()` menukar tautannya dan **menunggu sampai
berkas penggantinya benar-benar termuat** sebelum sampul dibuka — tanpa
menunggu, halaman sempat digambar dengan tema lama.

Kalau berkas tema penggantinya tidak ada, tema lama dibiarkan berdiri dan
sampul tetap dibuka. Undangan dengan tampilan yang bukan pilihannya masih
jauh lebih baik daripada undangan tanpa tampilan sama sekali.

Yang **tidak boleh** masuk ke berkas tema: apa pun yang khas satu
pasangan. Nama, alamat, tanggal, nomor dompet — semuanya dari database.

Tiap tema berdiri sendiri, tidak menumpang tema lain. Konsekuensinya
struktur yang sama ikut tersalin, tapi itu ditukar dengan kebebasan: tema
berikutnya tidak terkurung bentuk tema pertama.

---

## 1f. Gerak

Empat hal, semuanya di `assets/motion.js`: **runtun** (anak-anak satu
wadah muncul berurutan, bukan serempak), **parallax** tipis di bagian
pembuka, **angka hitung mundur** yang bergulir waktu berubah, dan **gulir
otomatis**.

Setelannya ada di berkas tema sebagai custom property, bukan di berkas
konfigurasi tersendiri — temanya toh sudah dimuat, jadi tidak perlu
permintaan jaringan tambahan, dan setelannya ikut tertukar sendiri waktu
temanya berganti:

```css
:root{ --runtun:90ms; --parallax:.18; --gulir-laju:46px; }
```

`--parallax:0` mematikan parallax, `--gulir-laju:0` mematikan gulir
otomatis untuk tema itu.

### Gulir otomatis

Tombol di atas tombol musik, muncul waktu undangan dibuka. Halaman
bergulir pelan seperti cerita lalu berhenti sendiri tepat di ujung.

Yang bikin fitur semacam ini sering terasa rusak: ia berebut dengan jari
penggunanya. Aturannya di sini satu dan keras — **begitu ada tanda
pengguna ingin menggulir sendiri, guliran otomatis menyerah seketika**
dan tidak mencoba melanjutkan. Tandanya ditangkap dua lapis: peristiwa
langsung (`wheel`, `touchstart`, `keydown`, `pointerdown`, `focusin`) dan
perbandingan posisi tiap bingkai, yang menangkap seretan bilah gulir
serta luncuran sisa di HP yang tidak memunculkan peristiwa apa pun.

Dua jebakan yang sudah ditangani:

- Berkas tema memasang `html{scroll-behavior:smooth}`. Kalau dibiarkan,
  tiap langkah kecil ikut dianimasikan halus dan hasilnya tersendat
  melawan dirinya sendiri. Selama gulir berjalan, perilaku itu dimatikan
  sementara lalu dikembalikan.
- Ada **jendela tenang 350 ms** sesudah tombol ditekan. Waktu itu halaman
  bisa saja masih melayang karena guliran halus yang dimulai hal lain —
  halaman ini sendiri menjalankan `scrollIntoView({behavior:'smooth'})`
  tepat sesudah undangan dibuka. Tanpa jendela ini, pergerakan sisa itu
  terbaca sebagai jari pengguna dan guliran mati seketika: tamu menekan
  tombolnya, lalu tidak terjadi apa-apa.

Kalau pengguna minta gerak dikurangi, tombolnya **tidak ditawarkan sama
sekali** — menawarkan lalu tidak menjalankan lebih membingungkan daripada
tidak ada tombolnya.

### Batas yang mengikat semuanya

Tamu kondangan membuka undangan ini dari **HP Android murah di jaringan
desa**. Jadi yang boleh dianimasikan hanya `transform` dan `opacity` —
keduanya dikerjakan compositor dan tidak memicu peramban menghitung ulang
tata letak. Begitu sebuah animasi menyentuh `width`, `height`, `top`, atau
`margin`, ponsel kelas bawah langsung tersendat.

Aturan seperti itu tidak bertahan kalau cuma ditulis di komentar:

```bash
node tema/periksa-gerak.mjs
```

Ia memindai tiap tema, membaca setiap `transition` dan `@keyframes`, dan
gagal kalau ada properti pemicu tata letak yang dianimasikan. Ia juga
menolak tema yang tidak menghormati `prefers-reduced-motion`. Jalankan
sebelum menambah tema baru.

### Jangan bekerja waktu tidak terlihat

Parallax berhenti begitu bagiannya keluar layar, dan hitung mundur
berhenti berdetak. Tanpa itu, empat angka tetap bergulir tiap detik
sepanjang tamu membaca bagian lain — kerja yang tidak pernah dilihat
siapa pun tapi tetap memakan baterai.

---

## 1g. Silsilah keluarga

Tabel `silsilah`, ditampilkan di undangan sebagai grid dua kolom per
sisi. Urutan sisinya mengikuti pihak tamu, sama seperti kartu mempelai.
Tanpa satu pun baris, bagiannya tidak muncul sama sekali.

### Bukan pohon

Undangan pernikahan menampilkan dua generasi, bukan silsilah marga. Maka
tabelnya datar: tidak ada kolom induk, tidak ada rujukan ke diri sendiri,
tidak ada kedalaman. Pohon sungguhan itu kerja berlipat untuk tampilan
yang justru **lebih buruk dibaca di layar selebar 400px**.

### Satu sumber, bukan dua

`mempelai` dulu menyimpan `ayah` dan `ibu` sendiri. Kalau silsilah
menyimpannya lagi, cepat atau lambat keduanya berbeda dan tidak ada yang
tahu mana yang benar. Jadi nilainya **dipindah** ke `silsilah`, kolom
lamanya dibuang, dan `undangan_isi()` menurunkan kembali `ayah`/`ibu`
dari tabel itu. Bentuk jawaban untuk halaman tidak berubah sama sekali —
yang berubah cuma dari mana nilainya berasal.

Migrasi `014` menolak membuang kolom lamanya kalau ada satu saja baris
yang belum pindah.

### Foto

Lewat edge function yang sama, dengan `?untuk=silsilah&id=…`. Dipisah
jadi dua fungsi berarti dua salinan pemeriksa token dan dua salinan batas
ukuran, dan salinan seperti itu selalu berakhir beda perilaku dari
induknya. Foto lama dibuang waktu diganti, supaya bucket tidak menyimpan
berkas yatim.

Alamat foto dibangun `MENGUNDANG.fotoUrl()` di `assets/varian.js`, bukan
di `assets/gambar.js`. Itu soal jalur penyimpanan, bukan soal mengecilkan
gambar — dan halaman undangan perlu yang pertama tapi tidak perlu yang
kedua: tamu tidak pernah mengunggah apa pun, dan mengirimi mereka 7 KB
pustaka yang tak terpakai itu mahal di jaringan desa.

Mengelolanya di kotak **5** halaman panitia.

---

## 1h. Dasbor klien

`/dasbor` — pengantin masuk dengan email, mengisi undangannya sendiri,
lalu menerbitkannya. Ini yang membuat klien baru tidak lagi berarti Anda
yang mengetik datanya.

### Membuka klien baru

Dua langkah, sekali saja:

1. Supabase → **Authentication → Users → Add user**, isi email dan kata
   sandi pengantin.
2. SQL Editor:

```sql
select public.pasangan_siapkan(
         'budi-sari', 'budi@contoh.com', 'Budi', 'Sari',
         date '2027-03-20', 'Semarang');
```

Satu perintah itu membuat pasangan (masih **draf**), dua mempelai, dua
tempat kosong, **keempat** baris pihak, lima link panitia dengan token
acak, dan menghubungkan akunnya ke tabel `pemilik`. Sesudah itu pengantin
masuk sendiri ke `/dasbor` dan mengisi sisanya.

Keempat baris `pihak` dibuat di sini justru karena itulah yang paling
mudah terlewat kalau dikerjakan dengan tangan: tanpa mereka, undangannya
tampil kosong **tanpa pesan galat apa pun**.

### Kenapa login email, bukan link bertoken

Halaman panitia (`/kirim`) memakai link — cocok untuk bapak, ibu, dan
mertua yang cuma perlu mengirim undangan. Dasbor lain urusannya: ia
mengubah isi undangan, dan pemiliknya butuh kunci yang melekat padanya
serta bisa dicabut, bukan link yang bisa diteruskan siapa saja.

Sesudah masuk, halaman ini menulis **langsung ke tabel** lewat REST —
tanpa RPC perantara. Itu aman karena RLS sejak migrasi `006` sudah
menyaring tiap tabel dengan `pasangan_saya()`. Diuji dengan akun pemilik
sungguhan: ia melihat undangannya sendiri, **nol baris** tamu pasangan
lain, dan setiap usaha menyunting atau menitipkan baris ke pasangan lain
ditolak RLS — termasuk waktu id pasangan lain itu sudah diketahui.

### Yang sengaja tidak jadi isian

Urutan nama dan urutan dompet per pihak **tidak ada di dasbor**. Keduanya
selalu berbunyi "sisi tamu dulu, lawannya belakangan", jadi sejak migrasi
`015` nilainya diturunkan `undangan_isi()` dari nama panggilan mempelai
dan kolom `dompet.sisi`. Meminta klien mengetik sesuatu yang sudah
diketahui sistem cuma menyiapkan sumber kedua yang akan berbeda.

### Jam acara

Kotak *Mulai* memakai waktu lokal peramban, sementara database menyimpan
UTC. Pergeserannya dikerjakan dua arah waktu memuat dan menyimpan —
tanpa itu jam yang muncul meleset sebesar selisih zona. Diuji di
`Asia/Jakarta`: `01:00 UTC` tampil sebagai `08:00`, dan disunting jadi
`16:30` terkirim kembali sebagai `09:30 UTC`.

### Belum ada di sini

Rekap sesudah acara tidak ada di `/dasbor`, melainkan di `/kirim` kotak 6
— tempat daftar tamunya memang sudah ada. Lihat bagian 1i.

---

## 1i. Rekap sesudah acara

Migrasi `016`. Tabel `pemberian` dan kolom `tamu.datang` sudah disiapkan
sejak migrasi `004`; yang baru ditambahkan sekarang cuma jalan masuknya.

Bentuknya **pengetikan pasca-acara oleh pengantin**, bukan aplikasi meja
penerima tamu: tidak ada mode offline, tidak ada antrean sinkronisasi,
tidak ada peran petugas baru. Yang ada cuma daftar tamu yang sudah ada,
dicari per nama, dengan dua hal yang ditempelkan padanya.

**Kehadiran punya tiga keadaan, bukan dua.** `null` berarti belum
ditanyakan. Tanpa keadaan ketiga, "belum sempat dicek" dan "tidak datang"
jadi satu angka, dan rekap setengah jadi terlihat seperti rekap yang sudah
selesai. Menekan tombol yang sudah menyala mengembalikannya ke `null`,
bukan membalik ke lawannya.

**Uang dan barang tidak pernah bercampur dalam satu baris.** Untuk
`uang`/`transfer` kolom `barang`, `jumlah` dan `satuan` dikosongkan
server; untuk kategori barang kolom `nominal` dikosongkan. Amplop yang
datang bersama gula dicatat dua baris. Alasannya satu: begitu taksiran
harga barang boleh diketik ke `nominal`, angka "total amplop" berubah jadi
campuran uang dan tebakan. Ada juga batas waras 1 miliar per baris — yang
dijaga bukan kecurangan, tapi jari yang kelebihan nol.

### Kategori pemberian

Migrasi `018`. Sepuluh kategori, karena "uang atau barang" saja tidak
cukup menggambarkan apa yang sungguh datang ke meja:

| | Dihitung sebagai |
|---|---|
| `uang`, `transfer` | rupiah — masuk total amplop |
| `rokok`, `gula`, `sembako`, `parsel`, `seserahan`, `barang` | takaran per satuan |
| `jasa`, `tenaga` | jumlah catatan |

`transfer` sengaja dipisah dari `uang`: yang mengirim lewat rekening
biasanya justru yang tidak bisa hadir, dan menyatukannya membuat
"siapa yang datang membawa amplop" tidak bisa dijawab lagi.

Merek dan rinciannya — "Djarum Super", "Vendor fotografer" — masuk kolom
`barang`. Takarannya masuk `jumlah` + `satuan`, dan keduanya **datang
berpasangan atau tidak sama sekali**: angka tanpa satuan tidak berarti
apa-apa, dan satuan tanpa angka juga tidak. Di halaman panitia keduanya
satu kotak, "2 slop", dipecah di peramban; mengetik angkanya saja memakai
satuan bawaan kategori. Rekapnya menjumlahkan **per satuan**, karena
"14 slop" dan "3 bungkus" adalah dua angka dan menjadikannya 17 akan
salah.

### Berkat punya dua keadaan

`pengiriman` menyimpan dua hal yang sebenarnya berbeda: pengiriman
undangan (`belum` → `terkirim`) dan penyerahan berkat (`belum` →
`dijatah` → `diberikan`). Sampai migrasi `018` keduanya dipaksa memakai
daftar status yang sama, jadi "sudah dijatah tapi belum diambil" — yang
justru pekerjaan yang belum selesai — tidak punya tempat.

`CHECK`-nya sekarang bercabang per `jenis`. Digabung jadi satu daftar,
"undangan dijatah" dan "berkat gagal" ikut lolos: dua keadaan yang tidak
punya arti apa pun tapi tetap bisa tersimpan dan muncul di rekap.

Tombolnya berputar `belum → dijatah → diberikan → belum`, dan **tulisannya
ikut berganti**, bukan cuma warnanya.

### Kelompok keluarga

Pak Budi menyumbang rokok dan tercatat di baris 10; anaknya datang
belakangan dan tercatat di baris 40. Tanpa cara menyatakan "ini satu
keluarga", merekapnya berarti bolak-balik sepanjang daftar.

Caranya: **isi dulu, kelompokkan belakangan**. Waktu tamu diketik sebelum
acara belum ketahuan siapa datang bareng siapa, dan waktu merekap urutan
yang ada adalah urutan amplop di tumpukan. Jadi pengelompokan adalah
tindakan terpisah yang bisa dilakukan kapan saja, bukan syarat waktu
menyimpan.

Bentuknya satu tulisan bebas di `tamu.kelompok` — pilihan pemiliknya —
plus `tamu.relasi` ("Anak", "Menantu") dan `tamu.alamat`. Kelemahannya
nyata dan pasti terjadi: `Kel. Budi` dan `Keluarga Budi` jadi dua
kelompok berbeda. Tiga penambal:

1. Spasi dirapikan sebelum disimpan.
2. Label yang **secara huruf besar-kecil sama** dengan yang sudah ada
   dipaksa memakai ejaan yang sudah ada. `keluarga budi` yang diketik
   belakangan menempel ke `Keluarga Budi`, bukan bikin kelompok kedua.
3. `kelompok_ganti_nama()` membetulkan seluruh anggota sekaligus kalau
   terlanjur bercabang — satu tindakan, bukan mengedit satu per satu.
   Nama baru yang dikosongkan membubarkan kelompoknya.

Yang **tidak** dikerjakan: menebak bahwa `Kel.` sama dengan `Keluarga`.
Tebakan seperti itu benar sembilan dari sepuluh kali, dan yang kesepuluh
menggabungkan dua keluarga yang memang berbeda tanpa ada yang sadar.

Label kelompok ikut jadi bahan pencarian, jadi mengetik "Budi"
memunculkan seluruh keluarganya — bukan cuma orang yang namanya Budi.

### Siapa boleh melihatnya

| Jalur masuk | Rekap |
|---|---|
| Login email (pemilik) | ya |
| Link panitia bercakupan penuh | ya |
| Link panitia per-pihak | **tidak** |

Ditolak di server, bukan cuma disembunyikan di halaman. Rekap memuat
jumlah amplop, dan itu bukan angka yang pantas dipegang pemegang link
keluarga sekalipun ia hanya melihat tamu dari pihaknya sendiri.

Berbeda dari kotak 4 dan 5 yang butuh token karena menyentuh edge
function `foto-unggah`, rekap tidak menyentuh berkas sama sekali — jadi
tidak ada alasan menutupnya untuk pengantin yang masuk lewat email.
Resolusi penyewanya dijadikan satu helper, `_pasangan_pengelola(token)`:
ada token → ditukar lewat `_panitia_penuh`; tanpa token → `pasangan_saya()`
dari JWT. Satu tempat, jadi tidak ada salinan yang bisa tertinggal waktu
aturannya berubah.

### Yang sampai ke halaman publik

Satu angka: berapa orang yang tercatat hadir. `terimakasih_isi()`
mengirim `hadir`, dan halaman menampilkannya sebagai satu baris di bawah
salam. Nominal amplop, nama pemberi, daftar barang, alamat, dan kelompok
keluarga tidak pernah keluar dari balik token.

Angkanya `null` selama belum ada yang ditandai hadir, jadi pasangan yang
belum sempat merekap tidak memajang "0 tamu hadir".

Fungsi itu `security definer` dan dipanggil anon — apa pun yang ditambahkan
ke dalamnya langsung jadi milik publik. Perlakukan sama seperti saringan
`tampil` di bagian 1c.

---

## 1j. Unduh Excel

`assets/xlsx.js`, migrasi `019`. Berkasnya **.xlsx sungguhan**, bukan CSV
berganti nama.

### Kenapa bukan CSV

CSV di Excel Indonesia hampir selalu berantakan. Pemisahnya ikut setelan
Windows — koma atau titik koma, dan halaman ini tidak punya cara menebak
yang mana. Lebih buruk lagi, `250.000` terbaca sebagai teks, sehingga
kolom yang justru ingin dijumlahkan tidak bisa dijumlahkan. Untuk berkas
yang isinya angka uang, itu bukan kegagalan kecil.

Di `.xlsx` angka disimpan sebagai angka dan tanggal sebagai tanggal.
Itu seluruh alasan berkas ini ada.

### Kenapa bukan SheetJS

Halaman panitia tidak punya langkah build dan tidak memuat pustaka apa
pun. Menambahkan berkas 400 KB untuk sebuah tombol unduh akan jadi hal
terberat di seluruh situs, dan ikut terunduh tiap kali halaman dibuka.

Jadi ditulis sendiri, sekitar 200 baris. `.xlsx` sebenarnya cuma berkas
ZIP berisi XML, dan yang dipakai sengaja sesedikit mungkin:

- ZIP tanpa kompresi (metode *stored*), jadi tidak perlu deflate
- teks inline (`t="inlineStr"`), jadi tidak perlu `sharedStrings.xml`
- satu `styles.xml` kecil: judul tebal, format ribuan, format tanggal

Yang tetap harus ditulis walau tidak dipakai: dua `fill`, satu `border`,
satu `cellStyleXfs`. Excel menolak `styles.xml` yang kekurangan bagian
bawaannya.

### Yang dijaga

- **Karakter kendali dibuang** dari tiap teks. Nama tamu diketik orang,
  dan sekali ada karakter kendali nyasar, seluruh berkas ditolak Excel
  tanpa penjelasan.
- **Nomor telepon ditulis sebagai teks.** `08123…` yang jadi angka
  kehilangan nol di depannya, dan nomor tanpa nol depan tidak bisa
  dihubungi.
- **Baris judul dibekukan.** Menggulir ke baris 200 tanpa itu berarti
  menebak kolom mana yang mana.
- Anchor unduhannya dimasukkan ke dokumen sebentar sebelum ditekan.
  Chromium mengunduh juga kalau dibiarkan lepas — sudah diuji — tapi
  tidak semua peramban begitu, dan yang tidak begitu diam saja tanpa
  galat.

### Diuji, bukan dikira

Berkas hasilnya dibuka kembali dengan `openpyxl` di pipa uji: angka
memang angka, tanggal memang tanggal, `&`/`<`/`>`/kutip tidak merusak
apa pun, apostrof pada `Nurul Zakiyatul 'AINI` utuh, kolom ke-27 jadi
`AA`, dan kolom nominal bisa dijumlahkan. Satu uji lagi memastikan
unduhan memuat 240 baris sementara layar cuma memuat 200 — kalau tombolnya
diam-diam memakai daftar layar, uji itu yang gagal.

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

Masuk ke `/kirim` lewat link bertoken, dan tokennya menentukan apa yang
terlihat:

| Cara masuk | Untuk siapa | Yang terlihat |
|---|---|---|
| `/kirim?t=…` cakupan penuh | Rian &amp; 'Aini | seluruh tamu, semua pihak |
| `/kirim?t=…` cakupan pihak | tiap pihak | hanya tamu pihaknya sendiri |
| Login email | — | tidak dipakai; lihat bagian 1 |

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
ganti tokennya lewat perintah di bagian bawah
`supabase/migrations/001_awal_satu_pasangan.sql` —
link lama langsung mati tanpa mengganggu yang lain.

### Lubang yang ditutup migrasi 017

Seluruh keluarga fungsi `panitia_*` lahir di migrasi `002`, waktu tabel
`tamu` belum punya `pasangan_id` sama sekali. Waktu kolom itu ditambahkan
di migrasi `004`, kebijakan RLS ikut diperbarui — tapi fungsi-fungsi itu
`security definer`, dan security definer berarti RLS tidak berlaku di
dalamnya. Saringannya tetap seperti dulu: cuma `pihak`, tanpa
`pasangan_id`.

Dibuktikan lewat pasangan kedua sungguhan di transaksi yang di-rollback,
memakai token pasangan pertama:

| Fungsi | Yang terjadi sebelum 017 |
|---|---|
| `panitia_daftar` | tamu pasangan lain ikut terdaftar |
| `panitia_ubah_nama` | nama tamu pasangan lain berhasil diganti |
| `panitia_hapus` | tamu pasangan lain **terhapus** |
| `panitia_ubah_pihak` | tanpa saringan sama sekali |
| `panitia_tambah` | tamu baru memakai `pasangan_bawaan()`, bukan pasangan pemilik token — jadi tamu pasangan kedua mendarat di daftar pasangan pertama |

Hari ini belum ada yang bocor karena barisnya memang cuma satu pasangan.
Itu bukan pengaman, itu kebetulan — dan kebetulan itu berakhir pada hari
pasangan kedua dibuat. Migrasi `017` menambahkan satu hal di tiap fungsi:
`pasangan_id` ikut disaring. Tidak ada perubahan perilaku untuk pemakai
yang sah.

Sekalian dibetulkan: keunikan slug tamu sekarang diperiksa **dalam**
pasangan, sepadan dengan indeks `tamu_slug_pasangan_idx` dari migrasi
`004`. Yang lama memeriksa seluruh tabel, jadi `bapak-ahmad` milik
pasangan lain memaksa tamu ini jadi `bapak-ahmad-2` — link tamunya jadi
lebih jelek untuk masalah yang tidak ada.

## 4. Sebar undangan

Buka `/kirim` lewat link pihak Anda.

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
   tidak saling memengaruhi. Tombolnya berputar tiga keadaan:
   *Berkat* (belum dijatah) → *Dijatah* → *Diberikan* → kembali ke awal.
   Tulisannya ikut berganti, bukan cuma warnanya. Angka di kotak 2 dan
   rekap per pihak menghitung yang **diberikan**; yang baru dijatah
   sengaja belum dihitung, karena itu pekerjaan yang belum selesai.
4. **Rekap per pihak** di kotak nomor 2 memperlihatkan berapa tamu dan
   berapa yang sudah dikirimi undangan serta berkat, dipecah per pihak.
   Angka besar di atasnya mengikuti saringan yang sedang aktif, jadi
   selalu cocok dengan baris yang terlihat di bawah.

Semuanya tersimpan di Supabase. Menutup browser, berganti HP, atau dibuka
bergantian oleh beberapa orang — progresnya tetap sama.

### Kotak 4 · Halaman terima kasih

Muncul **hanya untuk pemegang link bercakupan penuh**, dan hanya lewat
jalur token. Jalur login email sengaja tidak menampilkannya: jalur itu tidak
punya token panitia sama sekali, sementara edge function `foto-unggah`
justru memeriksa token itu — jadi panelnya disembunyikan, bukan ditampilkan
lalu gagal waktu ditekan.

**Foto.** Tekan *Pilih Foto*, boleh banyak sekaligus. Tiap berkas dikecilkan
dulu di HP ini (lihat bagian 1b) baru dikirim, jadi tidak perlu diperkecil
sendiri. Satu berkas yang gagal tidak menghentikan sisanya — yang gagal
dicatat di console. Tiap foto bisa diberi keterangan, dinaikturunkan,
disembunyikan, atau dihapus.

**Ucapan.** Balasan tampil di bawah ucapannya sebagai tulisan pengantin.
Mengosongkan kotaknya lalu menyimpan berarti menarik balasan itu kembali.
Tombol *Sembunyikan* memakai `ucapan_tampil` — ucapannya hilang dari halaman
terima kasih dan dari buku tamu undangan, tapi barisnya tetap ada dan bisa
ditampilkan lagi.

### Kotak 6 · Rekap sesudah acara

Muncul untuk pemegang link bercakupan penuh **dan** untuk pengantin yang
masuk lewat email — beda dari kotak 4 dan 5. Rinciannya di bagian 1i.

Cari nama tamunya, tandai *Hadir* atau *Tidak*, lalu catat amplop atau
barangnya. Pencarian dikerjakan server — nama, nomor, alamat, dan nama
kelompok sekaligus — dan hasilnya dipagari 200 baris: menurunkan 436 tamu
berikut pemberiannya sekali jalan berarti HP murah memegang seluruh daftar
untuk menyaring satu nama.

Alamat, kelompok, dan relasi ada di balik *Alamat & kelompok* pada tiap
baris. Ditaruh di sana karena biasanya cuma diisi untuk yang memberi
sesuatu, dan 200 baris yang masing-masing memajang tiga kotak kosong
membuat sisanya sulit dibaca.

Blok **Kelompok keluarga** di atas daftar memperlihatkan tiap keluarga
berikut jumlah anggota, yang hadir, total amplop, dan jumlah barangnya.
*Lihat* menyaring daftar ke keluarga itu saja; *Ganti Nama* membetulkan
ejaannya untuk semua anggota sekaligus. Bloknya terbuka sendiri saat
kelompok pertama lahir — dibiarkan tertutup, seluruh guna pengelompokan
bersembunyi di balik satu klik yang tidak ada petunjuknya.

Saringan **Urut kelompok** menaruh anggota satu keluarga berdampingan
dengan judul di atasnya. Judul itu tidak muncul di urutan nama: di sana
anggota satu keluarga berserak dan judulnya akan muncul berulang-ulang
tanpa arti.

**Unduh Excel** mengambil *seluruh* sumbangan lewat `rekap_unduh()`
(migrasi `019`) — bukan yang terlihat di layar. Ini penting: daftar di
layar sudah disaring dan dipagari 200 baris, dan unduhan yang diam-diam
terpotong di baris ke-200 lebih buruk daripada tidak ada unduhan sama
sekali, karena tidak ada yang tahu. Kalau belum ada sumbangan sama
sekali, tombolnya berkata begitu dan tidak mengunduh berkas kosong.

Dua lembar: **Sumbangan** (satu baris per pemberian, diurutkan per
kelompok keluarga, lengkap dengan alamat, relasi, kehadiran, dan status
berkat) dan **Ringkasan** (angka kehadiran, total amplop, dan rincian
barang per satuan). Rinciannya di bagian 1j.

Angka di atas kotak dihitung ulang tiap kali ada yang berubah — tidak ada
kolom total yang disimpan, karena total yang disimpan adalah sumber
kebenaran kedua dan sumber kebenaran kedua selalu berakhir berbeda dari
yang pertama.

Dari angka *Hadir* itulah baris kehadiran di `/terimakasih` muncul. Yang
lain — nominal, nama pemberi, daftar barang — berhenti di halaman ini.

---

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
| Dompet digital | DANA Rian dulu | DANA Rian dulu | DANA 'Aini dulu | DANA 'Aini dulu |
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

Sejak migrasi `010` ucapan punya tiga kolom tambahan: `balasan`,
`dibalas_pada`, dan `tampil`.

**Membalas.** RPC `ucapan_balas(token, id, teks)`, memakai token bercakupan
penuh. Balasan muncul di halaman terima kasih sebagai tulisan pengantin.
Mengirim teks kosong berarti menarik balasannya kembali, bukan menyimpan
balasan kosong.

**Menyembunyikan.** RPC `ucapan_tampil(token, id, false)`. Ini lebih baik
daripada menghapus: barisnya tetap ada, dan bisa ditampilkan lagi.
Saringannya mengikat di policy, bukan di halaman — ucapan yang
disembunyikan hilang dari buku tamu maupun dari REST, jadi
menyembunyikannya benar-benar menyembunyikan. Pengelola tetap melihat
semuanya lewat `ucapan_daftar(token)`.

Dua hal yang sengaja dikunci di migrasi itu, keduanya baru berbahaya
setelah kolom `balasan` ada:

- Policy INSERT lama cuma memeriksa panjang tulisan, tidak membatasi kolom.
  Artinya siapa pun bisa POST ke `/rest/v1/ucapan` sambil menyertakan
  `balasan`, dan halaman akan menayangkannya seolah-olah itu tulisan
  pengantin. Sekarang `balasan` dan `dibalas_pada` wajib kosong pada tulisan
  tamu.
- Policy SELECT lama `using (true)`. Kalau `tampil` cuma disaring di
  halaman, ucapan yang disembunyikan tetap terbaca lewat REST — padahal
  alasan menyembunyikannya biasanya justru karena isinya tidak pantas.

Masih terbuka: `pasangan_id` belum dikunci di policy INSERT, jadi secara
teori sebuah tulisan bisa dititipkan ke pasangan lain. Belum berakibat
apa-apa selama baru ada satu pasangan, dan menutupnya butuh halaman tahu ia
sedang menulis untuk siapa — itu resolusi penyewa di tahap 2.

Untuk melihat mentahnya: Supabase → **Table Editor → ucapan**.
