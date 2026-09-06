/* ============================================================
   Undangan Rian & 'Aini — konfigurasi & varian per pihak
   Dipakai bersama oleh halaman undangan dan halaman panitia.

   Semua yang perlu diubah ada di file ini. Tidak ada build step.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Supabase ----------
     anon key memang aman ditaruh di sini: RLS hanya mengizinkan
     baca/tulis ucapan. Daftar tamu tidak bisa dibaca dengan key ini. */
  var SB = {
    url: 'https://mavjlhlyrtacxleulbom.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdmpsaGx5cnRhY3hsZXVsYm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTQwMTUsImV4cCI6MjEwMjMzMDAxNX0.z-ggUETNyHPLWdhXkLTuWHMZdb-E98YcqGzM74d1uq8'
  };

  /* ---------- Alamat situs ----------
     Dipakai halaman panitia untuk menyusun link personal tamu. */
  var SITUS = 'https://rian-aini.mengundang.id';

  /* ---------- Musik latar ---------- */
  var BACKSOUND_URL = '/assets/backsound.mp3';

  /* ---------- Mempelai ---------- */
  var MEMPELAI = {
    pria: {
      panggilan: 'RIAN',
      lengkap:   'RIAN ADI SAPUTRO',
      peran:     'Mempelai Pria',
      anak:      'Putra dari',
      ayah:      'Bapak Joko Sudarno',  ayahKet: '(Alm)',
      ibu:       'Ibu Sri Kanah',       ibuKet:  '(Almh)'
    },
    wanita: {
      panggilan: "'AINI",
      lengkap:   "NURUL ZAKIYATUL 'AINI",
      peran:     'Mempelai Wanita',
      anak:      'Putri dari',
      ayah:      'Bapak Surahmad',      ayahKet: '',
      ibu:       "Ibu Robi'atun",       ibuKet:  '(Almh)'
    }
  };

  /* ---------- Tempat & acara, per sisi keluarga ----------

     TEMPAT.wanita / ACARA.wanita  → dilihat pihak wanita
     TEMPAT.pria   / ACARA.pria    → dilihat pihak pria

     Selama TEMPAT.pria masih null, pihak pria ikut memakai
     alamat dan acara sisi wanita. Isi begitu acara di rumah
     mempelai pria (ngunduh mantu) sudah pasti. */

  var TEMPAT = {
    wanita: {
      nama:    'Kediaman Mempelai Putri',
      alamat:  'Jalan Pesajen RT 03 / RW 04, Demaan, Jepara, Jawa Tengah',
      ringkas: 'Jl. Pesajen RT 03/04, Demaan, Jepara',
      maps:    'https://maps.app.goo.gl/xSdwqbrQoHadeU2A6'
    },

    /* Jalan dan RW sama dengan sisi wanita, hanya RT-nya berbeda. */
    pria: {
      nama:    'Kediaman Mempelai Putra',
      alamat:  'Jalan Pesajen RT 01 / RW 04, Demaan, Jepara, Jawa Tengah',
      ringkas: 'Jl. Pesajen RT 01/04, Demaan, Jepara',
      maps:    'https://goo.gl/maps/HbCrjVDvgopegQHW8'
    }
  };

  var ACARA = {
    wanita: {
      mulai: '2026-09-15T13:00:00+07:00',
      daftar: [
        { nama: 'Akad Nikah', tanggal: 'Selasa, 15 September 2026', jam: 'Pukul 13.00 WIB' },
        { nama: 'Resepsi',    tanggal: 'Selasa, 15 September 2026', jam: 'Pukul 16.00 WIB — selesai' }
      ],
      /* dipakai di judul hitung mundur dan pesan WhatsApp */
      tanggalRingkas: 'Selasa, 15 September 2026',
      jamRingkas:     'Akad 13.00 WIB · Resepsi 16.00 WIB'
    },

    /* Belum ada rangkaian acara tersendiri untuk sisi pria, jadi
       tanggal dan jamnya mengikuti sisi wanita. Isi blok ini —
       bentuknya persis seperti blok wanita di atas — bila acara di
       kediaman mempelai putra digelar pada waktu yang berbeda. */
    pria: null
  };

  /* ---------- Dompet digital ---------- */
  var DOMPET = {
    rian: { bank: 'SeaBank', nomor: '901316451657', an: 'a.n. Rian Adi Saputro' },
    aini: { bank: 'DANA',    nomor: '085727641452', an: "a.n. Nurul Zakiyatul 'Aini" }
  };

  /* ---------- Empat varian undangan ----------

     sisi     → tempat & acara mana yang ditampilkan
     urutan   → urutan kartu mempelai dan urutan nama di judul
     dompet   → dompet digital yang tampil, urutan menentukan posisi
     ttdNama  → tanda tangan di penutup, menyesuaikan siapa yang mengundang

     Kartu ucapan sengaja TIDAK dibedakan: semua varian menulis dan
     membaca daftar ucapan yang sama.                                */

  var VARIAN = {
    'pria': {
      label:   'Pengantin Pria',
      kode:    'p',
      sisi:    'pria',
      urutan:  ['pria', 'wanita'],
      dompet:  ['rian', 'aini'],
      ttdLabel: 'Kami yang berbahagia',
      ttdNama:  ["RIAN", "'AINI"],
      ttdSub:   'Beserta Keluarga'
    },

    'keluarga-pria': {
      label:   'Keluarga Pihak Pria',
      kode:    'kp',
      sisi:    'pria',
      urutan:  ['pria', 'wanita'],
      dompet:  ['rian', 'aini'],
      ttdLabel: 'Hormat kami',
      ttdNama:  ["RIAN", "'AINI"],
      ttdSub:   'Beserta Keluarga Besar Bapak Joko Sudarno (Alm) & Ibu Sri Kanah (Almh)'
    },

    'wanita': {
      label:   'Pengantin Wanita',
      kode:    'w',
      sisi:    'wanita',
      urutan:  ['wanita', 'pria'],
      dompet:  ['aini', 'rian'],
      ttdLabel: 'Kami yang berbahagia',
      ttdNama:  ["'AINI", "RIAN"],
      ttdSub:   'Beserta Keluarga'
    },

    'keluarga-wanita': {
      label:   'Keluarga Pihak Wanita',
      kode:    'kw',
      sisi:    'wanita',
      urutan:  ['wanita', 'pria'],
      dompet:  ['aini', 'rian'],
      ttdLabel: 'Hormat kami',
      ttdNama:  ["'AINI", "RIAN"],
      ttdSub:   "Beserta Keluarga Besar Bapak Surahmad & Ibu Robi'atun (Almh)"
    }
  };

  var PIHAK_BAWAAN = 'keluarga-wanita';

  /* kode pendek (?p=kp) → nama pihak */
  var DARI_KODE = {};
  Object.keys(VARIAN).forEach(function (k) { DARI_KODE[VARIAN[k].kode] = k; });

  /* ============================================================
     Pembantu
     ============================================================ */

  /* nama pihak yang sah, atau nilai bawaan */
  function pihakSah(p) {
    if (!p) return null;
    p = String(p).trim().toLowerCase();
    if (VARIAN[p]) return p;
    if (DARI_KODE[p]) return DARI_KODE[p];
    return null;
  }

  function varian(pihak) {
    return VARIAN[pihakSah(pihak) || PIHAK_BAWAAN];
  }

  /* tempat & acara yang berlaku untuk sebuah varian,
     dengan sisi pria jatuh kembali ke sisi wanita bila belum diisi */
  function tempatVarian(v) { return TEMPAT[v.sisi] || TEMPAT.wanita; }
  function acaraVarian(v)  { return ACARA[v.sisi]  || ACARA.wanita;  }

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

  /* kunci pembanding untuk mendeteksi nama kembar:
     huruf kecil, gelar dan sapaan dibuang, spasi dirapatkan */
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
    var dasar = SITUS.replace(/\/+$/, '');
    var v = pihakSah(pihak);
    return dasar + '/' + slug + (v ? '?p=' + VARIAN[v].kode : '');
  }

  /* pesan WhatsApp, isinya menyesuaikan pihak tamu */
  function pesanWA(nama, slug, pihak) {
    var v  = varian(pihak);
    var t  = tempatVarian(v);
    var a  = acaraVarian(v);
    var ur = v.ttdNama[0] + " & " + v.ttdNama[1];

    return "Assalamu'alaikum Warahmatullahi Wabarakatuh\n\n"
      + "Yth. Bapak/Ibu/Saudara/i\n"
      + "*" + nama + "*\n\n"
      + "Tanpa mengurangi rasa hormat, kami bermaksud mengundang Anda untuk hadir pada acara pernikahan kami:\n\n"
      + "*" + ur + "*\n\n"
      + a.tanggalRingkas + "\n"
      + a.jamRingkas + "\n"
      + t.nama + "\n"
      + t.ringkas + "\n\n"
      + "Detail lengkap, lokasi, dan konfirmasi kehadiran dapat dibuka di:\n"
      + linkTamu(slug, pihak) + "\n\n"
      + "Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir untuk memberikan doa restu.\n\n"
      + "Wassalamu'alaikum Warahmatullahi Wabarakatuh\n\n"
      + v.ttdLabel + ",\n"
      + ur;
  }

  global.MENGUNDANG = {
    SB: SB,
    SITUS: SITUS,
    BACKSOUND_URL: BACKSOUND_URL,
    MEMPELAI: MEMPELAI,
    TEMPAT: TEMPAT,
    ACARA: ACARA,
    DOMPET: DOMPET,
    VARIAN: VARIAN,
    PIHAK_BAWAAN: PIHAK_BAWAAN,
    pihakSah: pihakSah,
    varian: varian,
    tempatVarian: tempatVarian,
    acaraVarian: acaraVarian,
    siput: siput,
    nomorRapi: nomorRapi,
    kunciNama: kunciNama,
    linkTamu: linkTamu,
    pesanWA: pesanWA
  };
})(window);
