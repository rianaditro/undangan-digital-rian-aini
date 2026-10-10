/* ============================================================
   Pengecil gambar di peramban

   Foto dari kamera HP sekarang lazim 4–8 MB. Mengunggahnya apa adanya
   menghabiskan kuota penyimpanan dalam hitungan satu pasangan, dan yang
   lebih mahal lagi: tiap tamu yang membuka halaman terima kasih ikut
   menarik berkas sebesar itu. Jadi pengecilan dikerjakan di HP pengunggah,
   sekali, sebelum berkasnya berangkat.

   Hasilnya sepasang: versi penuh untuk dilihat, versi kecil untuk grid.

   Empat hal yang bikin kode semacam ini sering salah di dunia nyata:

   · Orientasi EXIF. Foto potret dari HP tersimpan mendatar plus penanda
     "putar 90°". Kalau penandanya diabaikan, semua foto potret jadi
     miring. createImageBitmap dengan imageOrientation:'from-image' yang
     mengurusnya.
   · toBlob diam-diam gagal. Diminta 'image/webp' tapi peramban tidak bisa
     mengekspornya, yang keluar PNG — tanpa error, dan PNG foto justru
     jauh lebih besar dari JPEG-nya. Jadi jenis blob hasilnya harus
     diperiksa, bukan dipercaya.
   · Memori. Mendekode 12 MP di HP murah bisa bikin tab-nya mati.
     resizeWidth pada createImageBitmap mendekode sambil mengecilkan,
     jadi ukuran penuhnya tidak pernah singgah di memori.
   · Gambar yang sudah kecil. Jangan pernah diperbesar — cuma menambah
     bita tanpa menambah detail.
   ============================================================ */
(function (global) {
  'use strict';

  var SISI_PENUH   = 1600;      // sisi terpanjang versi penuh
  var SISI_KECIL   = 480;       // sisi terpanjang thumbnail
  var TARGET_PENUH = 220 * 1024;
  var TARGET_KECIL = 40 * 1024;
  var MUTU         = [0.82, 0.72, 0.62, 0.52, 0.42];

  /* ---------- Dukungan WebP ----------
     Dijawab sekali lalu diingat. Pertanyaannya bukan "bisa menampilkan
     WebP" tapi "bisa mengekspor WebP", dan itu dua hal berbeda. */
  var webpBisa = null;

  function dukungWebp() {
    if (webpBisa !== null) return Promise.resolve(webpBisa);
    var k = document.createElement('canvas');
    k.width = 1; k.height = 1;
    return keBlob(k, 'image/webp', 0.8).then(function (b) {
      webpBisa = !!b && b.type === 'image/webp';
      return webpBisa;
    }).catch(function () {
      webpBisa = false;
      return false;
    });
  }

  function keBlob(kanvas, jenis, mutu) {
    return new Promise(function (selesai, gagal) {
      if (kanvas.convertToBlob) {                 // OffscreenCanvas
        kanvas.convertToBlob({ type: jenis, quality: mutu }).then(selesai, gagal);
        return;
      }
      kanvas.toBlob(function (b) {
        if (b) selesai(b); else gagal(new Error('Kanvas gagal diekspor'));
      }, jenis, mutu);
    });
  }

  /* ---------- Mendekode ----------
     Jalur utama createImageBitmap; <img> cuma cadangan untuk peramban
     lama. Di jalur cadangan orientasi EXIF diserahkan ke peramban, yang
     pada versi masa kini memang sudah benar sendiri. */
  function bacaGambar(berkas, sisiTarget) {
    if (global.createImageBitmap) {
      var opsi = { imageOrientation: 'from-image' };
      return createImageBitmap(berkas, opsi).then(function (bmp) {
        var s = skala(bmp.width, bmp.height, sisiTarget);
        if (s === 1) return bmp;
        /* Dekode ulang sambil mengecilkan supaya versi penuhnya tidak
           perlu ditahan di memori. Kalau peramban tidak mendukung opsi
           resize-nya, bitmap pertama tadi tetap terpakai. */
        return createImageBitmap(berkas, {
          imageOrientation: 'from-image',
          resizeWidth:  Math.round(bmp.width  * s),
          resizeHeight: Math.round(bmp.height * s),
          resizeQuality: 'high'
        }).then(function (kecil) {
          bmp.close && bmp.close();
          return kecil;
        }).catch(function () { return bmp; });
      }).catch(lewatImg);
    }
    return lewatImg();

    function lewatImg() {
      return new Promise(function (selesai, gagal) {
        var url = URL.createObjectURL(berkas);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          selesai(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          gagal(new Error('Berkas ini bukan gambar yang bisa dibaca'));
        };
        img.src = url;
      });
    }
  }

  function skala(l, t, sisiTarget) {
    var terpanjang = Math.max(l, t);
    if (terpanjang <= sisiTarget) return 1;      // jangan pernah diperbesar
    return sisiTarget / terpanjang;
  }

  function ukuran(sumber) {
    return {
      l: sumber.width  || sumber.naturalWidth,
      t: sumber.height || sumber.naturalHeight
    };
  }

  function kanvasBaru(l, t) {
    if (global.OffscreenCanvas) return new OffscreenCanvas(l, t);
    var k = document.createElement('canvas');
    k.width = l; k.height = t;
    return k;
  }

  /* ---------- Satu keluaran ---------- */
  function render(sumber, sisiTarget, target, jenis) {
    var u = ukuran(sumber);
    var s = skala(u.l, u.t, sisiTarget);
    var l = Math.max(1, Math.round(u.l * s));
    var t = Math.max(1, Math.round(u.t * s));

    var kanvas = kanvasBaru(l, t);
    var ktx = kanvas.getContext('2d');
    ktx.imageSmoothingEnabled = true;
    ktx.imageSmoothingQuality = 'high';
    ktx.drawImage(sumber, 0, 0, l, t);

    /* Mutu diturunkan bertahap sampai cukup kecil. Yang terakhir dipakai
       apa adanya walau masih di atas target — lebih baik agak besar
       daripada tidak ada foto sama sekali. */
    var i = 0;
    return coba();

    function coba() {
      return keBlob(kanvas, jenis, MUTU[i]).then(function (blob) {
        if (blob.size <= target || i >= MUTU.length - 1) {
          return { blob: blob, lebar: l, tinggi: t };
        }
        i += 1;
        return coba();
      });
    }
  }

  /* ---------- Yang dipanggil halaman ----------
     Kembaliannya { penuh, kecil }, masing-masing { blob, lebar, tinggi }. */
  function siapkan(berkas) {
    if (!berkas || !/^image\//.test(berkas.type)) {
      return Promise.reject(new Error('Yang dipilih bukan berkas gambar'));
    }
    return dukungWebp().then(function (webp) {
      var jenis = webp ? 'image/webp' : 'image/jpeg';
      return bacaGambar(berkas, SISI_PENUH).then(function (sumber) {
        return render(sumber, SISI_PENUH, TARGET_PENUH, jenis)
          .then(function (penuh) {
            return render(sumber, SISI_KECIL, TARGET_KECIL, jenis)
              .then(function (kecil) {
                sumber.close && sumber.close();
                return { penuh: penuh, kecil: kecil };
              });
          });
      });
    });
  }

  /* ---------- Video ----------
     Video TIDAK diubah di peramban: MediaRecorder berbeda-beda antar HP
     dan hasilnya tidak bisa dijamin (docs/kenangan.md §9). Yang
     dikerjakan di sini cuma tiga hal, semuanya sebelum apa pun dikirim:

       1. jenis dan ukurannya masuk akal (MP4/WebM, ≤ BATAS_VIDEO)
       2. peramban INI bisa memutarnya — video HEVC dari sebagian HP
          ditolak di sini, bukan sesudah tamu melihat kotak hitam
       3. satu bingkai dipotret jadi poster: tampil selagi videonya
          dimuat, dan jadi thumbnail di dasbor

     Kembaliannya { video, poster: {blob, lebar, tinggi}, lebar, tinggi,
     durasi_ms }. */
  var BATAS_VIDEO = 20 * 1024 * 1024;
  var JENIS_VIDEO = ['video/mp4', 'video/webm'];

  function siapkanVideo(berkas) {
    if (!berkas || !/^video\//.test(berkas.type)) {
      return Promise.reject(new Error('Yang dipilih bukan berkas video'));
    }
    if (JENIS_VIDEO.indexOf(berkas.type) < 0) {
      return Promise.reject(new Error('Video ' + (berkas.type.split('/')[1] || '').toUpperCase()
        + ' belum diterima — simpan sebagai MP4 dulu (di iPhone: Pengaturan › Kamera › Format › Paling Kompatibel)'));
    }
    if (berkas.size > BATAS_VIDEO) {
      return Promise.reject(new Error('Video lebih dari 20 MB — potong jadi lebih pendek dulu'));
    }
    return new Promise(function (selesai, gagal) {
      var url = URL.createObjectURL(berkas);
      var v = document.createElement('video');
      var habis = setTimeout(function () { akhiri(new Error('Video tidak bisa dibuka di perangkat ini')); }, 20000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      function akhiri(galat, hasil) {
        clearTimeout(habis);
        v.removeAttribute('src'); v.load();
        URL.revokeObjectURL(url);
        galat ? gagal(galat) : selesai(hasil);
      }
      v.onerror = function () {
        akhiri(new Error('Format video ini tidak bisa diputar di semua HP — simpan ulang sebagai MP4 (H.264)'));
      };
      v.onloadedmetadata = function () {
        if (!v.videoWidth || !v.videoHeight) { akhiri(new Error('Video tanpa gambar tidak bisa dipakai')); return; }
        v.currentTime = Math.min(1, (v.duration || 0) / 2);
      };
      v.onseeked = function () {
        var s = skala(v.videoWidth, v.videoHeight, SISI_PENUH);
        var l = Math.max(1, Math.round(v.videoWidth * s)), t = Math.max(1, Math.round(v.videoHeight * s));
        var k = kanvasBaru(l, t);
        k.getContext('2d').drawImage(v, 0, 0, l, t);
        dukungWebp().then(function (webp) {
          return keBlob(k, webp ? 'image/webp' : 'image/jpeg', 0.72);
        }).then(function (blob) {
          akhiri(null, {
            video: berkas,
            poster: { blob: blob, lebar: l, tinggi: t },
            lebar: v.videoWidth, tinggi: v.videoHeight,
            durasi_ms: Math.round((v.duration || 0) * 1000)
          });
        }).catch(function (e) { akhiri(e); });
      };
      v.src = url;
    });
  }

  /* ---------- Alamat publik sebuah foto ----------
     Sekadar penerus ke MENGUNDANG.fotoUrl(). Fungsinya pindah ke
     assets/varian.js supaya halaman undangan bisa memakainya tanpa ikut
     memuat pengecil gambar ini — tamu tidak pernah mengunggah apa pun.
     Nama lamanya dipertahankan supaya pemanggil yang ada tidak berubah. */
  function url(jalur) {
    var M = global.MENGUNDANG;
    return (M && M.fotoUrl) ? M.fotoUrl(jalur) : '';
  }

  global.Gambar = {
    siapkan: siapkan,
    siapkanVideo: siapkanVideo,
    BATAS_VIDEO: BATAS_VIDEO,
    url: url,
    SISI_PENUH: SISI_PENUH,
    SISI_KECIL: SISI_KECIL
  };
})(typeof window !== 'undefined' ? window : globalThis);
