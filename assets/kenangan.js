/* Blok rangka halaman kenangan — satu sumber untuk dua pembaca.

   /terimakasih memakainya sebagai tulisan bawaan; /dasbor panel 9
   memakainya sebagai placeholder, supaya yang dilihat pasangan di kotak
   kosong persis yang nanti dibaca tamu. Dua salinan daftar ini cepat
   atau lambat akan berbeda — itu sebabnya ia berdiri sendiri di sini.

   Urutan di sini urutan di halaman, dan tidak bisa diubah dari dasbor
   (docs/kenangan.md §4). Sampul dan penutup wajib: halaman tanpa awal
   atau tanpa akhir itu halaman rusak. */
(function (global) {
  'use strict';

  var BLOK = [
    { kunci: 'sampul', wajib: true,
      nama: 'Sampul', guna: 'Pembuka halaman, di atas nama kalian. Judulnya jadi tulisan kecil di atas nama.',
      judul: 'Terima Kasih',
      teks:  'Terima kasih atas doa, restu, dan kehadiran Anda. Kebahagiaan hari itu terasa jauh lebih penuh karena ada Anda di dalamnya.' },
    { kunci: 'pembuka',
      nama: 'Pengantar babak', guna: 'Muncul sebelum babak pertama. Diam sendiri kalau belum ada babak.',
      judul: 'Seluruh Hari Itu',
      teks:  'Tidak semua sempat hadir dari awal sampai akhir. Ada yang datang pagi, ada yang mampir menjelang sore. Inilah hari itu, berurutan — untuk Anda yang hadir, dan untuk Anda yang mendoakan dari jauh.' },
    { kunci: 'angka',
      nama: 'Angka hari itu', guna: 'Jumlah tamu hadir, ucapan, foto, dan babak. Angka nol tidak dipajang.',
      judul: 'Dalam Angka', teks: null },
    { kunci: 'galeri',
      nama: 'Galeri', guna: 'Semua foto yang tampil, termasuk yang tanpa babak.',
      judul: 'Momen Hari Itu', teks: null },
    { kunci: 'ucapan',
      nama: 'Ucapan tamu', guna: 'Ucapan dan doa yang tidak disembunyikan, beserta balasan kalian.',
      judul: 'Dari Para Tamu', teks: 'Kami membacanya satu per satu.' },
    { kunci: 'penutup', wajib: true,
      nama: 'Penutup', guna: 'Akhir halaman, ditandatangani nama kalian berdua.',
      judul: 'Sampai Jumpa',
      teks:  'Semoga setiap kebaikan Anda dibalas berlipat. Terima kasih telah menjadi bagian dari hari kami.' }
  ];

  var MENURUT = {};
  BLOK.forEach(function (b) { MENURUT[b.kunci] = b; });

  /* Blok yang berlaku: yang disimpan pasangan menimpa bawaan, kolom
     kosong jatuh ke bawaan, dan blok wajib selalu tampil. */
  function berlaku(simpanan, kunci) {
    var b = MENURUT[kunci], s = (simpanan && simpanan[kunci]) || {};
    return {
      tampil: b.wajib ? true : s.tampil !== false,
      judul:  s.judul || b.judul,
      teks:   s.teks  || b.teks
    };
  }

  global.Kenangan = { BLOK: BLOK, MENURUT: MENURUT, berlaku: berlaku };
})(typeof window !== 'undefined' ? window : globalThis);
