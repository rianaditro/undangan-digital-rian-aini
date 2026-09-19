/* ============================================================
   Gerak halaman undangan

   Tiga hal: runtun (anak-anak satu wadah muncul berurutan, bukan
   serempak), parallax tipis di bagian pembuka, dan angka hitung mundur
   yang bergulir waktu berubah.

   SATU BATAS YANG MENGIKAT SEMUANYA. Tamu kondangan membuka undangan ini
   dari HP Android murah di jaringan desa. Jadi yang boleh dianimasikan
   hanya `transform` dan `opacity` — keduanya dikerjakan compositor dan
   tidak memicu peramban menghitung ulang tata letak. Begitu sebuah
   animasi menyentuh width, height, top, atau margin, ponsel kelas bawah
   langsung tersendat. Ada uji yang menjaga aturan ini di berkas tema.

   Yang kedua: jangan bekerja waktu tidak terlihat. Parallax dan gulir
   angka berhenti sendiri begitu bagiannya keluar layar.

   Setelannya dibaca dari custom property di berkas tema, bukan dari
   berkas konfigurasi tersendiri — temanya toh sudah dimuat, jadi tidak
   perlu permintaan jaringan tambahan, dan setelannya ikut tertukar
   sendiri waktu temanya berganti.

     :root{ --runtun:90ms; --parallax:.28; --angka-gulir:1; }
   ============================================================ */
(function (global) {
  'use strict';

  var doc = global.document;
  var kurangi = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  function setelan(nama, bawaan) {
    if (!doc) return bawaan;
    var v = getComputedStyle(doc.documentElement).getPropertyValue(nama).trim();
    return v === '' ? bawaan : v;
  }

  function angkaSetelan(nama, bawaan) {
    var n = parseFloat(setelan(nama, String(bawaan)));
    return isNaN(n) ? bawaan : n;
  }

  /* ---------- 1. Runtun ----------
     Anak-anak `.reveal` di dalam [data-runtun] diberi nomor urut. Berkas
     tema memakainya sebagai transition-delay, jadi mereka muncul
     bergiliran, bukan serempak. Hanya penundaan — tidak ada animasi
     tambahan yang berjalan. */
  function runtun(akar) {
    (akar || doc).querySelectorAll('[data-runtun]').forEach(function (wadah) {
      var anak = wadah.querySelectorAll(':scope > .reveal, :scope > * > .reveal');
      for (var i = 0; i < anak.length; i++) {
        anak[i].style.setProperty('--i', i);
      }
    });
  }

  /* ---------- 2. Parallax ----------
     Isi bagian pembuka bergerak lebih lambat dari gulirannya. Hanya
     translate3d, dan hanya selagi bagiannya terlihat — begitu keluar
     layar, gelung rAF-nya berhenti total. */
  function parallax(el, kekuatan) {
    if (kurangi || !el || !kekuatan) return function () {};
    if (!global.IntersectionObserver || !global.requestAnimationFrame) return function () {};

    var terlihat = false, jalan = false, mati = false;

    function gambar() {
      if (mati || !terlihat) { jalan = false; return; }
      var y = el.getBoundingClientRect().top;
      /* Dibatasi supaya tidak pernah bergeser jauh; parallax yang
         berlebihan justru bikin teks susah dibaca sambil menggulir. */
      var geser = Math.max(-120, Math.min(120, -y * kekuatan));
      el.style.transform = 'translate3d(0,' + geser.toFixed(1) + 'px,0)';
      jalan = true;
      requestAnimationFrame(gambar);
    }

    var pengamat = new IntersectionObserver(function (masuk) {
      terlihat = masuk[0].isIntersecting;
      if (terlihat && !jalan) { jalan = true; requestAnimationFrame(gambar); }
    }, { threshold: 0 });
    pengamat.observe(el);

    return function () {
      mati = true;
      pengamat.disconnect();
      el.style.transform = '';
    };
  }

  /* ---------- 3. Angka bergulir ----------
     Angka lama naik keluar, angka baru naik masuk. Dikerjakan Web
     Animations API supaya peramban bisa menyerahkannya ke compositor.

     Kalau nilainya tidak berubah, tidak ada apa pun yang dikerjakan —
     itu yang menjaga detik demi detik tetap murah. */
  function angka(el, teks) {
    if (!el) return;
    teks = String(teks);

    /* Yang terbaru selalu anak terakhir. Sisa dari gulir sebelumnya yang
       belum sempat dibersihkan dibuang paksa di sini — di HP lambat,
       onfinish bisa tertinggal dari detik yang terus berjalan, dan tanpa
       ini span-nya menumpuk tanpa batas. */
    var semua = el.querySelectorAll('.angka');
    for (var k = 0; k < semua.length - 1; k++) {
      if (semua[k].parentNode) semua[k].parentNode.removeChild(semua[k]);
    }

    var isi = semua.length ? semua[semua.length - 1] : null;
    if (!isi) {
      el.textContent = '';
      isi = doc.createElement('span');
      isi.className = 'angka';
      isi.textContent = teks;
      el.appendChild(isi);
      return;
    }
    if (isi.textContent === teks) return;

    if (kurangi || !el.animate) { isi.textContent = teks; return; }

    var baru = doc.createElement('span');
    baru.className = 'angka';
    baru.textContent = teks;
    el.appendChild(baru);

    var lama = isi;
    lama.animate(
      [{ transform: 'translateY(0)', opacity: 1 },
       { transform: 'translateY(-90%)', opacity: 0 }],
      { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    ).onfinish = function () { if (lama.parentNode) lama.parentNode.removeChild(lama); };

    baru.animate(
      [{ transform: 'translateY(90%)', opacity: 0 },
       { transform: 'translateY(0)', opacity: 1 }],
      { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)' }
    );
  }

  /* ---------- Pemasangan ---------- */
  function pasang(opsi) {
    opsi = opsi || {};
    runtun(opsi.akar);

    var kekuatan = angkaSetelan('--parallax', 0);
    var sasaran = opsi.parallax || (doc && doc.querySelector('[data-parallax]'));
    return parallax(sasaran, kekuatan);
  }

  global.Motion = {
    pasang: pasang,
    runtun: runtun,
    parallax: parallax,
    angka: angka,
    kurangi: kurangi
  };
})(typeof window !== 'undefined' ? window : globalThis);
