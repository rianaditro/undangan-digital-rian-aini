// Pintu depan mengundang.id di Cloudflare Workers.
//
// Dipanggil untuk navigasi halaman (lihat run_worker_first di
// wrangler.jsonc); folder berkas — /assets, /tema, /custom — dilayani
// lapisan aset langsung tanpa melewati sini.
//
//   mengundang.id/              → /mulai   (halaman depan platform)
//   www.mengundang.id/          → https://mengundang.id/mulai
//   rian-aini.mengundang.id/    → index.html (undangan pasangan itu)
//   *.workers.dev/              → index.html (pasangan cadangan)
//   <host apa pun>/media/…      → foto/video di R2 (cloudflare/media.js)
//
// Halaman custom (Full Custom anak tangga 3, docs/halaman-khusus.md 3.4):
// pasangan yang tercatat di custom/peta.json mendapat
// /custom/<kode>/index.html sebagai undangannya, dan
// /custom/<kode>/terimakasih/index.html sebagai halaman terima kasihnya —
// alamatnya tetap, hanya isinya yang ditukar. Pasangan lain tidak
// tersentuh sama sekali.

import { layaniMedia } from './media.js';
import PETA_CUSTOM from '../custom/peta.json' with { type: 'json' };

const APEX = 'mengundang.id';

// Jalur milik platform: tidak pernah jadi undangan siapa pun, juga di
// alamat pratinjau (sama dengan JALUR_PLATFORM di assets/varian.js).
const JALUR_PLATFORM = new Set(['kirim', 'dasbor', 'terimakasih', 'admin', 'mulai', 'coba', 'reseller',
                                'pemilik', 'assets', 'tema', 'custom', 'media']);
const SIPUT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* Slug pasangan yang memakai halaman custom untuk permintaan ini, atau null.
   HANYA di subdomain pasangan (paket premium / full_custom) dan di alamat
   pratinjau *.workers.dev. Di domain bersama mengundang.id/<slug>/…
   halaman custom berbagi origin dengan /dasbor, dan skrip apa pun di
   dalamnya bisa membaca sesi pengantin yang sedang login — jadi di sana
   tidak pernah dipetakan. */
export function slugCustom(url, peta) {
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split('/').filter(Boolean);
  let slug = '';
  if (host.endsWith('.' + APEX)) {
    const sub = host.slice(0, -APEX.length - 1);
    if (sub.includes('.') || sub === 'www') return null;
    slug = sub;
  } else if (host.endsWith('.workers.dev')) {
    if (seg[0] === 'terimakasih') slug = url.searchParams.get('pasangan') || '';
    else if (seg.length && !JALUR_PLATFORM.has(seg[0])) slug = seg[0].toLowerCase();
  } else {
    return null;
  }
  if (!SIPUT.test(slug) || !Object.prototype.hasOwnProperty.call(peta, slug)) return null;
  return slug;
}

/* Jalur berkas halaman custom untuk permintaan ini: undangan, atau
   terima kasih. Jalur platform lain (/kirim, /dasbor, …) tetap milik
   platform. */
function jalurCustom(url, kode) {
  const seg = url.pathname.split('/').filter(Boolean);
  if (seg[0] === 'terimakasih') return '/custom/' + kode + '/terimakasih/';
  if (seg.length && JALUR_PLATFORM.has(seg[0])) return null;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return null;      // berkas, bukan halaman
  return '/custom/' + kode + '/';
}

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (url.pathname.startsWith('/media/')) return layaniMedia(request, env, ctx);

    // Location relatif untuk apex: tetap di host dan skema yang sama,
    // dan bisa diuji tanpa sertifikat. www dipindah ke apex sekalian.
    if (url.pathname === '/' && host === APEX) {
      return new Response(null, { status: 307, headers: { Location: '/mulai' + url.search } });
    }
    if (url.pathname === '/' && host === 'www.' + APEX) {
      return Response.redirect('https://' + APEX + '/mulai' + url.search, 307);
    }

    // env.PETA_CUSTOM hanya dipakai uji; di Cloudflare petanya dibundel.
    const peta = env.PETA_CUSTOM || PETA_CUSTOM;
    const slug = (request.method === 'GET' || request.method === 'HEAD') && slugCustom(url, peta);
    if (slug) {
      const jalur = jalurCustom(url, peta[slug]);
      if (jalur) {
        // Diminta dengan garis miring penutup, jadi lapisan aset
        // menjawab index.html-nya langsung, tanpa alih ke jalur lain.
        const isi = await env.ASSETS.fetch(new Request(new URL(jalur, url), request));
        if (isi.status === 200) return isi;
        if (isi.status >= 300 && isi.status < 400) {
          const ke = new URL(isi.headers.get('Location'), url);
          const lagi = await env.ASSETS.fetch(new Request(ke, request));
          if (lagi.status === 200) return lagi;
        }
        // folder custom tidak ada → jatuh ke template, bukan halaman kosong
      }
    }

    return env.ASSETS.fetch(request);
  }
};
