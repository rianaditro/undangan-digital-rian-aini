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

  var KONF = {
    siap: false,
    demo: false,
    slug: '',
    tema: '',
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
    kirim: 1, dasbor: 1, terimakasih: 1, admin: 1, mulai: 1, coba: 1,
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
        return gantiTema(KONF.tema).then(function () { return d; });
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
      return gantiTema(KONF.tema).then(function () { return d; });
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

  /* Menukar berkas tema, lalu MENUNGGU sampai berkas penggantinya benar-
     benar termuat. Tanpa menunggu, halaman sempat digambar dengan tema
     lama sementara tema barunya menyusul — dan itu persis kedipan yang
     ingin dihindari.

     Kalau gagal termuat, tema lama dibiarkan berdiri. Undangan dengan
     tampilan yang bukan pilihannya masih jauh lebih baik daripada
     undangan tanpa tampilan sama sekali. */
  function gantiTema(nama) {
    if (!nama || nama === TEMA_BAWAAN) return Promise.resolve(false);

    var tautan = global.document && document.getElementById('temaGaya');
    if (!tautan) return Promise.resolve(false);

    return new Promise(function (selesai) {
      var baru = document.createElement('link');
      baru.rel = 'stylesheet';
      baru.href = '/tema/' + nama + '/gaya.css';

      var sudah = false;
      function tuntas(berhasil) {
        if (sudah) return;
        sudah = true;
        if (berhasil) tautan.parentNode.removeChild(tautan);
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
  function fotoUrl(jalur) {
    if (!jalur) return '';
    return SB.url + '/storage/v1/object/public/foto/' + jalur;
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

    return "Assalamu'alaikum Warahmatullahi Wabarakatuh\n\n"
      + "Yth. Bapak/Ibu/Saudara/i\n"
      + "*" + nama + "*\n\n"
      + "Tanpa mengurangi rasa hormat, kami bermaksud mengundang Anda untuk hadir pada acara pernikahan kami:\n\n"
      + "*" + ur + "*\n\n"
      + a.tanggalRingkas + "\n\n"
      + blok + "\n\n"
      + "Detail lengkap, lokasi, dan konfirmasi kehadiran dapat dibuka di:\n"
      + linkTamu(slug, pihak) + "\n\n"
      + "Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir untuk memberikan doa restu.\n\n"
      + "Wassalamu'alaikum Warahmatullahi Wabarakatuh\n\n"
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
    DOMPET: DOMPET,
    VARIAN: VARIAN,
    KONF: KONF,

    muat: muat,
    TEMA_BAWAAN: TEMA_BAWAAN,
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
