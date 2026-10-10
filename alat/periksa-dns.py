#!/usr/bin/env python3
"""Membandingkan DNS yang SEKARANG dilihat dunia dengan yang akan dilayani
nameserver tujuan (Cloudflare, atau Vercel), sebelum nameserver dipindah.

Kenapa ini ada. Delegasi NS mengundang.id punya TTL 6 jam. Begitu
nameserver diganti di registrar, selama sampai 6 jam sebagian resolver
masih bertanya ke nameserver lama dan sebagian sudah bertanya ke yang
baru. Selama kedua sisi menjawab sama, tidak ada yang terasa. Kalau sisi
barunya kosong, sebagian pengunjung dapat SERVFAIL — dan
rian-aini.mengundang.id itu undangan sungguhan yang tautannya sudah
dipegang 415 tamu.

Jadi urutannya bukan selera: isi dulu zona di tujuan, buktikan
jawabannya sama, baru pindahkan nameserver.

    python3 alat/periksa-dns.py anna.ns.cloudflare.com   # nameserver dari Cloudflare
    python3 alat/periksa-dns.py                          # bawaan: ns1.vercel-dns.com

Untuk Cloudflare, berkas ini juga menolak rekaman yang proxy-nya menyala
(awan oranye): Vercel tidak bisa menerbitkan sertifikat di belakangnya,
dan jawabannya jadi A ke IP Cloudflare, bukan CNAME ke Vercel.

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
NS_TUJUAN = sys.argv[1] if len(sys.argv) > 1 else "ns1.vercel-dns.com"

# Awalan IPv4 anycast Cloudflare. Jawaban A ke salah satunya = proxy
# oranye menyala.
CF_AWALAN = ("104.16.", "104.17.", "104.18.", "104.19.", "104.20.", "104.21.",
             "104.22.", "104.23.", "104.24.", "104.25.", "104.26.", "104.27.",
             "172.64.", "172.65.", "172.66.", "172.67.", "172.68.", "172.69.",
             "188.114.")

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


def tidak_otoritatif(ip_ns):
    """Nameserver tujuan harus sudah memegang zona mengundang.id — di
    Cloudflare itu terjadi begitu situsnya ditambahkan, jauh sebelum
    delegasi dipindah. Kalau ia menjawab aa=0, zonanya belum ada, atau:

    Sebagian jaringan — termasuk sandbox tempat berkas ini ditulis —
    membelokkan SEMUA UDP/53 ke resolver sendiri. Gejalanya: nameserver
    otoritatif menjawab aa=0, yang mustahil untuk zona miliknya sendiri.
    Tanpa pemeriksaan ini, kolom "yang akan dilayani tujuan" diam-diam
    menampilkan jawaban resolver lokal dan terbaca seperti fakta."""
    rc, jwb, otoritatif = tanya(DOMAIN, "SOA", ip_ns, rekursi=False)
    return not (rc == 0 and jwb and otoritatif)


def ringkas(jawaban):
    if not jawaban:
        return "(kosong)"
    return ", ".join(f"{t} {v}" for t, _ttl, v in jawaban)


def proxy_menyala(jawaban, tipe):
    """Rekaman yang mestinya CNAME malah dijawab A, atau A-nya ke IP
    Cloudflare: awan oranye."""
    if tipe == "CNAME" and any(t == "A" for t, _ttl, _v in jawaban) \
            and not any(t == "CNAME" for t, _ttl, _v in jawaban):
        return True
    return any(t == "A" and v.startswith(CF_AWALAN) for t, _ttl, v in jawaban)


def main():
    try:
        ip_tujuan = socket.gethostbyname(NS_TUJUAN)
    except OSError:
        print(f"Tidak bisa menerjemahkan {NS_TUJUAN}. Salah ketik, atau tidak ada jaringan?")
        return 2

    # "ns.cloudflare.com" atau "vercel-dns.com": penanda delegasi sudah pindah.
    label = NS_TUJUAN.rstrip(".").split(".")
    zona_ns = ".".join(label[-3:] if NS_TUJUAN.endswith("ns.cloudflare.com") else label[-2:])

    print(f"Resolver umum : {RESOLVER}")
    print(f"NS tujuan     : {NS_TUJUAN} ({ip_tujuan})\n")

    if tidak_otoritatif(ip_tujuan):
        print(f"{NS_TUJUAN} TIDAK MENJAWAB {DOMAIN} SECARA OTORITATIF.")
        print()
        print("Dua kemungkinan: zonanya belum dibuat di sana (di Cloudflare:")
        print("Add a site belum selesai, atau nameserver yang diketik bukan")
        print("yang diberikan untuk domain ini), atau jaringan ini membelokkan")
        print("UDP/53 ke resolver sendiri — kalau begitu, jalankan dari")
        print("komputermu sendiri.")
        print()
        print("Jalankan berkas ini dari komputermu sendiri, bukan dari sini.")
        print("Yang di bawah cuma keadaan yang dilihat dunia sekarang.")
        print()

    rc, ns_sekarang, _ = tanya(DOMAIN, "NS", RESOLVER)
    daftar_ns = sorted(v for t, _ttl, v in ns_sekarang if t == "NS")
    ttl_ns = min((ttl for t, ttl, _v in ns_sekarang if t == "NS"), default=0)
    sudah_pindah = all(n.endswith(zona_ns) for n in daftar_ns) and bool(daftar_ns)

    print("Delegasi sekarang:")
    for n in daftar_ns:
        print(f"  NS  {n}")
    print(f"  TTL {ttl_ns} detik ({ttl_ns // 3600} jam {ttl_ns % 3600 // 60} menit)")
    print(f"  → nameserver {'SUDAH' if sudah_pindah else 'BELUM'} di {zona_ns}\n")

    print(f"{'nama':34}{'dunia sekarang':46}{'yang akan dilayani tujuan':46}")
    print("-" * 126)

    siap = True
    for nama, tipe in NAMA:
        rc_dunia, jwb_dunia, _ = tanya(nama, tipe, RESOLVER)
        rc_vc, jwb_vc, vc_otoritatif = tanya(nama, tipe, ip_tujuan, rekursi=False)
        if not vc_otoritatif:
            rc_vc, jwb_vc = None, []

        kiri = ringkas(jwb_dunia) if rc_dunia == 0 else RCODE.get(rc_dunia, f"rcode {rc_dunia}")
        kanan = (ringkas(jwb_vc) if rc_vc == 0
                 else "(tidak terjawab otoritatif)" if rc_vc is None
                 else RCODE.get(rc_vc, f"rcode {rc_vc}"))

        # Wildcard belum tentu ada di sisi lama — itu memang yang mau
        # ditambahkan. Yang tidak boleh: sisi Vercel kosong untuk nama
        # yang SEKARANG hidup, dan proxy oranye di mana pun.
        hidup_sekarang = rc_dunia == 0 and bool(jwb_dunia)
        dijawab_vercel = rc_vc == 0 and bool(jwb_vc)
        if dijawab_vercel and proxy_menyala(jwb_vc, tipe):
            siap = False
            tanda = "  ← PROXY ORANYE, matikan (DNS only)"
        elif hidup_sekarang and not dijawab_vercel:
            siap = False
            tanda = "  ← BELUM AMAN"
        elif not dijawab_vercel:
            tanda = "  (belum ada, belum wajib)"
        else:
            tanda = ""
        print(f"{nama:34}{kiri:46}{kanan:46}{tanda}")

    print()
    if sudah_pindah:
        print(f"Nameserver sudah di {zona_ns}. Yang perlu diperiksa sekarang")
        print("cuma apakah semua nama di atas dijawab — kolom kiri dan kanan")
        print("sudah sama-sama datang dari tujuan.")
    elif siap:
        print("SIAP. Setiap nama yang sekarang hidup sudah punya jawaban di")
        print("tujuan. Nameserver boleh dipindah; selama masa propagasi kedua")
        print("sisi menjawab hal yang sama.")
    else:
        print("BELUM AMAN. Ada nama yang belum dijawab tujuan, atau proxy")
        print("oranye menyala. Memindahkan nameserver sekarang akan merusaknya")
        print(f"untuk sebagian pengunjung sampai {ttl_ns // 3600} jam ke depan.")
    return 0 if siap else 1


if __name__ == "__main__":
    sys.exit(main())
