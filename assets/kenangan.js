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
      teks:  'Untuk setiap langkah yang datang, setiap doa yang dipanjatkan, dan setiap air mata bahagia yang jatuh bersama kami.' },
    { kunci: 'pembuka', jenis: 'teks',
      nama: 'Pesan dari kami', guna: 'Kata-kata pertama kalian untuk para tamu, sesudah sampul.',
      judul: 'Karena Anda Hadir',
      teks:  'Ada hari-hari yang berlalu begitu saja, dan ada satu hari yang akan kami kenang seumur hidup. Hari itu menjadi utuh karena Anda ada di sana — menyaksikan, mendoakan, dan ikut berbahagia. Kami tak sempat menyapa satu per satu, maka izinkan halaman ini menyampaikannya: terima kasih, dari lubuk hati yang paling dalam.' },
    { kunci: 'pria', jenis: 'media',
      nama: 'Mempelai pria', guna: 'Foto mempelai pria. Judul bawaannya nama panggilannya; nama orang tua diambil dari silsilah.',
      judul: null,
      teks:  'Hari itu ia melangkah dengan dada bergetar dan doa ayah-ibu di pundaknya — siap memikul sebuah janji yang akan ia jaga seumur hidup.' },
    { kunci: 'wanita', jenis: 'media',
      nama: 'Mempelai wanita', guna: 'Foto mempelai wanita. Judul bawaannya nama panggilannya; nama orang tua diambil dari silsilah.',
      judul: null,
      teks:  'Dengan restu yang menguatkan setiap langkahnya, ia berangkat membangun rumah yang baru — tanpa pernah melepas genggaman tangan yang membesarkannya.' },
    { kunci: 'kedatangan', jenis: 'media',
      nama: 'Kedatangan keluarga', guna: 'Rombongan keluarga tiba.',
      judul: 'Restu Berdatangan',
      teks:  'Seserahan di tangan, doa di dada. Langkah demi langkah, dua keluarga yang semula asing mulai menjadi satu.' },
    { kunci: 'acara', jenis: 'acara',
      nama: 'Rangkaian acara', guna: 'Satu bab untuk setiap acara yang dicentang di kotak 3, dalam urutan hari itu. Kalimat yang dibiarkan kosong diisi kalimat bawaan sesuai nama acaranya.' },
    { kunci: 'sungkem', jenis: 'media',
      nama: 'Sungkem', guna: 'Sungkem kepada orang tua.',
      judul: 'Bersimpuh dalam Bakti',
      teks:  'Di pangkuan inilah kami dulu belajar berdiri. Hari itu kami kembali bersimpuh — memohon maaf atas segala khilaf, memohon restu untuk setiap langkah. Air mata yang jatuh di sana adalah terima kasih yang tak sanggup kami ucapkan.' },
    { kunci: 'keluarga', jenis: 'media',
      nama: 'Keluarga', guna: 'Foto keluarga besar.',
      judul: 'Akar Tempat Kami Tumbuh',
      teks:  'Sebelum ada kami, ada mereka. Di tangan merekalah kami dibesarkan, di pelukan merekalah kami selalu pulang — dan hari itu, semua akar itu berkumpul untuk merestui satu pohon yang baru tumbuh.' },
    { kunci: 'tamu', jenis: 'media',
      nama: 'Para tamu', guna: 'Foto bersama tamu.',
      judul: 'Saksi Bahagia Kami',
      teks:  'Setiap jabat tangan, pelukan, dan doa yang Anda titipkan hari itu kini menjadi bagian dari kisah kami — kami simpan, dan tak akan pernah kami lupakan.' },
    { kunci: 'berdua', jenis: 'media',
      nama: 'Kami berdua', guna: 'Foto berdua — bab terakhir sebelum ucapan penutup.',
      judul: 'Akhirnya, Kita',
      teks:  'Ketika riuh perlahan reda dan tamu satu per satu berpamitan, tinggal kami berdua — dua tangan yang kini tak perlu lagi saling mencari. Semua doa hari itu bermuara di sini: pada satu janji untuk berjalan bersama, selamanya.' },
    { kunci: 'galeri', jenis: 'album',
      nama: 'Album', guna: 'Semua foto dan video, berurutan seperti bab-babnya, ditambah yang tanpa bab. Di sinilah tamu melihat satu per satu dan memperbesarnya.',
      judul: 'Yang Tak Ingin Kami Lupakan',
      teks:  'Setiap bingkai adalah detik yang ingin kami hentikan selamanya — tawa yang pecah, tangan yang bergetar, mata yang basah. Semuanya kami simpan di sini.' },
    { kunci: 'vendor', jenis: 'vendor',
      nama: 'Terima kasih kepada', guna: 'Vendor, sponsor, atau brand yang terlibat. Tidak muncul kalau daftarnya kosong.',
      judul: 'Terima Kasih Kepada',
      teks:  'Di balik setiap detail yang memukau, ada tangan-tangan yang bekerja dalam diam — sejak fajar hingga lampu terakhir padam. Hari kami tak akan seindah ini tanpa kalian.' },
    { kunci: 'ucapan', jenis: 'ucapan',
      nama: 'Ucapan tamu', guna: 'Ucapan dan doa tamu muncul bergantian di pojok bawah selama halaman dibuka.',
      judul: null, teks: null },
    { kunci: 'penutup', jenis: 'teks', wajib: true,
      nama: 'Penutup', guna: 'Akhir halaman, ditandatangani nama kalian berdua.',
      judul: 'Dengan Segenap Syukur',
      teks:  'Kami tak mampu membalas semua kebaikan Anda. Semoga setiap doa yang Anda titipkan untuk kami kembali kepada Anda berlipat ganda — dan semoga kita dipertemukan lagi dalam kebahagiaan-kebahagiaan berikutnya.' }
  ];

  /* Kalimat bawaan babak acara, dikenali dari namanya (kotak 3). Dipakai
     halaman kalau pasangan tidak menulis kalimat untuk babak itu, dan jadi
     placeholder di kotak 9 — yang dilihat di kotak kosong = yang dibaca tamu. */
  var BABAK = [
    [/akad|ijab|nikah|pemberkatan|holy\s*matrimony/i,
     'Satu tarikan napas, satu kalimat yang bergetar — dan dua hidup resmi menjadi satu. Detik yang akan kami ingat sampai akhir.'],
    [/resepsi|walimah|pesta|reception/i,
     'Saat tawa, doa, dan pelukan berbaur menjadi satu — perayaan atas cinta yang akhirnya menemukan rumahnya.'],
    [/siraman/i,
     'Air yang mengalir dari tangan-tangan tercinta membasuh masa lalu — melepas kami dengan doa, menyiapkan hati untuk lembaran yang baru.'],
    [/pengajian|tasyakuran|doa\s*bersama|khataman/i,
     'Lantunan doa yang mengawali segalanya — memohon agar setiap langkah kami selalu dalam lindungan-Nya.'],
    [/midodareni|malam\s*bainai|henna/i,
     'Malam terakhir sebagai anak di rumah ini — sunyi, penuh harap, ketika restu dan doa dikumpulkan untuk esok.'],
    [/lamaran|tunangan|khitbah|seserahan/i,
     'Saat sebuah niat baik diucapkan dengan suara bergetar, dan dua keluarga mengangguk merestui — awal dari segalanya.'],
    [/temu|panggih|balang\s*suruh/i,
     'Dua jiwa akhirnya berhadapan, disaksikan leluhur lewat adat yang diwariskan turun-temurun — dan sejak detik itu, tak ada lagi jalan pulang sendiri-sendiri.'],
    [/unduh|ngunduh/i,
     'Kami pulang bukan lagi sebagai dua, melainkan satu — disambut pelukan keluarga yang ikut merayakan babak baru ini.']
  ];
  var BABAK_UMUM = 'Satu lagi detik dari hari itu — kecil di kalender, tapi abadi di hati kami.';
  function teksBabak(nama) {
    for (var i = 0; i < BABAK.length; i++) if (BABAK[i][0].test(nama || '')) return BABAK[i][1];
    return BABAK_UMUM;
  }


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

  global.Kenangan = { BLOK: BLOK, MENURUT: MENURUT, BAGIAN: BAGIAN, berlaku: berlaku, teksBabak: teksBabak };
})(typeof window !== 'undefined' ? window : globalThis);
