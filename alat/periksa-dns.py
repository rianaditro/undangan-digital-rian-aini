#!/usr/bin/env python3
"""Membandingkan DNS yang SEKARANG dilihat dunia dengan yang akan dilayani
Vercel, sebelum nameserver dipindah.

Kenapa ini ada. Delegasi NS mengundang.id punya TTL 6 jam. Begitu
nameserver diganti di registrar, selama sampai 6 jam sebagian resolver
masih bertanya ke nameserver lama dan sebagian sudah bertanya ke yang
baru. Selama kedua sisi menjawab sama, tidak ada yang terasa. Kalau sisi
barunya kosong, sebagian pengunjung dapat SERVFAIL — dan
rian-aini.mengundang.id itu undangan sungguhan yang tautannya sudah
dipegang 415 tamu.

Jadi urutannya bukan selera: isi dulu zona di Vercel, buktikan
jawabannya sama, baru pindahkan nameserver.

    python3 alat/periksa-dns.py

Tanpa pustaka luar — resolver DNS seadanya di bawah, cukup untuk A,
CNAME, NS, SOA, MX, dan TXT. Dijalankan dari mana saja yang bisa
mengirim UDP ke port 53.
"""

import socket
import struct
import sys

DOMAIN = "mengundang.id"

# Nama yang harus tetap hidup sesudah pindah. rian-aini yang pertama
# bukan kebetulan: itu satu-satunya yang tautannya sudah tersebar.
NAMA = [
    ("rian-aini." + DOMAIN, "CNAME"),
    (DOMAIN, "A"),
    ("www." + DOMAIN, "CNAME"),
    ("uji-wildcard-abc." + DOMAIN, "CNAME"),   # membuktikan rekaman *
]

RESOLVER = "8.8.8.8"
NS_VERCEL = "ns1.vercel-dns.com"

TIPE = {"A": 1, "NS": 2, "CNAME": 5, "SOA": 6, "MX": 15, "TXT": 16}
BALIK = {v: k for k, v in TIPE.items()}
RCODE = {0: "ok", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED"}


def _enc(nama):
    return b"".join(bytes([len(b)]) + b.encode() for b in nama.rstrip(".").split(".")) + b"\0"


def _nama_di(buf, i):
    bagian, lompat, akhir = [], False, i
    while True:
        panjang = buf[i]
        if panjang & 0xC0 == 0xC0:
            ptr = struct.unpack("!H", buf[i:i + 2])[0] & 0x3FFF
            if not lompat:
                akhir = i + 2
            i, lompat = ptr, True
            continue
        if panjang == 0:
            if not lompat:
                akhir = i + 1
            break
        bagian.append(buf[i + 1:i + 1 + panjang].decode("latin1"))
        i += 1 + panjang
    return ".".join(bagian), akhir


def tanya(nama, tipe, server, rekursi=True):
    """→ (rcode, [(tipe, ttl, nilai), …], otoritatif). rcode None kalau diam."""
    bendera = 0x0100 if rekursi else 0x0000
    pesan = (struct.pack("!HHHHHH", 0x4242, bendera, 1, 0, 0, 0)
             + _enc(nama) + struct.pack("!HH", TIPE[tipe], 1))
    sok = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sok.settimeout(8)
    try:
        sok.sendto(pesan, (server, 53))
        buf, _ = sok.recvfrom(4096)
    except OSError:
        return None, [], False
    finally:
        sok.close()

    _, bendera, qd, an, ns, _ar = struct.unpack("!HHHHHH", buf[:12])
    i = 12
    for _ in range(qd):
        _, i = _nama_di(buf, i)
        i += 4

    hasil = []
    for _ in range(an + ns):
        _, i = _nama_di(buf, i)
        t, _kelas, ttl, dl = struct.unpack("!HHIH", buf[i:i + 10])
        i += 10
        if t in (2, 5, 6):
            nilai, _ = _nama_di(buf, i)
        elif t == 1:
            nilai = socket.inet_ntoa(buf[i:i + dl])
        elif t == 15:
            prioritas = struct.unpack("!H", buf[i:i + 2])[0]
            target, _ = _nama_di(buf, i + 2)
            nilai = f"{prioritas} {target}"
        elif t == 16:
            nilai = buf[i + 1:i + 1 + buf[i]].decode("latin1")
        else:
            nilai = buf[i:i + dl].hex()
        hasil.append((BALIK.get(t, str(t)), ttl, nilai))
        i += dl
    return bendera & 0xF, hasil, bool((bendera >> 10) & 1)


def jalur_tersadap(ip_ns):
    """Sebagian jaringan — termasuk sandbox tempat berkas ini ditulis —
    membelokkan SEMUA UDP/53 ke resolver sendiri. Gejalanya: nameserver
    otoritatif menjawab aa=0, yang mustahil untuk zona miliknya sendiri.
    Tanpa pemeriksaan ini, kolom "yang akan dilayani Vercel" diam-diam
    menampilkan jawaban resolver lokal dan terbaca seperti fakta."""
    rc, jwb, otoritatif = tanya("vercel.com", "A", ip_ns, rekursi=False)
    return not (rc == 0 and jwb and otoritatif)


def ringkas(jawaban):
    if not jawaban:
        return "(kosong)"
    return ", ".join(f"{t} {v}" for t, _ttl, v in jawaban)


def main():
    try:
        ip_vercel = socket.gethostbyname(NS_VERCEL)
    except OSError:
        print(f"Tidak bisa menerjemahkan {NS_VERCEL}. Tidak ada jaringan?")
        return 2

    print(f"Resolver umum : {RESOLVER}")
    print(f"NS Vercel     : {NS_VERCEL} ({ip_vercel})\n")

    if jalur_tersadap(ip_vercel):
        print("TIDAK BISA MEMERIKSA SISI VERCEL DARI SINI.")
        print()
        print("Kueri ke " + NS_VERCEL + " tidak sampai ke sana — jaringan ini")
        print("membelokkan UDP/53 ke resolver sendiri. Buktinya: nameserver")
        print("Vercel menjawab vercel.com dengan aa=0, yang mustahil untuk")
        print("zona miliknya sendiri.")
        print()
        print("Jalankan berkas ini dari komputermu sendiri, bukan dari sini.")
        print("Yang di bawah cuma keadaan yang dilihat dunia sekarang.")
        print()

    rc, ns_sekarang, _ = tanya(DOMAIN, "NS", RESOLVER)
    daftar_ns = sorted(v for t, _ttl, v in ns_sekarang if t == "NS")
    ttl_ns = min((ttl for t, ttl, _v in ns_sekarang if t == "NS"), default=0)
    di_vercel = all("vercel-dns" in n for n in daftar_ns) and bool(daftar_ns)

    print("Delegasi sekarang:")
    for n in daftar_ns:
        print(f"  NS  {n}")
    print(f"  TTL {ttl_ns} detik ({ttl_ns // 3600} jam {ttl_ns % 3600 // 60} menit)")
    print(f"  → nameserver {'SUDAH' if di_vercel else 'BELUM'} di Vercel\n")

    print(f"{'nama':34}{'dunia sekarang':46}{'yang akan dilayani Vercel':46}")
    print("-" * 126)

    siap = True
    for nama, tipe in NAMA:
        rc_dunia, jwb_dunia, _ = tanya(nama, tipe, RESOLVER)
        rc_vc, jwb_vc, vc_otoritatif = tanya(nama, tipe, ip_vercel, rekursi=False)
        if not vc_otoritatif:
            rc_vc, jwb_vc = None, []

        kiri = ringkas(jwb_dunia) if rc_dunia == 0 else RCODE.get(rc_dunia, f"rcode {rc_dunia}")
        kanan = (ringkas(jwb_vc) if rc_vc == 0
                 else "(tidak terjawab otoritatif)" if rc_vc is None
                 else RCODE.get(rc_vc, f"rcode {rc_vc}"))

        # Wildcard belum tentu ada di sisi lama — itu memang yang mau
        # ditambahkan. Yang tidak boleh: sisi Vercel kosong untuk nama
        # yang SEKARANG hidup.
        hidup_sekarang = rc_dunia == 0 and bool(jwb_dunia)
        dijawab_vercel = rc_vc == 0 and bool(jwb_vc)
        if hidup_sekarang and not dijawab_vercel:
            siap = False
            tanda = "  ← BELUM AMAN"
        elif not dijawab_vercel:
            tanda = "  (belum ada, belum wajib)"
        else:
            tanda = ""
        print(f"{nama:34}{kiri:46}{kanan:46}{tanda}")

    print()
    if di_vercel:
        print("Nameserver sudah di Vercel. Yang perlu diperiksa sekarang cuma")
        print("apakah semua nama di atas dijawab — kolom kiri dan kanan sudah")
        print("sama-sama datang dari Vercel.")
    elif siap:
        print("SIAP. Setiap nama yang sekarang hidup sudah punya jawaban di")
        print("Vercel. Nameserver boleh dipindah; selama masa propagasi kedua")
        print("sisi menjawab hal yang sama.")
    else:
        print("BELUM AMAN. Ada nama yang sekarang hidup tapi belum dijawab")
        print("Vercel. Memindahkan nameserver sekarang akan mematikannya untuk")
        print(f"sebagian pengunjung sampai {ttl_ns // 3600} jam ke depan.")
    return 0 if (siap or di_vercel) else 1


if __name__ == "__main__":
    sys.exit(main())
