/* Kerangka halaman custom: semua isi datang dari Kit (assets/kit.js).
   Teks dari data dipasang lewat textContent, atau Kit.esc() bila harus
   lewat innerHTML — kontrak uji-custom memeriksanya dengan data jahil. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Kit.esc;

  function gambarAcara(daftar) {
    $('daftarAcara').innerHTML = daftar.map(function (a) {
      var t = a.tempat;
      return '<article class="acara">'
        + '<h3>' + esc(a.nama) + '</h3>'
        + '<p>' + esc(a.tanggal) + (a.jam ? ' · ' + esc(a.jam) : '') + '</p>'
        + (t ? '<p class="tempat"><b>' + esc(t.nama) + '</b><br>' + esc(t.alamat) + '</p>'
             + (/^https:\/\//.test(t.peta) ? '<a class="tombol tipis" href="' + esc(t.peta) + '" target="_blank" rel="noopener">Buka peta</a>' : '')
             : '')
        + '</article>';
    }).join('');
  }

  function gambarMempelai(m) {
    $('duaMempelai').innerHTML = ['wanita', 'pria'].map(function (s) {
      var x = m[s] || {};
      var ortu = [x.ayah, x.ibu].filter(Boolean).map(esc).join(' &amp; ');
      return '<div class="satu">'
        + '<p class="nama-sedang">' + esc(x.lengkap || x.panggilan || '') + '</p>'
        + '<p class="kecil">' + esc(x.anak || '') + (ortu ? '<br>' + ortu : '') + '</p>'
        + '</div>';
    }).join('<p class="dan" aria-hidden="true">&amp;</p>');
  }

  function gambarFoto(galeri) {
    if (!galeri.length) return;
    $('daftarFoto').innerHTML = galeri.slice(0, 9).map(function (f) {
      return '<img loading="lazy" decoding="async" alt="' + esc(f.keterangan || '') + '" src="' + esc(Kit.fotoUrl(f, 'kecil')) + '">';
    }).join('');
    $('galeri').hidden = false;
  }

  function gambarDompet(daftar) {
    if (!daftar.length) return;
    $('daftarDompet').innerHTML = daftar.map(function (d) {
      return '<div class="dompet"><b>' + esc(d.bank) + '</b><span class="nomor">' + esc(d.nomor) + '</span>'
        + '<span class="kecil">' + esc(d.atasNama) + '</span>'
        + '<button type="button" class="tombol tipis" data-salin="' + esc(d.nomor) + '">Salin nomor</button></div>';
    }).join('');
    $('hadiah').hidden = false;
  }

  function gambarUcapan(daftar) {
    $('daftarUcapan').innerHTML = daftar.length ? daftar.map(function (u) {
      return '<li><b>' + esc(u.nama) + '</b> <span class="kecil">' + esc(u.hadir) + '</span><p>' + esc(u.pesan) + '</p></li>';
    }).join('') : '<li class="kecil">Belum ada ucapan. Jadilah yang pertama.</li>';
  }
  function muatUcapan() {
    return Kit.ucapan.daftar().then(gambarUcapan, function () {
      $('daftarUcapan').innerHTML = '<li class="kecil">Ucapan belum bisa dimuat.</li>';
    });
  }

  Kit.muat().then(function (u) {
    var pria = u.mempelai.pria.panggilan || '', wanita = u.mempelai.wanita.panggilan || '';
    document.title = wanita + ' & ' + pria + ' — Undangan Pernikahan';
    $('namaTamu').textContent = u.tamu.nama || 'Tamu Undangan';
    $('namaAmplop').textContent = wanita + ' & ' + pria;
    $('inisial').textContent = (wanita.replace(/[^A-Za-z]/g, '').charAt(0) || '') + (pria.replace(/[^A-Za-z]/g, '').charAt(0) || '');
    $('namaWanita').textContent = wanita;
    $('namaPria').textContent = pria;
    $('namaPenutup').textContent = wanita + ' & ' + pria;
    $('tanggal').textContent = u.tanggalRingkas || '';
    $('salam').textContent = u.pembuka.salam || u.pembuka.alis || '';
    if (u.pembuka.kutipan) {
      $('ayatTeks').textContent = u.pembuka.kutipan;
      $('ayatSumber').textContent = u.pembuka.sumber || '';
      $('ayat').hidden = false;
    }
    if (typeof u.khusus.kutipan === 'string' && u.khusus.kutipan) {
      $('kutipan').textContent = u.khusus.kutipan;
      $('kutipan').hidden = false;
    }
    if (u.foto.sampul) { $('sampulImg').src = Kit.fotoUrl(u.foto.sampul); $('sampul').hidden = false; }
    gambarMempelai(u.mempelai);
    gambarAcara(u.acara);
    gambarFoto(u.foto.galeri || []);
    gambarDompet(u.dompet);
    $('inHadir').innerHTML = u.pilihanHadir.map(function (h) {
      return '<option value="' + esc(h.nilai) + '">' + esc(h.label) + '</option>';
    }).join('');
    if (u.tamu.nama) $('inNama').value = u.tamu.nama.slice(0, 40);
    if (window.MENGUNDANG.BACKSOUND_URL) { $('btnMusik').hidden = false; Kit.musik($('btnMusik')); }
    muatUcapan();
    document.body.dataset.siap = 'isi';
  }).catch(function () {
    $('amplop').hidden = true;
    $('galat').hidden = false;
    document.body.dataset.siap = 'galat';
  });

  $('btnBuka').addEventListener('click', function () {
    document.body.classList.remove('tertutup');
    document.body.classList.add('terbuka');
    $('surat').hidden = false;
    if (Kit.gerak) Kit.gerak.runtun(document);
    $('pembuka').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  $('formUcapan').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('btnKirim'), pesan = $('pesanForm');
    btn.disabled = true; pesan.textContent = '';
    Kit.ucapan.kirim({ nama: $('inNama').value, hadir: $('inHadir').value, pesan: $('inPesan').value })
      .then(function () { $('inPesan').value = ''; pesan.textContent = 'Terima kasih, ucapan Anda terkirim.'; return muatUcapan(); },
            function (err) { pesan.textContent = /^HTTP/.test(err.message) ? 'Ucapan gagal terkirim. Coba sekali lagi.' : err.message; })
      .then(function () { btn.disabled = false; });
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-salin]');
    if (!b) return;
    var teks = b.dataset.salin;
    (navigator.clipboard ? navigator.clipboard.writeText(teks) : Promise.reject()).then(function () {
      b.textContent = 'Tersalin';
    }, function () { b.textContent = teks; });
  });
})();
