/* ============================================================
   Tema dokumenter — perilaku yang tidak bisa dicapai CSS

   · polaroid miring sedikit-sedikit, acak tapi TETAP (dihitung dari
     urutannya, jadi tidak berubah tiap kali halaman dibuka)
   · cap tanggal oranye ala kamera saku di pojok foto, dari tanggal acara
   · strip film galeri bisa diseret dengan tetikus (di HP cukup diusap,
     itu sudah ditangani peramban)

   Tanpa berkas ini halaman tetap utuh: foto tegak lurus, tanpa cap,
   strip tetap bisa digulir. Kontraknya di assets/varian.js (daftarTata).
   ============================================================ */
(function () {
  'use strict';
  var M = window.MENGUNDANG;
  if (!M || !M.tema || !M.tema.daftarTata) return;

  function acak(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

  /* "15 9 '26" — seperti angka yang dibakar kamera saku ke filmnya */
  function cap(konf) {
    var t = String((konf && konf.tanggalAcara) || '').split('-');
    return t.length === 3 ? Number(t[2]) + ' ' + Number(t[1]) + " '" + t[0].slice(2) : '';
  }

  function seret(strip) {
    if (strip.getAttribute('data-seret')) return;
    strip.setAttribute('data-seret', '1');
    var x0 = 0, kiri0 = 0, aktif = false, geser = 0;
    strip.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      aktif = true; geser = 0; x0 = e.clientX; kiri0 = strip.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!aktif) return;
      geser = e.clientX - x0;
      strip.scrollLeft = kiri0 - geser;
    });
    window.addEventListener('pointerup', function () { aktif = false; });
    /* seretan bukan ketukan: foto tidak terbuka besar sesudah diseret */
    strip.addEventListener('click', function (e) {
      if (Math.abs(geser) > 6) { e.stopPropagation(); e.preventDefault(); geser = 0; }
    }, true);
  }

  M.tema.daftarTata('dokumenter', {
    pasang: function (akar, k) {
      var tanggal = cap(k.konf);
      var foto = akar.querySelectorAll('.galeri-item, .person-foto, .sampul-foto');
      for (var i = 0; i < foto.length; i++) {
        var el = foto[i];
        el.style.setProperty('--miring', ((acak(i + 1) * 5) - 2.5).toFixed(2) + 'deg');
        if (tanggal && !el.querySelector('.cap-tanggal')) {
          var s = document.createElement('span');
          s.className = 'cap-tanggal';
          s.setAttribute('aria-hidden', 'true');
          s.textContent = tanggal;
          el.appendChild(s);
        }
      }
      var strip = akar.getElementById && akar.getElementById('galeriIsi');
      if (strip) seret(strip);
    }
  });
})();
