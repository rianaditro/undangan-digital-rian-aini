#!/usr/bin/env bash
# Semua pemeriksaan database, tanpa menyentuh produksi:
#
#   1. bangun ulang skema dari nol (tiruan Supabase + semua migrasi)
#   2. uji SQL di uji/sql/ terhadap hasilnya
#   3. aturan kompatibilitas: halaman di main dan di HEAD masih dilayani
#   4. uji untuk pemeriksa kompatibilitas itu sendiri
#
#   PGURL=postgres://postgres@localhost:5432/postgres uji/db/uji.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${PGURL:?PGURL belum diisi, contoh postgres://postgres@localhost:5432/postgres}"
DB="${PGURL%/*}/bangun"
gagal=0
merah() { echo "✗ $*"; gagal=$((gagal + 1)); }

echo "== bangun"
uji/db/bangun.sh || { echo "✗ skema tidak bisa dibangun — berhenti"; exit 1; }

echo "== uji SQL"
for f in uji/sql/*.sql; do
  # Tiap uji diakhiri raise yang membawa laporan dan membatalkan
  # transaksinya, jadi kode keluar psql selalu bukan nol; yang dibaca
  # adalah baris LULUS/GAGAL.
  keluar=$(psql "$DB" -X -f "$f" 2>&1)
  hasil=$(grep -oE 'LULUS [0-9]+ +GAGAL [0-9]+' <<<"$keluar" | tail -1)
  if [ -z "$hasil" ]; then
    merah "$f tidak selesai"; grep -E 'ERROR|error' <<<"$keluar" | head -5
  elif [[ "$hasil" =~ GAGAL\ +0$ ]]; then
    echo "✓ $(basename "$f")  $hasil"
  else
    merah "$(basename "$f")  $hasil"; grep -E '^GAGAL' <<<"$keluar"
  fi
done

echo "== kompatibilitas"
refs=(HEAD)
git rev-parse -q --verify origin/main >/dev/null && refs=(origin/main HEAD)
PGURL="$DB" node uji/db/kompat.mjs "${refs[@]}" || merah "kompatibilitas"

echo "== pemeriksa kompatibilitas"
# Kode main sebelum tambalan 5dacdd1 memanggil buku tamu langsung ke tabel
# dan undangan_tamu dengan satu argumen. Sampai migrasi 011 itu sah; sesudah
# 012/021/022 patah di tiga tempat. Pemeriksa harus melihat keduanya.
LAMA=5dacdd1^
if git rev-parse -q --verify "$LAMA" >/dev/null; then
  SAMPAI=011 uji/db/bangun.sh bangun011 >/dev/null
  if PGURL="${PGURL%/*}/bangun011" node uji/db/kompat.mjs "$LAMA" >/dev/null; then
    echo "✓ kode lama sah terhadap skema 011"
  else merah "pemeriksa menolak kode lama terhadap skema 011 (terlalu ketat)"; fi
  n=$(PGURL="$DB" node uji/db/kompat.mjs "$LAMA" | grep -c '^   ')
  if [ "$n" = 3 ]; then echo "✓ kode lama patah di 3 tempat terhadap skema sekarang"
  else merah "pemeriksa menemukan $n masalah di kode lama, seharusnya 3"; fi
else
  echo "- riwayat $LAMA tidak ada (clone dangkal?), dilewati"
fi

echo
if [ "$gagal" = 0 ]; then echo "database: semua lulus"; else echo "database: $gagal gagal"; exit 1; fi
