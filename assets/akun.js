/* Lupa sandi dan tautan dari email — dipakai bersama /pemilik, /admin,
   dan /dasbor. Butuh assets/varian.js (MENGUNDANG.SB) dimuat lebih dulu.

     AKUN.kirimPemulihan(email, '/admin')  → Supabase mengirim email
         berisi tautan kembali ke halaman itu
     AKUN.bacaTautan()  → kalau halaman dibuka dari tautan email:
         { akses, segar, email, jenis } atau { galat }; hash dibuang dari
         bilah alamat supaya token tidak tertinggal di riwayat
     AKUN.simpanSandi(akses, sandi)  → sandi baru untuk sesi itu

   Halaman tujuan harus terdaftar di Supabase → Authentication → URL
   Configuration → Redirect URLs (https://mengundang.id/** mencakup
   semuanya); yang tidak terdaftar dikirim Supabase ke Site URL. */
(function (g) {
  'use strict';
  var M = g.MENGUNDANG;

  async function kirimPemulihan(email, jalur) {
    email = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) throw new Error('Isi email Anda dulu.');
    var r = await fetch(M.SB.url + '/auth/v1/recover?redirect_to=' +
      encodeURIComponent(location.origin + jalur), {
      method: 'POST',
      headers: { 'apikey': M.SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });
    if (r.status === 429) throw new Error('Terlalu sering meminta. Coba lagi beberapa menit lagi.');
    if (!r.ok) {
      var j = {}; try { j = await r.json(); } catch (e) {}
      throw new Error(j.msg || j.error_description || j.message || 'Gagal mengirim email');
    }
  }

  function bacaTautan() {
    var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (!h.get('access_token') && !h.get('error') && !h.get('error_code')) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('error') || h.get('error_code')) {
      var ket = h.get('error_description') || h.get('error_code') || '';
      return { galat: /expired|invalid/i.test(ket)
        ? 'Tautan di email sudah kedaluwarsa atau sudah dipakai. Minta tautan baru lewat "Lupa sandi?".'
        : (ket || 'Tautan tidak bisa dipakai.') };
    }
    var email = '';
    try {
      var bagian = h.get('access_token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      email = JSON.parse(atob(bagian)).email || '';
    } catch (e) {}
    return { akses: h.get('access_token'), segar: h.get('refresh_token'), email: email,
             jenis: h.get('type') || '' };
  }

  async function simpanSandi(akses, sandi) {
    if (String(sandi || '').length < 10) throw new Error('Minimal 10 huruf.');
    var r = await fetch(M.SB.url + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': M.SB.key, 'Authorization': 'Bearer ' + akses, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: sandi })
    });
    if (!r.ok) {
      var j = {}; try { j = await r.json(); } catch (e) {}
      throw new Error(j.msg || j.error_description || j.message || 'Gagal menyimpan sandi');
    }
  }

  g.AKUN = { kirimPemulihan: kirimPemulihan, bacaTautan: bacaTautan, simpanSandi: simpanSandi };
})(window);
