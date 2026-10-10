// R2 tiruan di memori — cukup untuk cloudflare/media.js: put, get
// (dengan range), head, delete. Bentuk objeknya mengikuti R2Object /
// R2ObjectBody di Workers: size, httpEtag, range, writeHttpMetadata().
export class R2Tiruan {
  constructor() { this.isi = new Map(); this.catatan = []; }

  async put(kunci, badan, opsi = {}) {
    let buf;
    if (badan == null) buf = Buffer.alloc(0);
    else if (badan instanceof ArrayBuffer) buf = Buffer.from(badan);
    else if (ArrayBuffer.isView(badan)) buf = Buffer.from(badan.buffer, badan.byteOffset, badan.byteLength);
    else if (typeof badan === 'string') buf = Buffer.from(badan);
    else buf = Buffer.from(await new Response(badan).arrayBuffer());
    const o = { buf, jenis: opsi.httpMetadata?.contentType, cache: opsi.httpMetadata?.cacheControl,
                etag: 'e' + this.isi.size + '-' + buf.length };
    this.isi.set(kunci, o);
    this.catatan.push(['put', kunci]);
    return this.#objek(kunci, o);
  }
  async head(kunci) { const o = this.isi.get(kunci); return o ? this.#objek(kunci, o) : null; }
  async get(kunci, opsi = {}) {
    const o = this.isi.get(kunci);
    if (!o) return null;
    this.catatan.push(['get', kunci]);
    let awal = 0, akhir = o.buf.length - 1, range;
    const r = opsi.range instanceof Headers ? opsi.range.get('range') : null;
    const m = r && r.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      if (m[1] === '') { awal = Math.max(0, o.buf.length - Number(m[2])); }
      else { awal = Number(m[1]); if (m[2] !== '') akhir = Math.min(Number(m[2]), akhir); }
      range = { offset: awal, length: akhir - awal + 1 };
    }
    const potong = o.buf.subarray(awal, akhir + 1);
    return { ...this.#objek(kunci, o), range,
             body: new Response(potong).body, arrayBuffer: async () => potong };
  }
  async delete(kunci) { this.isi.delete(kunci); this.catatan.push(['delete', kunci]); }
  #objek(kunci, o) {
    return { key: kunci, size: o.buf.length, httpEtag: '"' + o.etag + '"',
             writeHttpMetadata(h) { if (o.jenis) h.set('Content-Type', o.jenis); if (o.cache) h.set('Cache-Control', o.cache); } };
  }
}
