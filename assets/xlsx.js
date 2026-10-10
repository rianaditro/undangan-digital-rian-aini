/* ============================================================
   xlsx.js — menulis berkas Excel (.xlsx) tanpa pustaka apa pun

   Kenapa bukan CSV saja. CSV di Excel Indonesia hampir selalu
   berantakan: pemisahnya ikut setelan Windows (koma atau titik koma,
   tidak bisa ditebak dari sini), dan "250.000" terbaca sebagai teks —
   sehingga kolom yang justru ingin dijumlahkan tidak bisa dijumlahkan.
   Sudah begitu, yang menerimanya harus tahu cara Import Text Wizard.
   Untuk berkas yang isinya angka uang, itu bukan kegagalan kecil.

   Kenapa bukan SheetJS. Halaman ini tidak punya langkah build dan tidak
   memuat pustaka apa pun; menambahkan satu berkas 400 KB untuk sebuah
   tombol unduh akan jadi hal terberat di seluruh situs, dan akan ikut
   diunduh tiap kali halaman panitia dibuka.

   Jadi ditulis sendiri. .xlsx sebenarnya cuma berkas ZIP berisi XML.
   Yang dipakai di sini sengaja sesedikit mungkin:

     · ZIP tanpa kompresi (metode "stored"), jadi tidak perlu deflate
     · teks ditaruh inline (t="inlineStr"), jadi tidak perlu
       sharedStrings.xml
     · satu styles.xml kecil: baris judul tebal, kolom angka berformat
       ribuan, kolom tanggal berformat tanggal

   Angka ditulis sebagai angka, tanggal sebagai tanggal. Itu seluruh
   alasan berkas ini ada.

   Pakai:
     XLSX.unduh('rekap.xlsx', [
       { nama:'Sumbangan', lebar:[28,14], baris:[
           [{v:'Nama', j:'judul'}, {v:'Nominal', j:'judul'}],
           [{v:'Budi'},            {v:250000, j:'uang'}]
       ]}
     ]);

   Jenis sel: 'teks' (bawaan), 'angka', 'uang', 'tanggal', 'judul'.
   ============================================================ */
(function (global) {
  'use strict';

  var enc = new TextEncoder();

  /* ---------- CRC32 ---------- */
  var TABEL = (function () {
    var t = new Uint32Array(256), c, i, k;
    for (i = 0; i < 256; i++) {
      c = i;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = TABEL[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- penulis byte ---------- */
  function Tulis() { this.b = []; }
  Tulis.prototype.u8  = function (n) { this.b.push(n & 0xFF); return this; };
  Tulis.prototype.u16 = function (n) { return this.u8(n).u8(n >>> 8); };
  Tulis.prototype.u32 = function (n) { return this.u16(n).u16(n >>> 16); };
  Tulis.prototype.bytes = function (a) {
    for (var i = 0; i < a.length; i++) this.b.push(a[i]);
    return this;
  };
  Tulis.prototype.hasil = function () { return new Uint8Array(this.b); };

  /* ---------- ZIP ----------
     Metode "stored": isinya disalin apa adanya. Untuk XML beberapa ratus
     kilobyte itu memang lebih besar dari perlunya, tapi menukarnya dengan
     implementasi deflate sendiri bukan pertukaran yang sepadan — dan
     Excel membuka keduanya sama saja. */
  function zip(berkas) {
    var lokal = new Tulis(), pusat = new Tulis(), offset = 0, n = 0;

    berkas.forEach(function (f) {
      var nama = enc.encode(f.nama);
      var isi  = f.data;
      var c    = crc32(isi);

      // 0x0800 = nama berkas dalam UTF-8
      lokal.u32(0x04034B50).u16(20).u16(0x0800).u16(0)
           .u16(0).u16(0)                       // jam & tanggal: nol, tidak dipakai
           .u32(c).u32(isi.length).u32(isi.length)
           .u16(nama.length).u16(0)
           .bytes(nama).bytes(isi);

      pusat.u32(0x02014B50).u16(20).u16(20).u16(0x0800).u16(0)
           .u16(0).u16(0)
           .u32(c).u32(isi.length).u32(isi.length)
           .u16(nama.length).u16(0).u16(0)
           .u16(0).u16(0).u32(0)
           .u32(offset)
           .bytes(nama);

      offset += 30 + nama.length + isi.length;
      n++;
    });

    var p = pusat.hasil();
    var akhir = new Tulis();
    akhir.u32(0x06054B50).u16(0).u16(0).u16(n).u16(n)
         .u32(p.length).u32(offset).u16(0);

    var a = lokal.hasil(), z = akhir.hasil();
    var out = new Uint8Array(a.length + p.length + z.length);
    out.set(a, 0); out.set(p, a.length); out.set(z, a.length + p.length);
    return out;
  }

  /* ---------- XML ---------- */
  /* Nama tamu diketik orang, dan sekali ada karakter kendali nyasar di
     dalamnya seluruh berkas ditolak Excel tanpa penjelasan. Jadi dibuang
     di sini, bukan diharapkan tidak ada. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function kolom(n) {                 // 1 → A, 27 → AA
    var s = '';
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
    return s;
  }

  /* Excel menyimpan tanggal sebagai jumlah hari sejak 1899-12-30. */
  function keSerial(d) {
    return (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569;
  }

  var GAYA = { teks: 0, judul: 1, angka: 2, uang: 3, tanggal: 4 };

  function sel(alamat, isi) {
    var j = isi && isi.j || 'teks';
    var s = GAYA[j] == null ? 0 : GAYA[j];
    var v = isi ? isi.v : null;

    if (v == null || v === '') return '<c r="' + alamat + '" s="' + s + '"/>';

    if (j === 'angka' || j === 'uang') {
      var n = Number(v);
      if (!isFinite(n)) return '<c r="' + alamat + '" s="0" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
      return '<c r="' + alamat + '" s="' + s + '"><v>' + n + '</v></c>';
    }
    if (j === 'tanggal') {
      var d = (v instanceof Date) ? v : new Date(v);
      if (isNaN(d)) return '<c r="' + alamat + '" s="0"/>';
      return '<c r="' + alamat + '" s="' + s + '"><v>' + keSerial(d) + '</v></c>';
    }
    // xml:space="preserve" supaya spasi di awal/akhir tidak dimakan
    return '<c r="' + alamat + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">'
         + esc(v) + '</t></is></c>';
  }

  function lembar(l) {
    var lebar = (l.lebar || []).map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('');

    var baris = l.baris.map(function (b, i) {
      var r = i + 1;
      return '<row r="' + r + '">'
        + b.map(function (c, k) { return sel(kolom(k + 1) + r, c); }).join('')
        + '</row>';
    }).join('');

    /* Baris judul dibekukan. Tanpa itu, menggulir ke baris 200 berarti
       menebak kolom mana yang mana. */
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0">'
      + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '</sheetView></sheetViews>'
      + (lebar ? '<cols>' + lebar + '</cols>' : '')
      + '<sheetData>' + baris + '</sheetData></worksheet>';
  }

  var NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function buat(lembaran) {
    var berkas = [];
    function tambah(nama, teks) { berkas.push({ nama: nama, data: enc.encode(teks) }); }

    tambah('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + lembaran.map(function (l, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml"'
               + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('')
      + '</Types>');

    tambah('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="' + NS_REL + '/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>');

    tambah('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="' + NS_REL + '"><sheets>'
      + lembaran.map(function (l, i) {
          return '<sheet name="' + esc(l.nama) + '" sheetId="' + (i + 1)
               + '" r:id="rId' + (i + 1) + '"/>';
        }).join('')
      + '</sheets></workbook>');

    tambah('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + lembaran.map(function (l, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL + '/worksheet"'
               + ' Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('')
      + '<Relationship Id="rIdS" Type="' + NS_REL + '/styles" Target="styles.xml"/>'
      + '</Relationships>');

    /* Excel menolak styles.xml yang kekurangan bagian bawaannya — dua
       fill, satu border, satu cellStyleXfs — walaupun tak satu pun
       dipakai. Jadi semuanya tetap ditulis. */
    tambah('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="2">'
      +   '<numFmt numFmtId="164" formatCode="#,##0"/>'
      +   '<numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/>'
      + '</numFmts>'
      + '<fonts count="2">'
      +   '<font><sz val="11"/><name val="Calibri"/></font>'
      +   '<font><b/><sz val="11"/><name val="Calibri"/></font>'
      + '</fonts>'
      + '<fills count="2">'
      +   '<fill><patternFill patternType="none"/></fill>'
      +   '<fill><patternFill patternType="gray125"/></fill>'
      + '</fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="5">'
      +   '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      +   '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
      +   '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      +   '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      +   '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>');

    lembaran.forEach(function (l, i) {
      tambah('xl/worksheets/sheet' + (i + 1) + '.xml', lembar(l));
    });

    return new Blob([zip(berkas)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* Anchor-nya dimasukkan ke dokumen sebentar sebelum ditekan. Chromium
     mengunduh juga kalau anchor-nya dibiarkan lepas — sudah diuji — tapi
     tidak semua peramban begitu, dan yang tidak begitu diam saja tanpa
     galat. Dua baris tambahan untuk menghapus satu kelas kegagalan yang
     tidak akan pernah kelihatan dari sini. */
  function unduh(namaBerkas, lembaran) {
    var url = URL.createObjectURL(buat(lembaran));
    var a = document.createElement('a');
    a.href = url;
    a.download = namaBerkas;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.XLSX = { buat: buat, unduh: unduh };
})(window);
