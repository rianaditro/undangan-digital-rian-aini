/* ============================================================
   mengundang.id — konfigurasi platform, pemuat isi, dan pembantu

   Sampai tahap 1 berkas ini juga menyimpan seluruh isi undangan Rian &
   'Aini sebagai konstanta. Sekarang tidak lagi: isinya datang dari
   undangan_isi(slug) di database, dan yang tersisa di sini cuma dua hal
   yang memang milik platform — alamat Supabase dan berkas musik — plus
   pembantu yang bentuknya fungsi murni.

   Cara pakainya berubah satu langkah: panggil MENGUNDANG.muat() dan
   tunggu, baru baca MEMPELAI, VARIAN, dan kawan-kawannya.

     await MENGUNDANG.muat();
     var v = MENGUNDANG.varian('keluarga-pria');

   Wadah datanya diisi di tempat, bukan diganti. Jadi kode yang terlanjur
   memegang rujukan ke MENGUNDANG.VARIAN tetap melihat isi yang benar
   sesudah muat() selesai.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Milik platform, bukan milik satu pasangan ----------
     anon key memang aman ditaruh di sini: dengan key ini saja, tabel
     tamu dan pengiriman tidak bisa dibaca sama sekali. */
  var SB = {
    url: 'https://mavjlhlyrtacxleulbom.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdmpsaGx5cnRhY3hsZXVsYm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTQwMTUsImV4cCI6MjEwMjMzMDAxNX0.z-ggUETNyHPLWdhXkLTuWHMZdb-E98YcqGzM74d1uq8'
  };

  var BACKSOUND_URL = '/assets/backsound.mp3';

  /* ---------- Teks pembuka menurut agama (migrasi 037) ----------
     Milik platform, bukan milik pasangan: satu salinan, bisa diperbaiki
     tanpa migrasi. Halaman menandai tiap teks dengan data-pembuka="kunci";
     nilai null menyembunyikan elemennya (pembuka "umum" tidak punya ayat).
     Teks Islam di index.html dan di sini SAMA PERSIS — pasangan lama
     (bawaan 'islam') tidak berubah satu huruf pun.

     Kutipan kitab memakai terjemahan yang lazim di undangan; sebaiknya
     dibaca ulang oleh orang dari tiap umat sebelum ditawarkan luas. */
  var PEMBUKA = {
    islam: {
      nama: 'Islam',
      basmalah: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ',
      label: "Walimatul 'Ursy",
      ayat: 'وَمِنْ اٰيٰتِهٖٓ اَنْ خَلَقَ لَكُمْ مِّنْ اَنْفُسِكُمْ اَزْوَاجًا',
      salam: "Assalamu'alaikum Warahmatullahi Wabarakatuh",
      kutipan: 'Dan di antara tanda-tanda kekuasaan-Nya ialah Dia menciptakan untukmu pasangan hidup dari jenismu sendiri, supaya kamu merasa tenteram di sisinya, dan dijadikan-Nya di antaramu rasa kasih dan sayang.',
      sumber: 'QS. Ar-Rum : 21',
      alis: 'Bismillahirrahmanirrahim',
      pengantar: "Dengan memohon rahmat dan ridha Allah Subhanahu wa Ta'ala, kami bermaksud menyelenggarakan pernikahan putra-putri kami.",
      doaHitung: 'Semoga Allah memudahkan langkah kami sampai pada hari itu.',
      selesai: 'Alhamdulillah, hari bahagia telah tiba.',
      hadir: 'Insya Allah hadir',
      contohUcapan: "Barakallahu lakuma wa baraka 'alaikuma...",
      salamTutup: "Wassalamu'alaikum Warahmatullahi Wabarakatuh"
    },
    kristen: {
      nama: 'Kristen',
      basmalah: null,
      label: 'Pemberkatan Nikah',
      ayat: null,
      salam: 'Salam sejahtera dalam kasih Tuhan kita Yesus Kristus',
      kutipan: 'Demikianlah mereka bukan lagi dua, melainkan satu. Karena itu, apa yang telah dipersatukan Allah, tidak boleh diceraikan manusia.',
      sumber: 'Matius 19 : 6',
      alis: 'Dengan sukacita',
      pengantar: 'Dengan penuh sukacita dan atas berkat kasih Tuhan, kami bermaksud melangsungkan pernikahan putra-putri kami.',
      doaHitung: 'Kiranya Tuhan memberkati langkah kami sampai pada hari itu.',
      selesai: 'Puji Tuhan, hari bahagia telah tiba.',
      hadir: 'Saya akan hadir',
      contohUcapan: 'Tuhan Yesus memberkati pernikahan kalian...',
      salamTutup: 'Tuhan memberkati'
    },
    katolik: {
      nama: 'Katolik',
      basmalah: null,
      label: 'Sakramen Perkawinan',
      ayat: null,
      salam: 'Salam damai dalam Kristus',
      kutipan: 'Kasih itu sabar; kasih itu murah hati; ia tidak cemburu. Ia tidak memegahkan diri dan tidak sombong.',
      sumber: '1 Korintus 13 : 4',
      alis: 'Dengan sukacita',
      pengantar: 'Dengan penuh sukacita dan atas rahmat Tuhan, kami bermaksud menerimakan Sakramen Perkawinan putra-putri kami.',
      doaHitung: 'Kiranya Tuhan menyertai langkah kami sampai pada hari itu.',
      selesai: 'Syukur kepada Allah, hari bahagia telah tiba.',
      hadir: 'Saya akan hadir',
      contohUcapan: 'Selamat menerimakan Sakramen Perkawinan, Tuhan memberkati...',
      salamTutup: 'Berkah Dalem'
    },
    hindu: {
      nama: 'Hindu',
      basmalah: null,
      label: 'Pawiwahan',
      ayat: null,
      salam: 'Om Swastiastu',
      kutipan: 'Wahai pasangan suami istri, semoga kalian tetap bersatu dan tidak pernah terpisahkan. Semoga kalian mencapai hidup penuh kebahagiaan, tinggal di rumah yang penuh kegembiraan bersama seluruh keturunanmu.',
      sumber: 'Rgveda X.85.42',
      alis: 'Om Swastiastu',
      pengantar: 'Atas asung kertha wara nugraha Ida Sang Hyang Widhi Wasa, kami bermaksud menyelenggarakan upacara Manusa Yadnya Pawiwahan putra-putri kami.',
      doaHitung: 'Semoga Ida Sang Hyang Widhi Wasa menuntun langkah kami sampai pada hari itu.',
      selesai: 'Hari bahagia telah tiba.',
      hadir: 'Saya akan hadir',
      contohUcapan: 'Selamat menempuh hidup baru, semoga langgeng...',
      salamTutup: 'Om Shanti Shanti Shanti Om'
    },
    buddha: {
      nama: 'Buddha',
      basmalah: null,
      label: 'Upacara Pernikahan',
      ayat: null,
      salam: 'Namo Buddhaya',
      kutipan: 'Bila suami dan istri ingin terus bersama dalam kehidupan ini dan kehidupan yang akan datang, hendaknya keduanya memiliki keyakinan, sila, kemurahan hati, dan kebijaksanaan yang sama.',
      sumber: 'Anguttara Nikaya 4.55',
      alis: 'Namo Buddhaya',
      pengantar: 'Dengan penuh sukacita, kami bermaksud menyelenggarakan pernikahan putra-putri kami.',
      doaHitung: 'Semoga semua makhluk berbahagia, juga di hari yang kami nantikan.',
      selesai: 'Hari bahagia telah tiba.',
      hadir: 'Saya akan hadir',
      contohUcapan: 'Selamat menempuh hidup baru, semoga berbahagia...',
      salamTutup: 'Sabbe satta bhavantu sukhitatta'
    },
    umum: {
      nama: 'Umum (tanpa teks keagamaan)',
      basmalah: null,
      label: 'Undangan Pernikahan',
      ayat: null,
      salam: null,
      kutipan: null,
      sumber: null,
      alis: 'Dengan sukacita',
      pengantar: 'Dengan penuh sukacita, kami bermaksud menyelenggarakan pernikahan putra-putri kami.',
      doaHitung: 'Menghitung hari menuju hari bahagia kami.',
      selesai: 'Hari bahagia telah tiba.',
      hadir: 'Saya akan hadir',
      contohUcapan: 'Selamat menempuh hidup baru...',
      salamTutup: null
    }
  };

  function teksPembuka(kode) { return PEMBUKA[kode] || PEMBUKA.islam; }

  /* Memasang teks pembuka ke elemen bertanda data-pembuka="kunci".
     Nilai null menyembunyikan elemennya. Untuk <option> dan placeholder
     dipakai data-pembuka-placeholder. */
  function pasangPembuka(kode, akar) {
    var t = teksPembuka(kode), doc = global.document;
    if (!doc) return;
    if (doc.documentElement) doc.documentElement.setAttribute('data-pembuka', PEMBUKA[kode] ? kode : 'islam');
    (akar || doc).querySelectorAll('[data-pembuka]').forEach(function (el) {
      var k = el.getAttribute('data-pembuka'), v = t[k];
      if (!(k in t)) return;
      if (v == null) { el.hidden = true; return; }
      el.hidden = false;
      el.textContent = v;
    });
    (akar || doc).querySelectorAll('[data-pembuka-placeholder]').forEach(function (el) {
      var v = t[el.getAttribute('data-pembuka-placeholder')];
      if (v) el.setAttribute('placeholder', v);
    });
  }

  /* Tema yang sudah tertaut di HTML. Halaman memuatnya sebagai <link>
     biasa supaya tidak ada kedipan; kalau database menyebut tema lain,
     yang tertaut ditukar lewat gantiTema() di bawah. */
  var TEMA_BAWAAN = 'ukir-jepara';

  /* Dipakai cuma kalau tidak ada location sama sekali (di luar
     peramban). Dulu isinya subdomain Rian & 'Aini — sisa zaman satu
     pasangan, dan salah untuk setiap pasangan lain. */
  var SITUS_CADANGAN = 'https://mengundang.id';
  var SLUG_CADANGAN  = 'rian-aini';

  /* ---------- Wadah isi undangan ----------
     Kosong sampai muat() selesai. Jangan diganti dengan objek baru;
     isinya diganti di tempat supaya rujukan lama tetap sah. */
  var MEMPELAI = {};
  var TEMPAT   = {};
  var DOMPET   = {};
  var VARIAN   = {};
  var ACARA    = [];
  var SILSILAH = {};
  var DARI_KODE = {};
  /* Foto prewed per peran (migrasi 036). Bentuknya selalu lengkap. */
  var FOTO     = { sampul: null, pria: null, wanita: null, galeri: [] };

  var KONF = {
    siap: false,
    demo: false,
    slug: '',
    tema: '',
    temaSetel: {},
    pembuka: 'islam',
    status: '',
    canonicalHost: '',
    kota: '',
    situs: SITUS_CADANGAN,
    pihakBawaan: '',
    tanggalRingkas: '',
    tanggalAcara: '',
    mulai: ''
  };

  /* ---------- Pasangan mana yang sedang dibuka ----------
     rian-aini.mengundang.id  → rian-aini        (subdomain)
     mengundang.id/budi-sari/ → budi-sari        (segmen path pertama)  */

  /* Hanya di bawah domain ini label pertama berarti nama pasangan.
     Dulu syaratnya cuma "host punya tiga bagian", dan itu salah di
     tempat yang justru paling sering dibuka waktu membangun:
     undangan-rian-aini.vercel.app terbaca sebagai pasangan
     bernama "undangan-rian-aini" — tidak ada di database, jadi
     seluruh situs pratinjaunya berhenti di "Undangan belum tersedia".

     Kalau nanti ada pasangan dengan domain sendiri (bukan cuma
     subdomain di sini), daftar ini tidak bisa menampungnya: pasangannya
     harus dikenali dari host lewat database, bukan dari daftar tetap. */
  var DOMAIN_PLATFORM = { 'mengundang.id': 1 };

  var LOMPATI_HOST = { www: 1 };

  /* Nama-nama ini milik platform, bukan milik pasangan mana pun — semua
     terdaftar di tabel slug_terlarang, jadi tidak akan pernah jadi slug
     pasangan. Itu yang membuat daftar di sini aman: bukan tebakan, tapi
     cermin dari aturan yang dijaga database. */
  var JALUR_PLATFORM = {
    kirim: 1, dasbor: 1, terimakasih: 1, admin: 1, mulai: 1, coba: 1, reseller: 1, pemilik: 1,
    assets: 1, tema: 1
  };

  /* Apakah host ini subdomain milik satu pasangan. Dipakai bersama oleh
     slugPasangan() dan jalurCoba(); disalin jadi dua, keduanya cepat
     atau lambat beda perilaku. */
  function subdomainPasangan(host) {
    var bagian = String(host || '').toLowerCase().split(':')[0].split('.');
    if (bagian.length < 3) return null;
    if (!DOMAIN_PLATFORM[bagian.slice(1).join('.')]) return null;
    if (LOMPATI_HOST[bagian[0]]) return null;
    return bagian[0];
  }

  function segmen(jalur) {
    return jalur.split('/').filter(Boolean).map(function (x) {
      try { return decodeURIComponent(x); } catch (e) { return x; }
    });
  }

  function slugPasangan(host, jalur, cari) {
    host  = host  != null ? host  : (global.location ? location.hostname : '');
    jalur = jalur != null ? jalur : (global.location ? location.pathname : '');
    cari  = cari  != null ? cari  : (global.location ? location.search   : '');

    var sub = subdomainPasangan(host);
    if (sub) return sub;

    /* Di domain bersama, segmen pertama SELALU nama pasangan.
       Sebelum ini satu segmen dianggap nama tamu dan pasangannya jatuh
       ke cadangan — artinya mengundang.id/budi-sari, link polos milik
       Budi & Sari sendiri, membuka undangan Rian & 'Aini. Sekeluarga
       dengan lubang di panitia_*, buku tamu, dan undangan_tamu: data
       pasangan lain muncul di tempat pasangan ini. */
    var seg = segmen(jalur);
    if (seg.length && !JALUR_PLATFORM[seg[0].toLowerCase()]) return siput(seg[0]);

    /* Jalur milik platform — /terimakasih, /kirim — tidak punya tempat
       untuk slug pasangan di jalurnya sendiri, jadi di domain bersama
       pasangannya disebut lewat ?pasangan=. Sengaja DI BAWAH jalur:
       kalau jalurnya sudah menyebut pasangan, query tidak boleh
       menimpanya. */
    var dariCari = '';
    try { dariCari = new URLSearchParams(cari || '').get('pasangan') || ''; } catch (e) { dariCari = ''; }
    if (dariCari) return siput(dariCari);

    /* Akar domain bersama, tanpa petunjuk apa pun. Selama masih satu
       pasangan, cadangan ini yang menjawab. */
    return SLUG_CADANGAN;
  }

  /* Slug TAMU dari alamat. Aturannya cermin slugPasangan(), dan memang
     harus di sebelahnya: dua bentuk alamat menaruh nama tamu di tempat
     yang berbeda.

       rian-aini.mengundang.id/bapak-ahmad   → segmen pertama
       mengundang.id/rian-aini/bapak-ahmad   → segmen KEDUA

     Sebelum ini halaman memakai seluruh pathname apa adanya, jadi bentuk
     path menghasilkan slug tamu "rian-aini-bapak-ahmad" — tidak pernah
     ketemu, dan sampulnya mencetak "Rian Aini Bapak Ahmad". */
  function slugTamuDari(host, jalur) {
    host  = host  != null ? host  : (global.location ? location.hostname : '');
    jalur = jalur != null ? jalur : (global.location ? location.pathname : '');

    var seg = segmen(jalur).map(function (x) { return x.replace(/\.html$/i, ''); })
                           .filter(function (x) { return x && x.toLowerCase() !== 'index'; });
    if (!seg.length) return '';

    /* Di domain bersama, segmen pertama itu slug pasangan — kecuali
       kalau itu jalur platform, dan di sana tidak ada tamu sama sekali. */
    var ambil;
    if (subdomainPasangan(host))                    ambil = seg[0];
    else if (JALUR_PLATFORM[seg[0].toLowerCase()])  ambil = '';
    else                                            ambil = seg.length >= 2 ? seg[1] : '';
    return ambil ? siput(ambil) : '';
  }

  /* ---------- Memuat ---------- */
  /* ============================================================
     Mode coba — undangan contoh tanpa database sama sekali

     Dipakai halaman /coba, dan halamannya BUKAN tiruan: yang dibuka
     calon klien adalah index.html yang sama persis, dengan tema yang
     sama, gerak yang sama, dan gulir otomatis yang sama. Yang berbeda
     cuma dari mana isinya datang — dari alamat, bukan dari database.

     Tidak ada baris yang disimpan. Tidak ada pendaftaran, tidak ada
     nomor telepon yang mendarat di server kami, dan tidak ada barisan
     pasangan percobaan yang harus dibersihkan belakangan. Nomor calon
     pasangannya cuma dipakai peramban untuk menyusun link wa.me, dan
     berhenti di situ.
     ============================================================ */
  var SLUG_COBA = 'coba';

  var HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  var BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
               'Agustus','September','Oktober','November','Desember'];

  function bersihNama(t, bawaan) {
    var x = String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 30);
    /* Nama ini masuk ke halaman yang bisa dibagikan lewat tautan, jadi
       yang boleh lewat dibatasi huruf — bukan disandikan belakangan.
       Menyandikan masih menyisakan tautan yang isinya apa pun mau
       pengirimnya, dan tautan seperti itu bukan demo lagi. */
    x = x.replace(/[^\p{L}\p{M}0-9 .'’-]/gu, '');
    return x || bawaan;
  }

  function tanggalCoba(iso) {
    var d = iso ? new Date(iso + 'T00:00:00') : null;
    if (!d || isNaN(d)) {
      d = new Date();
      d.setDate(d.getDate() + 180);      /* kira-kira setengah tahun lagi */
    }
    return d;
  }

  function panjangnya(d) {
    return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function isoTanggal(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function jamISO(d, jam) {
    var x = new Date(d.getTime());
    x.setHours(jam, 0, 0, 0);
    return x.toISOString();
  }

  function isiCoba(cari) {
    var q = new URLSearchParams(cari != null ? cari
                                             : (global.location ? location.search : ''));
    var pria   = bersihNama(q.get('pria'),   'Budi');
    var wanita = bersihNama(q.get('wanita'), 'Sari');
    var kota   = bersihNama(q.get('kota'),   'Jepara');
    var d      = tanggalCoba(q.get('tgl'));
    var tgl    = panjangnya(d);

    function pihak(kode, sisi, label, ttdLabel) {
      var urutan = sisi === 'pria' ? ['pria', 'wanita'] : ['wanita', 'pria'];
      return {
        kode: kode, sisi: sisi, label: label,
        dompet: urutan.slice(),
        urutan: urutan,
        ttdNama: urutan.map(function (u) { return u === 'pria' ? pria : wanita; }),
        ttdLabel: ttdLabel,
        ttdSub: 'Beserta Keluarga'
      };
    }

    function tempat(nama) {
      return {
        nama: nama,
        alamat: 'Alamat lengkapnya diisi sendiri nanti, ' + kota,
        ringkas: 'Diisi sendiri nanti, ' + kota,
        maps: 'https://www.google.com/maps/search/' + encodeURIComponent(kota)
      };
    }

    function mempelai(panggilan, peran, anak) {
      return {
        panggilan: panggilan, lengkap: panggilan,
        peran: peran, anak: anak,
        ayah: 'Bapak —', ibu: 'Ibu —', ayahKet: null, ibuKet: null
      };
    }

    return {
      slug: SLUG_COBA,
      aktif: true,
      status: 'aktif',
      terbit: true,
      tema: TEMA_BAWAAN,
      kota: kota,
      tanggal_acara: isoTanggal(d),
      canonical_host: null,
      pihak_bawaan: 'keluarga-wanita',
      mempelai: {
        pria:   mempelai(pria,   'Mempelai Pria',   'Putra dari'),
        wanita: mempelai(wanita, 'Mempelai Wanita', 'Putri dari')
      },
      tempat: { pria: tempat('Kediaman Mempelai Putra'),
                wanita: tempat('Kediaman Mempelai Putri') },
      acara: [
        { nama:'Akad Nikah', tanggal:tgl, jam:'Pukul 08.00 WIB',
          ringkas:'Akad 08.00 WIB', mulai:jamISO(d, 8),  tempat:'wanita' },
        { nama:'Resepsi',    tanggal:tgl, jam:'Pukul 11.00 WIB — selesai',
          ringkas:'Resepsi 11.00 WIB', mulai:jamISO(d, 11), tempat:null }
      ],
      dompet: {
        pria:   { bank:'Contoh', nomor:'0000 0000 0000', an:'a.n. diisi sendiri di dasbor' },
        wanita: { bank:'Contoh', nomor:'1111 1111 1111', an:'a.n. diisi sendiri di dasbor' }
      },
      pihak: {
        'pria':            pihak('p',  'pria',   'Pengantin Pria',      'Kami yang berbahagia'),
        'wanita':          pihak('w',  'wanita', 'Pengantin Wanita',    'Kami yang berbahagia'),
        'keluarga-pria':   pihak('kp', 'pria',   'Keluarga Pihak Pria', 'Hormat kami'),
        'keluarga-wanita': pihak('kw', 'wanita', 'Keluarga Pihak Wanita','Hormat kami')
      },
      /* Kosong, jadi bagian silsilah tidak muncul sama sekali. Isinya
         foto keluarga sungguhan; menaruh nama karangan di sana justru
         membuat demonya terasa belum jadi. */
      silsilah: {}
    };
  }

  /* /coba adalah jalur PLATFORM, sebaris dengan /kirim dan /dasbor —
     bukan slug pasangan. Karena itu ia dikenali dari pathname, bukan
     dari slugPasangan(): di sana satu segmen justru berarti nama tamu,
     jadi /coba akan terbaca sebagai tamu bernama "coba" dan jatuh ke
     pasangan bawaan.

     Satu pengecualian, aturan yang sama: di subdomain milik pasangan,
     segmen pertama memang nama tamu. `rian-aini.mengundang.id/coba`
     tetap undangan untuk tamu itu, bukan demo. */
  function jalurCoba(host, jalur) {
    host  = host  != null ? host  : (global.location ? location.hostname : '');
    jalur = jalur != null ? jalur : (global.location ? location.pathname : '');
    if (subdomainPasangan(host)) return false;
    return jalur.split('/').filter(Boolean)[0] === SLUG_COBA;
  }

  var janji = null;

  function muat(slug) {
    if (janji) return janji;
    var s = slug || slugPasangan();

    /* Demo tidak menyentuh jaringan sama sekali — bukan sekadar lebih
       cepat, tapi supaya tidak ada satu pun jejak calon klien yang
       mendarat di server kami sebelum ia memutuskan apa pun. */
    if (jalurCoba()) {
      janji = Promise.resolve().then(function () {
        var d = isiCoba();
        pasang(d);
        KONF.demo  = true;
        KONF.situs = global.location ? location.origin : SITUS_CADANGAN;
        return gantiTema(KONF.tema, KONF.temaSetel).then(function () { return d; });
      });
      return janji;
    }

    janji = fetch(SB.url + '/rest/v1/rpc/undangan_isi', {
      method: 'POST',
      headers: {
        'apikey': SB.key,
        'Authorization': 'Bearer ' + SB.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_slug: s })
    }).then(function (r) {
      if (!r.ok) throw new Error('Gagal memuat undangan (HTTP ' + r.status + ')');
      return r.json();
    }).then(function (d) {
      if (!d || d.aktif !== true) {
        var e = new Error('Undangan belum tersedia');
        e.tidakAktif = true;
        throw e;
      }
      pasang(d);
      return gantiTema(KONF.tema, KONF.temaSetel).then(function () { return d; });
    });

    return janji;
  }

  function isiUlang(wadah, isi) {
    Object.keys(wadah).forEach(function (k) { delete wadah[k]; });
    Object.keys(isi || {}).forEach(function (k) { wadah[k] = isi[k]; });
  }

  function pasang(d) {
    isiUlang(MEMPELAI, d.mempelai);
    isiUlang(TEMPAT,   d.tempat);
    isiUlang(DOMPET,   d.dompet);
    isiUlang(VARIAN,   d.pihak);
    isiUlang(SILSILAH, d.silsilah);

    ACARA.length = 0;
    (d.acara || []).forEach(function (a) { ACARA.push(a); });

    isiUlang(DARI_KODE, {});
    Object.keys(VARIAN).forEach(function (k) { DARI_KODE[VARIAN[k].kode] = k; });

    KONF.demo          = false;
    KONF.slug          = d.slug || '';
    KONF.tema          = d.tema || '';
    KONF.pembuka       = PEMBUKA[d.pembuka] ? d.pembuka : 'islam';
    KONF.temaSetel     = (d.tema_setel && typeof d.tema_setel === 'object') ? d.tema_setel : {};

    /* Halaman dari zaman sebelum 036 tidak mengirim `foto`; bentuknya
       tetap dipenuhi supaya pemakai tidak perlu memeriksa kunci. */
    var f = d.foto || {};
    FOTO.sampul = f.sampul || null;
    FOTO.pria   = f.pria   || null;
    FOTO.wanita = f.wanita || null;
    FOTO.galeri.length = 0;
    (f.galeri || []).forEach(function (x) { FOTO.galeri.push(x); });
    KONF.status        = d.status || '';
    KONF.canonicalHost = d.canonical_host || '';
    KONF.kota          = d.kota || '';
    KONF.tanggalAcara  = d.tanggal_acara || '';
    /* Dihitung SESUDAH slug dan canonicalHost terpasang: inilah alamat
       pangkal undangan pasangan ini, dan bentuknya ikut paket. */
    KONF.situs         = alamatUndangan({ slug: KONF.slug, canonical_host: KONF.canonicalHost });
    KONF.pihakBawaan   = d.pihak_bawaan || Object.keys(VARIAN)[0] || '';

    /* Dulu dua nilai ini disimpan sendiri di ACARA[sisi]. Keduanya selalu
       sama dengan acara pertama, jadi diturunkan saja — satu sumber. */
    KONF.tanggalRingkas = ACARA.length ? ACARA[0].tanggal : '';
    KONF.mulai          = ACARA.length ? ACARA[0].mulai   : '';
    KONF.siap = true;
  }

  /* ============================================================
     Tema: berkas, palet, dan gaya teks

     Satu tema = satu folder di /tema/<kode>/ (docs/rencana-tema.md):
       gaya.css      tampilan halaman undangan
       kenangan.css  tampilan halaman terima kasih
       tema.json     manifest: palet dan gaya teks pilihan, bawaannya

     Palet dan gaya teks tidak ditulis di CSS tema — tema hanya memakai
     token (--latar, --aksen, --judul, …) yang nilai bawaannya ada di
     :root. Pilihan pasangan (pasangan.tema_setel) dipasang di sini
     sebagai style di <html>, menimpa nilai bawaan itu.

     Fungsi warna di bawah fungsi murni dan dipakai juga oleh dasbor dan
     tema/periksa-palet.mjs — satu rumus, bukan tiga salinan.
     ============================================================ */

  var KODE_TEMA = /^(custom\/)?[a-z0-9]+(-[a-z0-9]+)*$/;
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function hexRgb(h) {
    h = String(h || '').replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbHex(c) {
    return '#' + c.map(function (x) {
      return ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2);
    }).join('').toUpperCase();
  }

  /* a dicampur ke arah b sebanyak t (0..1) */
  function campur(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }

  function luminans(h) {
    var c = hexRgb(h).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /* Rasio kontras WCAG, 1..21 */
  function kontras(a, b) {
    var x = luminans(a), y = luminans(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* Palet ditulis cukup tiga warna — latar, teks, aksen. Sisanya boleh
     ditulis kalau perlu dijaga persis (ukir-jepara menjaga warnanya yang
     lama), dan kalau tidak, diturunkan dengan urutan ini. Urutan penting:
     yang belakangan boleh memakai yang lebih dulu. */
  var TURUNAN = [
    ['latar_2',      function (p) { return campur(p.latar, p.teks, 0.1); }],
    ['latar_3',      function (p) { return campur(p.latar, '#000000', 0.3); }],
    ['latar_tengah', function (p) { return campur(p.latar, p.latar_2, 0.5); }],
    ['bayang',       function (p) { return campur(p.latar_3, '#000000', 0.3); }],
    ['aksen_terang', function (p) { return campur(p.aksen, '#FFFFFF', 0.2); }],
    ['aksen_redup',  function (p) { return campur(p.aksen, p.latar, 0.35); }],
    ['kertas',       function (p) { return p.teks; }],
    ['kertas_teks',  function (p) { return p.latar; }],
    ['kertas_2',     function (p) { return campur(p.kertas, p.kertas_teks, 0.06); }],
    ['kertas_aksen', function (p) { return campur(p.aksen, p.kertas_teks, 0.35); }],
    ['ornamen',      function (p) { return p.kertas_aksen; }],
    /* Pasangan untuk teks di atas FOTO, apa pun terang-gelapnya palet:
       foto diredam dengan `gelap`, tulisannya `terang`. Tema berlatar
       terang (Dua Bingkai, Monokrom, …) tidak bisa memakai latar/teks
       di sana — teks gelap di atas foto yang diredam tidak terbaca. */
    ['gelap',        function (p) {
      var x = luminans(p.latar) < luminans(p.teks) ? p.latar : p.teks;
      return campur(x, '#000000', 0.35); }],
    ['terang',       function (p) { return luminans(p.latar) < luminans(p.teks) ? p.teks : p.latar; }]
  ];

  function paletLengkap(p) {
    var hasil = { latar: p.latar, teks: p.teks, aksen: p.aksen };
    TURUNAN.forEach(function (t) {
      hasil[t[0]] = HEX.test(p[t[0]] || '') ? p[t[0]] : t[1](hasil);
    });
    return hasil;
  }

  /* Syarat terbaca. Teks utama di kedua permukaan ≥ 7:1 (AAA), aksen dan
     label kertas ≥ 3:1 — batas WCAG untuk teks besar dan ornamen. Aksen
     tidak boleh dipakai untuk teks kecil di tema mana pun. */
  var SYARAT_KONTRAS = [
    ['teks', 'latar', 7], ['kertas_teks', 'kertas', 7],
    ['aksen', 'latar', 3], ['kertas_aksen', 'kertas', 3],
    ['terang', 'gelap', 7]
  ];

  function periksaPalet(p) {
    var salah = [];
    ['latar', 'teks', 'aksen'].forEach(function (k) {
      if (!HEX.test((p && p[k]) || '')) salah.push(k + ' bukan warna #RRGGBB');
    });
    if (salah.length) return salah;
    var l = paletLengkap(p);
    SYARAT_KONTRAS.forEach(function (s) {
      var k = kontras(l[s[0]], l[s[1]]);
      if (k < s[2]) salah.push(s[0] + ' / ' + s[1] + ' ' + k.toFixed(2) + ' < ' + s[2]);
    });
    return salah;
  }

  /* ---------- Palet dari foto (docs/rencana-tema.md 2.4) ----------
     Dari piksel foto sampul (RGBA, sudah dikecilkan di canvas) ke palet
     tema terang yang PASTI lulus periksaPalet:
       · rona utama = rona yang paling banyak dan paling hidup di foto
       · latar & kertas = rona itu, sangat terang dan pucat (kertas pasir
         untuk foto senja, kertas lumut untuk foto hutan)
       · teks = rona itu, sangat gelap
       · aksen = rona paling hidup, digelapkan sampai kontrasnya cukup
     Foto hitam putih (tanpa rona) menghasilkan palet netral.
     Fungsi murni: dipakai dasbor (canvas) dan diuji di Node. */
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    var t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgbHex(t.map(function (v) { return (v + m) * 255; }));
  }

  function keHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, s, l];
  }

  /* Gelapkan (atau terangkan) warna dengan rona tetap sampai kontrasnya
     terhadap `alas` mencapai `batas`. */
  function cukupKontras(h, s, l, alas, batas) {
    var w = hsl(h, s, l);
    for (var i = 0; i < 60 && kontras(w, alas) < batas; i++) { l -= 0.01; w = hsl(h, s, Math.max(0, l)); }
    return w;
  }

  function paletDariPiksel(data) {
    var BIN = 24, berat = [], jenuh = [], n = 0, sumS = 0;
    for (var b = 0; b < BIN; b++) { berat[b] = 0; jenuh[b] = []; }
    for (var i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      var c = keHsl(data[i], data[i + 1], data[i + 2]);
      n++; sumS += c[1];
      if (c[1] < 0.12 || c[2] < 0.12 || c[2] > 0.92) continue;   // abu-abu, hitam, putih: tanpa rona
      var k = Math.floor(c[0] / (360 / BIN)) % BIN;
      berat[k] += c[1] * (1 - Math.abs(c[2] - 0.5));
      jenuh[k].push(c[1]);
    }
    var puncak = 0;
    for (b = 1; b < BIN; b++) if (berat[b] > berat[puncak]) puncak = b;
    var netral = !n || berat[puncak] < n * 0.02;
    var h = (puncak + 0.5) * (360 / BIN);
    var sAksen = 0.03;
    if (!netral) {
      var j = jenuh[puncak].sort(function (x, y) { return x - y; });
      sAksen = Math.max(0.3, Math.min(0.65, j[Math.floor(j.length * 0.6)] || 0.4));
    }
    var sLatar = netral ? 0.04 : Math.min(0.32, 0.12 + (sumS / Math.max(n, 1)) * 0.3);

    var latar  = hsl(h, sLatar, 0.94);
    var kertas = hsl(h, sLatar * 0.8, 0.975);
    var teks   = cukupKontras(h, netral ? 0.06 : 0.28, 0.2, latar, 9);
    var aksen  = cukupKontras(h, sAksen, 0.46, latar, 3.4);
    return {
      latar: latar, teks: teks, aksen: aksen,
      latar_2: hsl(h, sLatar, 0.89),
      kertas: kertas, kertas_2: hsl(h, sLatar, 0.9),
      kertas_teks: teks,
      kertas_aksen: cukupKontras(h, sAksen, 0.4, kertas, 4.5),
      ornamen: aksen
    };
  }

  var KUNCI_PALET = ['latar', 'teks', 'aksen', 'latar_2', 'latar_3', 'latar_tengah', 'bayang', 'aksen_terang',
                     'aksen_redup', 'kertas', 'kertas_2', 'kertas_teks', 'kertas_aksen', 'ornamen'];

  function tokenPalet(p) {
    var l = paletLengkap(p), t = {};
    Object.keys(l).forEach(function (k) { t['--' + k.replace(/_/g, '-')] = l[k]; });
    ['latar', 'latar_3', 'bayang', 'teks', 'aksen', 'kertas_teks', 'ornamen', 'gelap', 'terang'].forEach(function (k) {
      t['--' + k.replace(/_/g, '-') + '-rgb'] = hexRgb(l[k]).join(',');
    });
    return t;
  }

  /* Gaya teks juga menentukan apakah judul ditulis kapital berjarak
     (Monokrom "Majalah") — selalu dikirim, supaya pilihan sebelumnya
     tidak tertinggal. */
  function tokenHuruf(h) {
    var t = {};
    ['judul', 'naskah', 'isi'].forEach(function (k) { if (h && h[k]) t['--' + k] = h[k]; });
    t['--judul-kapital'] = h && h.kapital ? 'uppercase' : 'none';
    t['--judul-jarak'] = (h && h.jarak) || 'normal';
    return t;
  }

  function cariKode(daftar, kode) {
    for (var i = 0; i < (daftar || []).length; i++) if (daftar[i].kode === kode) return daftar[i];
    return null;
  }

  /* Pilihan pasangan → palet dan gaya teks yang benar-benar dipakai.
     Kode yang tidak dikenal (palet dihapus dari tema, tema diganti)
     jatuh ke bawaan, tidak pernah ke halaman tanpa warna. Palet "foto"
     hanya dipakai bila temanya mengizinkan dan warnanya lulus kontras. */
  function pilihanTema(m, setel) {
    setel = setel || {};
    var bawaan = m.bawaan || {};
    var palet = null;
    if (setel.palet === 'foto' && m.palet_foto && setel.palet_foto &&
        !periksaPalet(setel.palet_foto).length) {
      palet = { kode: 'foto', nama: 'Dari foto' };
      KUNCI_PALET.forEach(function (k) {
        if (HEX.test(setel.palet_foto[k] || '')) palet[k] = setel.palet_foto[k];
      });
    }
    var huruf = cariKode(m.huruf, setel.huruf) || cariKode(m.huruf, bawaan.huruf) || (m.huruf || [])[0] || null;

    /* Setelan khas tema (misal mode potret Dua Bingkai): nilai yang
       tidak ada di daftar pilihannya jatuh ke pilihan pertama. */
    var setelan = {};
    (m.setelan || []).forEach(function (st) {
      var ada = cariKode(st.pilihan, setel[st.kode]);
      setelan[st.kode] = ada ? ada.kode : ((st.pilihan || [])[0] || {}).kode;
    });

    /* Palet bertanda daerah: tanpa pilihan warna, daerah yang dipilih
       memakai warna pertamanya (Bali → Prada), bukan bawaan tema. */
    var dariDaerah = null;
    if (setelan.daerah && !cariKode(m.palet, setel.palet)) {
      (m.palet || []).some(function (pl) { if (pl.daerah === setelan.daerah) { dariDaerah = pl; return true; } return false; });
    }
    palet = palet || cariKode(m.palet, setel.palet) || dariDaerah || cariKode(m.palet, bawaan.palet) || (m.palet || [])[0] || null;
    return { palet: palet, huruf: huruf, setelan: setelan,
             hurufBawaan: (huruf && huruf.kode === bawaan.huruf) };
  }

  /* Ornamen milik tema. Halaman menggambar ornamen lewat
     <use href="#ukir-pemisah"> dan kawan-kawan; tema yang punya ornamen
     sendiri menunjuknya di manifest:
       "ornamen": { "ukir-pemisah": "ornamen.svg#pemisah", … }
     dan rujukannya ditukar ke berkas tema itu. Dipanggil lagi oleh
     halaman sesudah menggambar ornamen baru. */
  /* Berkas ornamen boleh bergantung pada setelan: "ornamen-{daerah}.svg"
     memakai nilai setelan `daerah`. Pilihan setelan yang bertanda
     "ornamen_bawaan": true memakai ornamen yang tertanam di halaman
     (ukir-jepara: daerah Jawa), tanpa berkas tambahan. */
  function berkasOrnamen(m, ke) {
    var bawaan = false;
    (m.setelan || []).forEach(function (st) {
      var pl = cariKode(st.pilihan, TEMA_AKTIF.setelan[st.kode]);
      if (pl && pl.ornamen_bawaan && ke.indexOf('{' + st.kode + '}') >= 0) bawaan = true;
    });
    if (bawaan) return null;
    ke = ke.replace(/\{([a-z0-9_]+)\}/g, function (_, k) { return TEMA_AKTIF.setelan[k] || ''; });
    return /^[a-z0-9-]+\.svg#[a-z0-9-]+$/.test(ke) ? ke : null;
  }

  function pasangOrnamen(akar) {
    var m = TEMA_AKTIF.manifest, doc = global.document;
    if (!doc || !m || !m.ornamen) return;
    (akar || doc).querySelectorAll('use').forEach(function (u) {
      var h = u.getAttribute('href') || '';
      var ke = h.charAt(0) === '#' && m.ornamen[h.slice(1)];
      ke = ke && berkasOrnamen(m, ke);
      if (ke) u.setAttribute('href', '/tema/' + TEMA_AKTIF.kode + '/' + ke);
    });
  }

  var MANIFEST = {};
  function muatManifest(kode) {
    if (!KODE_TEMA.test(kode || '')) return Promise.resolve(null);
    if (!MANIFEST[kode]) {
      MANIFEST[kode] = (typeof fetch === 'function'
        ? fetch('/tema/' + kode + '/tema.json').then(function (r) { return r.ok ? r.json() : null; })
        : Promise.resolve(null)).catch(function () { return null; });
    }
    return MANIFEST[kode];
  }

  /* Menukar berkas tema, lalu MENUNGGU sampai berkas penggantinya benar-
     benar termuat. Tanpa menunggu, halaman sempat digambar dengan tema
     lama sementara tema barunya menyusul — dan itu persis kedipan yang
     ingin dihindari.

     Kalau gagal termuat, tema lama dibiarkan berdiri. Undangan dengan
     tampilan yang bukan pilihannya masih jauh lebih baik daripada
     undangan tanpa tampilan sama sekali.

     `berkas` gaya.css untuk undangan, kenangan.css untuk halaman terima
     kasih. <link id="temaGaya"> di halaman menunjuk berkas bawaan. */
  function tukarBerkas(nama, berkas) {
    var tautan = global.document && document.getElementById('temaGaya');
    if (!tautan) return Promise.resolve(false);
    var href = '/tema/' + nama + '/' + berkas;
    if (tautan.getAttribute('href') === href) return Promise.resolve(false);

    return new Promise(function (selesai) {
      var baru = document.createElement('link');
      baru.rel = 'stylesheet';
      baru.href = href;

      var sudah = false;
      function tuntas(berhasil) {
        if (sudah) return;
        sudah = true;
        if (berhasil) { tautan.parentNode.removeChild(tautan); baru.id = 'temaGaya'; }
        else if (baru.parentNode) baru.parentNode.removeChild(baru);
        selesai(berhasil);
      }

      baru.onload  = function () { tuntas(true); };
      baru.onerror = function () { tuntas(false); };
      /* Jaring pengaman: onload css tidak selalu menyala di semua
         peramban lama. */
      setTimeout(function () { tuntas(true); }, 3000);

      tautan.parentNode.insertBefore(baru, tautan.nextSibling);
    });
  }

  /* Gaya teks selain bawaan membawa tautan Google Fonts-nya sendiri.
     Ditunggu sampai hurufnya siap, paling lama 1,5 detik — sesudah itu
     halaman jalan terus dengan huruf cadangan dan bertukar sendiri saat
     hurufnya tiba. */
  function pasangHuruf(h) {
    var doc = global.document;
    if (!doc || !h || !h.google) return Promise.resolve();
    var lama = doc.getElementById('temaHuruf');
    var href = 'https://fonts.googleapis.com/css2?' + h.google + '&display=swap';
    if (lama && lama.getAttribute('href') === href) return Promise.resolve();
    var l = doc.createElement('link');
    l.rel = 'stylesheet'; l.id = 'temaHuruf'; l.href = href;
    if (lama) lama.parentNode.replaceChild(l, lama); else doc.head.appendChild(l);

    var tunggu = new Promise(function (selesai) {
      l.onload = function () {
        if (!doc.fonts || !doc.fonts.load) return selesai();
        Promise.all(['judul', 'naskah', 'isi'].map(function (k) {
          return h[k] ? doc.fonts.load('1em ' + h[k]).catch(function () {}) : null;
        })).then(function () { selesai(); }, function () { selesai(); });
      };
      l.onerror = function () { selesai(); };
    });
    return Promise.race([tunggu, new Promise(function (s) { setTimeout(s, 1500); })]);
  }

  function pasangToken(t) {
    var root = global.document && document.documentElement;
    if (!root) return;
    Object.keys(t).forEach(function (k) { root.style.setProperty(k, t[k]); });
  }

  /* Pratinjau dari dasbor: ?pratinjau=1&tema=…&palet=…&huruf=… menimpa
     pilihan yang tersimpan, hanya di peramban yang membukanya. */
  function timpaPratinjau(nama, setel) {
    var q;
    try { q = new URLSearchParams(global.location ? location.search : ''); } catch (e) { return null; }
    if (q.get('pratinjau') !== '1') return null;
    var s = {}; Object.keys(setel || {}).forEach(function (k) { s[k] = setel[k]; });
    if (q.get('palet')) s.palet = q.get('palet');
    if (q.get('huruf')) s.huruf = q.get('huruf');
    var t = q.get('tema');
    return { nama: KODE_TEMA.test(t || '') ? t : nama, setel: s };
  }

  var TEMA_AKTIF = { kode: '', palet: '', huruf: '', setelan: {}, manifest: null };

  /* Memasang tema lengkap: berkas, palet, gaya teks. Selesai = boleh
     membuka sampul. Apa pun yang gagal di sini jatuh ke bawaan; tidak
     ada jalur yang meninggalkan halaman tanpa tampilan. */
  function pasangTema(nama, setel, berkas) {
    if (!KODE_TEMA.test(nama || '')) nama = TEMA_BAWAAN;
    berkas = berkas || 'gaya.css';
    var timpa = timpaPratinjau(nama, setel);
    if (timpa) { nama = timpa.nama; setel = timpa.setel; }

    var root = global.document && document.documentElement;

    /* Manifest dulu, baru berkasnya. Tema yang foldernya tidak ada
       (dihapus, salah ketik di database) tidak pernah dipasang: lapisan
       aset menjawab alamat yang tidak ada dengan index.html, dan
       peramban akan menukar tema yang sah dengan "stylesheet" kosong. */
    return muatManifest(nama).then(function (m) {
      if (!m && nama !== TEMA_BAWAAN) {
        nama = TEMA_BAWAAN;
        return muatManifest(nama).then(function (mb) { return pasangDengan(mb); });
      }
      return pasangDengan(m);
    });

    function pasangDengan(m) {
      if (root) root.setAttribute('data-tema', nama);
      TEMA_AKTIF.kode = nama;
      var berkasSiap = nama === TEMA_BAWAAN && berkas === 'gaya.css'
        ? Promise.resolve(false)
        : tukarBerkas(nama, berkas);
      return Promise.all([berkasSiap, pasangPilihan(m)]).then(function (h) { return h[0]; });
    }

    function pasangPilihan(m) {
      TEMA_AKTIF.manifest = m || null;
      if (!m) return;
      var p = pilihanTema(m, setel);
      TEMA_AKTIF.setelan = p.setelan;
      /* Setelan juga jadi atribut <html data-…> supaya CSS tema bisa
         membacanya (Monokrom: foto hitam putih atau berwarna). */
      if (root) Object.keys(p.setelan).forEach(function (k) {
        root.setAttribute('data-' + k.replace(/_/g, '-'), p.setelan[k]);
      });
      pasangOrnamen();
      if (p.palet) { pasangToken(tokenPalet(p.palet)); TEMA_AKTIF.palet = p.palet.kode; }
      if (p.huruf) { pasangToken(tokenHuruf(p.huruf)); TEMA_AKTIF.huruf = p.huruf.kode; }
      if (root) {
        root.setAttribute('data-palet', TEMA_AKTIF.palet);
        root.setAttribute('data-huruf', TEMA_AKTIF.huruf);
      }
      /* Huruf bawaan sudah di-@import oleh berkas temanya sendiri. */
      if (p.huruf && !p.hurufBawaan) return pasangHuruf(p.huruf);
    }
  }

  /* Nama lama, dipertahankan untuk pemanggil yang sudah ada. */
  function gantiTema(nama, setel) { return pasangTema(nama, setel, 'gaya.css'); }

  function pastikanSiap() {
    if (!KONF.siap) {
      throw new Error('MENGUNDANG.muat() belum selesai dipanggil');
    }
  }

  /* ============================================================
     Pembantu — fungsi murni, tidak berubah dari sebelumnya
     ============================================================ */

  function pihakSah(p) {
    if (!p) return null;
    p = String(p).trim().toLowerCase();
    if (VARIAN[p]) return p;
    if (DARI_KODE[p]) return DARI_KODE[p];
    return null;
  }

  function varian(pihak) {
    pastikanSiap();
    return VARIAN[pihakSah(pihak) || KONF.pihakBawaan];
  }

  function tempatVarian(v) { return TEMPAT[v.sisi] || TEMPAT.wanita; }

  /* Rangkaian acaranya satu untuk semua pihak — yang berpindah cuma
     tempatnya, dan itu ditentukan per acara. Bentuk kembaliannya
     dipertahankan supaya pemanggil lama tidak perlu diubah. */
  function acaraVarian(v) {
    return {
      daftar: ACARA,
      mulai: KONF.mulai,
      tanggalRingkas: KONF.tanggalRingkas
    };
  }

  /* tempat sebuah acara: yang dikunci di acara itu, kalau tidak ada
     baru ikut sisi keluarga tamunya */
  function tempatAcara(v, ac) {
    if (ac && ac.tempat && TEMPAT[ac.tempat]) return TEMPAT[ac.tempat];
    return tempatVarian(v);
  }

  function acaraBertempat(v) {
    return ACARA.map(function (ac) {
      return { acara: ac, tempat: tempatAcara(v, ac) };
    });
  }

  function satuTempat(daftar) {
    return daftar.every(function (d) { return d.tempat === daftar[0].tempat; });
  }

  /* "Bapak Ahmad Fauzi" → "bapak-ahmad-fauzi" */
  function siput(nama) {
    var s = String(nama == null ? '' : nama).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80)
            .replace(/-+$/, '');
  }

  /* 08xx / +62xx / 62 xx / 8xx → 62xxxxxxxxxx */
  function nomorRapi(mentah) {
    var d = String(mentah == null ? '' : mentah).replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('62') === 0) return d;
    if (d.indexOf('0')  === 0) return '62' + d.slice(1);
    if (d.indexOf('8')  === 0) return '62' + d;
    return d;
  }

  var SAPAAN = /\b(bapak|bpk|pak|ibu|bu|mas|mbak|mbk|saudara|saudari|sdr|sdri|kakak|kak|adik|dek|haji|hajjah|hj|h|drs|dra|ir|dr|s\.?pd|s\.?e|s\.?h|s\.?t|m\.?pd|sekeluarga|keluarga|besar)\b/g;

  function kunciNama(nama) {
    return String(nama || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(SAPAAN, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- Alamat publik sebuah foto ----------
     Ada di sini, bukan di assets/gambar.js, karena ini soal jalur
     penyimpanan — bukan soal mengecilkan gambar. Halaman undangan perlu
     membangun alamat foto silsilah, tapi tidak perlu pengecilnya: tamu
     tidak pernah mengunggah apa pun, dan mengirimi mereka 7 KB pustaka
     yang tak terpakai itu mahal di jaringan desa. */
  /* Foto dan video pasangan dilayani Worker di /media/ (R2, cache edge
     Cloudflare) — di host mana pun halaman ini dibuka, tanpa egress
     Supabase. Berkas lama yang masih di Supabase Storage disalin Worker
     ke R2 saat pertama dibuka (cloudflare/media.js). */
  function fotoUrl(jalur) {
    if (!jalur) return '';
    return '/media/' + jalur;
  }

  /* ---------- Alamat, dua bentuk ----------
     Bentuknya ditentukan paket, dan paket sudah diterjemahkan jadi
     canonical_host di database (migrasi 023):

       premium : https://rian-aini.mengundang.id
       standar : https://mengundang.id/rian-aini

     Keduanya pure function yang menerima pasangannya sebagai argumen,
     bukan membaca KONF — halaman admin membangun alamat untuk pasangan
     LAIN, dan versi keduanya yang disalin ke sana cepat atau lambat
     beda perilaku dari yang ini. */
  function asalSekarang() {
    return (global.location ? location.origin : SITUS_CADANGAN).replace(/\/+$/, '');
  }

  function alamatUndangan(pas) {
    var host = (pas && (pas.canonical_host || pas.canonicalHost)) || '';
    if (host) return 'https://' + String(host).replace(/^https?:\/\//, '').replace(/\/+$/, '');

    /* Sedang dibuka DI subdomain pasangan padahal canonical_host belum
       terisi: alamat tamu tetap langsung di akar. Mengulang slug di
       jalur akan menghasilkan rian-aini.mengundang.id/rian-aini/…. */
    if (subdomainPasangan(global.location ? location.hostname : '')) return asalSekarang();

    return asalSekarang() + '/' + ((pas && pas.slug) || '');
  }

  /* Halaman milik platform — /terimakasih, /kirim — tidak bisa ikut
     bentuk jalur. mengundang.id/rian-aini/terimakasih akan terbaca
     sebagai undangan untuk tamu bernama "terimakasih", dan memang
     begitulah rewrite Vercel menyajikannya. Di domain bersama
     pasangannya disebut lewat ?pasangan=. */
  function alamatPlatform(pas, jalur, cari) {
    jalur = '/' + String(jalur || '').replace(/^\/+/, '');
    cari  = String(cari || '').replace(/^[?&]+/, '');

    var host = (pas && (pas.canonical_host || pas.canonicalHost)) || '';
    var pakaiJalurSendiri = !!host || !!subdomainPasangan(global.location ? location.hostname : '');
    var pangkal = host ? 'https://' + String(host).replace(/^https?:\/\//, '').replace(/\/+$/, '')
                       : asalSekarang();

    if (pakaiJalurSendiri) return pangkal + jalur + (cari ? '?' + cari : '');

    return pangkal + jalur + '?' + (cari ? cari + '&' : '')
         + 'pasangan=' + encodeURIComponent((pas && pas.slug) || '');
  }

  /* Pratinjau pemilik: selalu di ASAL YANG SAMA dengan halaman yang
     memanggilnya. Sesi dasbor tinggal di localStorage asal itu, dan
     subdomain pasangan premium adalah asal yang lain — membuka
     pratinjau di sana berarti membuka halaman yang tidak tahu siapa
     pemiliknya. Di subdomain pasangan, pasangannya sudah tersirat. */
  function alamatPratinjau(pas, jalur) {
    jalur = '/' + String(jalur || '').replace(/^\/+/, '');
    var diSub = !!subdomainPasangan(global.location ? location.hostname : '');
    return asalSekarang() + jalur + '?'
         + (diSub ? '' : 'pasangan=' + encodeURIComponent((pas && pas.slug) || '') + '&')
         + 'pratinjau=1';
  }

  function pasanganIni() {
    return { slug: KONF.slug, canonical_host: KONF.canonicalHost };
  }

  function linkTamu(slug, pihak) {
    var v = pihakSah(pihak);
    return alamatUndangan(pasanganIni()) + '/' + slug + (v ? '?p=' + VARIAN[v].kode : '');
  }

  function linkPlatform(jalur, cari) {
    return alamatPlatform(pasanganIni(), jalur, cari);
  }

  function pesanWA(nama, slug, pihak) {
    var v      = varian(pihak);
    var a      = acaraVarian(v);
    var daftar = acaraBertempat(v);
    var ur     = v.ttdNama[0] + " & " + v.ttdNama[1];

    var blok;
    if (satuTempat(daftar)) {
      var t = daftar[0].tempat;
      blok = daftar.map(function (d) { return d.acara.ringkas; }).join('\n')
           + "\n" + t.nama + "\n" + t.ringkas;
    } else {
      blok = daftar.map(function (d) {
        return d.acara.ringkas + "\n" + d.tempat.nama + "\n" + d.tempat.ringkas;
      }).join("\n\n");
    }

    /* Salam pembuka dan penutup mengikuti agama pasangan (037); pembuka
       "umum" tidak memakai salam sama sekali. */
    var tp = teksPembuka(KONF.pembuka);
    return (tp.salam ? tp.salam + "\n\n" : "")
      + "Yth. Bapak/Ibu/Saudara/i\n"
      + "*" + nama + "*\n\n"
      + "Tanpa mengurangi rasa hormat, kami bermaksud mengundang Anda untuk hadir pada acara pernikahan kami:\n\n"
      + "*" + ur + "*\n\n"
      + a.tanggalRingkas + "\n\n"
      + blok + "\n\n"
      + "Detail lengkap, lokasi, dan konfirmasi kehadiran dapat dibuka di:\n"
      + linkTamu(slug, pihak) + "\n\n"
      + "Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir untuk memberikan doa restu.\n\n"
      + (tp.salamTutup ? tp.salamTutup + "\n\n" : "")
      + v.ttdLabel + ",\n"
      + ur;
  }

  var API = {
    SB: SB,
    BACKSOUND_URL: BACKSOUND_URL,

    MEMPELAI: MEMPELAI,
    TEMPAT: TEMPAT,
    ACARA: ACARA,
    SILSILAH: SILSILAH,
    FOTO: FOTO,
    DOMPET: DOMPET,
    VARIAN: VARIAN,
    KONF: KONF,

    muat: muat,
    PEMBUKA: PEMBUKA,
    teksPembuka: teksPembuka,
    pasangPembuka: pasangPembuka,
    TEMA_BAWAAN: TEMA_BAWAAN,
    pasangTema: pasangTema,
    tema: {
      KODE: KODE_TEMA,
      AKTIF: TEMA_AKTIF,
      SYARAT_KONTRAS: SYARAT_KONTRAS,
      campur: campur,
      kontras: kontras,
      paletLengkap: paletLengkap,
      paletDariPiksel: paletDariPiksel,
      periksaPalet: periksaPalet,
      tokenPalet: tokenPalet,
      tokenHuruf: tokenHuruf,
      pilihan: pilihanTema,
      pasangOrnamen: pasangOrnamen,
      manifest: muatManifest
    },
    slugPasangan: slugPasangan,
    slugTamuDari: slugTamuDari,
    SLUG_COBA: SLUG_COBA,
    isiCoba: isiCoba,
    jalurCoba: jalurCoba,
    pihakSah: pihakSah,
    varian: varian,
    tempatVarian: tempatVarian,
    acaraVarian: acaraVarian,
    tempatAcara: tempatAcara,
    acaraBertempat: acaraBertempat,
    satuTempat: satuTempat,
    fotoUrl: fotoUrl,
    siput: siput,
    nomorRapi: nomorRapi,
    kunciNama: kunciNama,
    linkTamu: linkTamu,
    linkPlatform: linkPlatform,
    alamatUndangan: alamatUndangan,
    alamatPlatform: alamatPlatform,
    alamatPratinjau: alamatPratinjau,
    pesanWA: pesanWA
  };

  /* SITUS dan PIHAK_BAWAAN dulu berupa nilai tetap. Nilainya sekarang baru
     diketahui sesudah muat(), dan string tidak bisa diubah di tempat —
     jadi keduanya jadi properti baca yang mengambil nilai terkini. */
  Object.defineProperty(API, 'SITUS', {
    enumerable: true, get: function () { return KONF.situs; }
  });
  Object.defineProperty(API, 'PIHAK_BAWAAN', {
    enumerable: true, get: function () { return KONF.pihakBawaan; }
  });

  global.MENGUNDANG = API;
})(typeof window !== 'undefined' ? window : globalThis);
