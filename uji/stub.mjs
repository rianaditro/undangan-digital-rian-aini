// Model Supabase palsu. Ia MENIRU kontrak yang sudah dibuktikan di SQL
// (migrasi 016 diuji langsung di database), jadi tugasnya di sini bukan
// membuktikan SQL-nya — tapi membuktikan halamannya mengirim argumen
// yang benar dan menggambar jawabannya dengan benar.
import fs from 'node:fs';

export const ISI = JSON.parse(fs.readFileSync(new URL('./undangan-isi.json', import.meta.url),'utf8'));

export const T_PENUH = 'TOKEN-PENUH';
export const T_PIHAK = 'TOKEN-PIHAK';

export function bikinModel(){
  const tamu = [];
  for (let i = 0; i < 210; i++){
    tamu.push({
      id: 'tamu-' + i,
      nama: i === 0 ? 'Ababil Sekeluarga' : 'Tamu Uji ' + String(i).padStart(3,'0'),
      slug: 'tamu-' + i,
      telepon: '0812000' + String(i).padStart(4,'0'),
      pihak: i % 2 ? 'keluarga-pria' : 'keluarga-wanita',
      datang: null, alamat: null, kelompok: null, relasi: null,
      undangan: 'belum', berkat: 'belum'
    });
  }
  const pemberian = [];       // {id, tamu_id, jenis, nominal, barang, catatan}
  const panggilan = [];       // catatan semua rpc yang masuk
  let seq = 0;

  function cakupanPenuh(token){
    if (token === T_PENUH) return true;
    if (token === T_PIHAK) { const e = new Error('Link ini hanya untuk satu pihak'); e.kode = 403; throw e; }
    return false;                                  // null = jalur login email
  }
  function pengelola(token, jwt){
    if (token) { cakupanPenuh(token); return true; }
    if (jwt && jwt !== 'ANON') return true;        // pemilik yang sudah masuk
    const e = new Error('Perlu masuk sebagai pemilik'); e.kode = 403; throw e;
  }
  function beriDari(id){ return pemberian.filter(g => g.tamu_id === id); }
  function rapi(t){ const x = String(t ?? '').replace(/\s+/g,' ').trim(); return x || null; }
  const UANG = new Set(['uang','transfer']);
  const JENIS_SAH = ['uang','transfer','rokok','gula','sembako','parsel',
                     'seserahan','jasa','barang','tenaga'];

  const rpc = {
    undangan_isi: () => ISI,

    panitia_masuk: (a) => a.p_token === T_PENUH
      ? [{ nama: "Rian & 'Aini (semua pihak)", pihak: null }]
      : [{ nama: 'Keluarga Pihak Pria', pihak: 'keluarga-pria' }],

    panitia_daftar: (a) => {
      const sempit = a.p_token === T_PIHAK ? 'keluarga-pria' : null;
      return tamu.filter(t => !sempit || t.pihak === sempit)
                 .map(t => ({ id:t.id, nama:t.nama, slug:t.slug, telepon:t.telepon,
                              pihak:t.pihak, undangan:t.undangan, berkat:t.berkat }));
    },

    foto_daftar: () => [],
    ucapan_daftar: () => [],
    silsilah_daftar: () => [],

    rekap_ringkas: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const ada = new Set(pemberian.map(g => g.tamu_id));
      return {
        tamu: tamu.length,
        datang:  tamu.filter(t => t.datang === true).length,
        tidak:   tamu.filter(t => t.datang === false).length,
        belum:   tamu.filter(t => t.datang == null).length,
        pemberi: ada.size,
        kelompok: new Set(tamu.filter(t=>t.kelompok).map(t=>t.kelompok.toLowerCase())).size,
        uang:    pemberian.filter(g => UANG.has(g.jenis)).reduce((s,g)=>s+(g.nominal||0),0),
        barang:  pemberian.filter(g => !UANG.has(g.jenis)).length,
        berkat_dijatah:   tamu.filter(t => t.berkat === 'dijatah').length,
        berkat_diberikan: tamu.filter(t => t.berkat === 'diberikan').length,
        rinci: (() => {
          const peta = new Map();
          for (const g of pemberian){
            if (UANG.has(g.jenis)) continue;
            const k = g.jenis + '|' + (g.satuan ?? '');
            if (!peta.has(k)) peta.set(k, { jenis:g.jenis, satuan:g.satuan, jumlah:null, baris:0 });
            const e = peta.get(k);
            e.baris++;
            if (g.jumlah != null) e.jumlah = (e.jumlah ?? 0) + g.jumlah;
          }
          return [...peta.values()];
        })()
      };
    },

    rekap_daftar: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const q = (a.p_cari || '').trim().toLowerCase();
      const s = a.p_saring || '';
      const kel = rapi(a.p_kelompok);
      const batas = Math.min(Math.max(a.p_batas ?? 40, 1), 200);
      let out = tamu
        .filter(t => !q
          || t.nama.toLowerCase().includes(q)
          || (t.telepon||'').includes(q)
          || (t.alamat||'').toLowerCase().includes(q)
          || (t.kelompok||'').toLowerCase().includes(q))
        .filter(t => !kel || (t.kelompok||'').toLowerCase() === kel.toLowerCase())
        .filter(t => !s
          || (s==='belum'          && t.datang == null)
          || (s==='datang'         && t.datang === true)
          || (s==='tidak'          && t.datang === false)
          || (s==='tanpa-kelompok' && t.kelompok == null)
          || (s==='berkat-belum'   && t.berkat === 'belum')
          || (s==='berkat-dijatah' && t.berkat === 'dijatah')
          || (s==='memberi' && beriDari(t.id).length));

      out.sort((x,y) => {
        if (a.p_urut === 'kelompok'){
          const kx = x.kelompok ? 0 : 1, ky = y.kelompok ? 0 : 1;
          if (kx !== ky) return kx - ky;
          const cx = (x.kelompok||'').toLowerCase(), cy = (y.kelompok||'').toLowerCase();
          if (cx !== cy) return cx < cy ? -1 : 1;
        }
        return x.nama < y.nama ? -1 : x.nama > y.nama ? 1 : 0;
      });

      return out.slice(0, batas).map(t => ({
        id:t.id, nama:t.nama, pihak:t.pihak, telepon:t.telepon, alamat:t.alamat,
        kelompok:t.kelompok, relasi:t.relasi, datang:t.datang, berkat:t.berkat,
        pemberian: beriDari(t.id) }));
    },

    rekap_unduh: (a, jwt) => {
      pengelola(a.p_token, jwt);
      // TANPA batas dan TANPA saringan — sepadan dengan SQL-nya
      return pemberian.map(g => {
        const t = tamu.find(x => x.id === g.tamu_id);
        return { nama:t.nama, pihak:t.pihak, telepon:t.telepon, alamat:t.alamat,
                 kelompok:t.kelompok, relasi:t.relasi, datang:t.datang, berkat:t.berkat,
                 jenis:g.jenis, nominal:g.nominal, jumlah:g.jumlah, satuan:g.satuan,
                 barang:g.barang, catatan:g.catatan, dicatat:'2026-09-15T09:30:00+00:00' };
      }).sort((x,y) => {
        const kx = x.kelompok ? 0 : 1, ky = y.kelompok ? 0 : 1;
        if (kx !== ky) return kx - ky;
        const cx = (x.kelompok||'').toLowerCase(), cy = (y.kelompok||'').toLowerCase();
        if (cx !== cy) return cx < cy ? -1 : 1;
        return x.nama < y.nama ? -1 : x.nama > y.nama ? 1 : 0;
      });
    },

    rekap_kelompok: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const peta = new Map();
      for (const t of tamu){
        if (!t.kelompok) continue;
        const k = t.kelompok.toLowerCase();
        if (!peta.has(k)) peta.set(k, { kelompok:t.kelompok, anggota:0, datang:0, uang:0, barang:0 });
        const e = peta.get(k);
        e.anggota++;
        if (t.datang === true) e.datang++;
        for (const g of beriDari(t.id)){
          if (UANG.has(g.jenis)) e.uang += g.nominal || 0; else e.barang++;
        }
      }
      return [...peta.values()].sort((x,y) => x.kelompok < y.kelompok ? -1 : 1);
    },

    tamu_ubah_rekap: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const t = tamu.find(x => x.id === a.p_tamu_id);
      if (!t) { const e = new Error('Tamu tidak ditemukan'); e.kode = 400; throw e; }
      if (a.p_alamat !== null && a.p_alamat !== undefined) t.alamat = rapi(a.p_alamat);
      if (a.p_relasi !== null && a.p_relasi !== undefined) t.relasi = rapi(a.p_relasi);
      if (a.p_kelompok !== null && a.p_kelompok !== undefined){
        let k = rapi(a.p_kelompok);
        if (k){   // menempel ke ejaan yang sudah ada
          const ada = tamu.find(x => x.kelompok && x.kelompok.toLowerCase() === k.toLowerCase());
          if (ada) k = ada.kelompok;
        }
        t.kelompok = k;
      }
      return null;
    },

    kelompok_ganti_nama: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const lama = rapi(a.p_lama), baru = rapi(a.p_baru);
      if (!lama) { const e = new Error('Kelompok yang mau diganti harus disebut'); e.kode = 400; throw e; }
      const kena = tamu.filter(t => (t.kelompok||'').toLowerCase() === lama.toLowerCase());
      if (!kena.length) { const e = new Error('Kelompok tidak ditemukan'); e.kode = 400; throw e; }
      kena.forEach(t => { t.kelompok = baru; });
      return kena.length;
    },

    berkat_tandai: (a, jwt) => {
      pengelola(a.p_token, jwt);
      if (!['belum','dijatah','diberikan'].includes(a.p_status)){
        const e = new Error('Status berkat tidak dikenal: ' + JSON.stringify(a.p_status)); e.kode = 400; throw e;
      }
      const t = tamu.find(x => x.id === a.p_tamu_id);
      if (!t) { const e = new Error('Tamu tidak ditemukan'); e.kode = 400; throw e; }
      t.berkat = a.p_status;
      return null;
    },

    panitia_tandai: (a) => {
      const t = tamu.find(x => x.id === a.p_tamu_id);
      if (!t) { const e = new Error('Tamu tidak ada dalam cakupan link ini'); e.kode = 403; throw e; }
      const sah = a.p_jenis === 'undangan' ? ['belum','terkirim','gagal']
                : a.p_jenis === 'berkat'   ? ['belum','dijatah','diberikan'] : null;
      if (!sah) { const e = new Error('Jenis pengiriman tidak dikenal'); e.kode = 400; throw e; }
      if (!sah.includes(a.p_status)){
        const e = new Error('Status ' + a.p_jenis + ' tidak dikenal: ' + JSON.stringify(a.p_status));
        e.kode = 400; throw e;
      }
      t[a.p_jenis] = a.p_status;
      return null;
    },

    tamu_datang: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const t = tamu.find(x => x.id === a.p_tamu_id);
      if (!t) { const e = new Error('Tamu tidak ditemukan'); e.kode = 400; throw e; }
      if (!(a.p_datang === true || a.p_datang === false || a.p_datang === null)){
        const e = new Error('p_datang bukan tri-state: ' + JSON.stringify(a.p_datang)); e.kode = 400; throw e;
      }
      t.datang = a.p_datang;
      return null;
    },

    pemberian_simpan: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const jenis = a.p_jenis;
      if (!JENIS_SAH.includes(jenis)){
        const e = new Error('Jenis pemberian tidak dikenal'); e.kode = 400; throw e;
      }
      const t = tamu.find(x => x.id === a.p_tamu_id);
      if (!t) { const e = new Error('Tamu tidak ditemukan'); e.kode = 400; throw e; }

      let nominal = null, barang = null, jumlah = null, satuan = null;
      if (UANG.has(jenis)){
        if (typeof a.p_nominal !== 'number' || !Number.isFinite(a.p_nominal)){
          const e = new Error('p_nominal bukan angka: ' + JSON.stringify(a.p_nominal)); e.kode = 400; throw e;
        }
        nominal = a.p_nominal;                       // sisanya dibuang, seperti di SQL
      } else {
        barang = rapi(a.p_barang);                   // nominal dibuang, seperti di SQL
        jumlah = a.p_jumlah ?? null;
        satuan = rapi(a.p_satuan);
        if (satuan) satuan = satuan.toLowerCase();
        if (jumlah !== null && typeof jumlah !== 'number'){
          const e = new Error('p_jumlah bukan angka: ' + JSON.stringify(a.p_jumlah)); e.kode = 400; throw e;
        }
        if ((jumlah === null) !== (satuan === null)){
          const e = new Error('Jumlah dan satuan harus diisi berdua'); e.kode = 400; throw e;
        }
        if (jenis === 'barang' && !barang){
          const e = new Error('Sebutkan barangnya'); e.kode = 400; throw e;
        }
      }
      const g = { id: 'beri-' + (++seq), tamu_id: t.id, jenis, nominal, barang,
                  jumlah, satuan, catatan: (a.p_catatan || null) };
      pemberian.push(g);
      return g.id;
    },

    pemberian_hapus: (a, jwt) => {
      pengelola(a.p_token, jwt);
      const i = pemberian.findIndex(g => g.id === a.p_id);
      if (i < 0) { const e = new Error('Catatan pemberian tidak ditemukan'); e.kode = 400; throw e; }
      pemberian.splice(i,1);
      return null;
    }
  };

  return { tamu, pemberian, panggilan, rpc };
}

// Dipasang ke sebuah Playwright page.
export async function pasang(page, model){
  await page.route('**/*.supabase.co/**', async (route) => {
    const req  = route.request();
    const url  = new URL(req.url());
    const jalur = url.pathname;

    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });

    if (jalur.startsWith('/rest/v1/rpc/')){
      const nama = jalur.slice('/rest/v1/rpc/'.length);
      let arg = {};
      try { arg = JSON.parse(req.postData() || '{}'); } catch {}
      const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i,'');
      const jwt  = auth.startsWith('eyJ') ? 'ANON' : auth;   // anon key vs JWT palsu
      model.panggilan.push({ nama, arg, jwt });

      const fn = model.rpc[nama];
      if (!fn) return route.fulfill({ status: 404, contentType:'application/json',
        body: JSON.stringify({ message: 'rpc tak dikenal: ' + nama }) });
      try {
        const hasil = fn(arg, jwt);
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(hasil === undefined ? null : hasil) });
      } catch (e){
        return route.fulfill({ status: e.kode || 400, contentType:'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ message: e.message }) });
      }
    }

    // apa pun sisanya (auth, storage, functions) tidak dipakai uji ini
    return route.fulfill({ status: 500, contentType:'application/json',
      body: JSON.stringify({ message: 'tidak distub: ' + jalur }) });
  });
}
