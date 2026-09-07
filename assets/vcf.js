/* ============================================================
   Pembaca berkas kontak .vcf (vCard)

   Dipakai halaman panitia untuk menyerap ekspor kontak dari HP.
   Hasilnya sengaja hanya berupa daftar {nama, telepon} — pembersihan
   nomor, deteksi kembar, dan penentuan pihak tetap dikerjakan alur
   yang sudah ada, supaya tidak ada dua jalan masuk yang berbeda
   perilakunya.

   Yang harus ditangani di dunia nyata:
   · vCard 2.1 dari Android memakai QUOTED-PRINTABLE, dan baris
     sambungannya TIDAK diawali spasi — beda dari pelipatan biasa.
   · vCard 3.0/4.0 melipat baris panjang dengan awalan spasi atau tab.
   · Nomor bisa lebih dari satu; yang bertipe seluler didahulukan.
   · Properti bisa bergrup, seperti `item1.TEL` pada ekspor iPhone.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Membuka lipatan baris ----------
     Menghasilkan larik baris logis dari teks mentah. */
  function barisLogis(teks) {
    var mentah = String(teks || '').replace(/\r\n?/g, '\n').split('\n');
    var hasil = [];

    for (var i = 0; i < mentah.length; i++) {
      var baris = mentah[i];

      /* pelipatan vCard 3.0/4.0: baris berikutnya diawali spasi/tab */
      while (i + 1 < mentah.length && /^[ \t]/.test(mentah[i + 1])) {
        baris += mentah[++i].slice(1);
      }

      /* sambungan QUOTED-PRINTABLE: baris berakhir '=' dan lanjut
         di baris berikutnya tanpa awalan spasi */
      if (/quoted-printable/i.test(baris)) {
        while (/=$/.test(baris) && i + 1 < mentah.length) {
          baris = baris.slice(0, -1) + mentah[++i];
        }
      }

      hasil.push(baris);
    }
    return hasil;
  }

  /* ---------- QUOTED-PRINTABLE → teks ---------- */
  function bukaQP(s) {
    var bita = [];
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
        bita.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      } else {
        bita.push(s.charCodeAt(i) & 0xFF);
      }
    }
    try {
      return new TextDecoder('utf-8').decode(new Uint8Array(bita));
    } catch (e) {
      /* peramban tanpa TextDecoder: kembalikan apa adanya */
      return s.replace(/=[0-9A-Fa-f]{2}/g, '');
    }
  }

  /* ---------- Lepas escape khas vCard ---------- */
  function bukaEscape(s) {
    return String(s || '')
      .replace(/\\n/gi, ' ')
      .replace(/\\([,;\\])/g, '$1');
  }

  /* ---------- Satu baris → {nama, params, nilai} ---------- */
  function uraiBaris(baris) {
    var pisah = baris.indexOf(':');
    if (pisah === -1) return null;

    var kiri  = baris.slice(0, pisah);
    var nilai = baris.slice(pisah + 1);

    var bagian = kiri.split(';');
    var nama   = bagian.shift();

    /* buang awalan grup, misalnya "item1.TEL" */
    var titik = nama.lastIndexOf('.');
    if (titik !== -1) nama = nama.slice(titik + 1);

    var params = bagian.map(function (p) { return p.toUpperCase(); });

    if (params.some(function (p) { return /QUOTED-PRINTABLE/.test(p); })) {
      nilai = bukaQP(nilai);
    }

    return { nama: nama.trim().toUpperCase(), params: params, nilai: nilai };
  }

  /* Memisah pada ';' yang tidak di-escape. Ditulis manual, bukan
     lookbehind — regex lookbehind masih syntax error di Safari lawas,
     dan itu akan mematikan seluruh berkas ini sekaligus. */
  function pisahTitikKoma(s) {
    var bagian = [], kini = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) { kini += s[i] + s[i + 1]; i++; }
      else if (s[i] === ';') { bagian.push(kini); kini = ''; }
      else kini += s[i];
    }
    bagian.push(kini);
    return bagian;
  }

  /* ---------- Nama dari properti N (terstruktur) ---------- */
  function namaDariN(nilai) {
    /* keluarga;depan;tengah;gelar depan;gelar belakang */
    var b = pisahTitikKoma(nilai).map(bukaEscape).map(function (x) { return x.trim(); });
    return [b[3], b[1], b[2], b[0], b[4]]
      .filter(function (x) { return x; })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- Memilih nomor yang paling masuk akal ---------- */
  var SELULER = /\b(CELL|MOBILE|IPHONE|HP)\b/;

  function pilihNomor(telepon) {
    if (!telepon.length) return '';
    var seluler = telepon.filter(function (t) {
      return t.params.some(function (p) { return SELULER.test(p); });
    });
    return (seluler[0] || telepon[0]).nilai;
  }

  /* ============================================================
     baca(teks) → [{nama, telepon}]
     ============================================================ */
  function baca(teks) {
    var baris = barisLogis(teks);
    var hasil = [];

    var fn = null, n = null, telepon = [], dalamKartu = false;

    function tutupKartu() {
      var nama = (fn || (n ? namaDariN(n) : '')).replace(/\s+/g, ' ').trim();
      if (nama) {
        hasil.push({
          nama: nama.slice(0, 80),
          telepon: pilihNomor(telepon).replace(/^tel:/i, '').trim()
        });
      }
      fn = null; n = null; telepon = [];
    }

    baris.forEach(function (b) {
      if (!b.trim()) return;
      var p = uraiBaris(b);
      if (!p) return;

      if (p.nama === 'BEGIN' && /VCARD/i.test(p.nilai)) {
        dalamKartu = true; fn = null; n = null; telepon = [];
        return;
      }
      if (p.nama === 'END' && /VCARD/i.test(p.nilai)) {
        if (dalamKartu) tutupKartu();
        dalamKartu = false;
        return;
      }
      if (!dalamKartu) return;

      if (p.nama === 'FN')  fn = bukaEscape(p.nilai);
      else if (p.nama === 'N' && !n) n = p.nilai;
      else if (p.nama === 'TEL') telepon.push(p);
    });

    /* berkas terpotong: kartu terakhir tanpa END:VCARD */
    if (dalamKartu) tutupKartu();

    return hasil;
  }

  global.VCF = { baca: baca };
})(typeof window !== 'undefined' ? window : globalThis);
