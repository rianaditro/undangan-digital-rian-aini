/* ============================================================
   Kit halaman custom — versi 1 (docs/halaman-khusus.md 3.2)

   Halaman custom (custom/<kode>/) bebas menyusun HTML-nya sendiri, tapi
   TIDAK berbicara langsung ke Supabase dan tidak menulis ulang logika
   yang sudah teruji: alamat dan slug tamu, pihak tamu, buku tamu,
   escape, isi halaman terima kasih. Semuanya lewat permukaan ini.

     <script src="/assets/varian.js"></script>
     <script src="/assets/motion.js"></script>   (bila memakai Kit.gerak)
     <script src="/assets/kit.js"></script>

     const u = await Kit.muat();      // isi undangan + tamu
     Kit.ucapan.daftar() / .kirim({ nama, hadir, pesan })
     Kit.kenangan()                   // isi halaman terima kasih
     Kit.musik(tombol)                // musik latar dan tombolnya
     Kit.fotoUrl(foto, 'kecil')
     Kit.gerak                        // = Motion (assets/motion.js)
     Kit.esc(teks)                    // untuk innerHTML; textContent tidak perlu

   Penanda yang wajib ada di halaman (uji/uji-custom.mjs memakainya untuk
   menjalankan kontrak di halaman yang susunannya bebas):
     data-kit="ucapan-nama" / "ucapan-hadir" / "ucapan-pesan" / "ucapan-kirim"
     data-kit="buka"   (opsional) tombol pembuka bila ada sampul/amplop
   dan document.body.dataset.siap = 'isi' sesudah isi tergambar.

   Kit.versi naik bila permukaan ini berubah dengan cara yang mematahkan
   halaman lama; halaman menyebut versi yang dipakainya di halaman.json,
   dan uji/uji-custom.mjs memeriksanya.
   ============================================================ */
(function (global) {
  'use strict';
  var M = global.MENGUNDANG;
  if (!M) throw new Error('kit.js butuh /assets/varian.js dimuat lebih dulu');

  var VERSI = 1;
  /* Nilai yang diterima ucapan_tulis (030) — label bebas, nilai tidak. */
  var HADIR = ['Hadir', 'Belum pasti', 'Tidak hadir'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rpc(nama, badan) {
    return fetch(M.SB.url + '/rest/v1/rpc/' + nama, {
      method: 'POST',
      headers: { apikey: M.SB.key, Authorization: 'Bearer ' + M.SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(badan)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  function judulKata(s) {
    return String(s).replace(/\S+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
  }

  /* ---------- tamu: sama persis dengan index.html ----------
     ?to= menang, lalu slug tamu dari alamat (dirapikan), lalu nama asli
     dan pihaknya dari undangan_tamu. ?p= menang atas pihak database. */
  var tamu = { nama: '', pihak: null, slug: '' };
  var cari = {};
  try { cari = new URLSearchParams(global.location.search); } catch (e) { cari = new URLSearchParams(''); }

  function siapkanTamu() {
    tamu.slug = M.slugTamuDari();
    var to = (cari.get('to') || '').trim();
    tamu.nama = to ? to.slice(0, 60) : (tamu.slug ? judulKata(tamu.slug.replace(/-/g, ' ')).slice(0, 60) : '');
    var mentah = cari.get('p');
    var janji = (tamu.slug && !to)
      ? rpc('undangan_tamu', { p_slug: tamu.slug, p_pasangan: M.slugPasangan() }).catch(function () { return null; })
      : Promise.resolve(null);
    return janji.then(function (baris) {
      var t = Array.isArray(baris) ? baris[0] : baris;
      if (t && t.nama) tamu.nama = String(t.nama).slice(0, 60);
      tamu.pihak = M.pihakSah(mentah) || (t && M.pihakSah(t.pihak)) || null;
      return tamu;
    });
  }

  /* ---------- isi undangan ---------- */
  var janjiMuat = null;
  function muat() {
    if (janjiMuat) return janjiMuat;
    janjiMuat = Promise.all([M.muat(), siapkanTamu()]).then(function () {
      var K = M.KONF, v = M.varian(tamu.pihak);
      var dompet = (v && v.dompet || []).map(function (kode) {
        var d = M.DOMPET[kode];
        return d ? { kode: kode, bank: d.bank, nomor: d.nomor, atasNama: d.an } : null;
      }).filter(Boolean);
      return {
        versi: VERSI,
        slug: K.slug,
        alamat: K.situs,
        tanggal: K.tanggalAcara,            // 'YYYY-MM-DD'
        tanggalRingkas: K.tanggalRingkas,   // seperti ditulis pasangan
        mulai: K.mulai,                     // ISO waktu acara pertama, untuk hitung mundur
        kota: K.kota,
        pembuka: M.teksPembuka(K.pembuka),  // salam, ayat/kutipan, sumbernya — menurut agama
        mempelai: { pria: M.MEMPELAI.pria || {}, wanita: M.MEMPELAI.wanita || {} },
        acara: M.acaraBertempat(v).map(function (x) {
          return { nama: x.acara.nama, tanggal: x.acara.tanggal, jam: x.acara.jam, mulai: x.acara.mulai,
                   tempat: x.tempat ? { nama: x.tempat.nama, alamat: x.tempat.alamat, peta: x.tempat.maps || '' } : null };
        }),
        foto: M.FOTO,                       // { sampul, pria, wanita, galeri: [] } — pakai Kit.fotoUrl
        kisah: M.KISAH.slice(),
        silsilah: M.SILSILAH,
        dompet: dompet,                     // sisi tamu dulu
        tandaTangan: v ? { label: v.ttdLabel, sub: v.ttdSub, nama: v.ttdNama } : null,
        khusus: K.khusus || {},             // pasangan.khusus — bentuknya milik halaman ini
        tamu: { nama: tamu.nama, pihak: tamu.pihak },
        /* pilihan kehadiran untuk formulir ucapan; label pertama ikut agama */
        pilihanHadir: [
          { nilai: 'Hadir', label: M.teksPembuka(K.pembuka).hadir || 'Hadir' },
          { nilai: 'Belum pasti', label: 'Masih belum pasti' },
          { nilai: 'Tidak hadir', label: 'Berhalangan hadir' }
        ]
      };
    });
    return janjiMuat;
  }

  /* ---------- buku tamu ---------- */
  var ucapan = {
    daftar: function () {
      return muat().then(function () { return rpc('ucapan_publik', { p_slug: M.KONF.slug }); })
        .then(function (data) {
          return (data || []).map(function (d) {
            return { nama: d.nama, hadir: d.hadir, pesan: d.pesan, waktu: d.created_at, balasan: d.balasan || null };
          });
        });
    },
    kirim: function (isi) {
      isi = isi || {};
      var nama = String(isi.nama || '').trim(), pesan = String(isi.pesan || '').trim();
      if (!nama) return Promise.reject(new Error('Nama belum diisi'));
      if (!pesan) return Promise.reject(new Error('Ucapan belum diisi'));
      if (HADIR.indexOf(isi.hadir) < 0) return Promise.reject(new Error('Pilih kehadiran'));
      var hadir = isi.hadir;
      return muat().then(function () {
        return rpc('ucapan_tulis', { p_slug: M.KONF.slug, p_nama: nama.slice(0, 40), p_hadir: hadir,
                                     p_pesan: pesan.slice(0, 500), p_pihak: tamu.pihak || null });
      });
    },
    HADIR: HADIR
  };

  /* ---------- halaman terima kasih ---------- */
  function kenangan() {
    return rpc('terimakasih_isi', { p_slug: M.slugPasangan() });
  }

  /* ---------- musik latar ----------
     Satu tombol, satu berkas (M.BACKSOUND_URL). Peramban menolak suara
     sebelum ada sentuhan, jadi musik hanya mulai dari tombol ini. */
  function musik(tombol) {
    if (!tombol) return null;
    var audio = null, nyala = false;
    function kabar() {
      tombol.setAttribute('aria-pressed', String(nyala));
      tombol.setAttribute('aria-label', nyala ? 'Matikan musik latar' : 'Nyalakan musik latar');
    }
    function alih() {
      if (!M.BACKSOUND_URL) return;
      if (!audio) { audio = new Audio(M.BACKSOUND_URL); audio.loop = true; }
      nyala = !nyala;
      if (nyala) audio.play().catch(function () { nyala = false; kabar(); });
      else audio.pause();
      kabar();
    }
    tombol.addEventListener('click', alih);
    kabar();
    return { alih: alih, nyala: function () { return nyala; } };
  }

  function fotoUrl(f, ukuran) {
    if (!f) return '';
    return M.fotoUrl(ukuran === 'kecil' ? (f.kecil || f.jalur) : (f.jalur || f.kecil));
  }

  global.Kit = {
    versi: VERSI,
    muat: muat,
    tamu: function () { return tamu.nama; },
    ucapan: ucapan,
    kenangan: kenangan,
    musik: musik,
    fotoUrl: fotoUrl,
    esc: esc,
    get gerak() { return global.Motion || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
