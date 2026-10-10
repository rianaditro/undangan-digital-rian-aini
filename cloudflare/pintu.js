// Pintu depan mengundang.id di Cloudflare Workers.
//
// Dipanggil HANYA untuk jalur "/" (lihat run_worker_first di
// wrangler.jsonc); semua jalur lain dilayani lapisan aset tanpa
// melewati sini.
//
//   mengundang.id/              → /mulai   (halaman depan platform)
//   www.mengundang.id/          → https://mengundang.id/mulai
//   rian-aini.mengundang.id/    → index.html (undangan pasangan itu)
//   *.workers.dev/              → index.html (pasangan cadangan)

const APEX = 'mengundang.id';

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // Location relatif untuk apex: tetap di host dan skema yang sama,
    // dan bisa diuji tanpa sertifikat. www dipindah ke apex sekalian.
    if (url.pathname === '/' && host === APEX) {
      return new Response(null, { status: 307, headers: { Location: '/mulai' + url.search } });
    }
    if (url.pathname === '/' && host === 'www.' + APEX) {
      return Response.redirect('https://' + APEX + '/mulai' + url.search, 307);
    }

    return env.ASSETS.fetch(request);
  }
};
