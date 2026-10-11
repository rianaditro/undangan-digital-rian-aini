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
    // …tapi tidak lebih dari 6 dtk per foto: kalau fotonya sedikit,
    // videonya yang lebih pendek, bukan fotonya yang terlalu lama diam
    if (nFoto) tambah = Math.min((anggaran - dipakai) / nFoto, 6 - LAMA_JUDUL);
    bab.forEach(function (b, i) {
      for (var k = 0; k < ambil[i]; k++) {
        var lama = (k === 0 ? LAMA_JUDUL : LAMA_FOTO) + tambah;
        adegan.push({ jenis: 'foto', mulai: t, lama: lama, foto: b.foto[k],
                      judul: k === 0 ? b.judul : null, atas: k === 0 ? b.atas : null, ke: adegan.length });
        t += lama;
      }
    });
    var total = Math.min(durasi, t + LAMA_PENUTUP + 1.5);
    adegan.push({ jenis: 'penutup', mulai: t, lama: total - t });
    return { adegan: adegan, total: total, fps: FPS, lebar: L, tinggi: T, isi: isi };
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
      // Latar buram: foto yang sama dikecilkan lalu dibesarkan lagi.
      // ctx.filter lebih halus, tapi Safari lama tidak mengenalnya dan
      // blur sebesar itu tiap bingkai berat di HP.
      if (!f.buram) f.buram = buramkan(img, iw, ih);
      ctx.save();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(f.buram, -L * 0.06, -T * 0.06, L * 1.12, T * 1.12);
      ctx.fillStyle = 'rgba(9,14,24,.58)'; ctx.fillRect(0, 0, L, T);
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
  function buramkan(img, iw, ih) {
    var k = document.createElement('canvas'); k.width = 27; k.height = 48;
    var c = k.getContext('2d'), s = Math.max(27 / iw, 48 / ih);
    c.drawImage(img, (27 - iw * s) / 2, (48 - ih * s) / 2, iw * s, ih * s);
    return k;
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

  /* ---------- dari data halaman kenangan ----------
     d = jawaban terimakasih_pratinjau (sama dengan yang dibaca halaman),
     K = window.Kenangan. Urutan dan judul bab persis seperti halaman;
     video (berkas bergerak) dilewati — videonya pakai foto saja. */
  var BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  function judulKata(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s-])([^a-z\s]*)([a-z])/g, function (m, a, b, c) { return a + b + c.toUpperCase(); });
  }
  function angka(n, bawaan, lo, hi) { n = Number(n); return isFinite(n) && n >= lo && n <= hi ? n : bawaan; }
  function catatan(f) {
    var utuh = f.tampilan === 'utuh' || (f.tampilan !== 'isi' && f.lebar && f.tinggi && f.lebar > f.tinggi * 1.15);
    return { jalur: f.jalur, fx: angka(f.fokus_x, 50, 0, 100) / 100, fy: angka(f.fokus_y, 50, 0, 100) / 100,
             zum: angka(f.zum, 1, 1, 3), utuh: !!utuh };
  }
  function dariData(d, K, alamat) {
    var foto = (d.foto || []).filter(function (f) { return f.jenis !== 'video'; });
    var bagian = {}, acara = {};
    foto.forEach(function (f) {
      if (f.bagian) (bagian[f.bagian] = bagian[f.bagian] || []).push(catatan(f));
      else if (f.acara_id) (acara[f.acara_id] = acara[f.acara_id] || []).push(catatan(f));
    });
    var pria = (d.mempelai && d.mempelai.pria) || {}, wanita = (d.mempelai && d.mempelai.wanita) || {};
    var nama = [judulKata(pria.panggilan), judulKata(wanita.panggilan)].filter(Boolean).join(' & ');
    var tgl = '';
    if (d.tanggal_acara) { var p = String(d.tanggal_acara).slice(0, 10).split('-'); tgl = Number(p[2]) + ' ' + BULAN[Number(p[1]) - 1] + ' ' + p[0]; }
    var bab = [];
    K.BLOK.forEach(function (def) {
      var b = K.berlaku(d.blok, def.kunci);
      if (!b.tampil) return;
      if (def.jenis === 'media' && def.kunci !== 'sampul') {
        var m = def.kunci === 'pria' ? pria : def.kunci === 'wanita' ? wanita : null;
        bab.push({ judul: b.judul || (m && judulKata(m.panggilan)) || def.nama,
                   atas: def.kunci === 'pria' ? 'Mempelai pria' : def.kunci === 'wanita' ? 'Mempelai wanita' : null,
                   foto: bagian[def.kunci] || [] });
      }
      if (def.jenis === 'acara') (d.babak || []).forEach(function (a) {
        bab.push({ judul: a.nama || 'Acara', atas: null, foto: acara[a.id] || [] });
      });
    });
    return { nama: nama, tanggal: [tgl, judulKata(d.kota)].filter(Boolean).join(' · '), alamat: alamat,
             sampul: (bagian.sampul || [])[0] || null, bab: bab };
  }
  function jumlahFoto(rencana) {
    return rencana.adegan.filter(function (a) { return a.foto; }).length;
  }

  /* Hanya foto yang benar-benar dipakai rencana yang diunduh. */
  function muatGambar(rencana, alamatFoto) {
    var perlu = rencana.adegan.filter(function (a) { return a.foto; }).map(function (a) { return a.foto; });
    return Promise.all(perlu.map(function (f) {
      return new Promise(function (selesai) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { f.img = img; selesai(); };
        img.onerror = function () { f.img = null; selesai(); };   // satu foto gagal: adegannya gelap, bukan batal
        img.src = alamatFoto(f.jalur);
      });
    }));
  }

  /* ---------- musik ----------
     Musik undangan diulang sampai durasinya, masuk 1 dtk dan keluar
     2,5 dtk memudar. Dirender sekali jadi AudioBuffer 48 kHz stereo. */
  function siapkanMusik(alamat, durasi) {
    if (!alamat) return Promise.resolve(null);
    var Ctx = global.AudioContext || global.webkitAudioContext;
    var Off = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!Ctx || !Off) return Promise.resolve(null);
    return fetch(alamat).then(function (r) { if (!r.ok) throw new Error('musik ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        var c = new Ctx();
        return new Promise(function (ok, no) { c.decodeAudioData(ab, ok, no); })
          .then(function (buf) { if (c.close) c.close(); return buf; });
      })
      .then(function (buf) {
        var off = new Off(2, Math.ceil(48000 * durasi), 48000);
        var src = off.createBufferSource(); src.buffer = buf; src.loop = true;
        var g = off.createGain();
        g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.9, 1);
        g.gain.setValueAtTime(0.9, Math.max(1, durasi - 2.5)); g.gain.linearRampToValueAtTime(0, durasi);
        src.connect(g); g.connect(off.destination); src.start(0);
        return off.startRendering();
      })
      .catch(function () { return null; });   // tanpa musik lebih baik daripada gagal
  }

  /* ---------- merekam ----------
     Jalan 1 (cepat, tidak perlu menunggu waktu nyata): WebCodecs —
     H.264 + AAC dibungkus MP4. Chrome/Edge desktop & Android, Safari 26.
     Jalan 2: MediaRecorder dari canvas, waktu nyata (90 dtk = 90 dtk).
     Safari lama menghasilkan MP4 di sini; peramban lain mungkin WebM. */
  /* H.264 + AAC: satu-satunya pasangan yang diputar WA, IG, dan TikTok
     di semua HP. Uji menambah VP9/Opus karena Chromium uji tidak membawa
     pengode H.264. */
  var KODEK = {
    video: [{ codec: 'avc1.640028', mux: 'avc' }, { codec: 'avc1.4d0028', mux: 'avc' }, { codec: 'avc1.42e028', mux: 'avc' }],
    audio: [{ codec: 'mp4a.40.2', mux: 'aac' }]
  };
  function pertamaYangBisa(daftar, periksa) {
    var i = 0;
    function coba() {
      if (i >= daftar.length) return null;
      var k = daftar[i++];
      return periksa(k.codec).then(function (r) { return r.supported ? k : coba(); }, coba);
    }
    return Promise.resolve(coba());
  }
  function cariKodek() {
    if (!global.VideoEncoder || !global.AudioEncoder || !global.Mp4Muxer) return Promise.resolve(null);
    return pertamaYangBisa(KODEK.video, function (c) {
      return VideoEncoder.isConfigSupported({ codec: c, width: L, height: T, bitrate: 6e6, framerate: FPS });
    }).then(function (v) {
      if (!v) return null;
      return pertamaYangBisa(KODEK.audio, function (c) {
        return AudioEncoder.isConfigSupported({ codec: c, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
      }).then(function (a) { return a ? { video: v, audio: a } : null; });
    });
  }
  function jenisRekaman() {
    if (!global.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    var daftar = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
                  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < daftar.length; i++) if (MediaRecorder.isTypeSupported(daftar[i])) return daftar[i];
    return null;
  }
  function bisa() {
    return cariKodek().then(function (k) {
      if (k) return { jalan: 'webcodecs', kodek: k, ekstensi: 'mp4' };   // k = { video, audio }
      var j = jenisRekaman();
      if (j) return { jalan: 'rekam', jenis: j, ekstensi: /mp4/.test(j) ? 'mp4' : 'webm' };
      return null;
    });
  }

  function tunggu(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* kanvas: <canvas> 1080×1920 yang juga jadi pratinjau di layar.
     opsi: { musik: AudioBuffer|null, kemajuan(0..1), batal(): bool } */
  function rekamWebCodecs(rencana, kanvas, cara, opsi) {
    var ctx = kanvas.getContext('2d'), galat = null;
    var muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: cara.kodek.video.mux, width: L, height: T, frameRate: FPS },
      audio: opsi.musik ? { codec: cara.kodek.audio.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: 'in-memory', firstTimestampBehavior: 'offset'
    });
    var ve = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { galat = e; } });
    var konf = { codec: cara.kodek.video.codec, width: L, height: T, bitrate: 6e6, framerate: FPS };
    if (cara.kodek.video.mux === 'avc') konf.avc = { format: 'avc' };
    ve.configure(konf);
    var ae = null;
    if (opsi.musik) {
      ae = new AudioEncoder({ output: function (c, m) { muxer.addAudioChunk(c, m); }, error: function (e) { galat = e; } });
      ae.configure({ codec: cara.kodek.audio.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
      var b = opsi.musik, n = b.length, kiri = b.getChannelData(0), kanan = b.getChannelData(1);
      for (var s = 0; s < n; s += 4800) {
        var k = Math.min(4800, n - s), data = new Float32Array(k * 2);
        data.set(kiri.subarray(s, s + k), 0); data.set(kanan.subarray(s, s + k), k);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: k, numberOfChannels: 2,
                                 timestamp: Math.round(s / 48000 * 1e6), data: data });
        ae.encode(ad); ad.close();
      }
    }
    var total = Math.round(rencana.total * FPS), i = 0;
    function langkah() {
      if (galat) return Promise.reject(galat);
      if (opsi.batal && opsi.batal()) return Promise.reject(new Error('dibatalkan'));
      if (i >= total) return Promise.resolve();
      if (ve.encodeQueueSize > 6) return tunggu(5).then(langkah);
      var akhir = Math.min(total, i + 5);
      for (; i < akhir; i++) {
        gambar(ctx, rencana, i / FPS);
        var f = new VideoFrame(kanvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
        ve.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close();
      }
      if (opsi.kemajuan) opsi.kemajuan(i / total);
      return tunggu(0).then(langkah);
    }
    return langkah()
      .then(function () { return Promise.all([ve.flush(), ae ? ae.flush() : null]); })
      .then(function () {
        muxer.finalize();
        return new Blob([muxer.target.buffer], { type: 'video/mp4' });
      })
      .finally(function () {
        try { if (ve.state !== 'closed') ve.close(); } catch (e) {}
        try { if (ae && ae.state !== 'closed') ae.close(); } catch (e) {}
      });
  }

  function rekamWaktuNyata(rencana, kanvas, cara, opsi) {
    var ctx = kanvas.getContext('2d');
    var aliran = kanvas.captureStream(FPS), ac = null, sumber = null;
    if (opsi.musik) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      ac = new Ctx({ sampleRate: 48000 });
      var tuju = ac.createMediaStreamDestination();
      sumber = ac.createBufferSource(); sumber.buffer = opsi.musik; sumber.connect(tuju);   // tidak ke pengeras suara
      tuju.stream.getAudioTracks().forEach(function (t) { aliran.addTrack(t); });
    }
    var rek = new MediaRecorder(aliran, { mimeType: cara.jenis, videoBitsPerSecond: 6e6, audioBitsPerSecond: 128000 });
    var potong = [];
    rek.ondataavailable = function (e) { if (e.data && e.data.size) potong.push(e.data); };
    return new Promise(function (selesai, gagal) {
      var mulai = null, jam = null;
      function bingkai() {
        var t = (performance.now() - mulai) / 1000;
        if (opsi.batal && opsi.batal()) { berhenti(); gagal(new Error('dibatalkan')); return; }
        if (t >= rencana.total) { gambar(ctx, rencana, rencana.total - 0.001); berhenti(); return; }
        gambar(ctx, rencana, t);
        if (opsi.kemajuan) opsi.kemajuan(t / rencana.total);
      }
      function berhenti() { clearInterval(jam); if (rek.state !== 'inactive') rek.stop(); if (sumber) try { sumber.stop(); } catch (e) {} }
      rek.onstop = function () {
        if (ac && ac.close) ac.close();
        aliran.getTracks().forEach(function (t) { t.stop(); });
        selesai(new Blob(potong, { type: cara.jenis.split(';')[0] }));
      };
      rek.onerror = function (e) { berhenti(); gagal(e.error || new Error('rekaman gagal')); };
      gambar(ctx, rencana, 0);
      Promise.resolve(ac && ac.resume ? ac.resume() : null).then(function () {
        rek.start(1000);
        if (sumber) sumber.start();
        mulai = performance.now();
        // setInterval, bukan requestAnimationFrame: tetap berdetak walau
        // pratinjaunya bergulir keluar layar
        jam = setInterval(bingkai, 1000 / FPS);
      });
    });
  }

  function rekamVideo(rencana, kanvas, cara, opsi) {
    return cara.jalan === 'webcodecs' ? rekamWebCodecs(rencana, kanvas, cara, opsi) : rekamWaktuNyata(rencana, kanvas, cara, opsi);
  }

  global.CeritaVideo = { susun: susun, gambar: gambar, dariData: dariData, muatGambar: muatGambar,
                         siapkanMusik: siapkanMusik, bisa: bisa, rekam: rekamVideo, jumlahFoto: jumlahFoto,
                         KODEK: KODEK, LEBAR: L, TINGGI: T, FPS: FPS };
})(typeof window !== 'undefined' ? window : globalThis);
