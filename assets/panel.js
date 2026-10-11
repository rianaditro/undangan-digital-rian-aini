/* Navigasi panel kerja — satu .halaman tampil pada satu waktu.

   Halaman ditandai <section class="halaman" data-halaman="foto"
   data-judul="Foto & video">, menu memakai <a href="#foto">. Alamatnya
   ikut berubah (#foto), jadi tombol Kembali di HP dan tautan langsung
   bekerja seperti biasa.

   Elemen dengan data-tampil-di="pengantin acara" hanya tampil di
   halaman-halaman itu (dipakai bilah Simpan Semua di /dasbor).

   Panel.ke('foto') berpindah dari kode; Panel.saatPindah(fn) memberi tahu
   halaman yang baru dibuka. */
(function (global) {
  'use strict';
  var doc = global.document, bawaan = null, pendengar = [];

  function halamanAda(nama) {
    return !!doc.querySelector('.halaman[data-halaman="' + nama + '"]');
  }

  function tampilkan(nama) {
    if (!nama || !halamanAda(nama)) nama = bawaan;
    var aktif = null;
    doc.querySelectorAll('.halaman').forEach(function (h) {
      var ya = h.dataset.halaman === nama;
      h.classList.toggle('aktif', ya);
      if (ya) aktif = h;
    });
    doc.querySelectorAll('.menu nav a[href^="#"]').forEach(function (a) {
      if (a.getAttribute('href') === '#' + nama) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    doc.querySelectorAll('[data-tampil-di]').forEach(function (el) {
      el.hidden = el.dataset.tampilDi.split(/\s+/).indexOf(nama) < 0;
    });
    var judul = doc.getElementById('judulHalaman');
    if (judul && aktif) judul.textContent = aktif.dataset.judul || '';
    // di HP, tab yang aktif digeser ke dalam pandangan
    var tab = doc.querySelector('.menu nav a[aria-current="page"]');
    if (tab && tab.scrollIntoView && global.innerWidth < 900) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
    pendengar.forEach(function (fn) { try { fn(nama); } catch (e) { console.error(e); } });
    return nama;
  }

  function dariAlamat() {
    return tampilkan(decodeURIComponent((global.location.hash || '').slice(1)));
  }

  global.Panel = {
    pasang: function (opsi) {
      bawaan = (opsi && opsi.bawaan) || (doc.querySelector('.halaman') || {}).dataset.halaman;
      global.addEventListener('hashchange', function () { dariAlamat(); global.scrollTo(0, 0); });
      return dariAlamat();
    },
    ke: function (nama) {
      if (global.location.hash === '#' + nama) return tampilkan(nama);
      global.location.hash = nama;
      return nama;
    },
    saatPindah: function (fn) { pendengar.push(fn); },
    sekarang: function () {
      var h = doc.querySelector('.halaman.aktif');
      return h ? h.dataset.halaman : null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
