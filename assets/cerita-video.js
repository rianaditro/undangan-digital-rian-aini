/* Video cerita — halaman kenangan diringkas jadi video tegak 1080×1920
   untuk story WA, IG, dan TikTok.

   Berkas ini hanya MENGGAMBAR: susun() memilih foto dan menyusun adegan
   untuk durasi 60 atau 90 detik, gambar(ctx, t) melukis satu bingkai pada
   detik t. Merekam bingkai-bingkai itu jadi MP4 dikerjakan pemanggilnya
   (dasbor), jadi penggambarannya bisa diuji dan dipratinjau terpisah.

   Aturan tata letak story: 14% atas dan 20% bawah layar tertutup tombol
   IG/TikTok, jadi tulisan penting duduk di antaranya. */
(function (global) {
  'use strict';

  var L = 1080, T = 1920, FPS = 30;
  var WARNA = { nila: '#131E33', nila3: '#0D1626', kuningan: '#C39A5C', kapur: '#EDE7D9' };
  var HURUF = { display: "'Marcellus', 'Times New Roman', serif", script: "'Cormorant', Georgia, serif" };

  var LAMA_SAMPUL = 5, LAMA_PENUTUP = 6.5, LAMA_FOTO = 2.8, LAMA_JUDUL = 3.8, SILANG = 0.7;

  /* isi: { nama, tanggal, alamat, sampul: foto|null,
            bab: [{ judul, atas?, foto: [{ img, fx, fy, zum, utuh }] }] }  (urut hari itu)
     Foto pertama tiap bab = foto latarnya; itu yang didahulukan. */
  function susun(isi, opsi) {
    var durasi = (opsi && opsi.durasi) || 60;
    var anggaran = durasi - LAMA_SAMPUL - LAMA_PENUTUP;
    var bab = isi.bab.filter(function (b) { return b.foto && b.foto.length; });

    // giliran: foto ke-1 semua bab, lalu foto ke-2 semua bab, dst.
    var ambil = bab.map(function () { return 0; }), dipakai = 0, ada = true;
    while (ada) {
      ada = false;
      for (var i = 0; i < bab.length; i++) {
        if (ambil[i] >= bab[i].foto.length) continue;
        var lama = ambil[i] === 0 ? LAMA_JUDUL : LAMA_FOTO;
        if (dipakai + lama > anggaran) continue;
        ambil[i]++; dipakai += lama; ada = true;
      }
    }

    var adegan = [], t = 0;
    adegan.push({ jenis: 'sampul', mulai: 0, lama: LAMA_SAMPUL, foto: isi.sampul });
    t = LAMA_SAMPUL;
    // sisa anggaran dibagi rata ke semua foto supaya pas di durasinya
    var tambah = 0, nFoto = ambil.reduce(function (a, b) { return a + b; }, 0);
    if (nFoto) tambah = (anggaran - dipakai) / nFoto;
    bab.forEach(function (b, i) {
      for (var k = 0; k < ambil[i]; k++) {
        var lama = (k === 0 ? LAMA_JUDUL : LAMA_FOTO) + tambah;
        adegan.push({ jenis: 'foto', mulai: t, lama: lama, foto: b.foto[k],
                      judul: k === 0 ? b.judul : null, atas: k === 0 ? b.atas : null, ke: adegan.length });
        t += lama;
      }
    });
    adegan.push({ jenis: 'penutup', mulai: t, lama: durasi - t });
    return { adegan: adegan, total: durasi, fps: FPS, lebar: L, tinggi: T, isi: isi };
  }

  /* ---------- alat gambar ---------- */
  function mudah(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function antara(t, a, b) { return mudah((t - a) / (b - a)); }

  function huruf(ctx, ukuran, keluarga, gaya) {
    ctx.font = (gaya || '') + ' ' + ukuran + 'px ' + keluarga;
  }
  function tulisJarang(ctx, teks, x, y, jarak) {
    // letter-spacing manual; canvas.letterSpacing belum ada di semua peramban
    if ('letterSpacing' in ctx) { ctx.letterSpacing = jarak + 'px'; ctx.fillText(teks, x + jarak / 2, y); ctx.letterSpacing = '0px'; return; }
    var lebar = 0, i, w = [];
    for (i = 0; i < teks.length; i++) { w[i] = ctx.measureText(teks[i]).width; lebar += w[i] + (i ? jarak : 0); }
    var al = ctx.textAlign, mulai = al === 'center' ? x - lebar / 2 : x;
    ctx.textAlign = 'left';
    for (i = 0; i < teks.length; i++) { ctx.fillText(teks[i], mulai, y); mulai += w[i] + jarak; }
    ctx.textAlign = al;
  }
  function bungkus(ctx, teks, lebarMaks) {
    var kata = String(teks).split(/\s+/), baris = [], kini = '';
    kata.forEach(function (k) {
      var coba = kini ? kini + ' ' + k : k;
      if (ctx.measureText(coba).width > lebarMaks && kini) { baris.push(kini); kini = k; } else kini = coba;
    });
    if (kini) baris.push(kini);
    return baris;
  }

  /* Foto memenuhi layar dengan gerak pelan (Ken Burns), mengikuti titik
     fokus dan zum yang diatur pasangan di dasbor. Foto "utuh" (landscape)
     tampil utuh di tengah dengan latar dirinya sendiri yang buram. */
  function lukisFoto(ctx, f, p, arah) {
    if (!f || !f.img) return;
    var img = f.img, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var zum = (f.zum || 1) * (1.04 + 0.08 * p);
    var geser = (arah ? 1 : -1) * (p - 0.5) * 0.03;
    if (f.utuh) {
      ctx.save();
      ctx.filter = 'blur(38px) brightness(0.42) saturate(1.15)';
      sampul(ctx, img, iw, ih, 0.5, 0.5, 1.15, 0);
      ctx.restore();
      var w = L * (1 + 0.04 * p), h = w * ih / iw, y = T * 0.43 - h / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
      ctx.drawImage(img, (L - w) / 2 + geser * L, y, w, h);
      ctx.restore();
      return;
    }
    sampul(ctx, img, iw, ih, f.fx == null ? 0.5 : f.fx, f.fy == null ? 0.5 : f.fy, zum, geser);
  }
  function sampul(ctx, img, iw, ih, fx, fy, zum, geser) {
    var s = Math.max(L / iw, T / ih) * zum, w = iw * s, h = ih * s;
    var x = (L - w) * fx + geser * L, y = (T - h) * fy;
    x = Math.min(0, Math.max(L - w, x)); y = Math.min(0, Math.max(T - h, y));
    ctx.drawImage(img, x, y, w, h);
  }
  function gelapBawah(ctx, kuat) {
    var g = ctx.createLinearGradient(0, T * 0.38, 0, T);
    g.addColorStop(0, 'rgba(13,22,38,0)');
    g.addColorStop(0.55, 'rgba(13,22,38,' + (0.55 * kuat) + ')');
    g.addColorStop(1, 'rgba(13,22,38,' + (0.92 * kuat) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, T);
    var a = ctx.createLinearGradient(0, 0, 0, T * 0.2);
    a.addColorStop(0, 'rgba(13,22,38,' + (0.45 * kuat) + ')'); a.addColorStop(1, 'rgba(13,22,38,0)');
    ctx.fillStyle = a; ctx.fillRect(0, 0, L, T * 0.2);
  }
  function garisEmas(ctx, cx, y, lebar, alfa) {
    ctx.save(); ctx.globalAlpha = alfa;
    ctx.strokeStyle = WARNA.kuningan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - lebar / 2, y); ctx.lineTo(cx - 14, y); ctx.moveTo(cx + 14, y); ctx.lineTo(cx + lebar / 2, y); ctx.stroke();
    ctx.translate(cx, y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-6, -6, 12, 12);
    ctx.restore();
  }

  /* ---------- adegan ---------- */
  function lukisSampul(ctx, a, u, isi) {
    var p = u / a.lama;
    if (a.foto) lukisFoto(ctx, a.foto, p, true);
    else { ctx.fillStyle = WARNA.nila; ctx.fillRect(0, 0, L, T); }
    gelapBawah(ctx, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var a1 = antara(u, 0.4, 1.4), a2 = antara(u, 0.9, 2.1), a3 = antara(u, 1.6, 2.6);
    ctx.fillStyle = 'rgba(195,154,92,' + a1 + ')';
    huruf(ctx, 30, HURUF.display); tulisJarang(ctx, 'TERIMA KASIH', L / 2, T * 0.6 + (1 - a1) * 20, 12);
    ctx.fillStyle = 'rgba(237,231,217,' + a2 + ')';
    var ukuran = 124; huruf(ctx, ukuran, HURUF.display);
    while (ctx.measureText(isi.nama).width > L * 0.86 && ukuran > 60) { ukuran -= 4; huruf(ctx, ukuran, HURUF.display); }
    ctx.fillText(isi.nama, L / 2, T * 0.6 + 150 + (1 - a2) * 30);
    garisEmas(ctx, L / 2, T * 0.6 + 210, 320, a3);
    ctx.fillStyle = 'rgba(237,231,217,' + (0.85 * a3) + ')';
    huruf(ctx, 30, HURUF.display); tulisJarang(ctx, isi.tanggal.toUpperCase(), L / 2, T * 0.6 + 280, 8);
  }

  function lukisFotoAdegan(ctx, a, u) {
    lukisFoto(ctx, a.foto, u / a.lama, a.ke % 2 === 0);
    gelapBawah(ctx, a.judul ? 1 : 0.55);
    if (!a.judul) return;
    // judul bab: naik pelan, bertahan, lalu pudar sebelum foto berikutnya
    var masuk = antara(u, 0.35, 1.25), keluar = 1 - antara(u, a.lama - 0.9, a.lama - 0.2);
    var alfa = masuk * keluar;
    ctx.textAlign = 'center';
    huruf(ctx, 76, HURUF.display);
    var baris = bungkus(ctx, a.judul, L * 0.82), tinggiBaris = 92;
    var dasar = T * 0.74 - (baris.length - 1) * tinggiBaris + (1 - masuk) * 28;
    garisEmas(ctx, L / 2, dasar - 96, 240, alfa);
    if (a.atas) {   // tulisan kecil di atas garis, mis. "MEMPELAI PRIA"
      ctx.fillStyle = 'rgba(195,154,92,' + alfa + ')';
      huruf(ctx, 26, HURUF.display); tulisJarang(ctx, a.atas.toUpperCase(), L / 2, dasar - 130, 10);
      huruf(ctx, 76, HURUF.display);
    }
    ctx.fillStyle = 'rgba(237,231,217,' + alfa + ')';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24;
    baris.forEach(function (b, i) { ctx.fillText(b, L / 2, dasar + i * tinggiBaris); });
    ctx.shadowBlur = 0;
  }

  function lukisPenutup(ctx, a, u, isi) {
    ctx.fillStyle = WARNA.nila3; ctx.fillRect(0, 0, L, T);
    var g = ctx.createRadialGradient(L / 2, T * 0.45, 40, L / 2, T * 0.45, T * 0.6);
    g.addColorStop(0, 'rgba(195,154,92,.16)'); g.addColorStop(1, 'rgba(195,154,92,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, T);
    ctx.textAlign = 'center';
    var a1 = antara(u, 0.3, 1.3), a2 = antara(u, 1.2, 2.2), a3 = antara(u, 2.2, 3.2);
    ctx.fillStyle = 'rgba(237,231,217,' + (0.9 * a1) + ')';
    huruf(ctx, 58, HURUF.script, 'italic');
    bungkus(ctx, 'Terima kasih telah menjadi bagian dari hari terindah kami.', L * 0.76)
      .forEach(function (b, i) { ctx.fillText(b, L / 2, T * 0.36 + i * 78 + (1 - a1) * 20); });
    garisEmas(ctx, L / 2, T * 0.5, 320, a2);
    ctx.fillStyle = 'rgba(237,231,217,' + a2 + ')';
    huruf(ctx, 96, HURUF.display);
    ctx.fillText(isi.nama, L / 2, T * 0.5 + 140);
    ctx.fillStyle = 'rgba(195,154,92,' + a3 + ')';
    huruf(ctx, 28, HURUF.display); tulisJarang(ctx, 'KISAH LENGKAPNYA DI', L / 2, T * 0.68, 8);
    ctx.fillStyle = 'rgba(237,231,217,' + a3 + ')';
    huruf(ctx, 40, HURUF.script, '500');
    ctx.fillText(isi.alamat, L / 2, T * 0.68 + 62);
  }

  function lukisAdegan(ctx, a, t, isi) {
    var u = t - a.mulai;
    if (a.jenis === 'sampul') lukisSampul(ctx, a, u, isi);
    else if (a.jenis === 'penutup') lukisPenutup(ctx, a, u, isi);
    else lukisFotoAdegan(ctx, a, u);
  }

  /* Satu bingkai pada detik t. Pergantian adegan memudar silang. */
  function gambar(ctx, rencana, t) {
    var ad = rencana.adegan, i = ad.length - 1;
    while (i > 0 && ad[i].mulai > t) i--;
    var a = ad[i];
    ctx.save();
    ctx.fillStyle = WARNA.nila3; ctx.fillRect(0, 0, L, T);
    if (i > 0 && t - a.mulai < SILANG) {
      lukisAdegan(ctx, ad[i - 1], t, rencana.isi);
      ctx.globalAlpha = mudah((t - a.mulai) / SILANG);
    }
    lukisAdegan(ctx, a, t, rencana.isi);
    ctx.restore();
    // satu detik terakhir memudar ke gelap
    var akhir = antara(t, rencana.total - 1, rencana.total);
    if (akhir > 0) { ctx.fillStyle = 'rgba(13,22,38,' + akhir + ')'; ctx.fillRect(0, 0, L, T); }
  }

  global.CeritaVideo = { susun: susun, gambar: gambar, LEBAR: L, TINGGI: T, FPS: FPS };
})(typeof window !== 'undefined' ? window : globalThis);
