#!/usr/bin/env bash
# Bangun ulang skema dari nol: tiruan Supabase, lalu setiap migrasi
# berurutan. Gagal di migrasi mana pun = gagal keras.
#
#   PGURL=postgres://user@localhost:5432/postgres uji/db/bangun.sh [nama_db]
#
# Database tujuan (bawaan: bangun) dihapus dan dibuat lagi. Jangan arahkan
# PGURL ke database yang isinya penting.
#
# SAMPAI=020 berhenti sesudah migrasi 020 — untuk melihat skema seperti
# pada satu titik di masa lalu.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PGURL:?PGURL belum diisi, contoh postgres://postgres@localhost:5432/postgres}"
DB="${1:-bangun}"
psql "$PGURL" -qX -v ON_ERROR_STOP=1 -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
TUJU="${PGURL%/*}/$DB"
psql "$TUJU" -qX -v ON_ERROR_STOP=1 -f uji/db/supabase-tiruan.sql >/dev/null
n=0
for f in supabase/migrations/*.sql; do
  nomor=$(basename "$f"); nomor=${nomor%%_*}
  if [ -n "${SAMPAI:-}" ] && [ "$((10#$nomor))" -gt "$((10#$SAMPAI))" ]; then break; fi
  psql "$TUJU" -qX -v ON_ERROR_STOP=1 --single-transaction -f "$f" >/dev/null 2>"/tmp/bangun-$$.err" || {
    echo "GAGAL di $f"; cat "/tmp/bangun-$$.err"; exit 1; }
  n=$((n+1))
done
rm -f "/tmp/bangun-$$.err"
echo "$n migrasi terpasang di $DB"
