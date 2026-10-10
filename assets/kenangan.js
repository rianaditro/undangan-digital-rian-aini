/* Bab halaman kenangan — satu sumber untuk dua pembaca.

   /terimakasih memakainya sebagai susunan dan tulisan bawaan; /dasbor
   panel 9 memakainya sebagai daftar isian dan placeholder, supaya yang
   dilihat pasangan di kotak kosong persis yang nanti dibaca tamu.

   Susunan (revisi 10 Oktober, migrasi 033) — gulir = hari berjalan:

     sampul → pembuka → mempelai pria → mempelai wanita → kedatangan
     keluarga → [babak acara dari kotak 3: akad, resepsi, …] → sungkem
     → keluarga → para tamu → kami berdua → album → terima kasih kepada
     → penutup

   Urutannya tetap dan sengaja tidak bisa digeser dari dasbor
   (docs/kenangan.md §4). Yang bisa: mematikan bab, mengganti
   tulisannya, dan memilih foto/video tiap bab.

   Tulisan bawaan memakai suara pengantin — "kami" kepada "Anda" yang
   hadir — karena halaman ini memang surat dari mereka berdua.

   jenis:
     'teks'   bab tulisan saja
     'media'  bab berlatar foto/video (foto.bagian = kunci); tampil
              kalau ada medianya ATAU pasangan menulis sesuatu untuknya
     'acara'  tempat babak acara disisipkan (bukan baris kenangan_blok)
     'vendor' daftar kenangan_vendor; tampil kalau ada isinya
     'album'  semua foto/video, urut bab, lalu yang tanpa bab
     'ucapan' pop-up ucapan tamu yang berputar
*/
(function (global) {
  'use strict';

  var BLOK = [
    { kunci: 'sampul', jenis: 'media', wajib: true,
      nama: 'Sampul', guna: 'Layar pertama: foto atau video sampul, nama kalian, tanggal, dan satu kalimat. Judulnya jadi tulisan kecil di atas nama.',
      judul: 'Terima Kasih',
      teks:  'Dari kami berdua, untuk Anda yang telah hadir dan mendoakan.' },
    { kunci: 'pembuka', jenis: 'teks',
      nama: 'Pesan dari kami', guna: 'Kata-kata pertama kalian untuk para tamu, sesudah sampul.',
      judul: 'Terima Kasih Telah Hadir',
      teks:  'Hari itu kami tidak sempat menyapa Anda satu per satu. Lewat halaman ini kami ingin mengatakannya dengan sungguh-sungguh: terima kasih sudah datang, mendoakan, dan ikut berbahagia bersama kami.' },
    { kunci: 'pria', jenis: 'media',
      nama: 'Mempelai pria', guna: 'Foto mempelai pria. Judul bawaannya nama panggilannya; nama orang tua diambil dari silsilah.',
      judul: null, teks: null },
    { kunci: 'wanita', jenis: 'media',
      nama: 'Mempelai wanita', guna: 'Foto mempelai wanita. Judul bawaannya nama panggilannya; nama orang tua diambil dari silsilah.',
      judul: null, teks: null },
    { kunci: 'kedatangan', jenis: 'media',
      nama: 'Kedatangan keluarga', guna: 'Rombongan keluarga tiba.',
      judul: 'Kedatangan Keluarga',
      teks:  'Rombongan keluarga tiba, membawa doa dan restu dari rumah.' },
    { kunci: 'acara', jenis: 'acara',
      nama: 'Rangkaian acara', guna: 'Satu bab untuk setiap acara yang dicentang di kotak 3, dalam urutan hari itu.' },
    { kunci: 'sungkem', jenis: 'media',
      nama: 'Sungkem', guna: 'Sungkem kepada orang tua.',
      judul: 'Sungkem',
      teks:  'Kepada ayah dan ibu yang membesarkan kami dengan sabar — terima kasih, dan mohon doa restu untuk langkah kami selanjutnya.' },
    { kunci: 'keluarga', jenis: 'media',
      nama: 'Keluarga', guna: 'Foto keluarga besar.',
      judul: 'Keluarga Besar',
      teks:  'Yang selalu ada sejak awal, dan akan tetap ada sesudahnya.' },
    { kunci: 'tamu', jenis: 'media',
      nama: 'Para tamu', guna: 'Foto bersama tamu.',
      judul: 'Anda yang Hadir',
      teks:  'Setiap senyum, pelukan, dan doa hari itu kami simpan baik-baik.' },
    { kunci: 'berdua', jenis: 'media',
      nama: 'Kami berdua', guna: 'Foto berdua — bab terakhir sebelum ucapan penutup.',
      judul: 'Kami Berdua',
      teks:  'Dan inilah awal perjalanan kami. Terima kasih telah menjadi saksinya.' },
    { kunci: 'galeri', jenis: 'album',
      nama: 'Album', guna: 'Semua foto dan video, berurutan seperti bab-babnya, ditambah yang tanpa bab. Di sinilah tamu melihat satu per satu dan memperbesarnya.',
      judul: 'Album Hari Itu', teks: null },
    { kunci: 'vendor', jenis: 'vendor',
      nama: 'Terima kasih kepada', guna: 'Vendor, sponsor, atau brand yang terlibat. Tidak muncul kalau daftarnya kosong.',
      judul: 'Terima Kasih Kepada',
      teks:  'Hari itu tidak akan seindah ini tanpa tangan-tangan yang bekerja di baliknya.' },
    { kunci: 'ucapan', jenis: 'ucapan',
      nama: 'Ucapan tamu', guna: 'Ucapan dan doa tamu muncul bergantian di pojok bawah selama halaman dibuka.',
      judul: null, teks: null },
    { kunci: 'penutup', jenis: 'teks', wajib: true,
      nama: 'Penutup', guna: 'Akhir halaman, ditandatangani nama kalian berdua.',
      judul: 'Dengan Penuh Syukur',
      teks:  'Semoga setiap doa dan kebaikan Anda kembali kepada Anda, berlipat ganda. Sampai jumpa di kebahagiaan berikutnya.' }
  ];

  var MENURUT = {};
  BLOK.forEach(function (b) { MENURUT[b.kunci] = b; });

  /* Bab yang punya foto/video sendiri — urutan yang sama dengan
     pilihan "Bab" di kotak 8 dasbor. */
  var BAGIAN = BLOK.filter(function (b) { return b.jenis === 'media'; })
                   .map(function (b) { return b.kunci; });

  /* Blok yang berlaku: yang disimpan pasangan menimpa bawaan, kolom
     kosong jatuh ke bawaan, dan blok wajib selalu tampil. `ditulis`
     menandai pasangan mengisi sesuatu sendiri — bab media tanpa foto
     tetap muncul kalau ditulisi. */
  function berlaku(simpanan, kunci) {
    var b = MENURUT[kunci] || {}, s = (simpanan && simpanan[kunci]) || {};
    return {
      tampil:  b.wajib ? true : s.tampil !== false,
      judul:   s.judul || b.judul || null,
      teks:    s.teks  || b.teks  || null,
      ditulis: !!(s.judul || s.teks)
    };
  }

  global.Kenangan = { BLOK: BLOK, MENURUT: MENURUT, BAGIAN: BAGIAN, berlaku: berlaku };
})(typeof window !== 'undefined' ? window : globalThis);
