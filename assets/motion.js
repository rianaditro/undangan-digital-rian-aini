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

  /* ---------- 4. Gulir otomatis ----------
     Undangan bergulir pelan seperti cerita, lalu berhenti sendiri di
     ujung.

     Yang bikin fitur semacam ini sering terasa rusak: ia berebut dengan
     jari penggunanya. Jadi aturannya satu dan keras — begitu ada tanda
     pengguna ingin menggulir sendiri, guliran otomatis MENYERAH SEKETIKA
     dan tidak mencoba melanjutkan.

     Tandanya ditangkap dua lapis. Lapis pertama peristiwa langsung:
     wheel, touchstart, keydown, pointerdown, dan focusin (tamu mengetik
     ucapan). Lapis kedua perbandingan: tiap bingkai, posisi yang
     sebenarnya dibandingkan dengan posisi yang kita setel. Kalau
     berbeda, berarti ada yang menggeser di luar kita — dan itu menangkap
     seretan bilah gulir serta luncuran sisa di HP yang tidak
     memunculkan satu pun peristiwa di atas.

     Satu jebakan: berkas tema memasang `html{scroll-behavior:smooth}`.
     Kalau dibiarkan, tiap langkah kecil kita ikut dianimasikan halus,
     dan hasilnya tersendat melawan dirinya sendiri. Jadi selama gulir
     berjalan, perilaku itu dimatikan sementara lalu dikembalikan. */
  function bikinGulir() {
    var laju = 0, y = 0, yDisetel = 0, jalan = false, rafId = 0, waktu = 0;
    var tenangSampai = 0;
    var adaKabar = null;
    var akar = doc ? doc.documentElement : null;
    var simpanPerilaku = '';

    var PERISTIWA = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'focusin'];

    function bisa() {
      return !!akar && !kurangi && !!global.requestAnimationFrame;
    }

    function ujung() {
      return Math.max(0, akar.scrollHeight - global.innerHeight);
    }

    function kabar() { if (adaKabar) adaKabar(jalan); }

    function mulai() {
      if (!bisa() || jalan) return;
      if (global.scrollY >= ujung() - 1) return;   // sudah di ujung

      jalan = true;
      y = yDisetel = global.scrollY;
      waktu = 0;

      /* Jendela tenang. Waktu tombol ditekan, halaman bisa saja masih
         melayang karena guliran halus yang dimulai hal lain — halaman ini
         sendiri menjalankan scrollIntoView({behavior:'smooth'}) tepat
         sesudah undangan dibuka. Tanpa jendela ini, pergerakan sisa itu
         terbaca sebagai jari pengguna dan guliran otomatis mati seketika:
         tamu menekan tombolnya, lalu tidak terjadi apa-apa.

         Selama jendela ini, pergeseran di luar kita TIDAK dianggap
         perlawanan — posisinya diikuti saja. Niat pengguna tetap
         tertangkap utuh lewat peristiwa langsung di bawah, dan itu
         memang tanda yang bisa dipercaya. */
      tenangSampai = (global.performance ? performance.now() : Date.now()) + 350;

      simpanPerilaku = akar.style.scrollBehavior;
      akar.style.scrollBehavior = 'auto';

      PERISTIWA.forEach(function (n) {
        global.addEventListener(n, henti, { passive: true });
      });
      doc.addEventListener('visibilitychange', sembunyi);

      rafId = requestAnimationFrame(langkah);
      kabar();
    }

    function henti() {
      if (!jalan) return;
      jalan = false;
      cancelAnimationFrame(rafId);

      akar.style.scrollBehavior = simpanPerilaku;
      PERISTIWA.forEach(function (n) { global.removeEventListener(n, henti); });
      doc.removeEventListener('visibilitychange', sembunyi);
      kabar();
    }

    function sembunyi() { if (doc.hidden) henti(); }

    function langkah(t) {
      if (!jalan) return;

      /* Pengguna menggeser sendiri: yang terbaca tidak sama dengan yang
         kita setel bingkai lalu. Di dalam jendela tenang, posisinya
         diikuti — bukan dianggap perlawanan. */
      if (Math.abs(global.scrollY - yDisetel) > 2) {
        if (t > tenangSampai) { henti(); return; }
        y = global.scrollY;
      }

      if (!waktu) waktu = t;
      var detik = Math.min(0.05, (t - waktu) / 1000);   // lompatan besar dijepit
      waktu = t;

      y += laju * detik;
      var batas = ujung();
      if (y >= batas) { global.scrollTo(0, batas); henti(); return; }

      global.scrollTo(0, y);
      yDisetel = global.scrollY;
      rafId = requestAnimationFrame(langkah);
    }

    return {
      pasang: function (opsi) {
        laju = angkaSetelan('--gulir-laju', 46);
        adaKabar = (opsi && opsi.kabar) || null;
        return bisa() && laju > 0;
      },
      mulai: mulai,
      henti: henti,
      alih: function () { jalan ? henti() : mulai(); },
      jalan: function () { return jalan; },
      bisa: bisa
    };
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
    gulir: bikinGulir(),
    pasang: pasang,
    runtun: runtun,
    parallax: parallax,
    angka: angka,
    kurangi: kurangi
  };
})(typeof window !== 'undefined' ? window : globalThis);
