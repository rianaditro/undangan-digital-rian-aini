# mengundang.id — bentuk aplikasi, stack, dan keamanan

Pelengkap `docs/platform.md`, yang berisi entitas dan fase. Dokumen ini
menjawab: aplikasinya nanti seperti apa, dibangun dengan apa, dan
diamankan bagaimana.

Ditulis dengan satu batasan yang mengubah hampir semua keputusan teknis:
**Vercel dan Supabase itu sementara. Ujungnya VPS sendiri.**

---

## 1. Ceritanya

### Yang dilihat pengantin

Mendarat di `mengundang.id`, daftar, lalu diberi satu formulir pendek —
enam kolom, tidak lebih: nama pria, nama wanita, waktu akad, waktu
resepsi, tautan Google Maps, satu foto. Tekan terbit. Di bawah tiga menit
undangannya sudah hidup di `mengundang.id/rian-aini`.

Semua isian lain menyusul kapan saja, dan **link tidak pernah berubah**
karenanya. Ini bukan detail kecil: link yang sudah masuk grup WhatsApp
tidak bisa ditarik.

Sesudah itu pekerjaan sebenarnya dimulai, dan di situlah produk ini
berbeda dari penjual template. Pengantin membuka daftar tamu, mengunggah
berkas kontak dari HP, dan sistem merapikan nomor, menggabungkan yang
kembar, lalu membuat link personal untuk tiap orang. Ia membagi empat link
ke bapak, ibu, mertua, dan pasangannya — masing-masing hanya melihat
bagiannya. Lalu mengirim bertahap, menandai yang sudah, dan melihat satu
tabel yang menjawab pertanyaan paling sering ditanyakan tiga hari sebelum
acara: *siapa yang belum dikirimi undangan, dan siapa yang belum dikirimi
berkat.*

### Yang dilihat keluarga

Bapak menerima satu tautan lewat WhatsApp. Ia membukanya. Tidak ada
formulir masuk, tidak ada kata sandi, tidak ada aplikasi yang harus
dipasang. Yang muncul langsung daftar tamunya sendiri. Ia menambah nama,
menekan kirim, WhatsApp terbuka dengan pesan yang sudah jadi.

Ia tidak pernah tahu ada berapa tamu di pihak besan, dan tidak bisa tahu.

### Yang dilihat tamu

Membuka `mengundang.id/rian-aini/bapak-ahmad-fauzi` dan melihat namanya
sendiri di sampul. Isi undangannya menyesuaikan dari pihak mana ia
diundang: urutan nama mempelai, alamat resepsi yang benar, dompet digital
yang pantas. Ia mengonfirmasi kehadiran, menulis doa, dan doanya terbaca
oleh semua tamu — satu buku ucapan, tidak dipecah.

Kalau linknya hilang tertimbun chat, ia mengetik namanya di
`mengundang.id/cari` dan menemukannya lagi.

### Yang dilihat reseller

Percetakan di Jepara membuka dasbornya, membuat pesanan atas nama klien,
memantau statusnya, dan melihat komisinya bertambah. Ia **tidak bisa
melihat satu pun nama tamu klien.** Bukan karena disembunyikan di
tampilan — karena datanya memang tidak pernah sampai ke sana.

---

## 2. Fitur, dikelompokkan menurut gunanya

**Pintu masuk** — terbit di bawah 3 menit, enam kolom, edit mandiri tanpa
mengubah link, turunan otomatis (koordinat dari tautan Maps, hitung
mundur, hari pasaran Jawa).

**Pengelola daftar tamu** — inti produknya. Impor `.vcf` dan tempel
mentah dari WhatsApp, normalisasi nomor, dedupe termasuk nama mirip,
generator link massal, nama undangan boleh berbeda dari nama kontak,
segmentasi sesi (akad / resepsi / ngunduh).

**Tracking dua jalur** — undangan dan berkat dicatat terpisah, statusnya
saling bebas, bisa disaring per RT, bisa diekspor. Ini alat kerja WO,
bukan fitur pengantin.

**Multi-admin tanpa login** — tiap pihak satu link, cakupannya dipaksa di
server. Sudah jalan hari ini.

**Sisi tamu** — undangan bervarian per pihak, RSVP, buku ucapan bersama,
amplop digital yang **hanya menampilkan** nomor atau QRIS pengantin,
halaman cari undangan.

**Mode akses** — hemat data di bawah 100KB tanpa animasi dan musik, mode
font besar dengan tombol telepon dan peta berukuran besar. Deteksi
otomatis, bisa dipilih manual.

**Buku kondangan** — fase tersendiri, bisa dijual tanpa undangan. Sumbunya
penerima: buku bapak, buku ibu, buku pengantin, buku besan, paralel.

---

## 3. Tech stack

### Prinsipnya

Pilih yang bisa dipindah, bukan yang paling nyaman sekarang. Setiap lapis
punya satu titik portabilitas yang harus dijaga.

| Lapis | Sekarang | Nanti di VPS | Yang menjaga portabilitas |
|---|---|---|---|
| Database | Supabase Postgres | Postgres biasa | SQL murni, migrasi berkas bernomor |
| Auth | Supabase GoTrue | milik sendiri | JWT + tabel `pengguna` |
| **API** | **PostgREST + RPC** | **server sendiri** | **inilah yang harus diubah** |
| Berkas | Cloudflare R2 | MinIO, atau R2 tetap | S3 API |
| Statis | Vercel | Caddy | berkas statis biasa |
| Antrean | — | pg-boss di Postgres | Postgres |
| Email | — | SMTP apa saja | SMTP |

### Yang harus berubah sekarang, bukan nanti

Hari ini peramban berbicara **langsung ke database**. Aman, karena RLS
dan RPC menjaganya — itu sudah diuji. Tapi pola itu punya tiga batas yang
akan tertabrak persis saat platform mulai tumbuh:

1. **Logika bisnis di plpgsql tidak berkelanjutan.** Webhook pembayaran,
   pengiriman WhatsApp, pembuatan PDF, pekerjaan terjadwal — tidak satu
   pun muat di dalam Postgres.
2. **Setiap aturan keamanan harus bisa ditulis sebagai RLS.** Yang tidak
   bisa, tidak terlindungi.
3. **Pindah penyedia berarti menulis ulang semantik PostgREST.**

Jadi fase 0 bukan cuma menambahkan `pasangan_id`. Fase 0 adalah
**menyisipkan satu server API di antara peramban dan database**, selagi
permukaannya masih kecil. Menundanya sampai ada 200 pesanan berarti
memindahkan sistem hidup.

### Usulan konkret

**Backend** — Node dengan TypeScript, satu proses, Fastify. Alasannya
bukan karena Node paling cepat, tapi karena seluruh kode Anda hari ini
JavaScript, dan satu bahasa untuk satu orang lebih berharga daripada
selisih kinerja. Go lebih hemat di VPS kecil dan layak dipertimbangkan
kalau Anda memang ingin belajar.

Akses database lewat query SQL langsung dengan pustaka tipis, **bukan
ORM berat**. Skema ini akan penuh aturan yang aneh (slug beku, dedupe
lintas pihak, dua jalur pengiriman) dan ORM justru menghalangi.

**Frontend** — tetap statis. Undangan tamu harus tetap ringan dan cepat di
Android murah; itu bukan tempat untuk framework. Dasbor klien boleh pakai
framework ringan kalau kompleksitasnya menuntut, tapi mulai tanpa dulu —
halaman panitia sekarang sudah membuktikan vanilla masih cukup jauh.

**Tanpa build step selama mungkin.** Ini bukan idealisme; ini agar Anda
bisa memperbaiki bug dari HP saat ada acara hari Minggu.

**VPS** — satu mesin kecil sudah lebih dari cukup untuk ratusan pesanan
per tahun. Caddy di depan (HTTPS otomatis, termasuk wildcard), satu proses
Node, satu Postgres, MinIO kalau mau lepas dari R2. Semuanya dalam
`docker compose` supaya bisa dipindah lagi.

**Yang jangan dibangun sendiri**: pembayaran (pakai Midtrans/Xendit),
pengiriman email massal, dan penyimpanan video.

---

## 4. Keamanan

Diurutkan dari yang paling mahal kalau gagal.

### Isolasi antar pasangan
Setiap query disaring `pasangan_id`, dan penyaringan itu **hanya boleh
ditulis di satu tempat** — lapisan data, bukan di tiap endpoint. Uji
otomatis yang membuat dua pasangan lalu memastikan yang satu tidak bisa
menyentuh yang lain harus ada sejak commit pertama fase 0.

### Data tamu
Nomor telepon tamu adalah milik orang yang bukan pelanggan kita. Aturan
yang sudah berlaku sekarang dan harus dipertahankan: **kunci publik yang
tertanam di halaman undangan tidak boleh bisa membaca daftar tamu sama
sekali.** Halaman undangan hanya boleh menanyakan satu tamu lewat
slug-nya, dan jawabannya hanya nama dan pihak.

### Reseller
Bukan disembunyikan di tampilan — endpoint reseller tidak pernah
menyentuh tabel tamu. Perlu uji yang membuktikannya, bukan sekadar niat.

### Buku kondangan
Data paling sensitif di seluruh produk. Bocornya jumlah sumbangan adalah
bencana sosial di kampung. Akses terkunci terpisah dari daftar tamu,
tidak pernah masuk analytics, tidak terlihat reseller, dan pertimbangkan
enkripsi di tingkat kolom.

### Link keluarga
Ini kredensial yang berjalan-jalan di WhatsApp. Yang belum ada dan harus
ada di platform:

- **Token disimpan dalam bentuk hash**, bukan apa adanya. Kalau database
  bocor, seluruh link keluarga ikut bocor — hari ini itu benar.
- **Kedaluwarsa** mengikuti masa aktif pasangan.
- **Bisa dicabut satu per satu** — sudah ada.
- **Tercatat kapan dan dari mana dipakai** — sebagian sudah ada.

### Sesi dan cookie
Dasbor di host terpisah `app.mengundang.id`. Cookie **host-only**, jangan
pernah `Domain=.mengundang.id` — kalau tidak, subdomain pasangan bisa
membacanya.

### Permukaan yang mudah terlewat
**Halaman "cari undangan saya" adalah alat panen nama.** Ketik beberapa
huruf, dapat daftar. Perlu pembatasan laju, perlu minimal beberapa huruf,
dan sebaiknya hanya mengembalikan satu hasil paling cocok, bukan daftar.
Hal yang sama berlaku untuk RSVP dan buku ucapan: keduanya menerima
tulisan dari publik tanpa login.

### Slug tidak pernah dilepas
Saat arsip kedaluwarsa, tandai `expired` dan tampilkan halaman "undangan
tidak aktif". **Jangan pernah dialihkan ke pemilik baru.** Link lama
beredar bertahun-tahun, dan tamu yang membukanya harus melihat halaman
mati, bukan pernikahan orang lain.

---

## 5. Retensi data dan UU PDP

Saya bukan penasihat hukum, dan sebelum reseller berbayar pertama masuk
sebaiknya ini dilihat orang yang memang ahlinya. Tapi rancangannya bisa
disiapkan sekarang.

### Satu koreksi yang perlu

Anda menyebut ini data yang hanya bisa dilihat user, bukan kita. Secara
teknis benar, dan itu memang rancangan yang bagus — tapi secara hukum
tidak membebaskan. **Menyimpan sudah termasuk memproses** menurut UU No.
27 Tahun 2022. Servernya milik Anda, jadi kewajibannya melekat walau
Anda tidak pernah membuka datanya.

Yang berlaku kira-kira begini: pengantin adalah pengendali atas daftar
tamunya, mengundang.id adalah prosesor yang menyimpankan. Tamu adalah
subjek data yang **tidak pernah memberi persetujuan kepada Anda** — ia
memberi nomornya kepada temannya yang menikah, bukan kepada platform.
Itulah kenapa jalur permintaan hapus dari tamu wajib ada.

Kabar baiknya: enkripsi dan kontrol akses yang sudah Anda punya justru
persis yang diminta pasal kewajiban pelindungan. Yang kurang tinggal
retensi dan hak subjek.

### Usulan jadwal retensi

| Data | Disimpan | Alasan |
|---|---|---|
| Daftar tamu, nomor, alamat | masa aktif + **90 hari** | klien sering baru minta ekspor sebulan setelah acara |
| Pengiriman, RSVP | ikut daftar tamu | |
| Ucapan | ikut masa aktif, bisa diekspor jadi PDF | |
| Buku kondangan | ikut paket arsip, minimal 3 tahun | ini catatan utang sosial, dipakai bertahun-tahun |
| **Slug** | **selamanya** | link beredar; hanya statusnya yang mati |
| Transaksi dan pajak | 10 tahun | kewajiban pembukuan, bukan PDP |
| Log akses | 12 bulan | |
| Akun terhapus | 30 hari masa tenggang, lalu hilang | mencegah salah hapus |

### Mekanismenya

1. Kolom `hapus_pada` di `pasangan`, dihitung dari masa aktif. Satu
   pekerjaan harian yang menjalankannya. **Otomatis, bukan ingatan
   manusia.**
2. Peringatan H-30 dan H-7 ke klien, dengan tombol ekspor dan tombol
   perpanjang.
3. **Ekspor mandiri kapan saja** — hak akses subjek data terpenuhi, dan
   sekaligus mengurangi alasan klien menahan data di server Anda.
4. **Jalur permintaan hapus untuk tamu.** Satu tautan kecil di kaki
   undangan: "Hapus data saya". Menghapus baris tamu itu dari daftar
   pengantin, mencatat permintaannya, dan tidak perlu persetujuan
   pengantin. Ini bagian yang paling sering dilupakan platform sejenis,
   dan paling mudah jadi masalah.
5. **Anonimkan, jangan hanya hapus**, untuk hal yang perlu tetap
   terhitung: simpan jumlahnya, buang identitasnya.
6. **Catatan penghapusan** — bukti kepatuhan bila suatu saat ditanya.
7. **Rencana kebocoran**: pemberitahuan 3×24 jam. Tulis prosedurnya
   sebelum dibutuhkan, karena saat dibutuhkan tidak akan sempat.

---

## 6. Keputusan yang sudah diambil

**Hosting sementara.** Vercel dan Supabase dipakai sampai VPS siap.
Karena itu jangan menambah ketergantungan baru yang khas penyedia:
Edge Functions, Realtime, dan Supabase Storage sebaiknya dihindari
walaupun tersedia. Yang boleh dipakai adalah yang punya padanan langsung
di VPS.

**Dedupe lintas pihak: jangan dihalangi.** Kalau dua pihak mengundang
orang yang sama, keduanya tetap boleh — menghalanginya berarti
membocorkan keberadaan tamu pihak lain. Tapi tampilan penuh milik
pengantin memunculkan penanda duplikat lintas pihak, supaya bisa
dirapikan manual sebelum menyebar.

**Cloudflare Workers dicoret** sebagai tujuan akhir. Alasan aslinya
adalah keterbatasan Cloudflare Pages, dan itu tidak relevan lagi begitu
tujuannya VPS sendiri.
