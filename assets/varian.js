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

  /* Dipakai kalau database tidak menyebut canonical_host. */
  var SITUS_CADANGAN = 'https://rian-aini.mengundang.id';
  var SLUG_CADANGAN  = 'rian-aini';

  /* ---------- Wadah isi undangan ----------
     Kosong sampai muat() selesai. Jangan diganti dengan objek baru;
     isinya diganti di tempat supaya rujukan lama tetap sah. */
  var MEMPELAI = {};
  var TEMPAT   = {};
  var DOMPET   = {};
  var VARIAN   = {};
  var ACARA    = [];
  var DARI_KODE = {};

  var KONF = {
    siap: false,
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
     mengundang.id/budi-sari/ → budi-sari        (segmen path pertama)

     Alamat IP tidak diperlakukan sebagai subdomain: 127.0.0.1 akan
     terbaca sebagai slug "127" dan halamannya diam-diam kosong waktu
     dites lokal. */
  var LOMPATI_HOST = { www: 1, mengundang: 1, localhost: 1 };

  function slugPasangan(host, jalur) {
    host  = host  != null ? host  : (global.location ? location.hostname : '');
    jalur = jalur != null ? jalur : (global.location ? location.pathname : '');

    var sepertiIP = /^[0-9.]+$/.test(host) || host.indexOf(':') !== -1;
    var bagian = host.split('.');

    if (!sepertiIP && bagian.length >= 3 && !LOMPATI_HOST[bagian[0]]) {
      return bagian[0];
    }

    /* Bentuk path hanya berlaku bila ada segmen sesudahnya — satu segmen
       saja adalah slug tamu di undangan, bukan slug pasangan. */
    var seg = jalur.split('/').filter(Boolean);
    if (seg.length >= 2) return seg[0];

    return SLUG_CADANGAN;
  }

  /* ---------- Memuat ---------- */
  var janji = null;

  function muat(slug) {
    if (janji) return janji;
    var s = slug || slugPasangan();

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
      return d;
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

    ACARA.length = 0;
    (d.acara || []).forEach(function (a) { ACARA.push(a); });

    isiUlang(DARI_KODE, {});
    Object.keys(VARIAN).forEach(function (k) { DARI_KODE[VARIAN[k].kode] = k; });

    KONF.slug          = d.slug || '';
    KONF.tema          = d.tema || '';
    KONF.status        = d.status || '';
    KONF.canonicalHost = d.canonical_host || '';
    KONF.kota          = d.kota || '';
    KONF.tanggalAcara  = d.tanggal_acara || '';
    KONF.situs         = d.canonical_host ? 'https://' + d.canonical_host : SITUS_CADANGAN;
    KONF.pihakBawaan   = d.pihak_bawaan || Object.keys(VARIAN)[0] || '';

    /* Dulu dua nilai ini disimpan sendiri di ACARA[sisi]. Keduanya selalu
       sama dengan acara pertama, jadi diturunkan saja — satu sumber. */
    KONF.tanggalRingkas = ACARA.length ? ACARA[0].tanggal : '';
    KONF.mulai          = ACARA.length ? ACARA[0].mulai   : '';
    KONF.siap = true;
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

  function linkTamu(slug, pihak) {
    var dasar = KONF.situs.replace(/\/+$/, '');
    var v = pihakSah(pihak);
    return dasar + '/' + slug + (v ? '?p=' + VARIAN[v].kode : '');
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
    DOMPET: DOMPET,
    VARIAN: VARIAN,
    KONF: KONF,

    muat: muat,
    slugPasangan: slugPasangan,
    pihakSah: pihakSah,
    varian: varian,
    tempatVarian: tempatVarian,
    acaraVarian: acaraVarian,
    tempatAcara: tempatAcara,
    acaraBertempat: acaraBertempat,
    satuTempat: satuTempat,
    siput: siput,
    nomorRapi: nomorRapi,
    kunciNama: kunciNama,
    linkTamu: linkTamu,
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
