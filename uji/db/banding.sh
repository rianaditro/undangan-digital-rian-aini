#!/usr/bin/env bash
# Cetak satu kueri SQL yang, dijalankan di produksi, mengembalikan hanya
# bagian skema yang BERBEDA dari hasil bangun.sh.
#
#   PGURL=postgres://... uji/db/banding.sh > /tmp/banding.sql
#   lalu jalankan isi /tmp/banding.sql di produksi (SQL editor Supabase
#   atau konektornya). Kosong = repo dan produksi sama.
#
# Sidik lokal (hash per entri) ditanam ke dalam kueri, jadi produksi tidak
# perlu bisa dihubungi dari mesin ini, dan yang keluar dari produksi cuma
# selisihnya — bukan seluruh skema.
set -euo pipefail
cd "$(dirname "$0")"
: "${PGURL:?PGURL belum diisi}"
DB="${1:-bangun}"
SIDIK_BADAN=$(sed -e '/^--/d' -e 's/) as sidik;/) as sidik/' sidik.sql)
LOKAL=$(psql "${PGURL%/*}/$DB" -XAt -v ON_ERROR_STOP=1 -c "
  with s as ($SIDIK_BADAN)
  select jsonb_object_agg(b.k || '|' || e.k, left(md5(e.v::text), 10))
    from s, jsonb_each(s.sidik) b(k, v), jsonb_each(b.v) e(k, v)")
cat <<SQL
with lokal as (select '${LOKAL//\'/\'\'}'::jsonb h),
s as ($SIDIK_BADAN),
prod as (select b.k || '|' || e.k as k, left(md5(e.v::text), 10) as h, e.v
           from s, jsonb_each(s.sidik) b(k, v), jsonb_each(b.v) e(k, v))
select coalesce(p.k, l.k) as entri,
       case when p.k is null then 'hanya di repo'
            when l.k is null then 'hanya di produksi'
            else 'berbeda' end as beda,
       p.v as di_produksi
  from prod p
  full join (select k, v #>> '{}' as h from lokal, jsonb_each(lokal.h) x(k, v)) l on l.k = p.k
 where p.h is distinct from l.h
 order by 1;
SQL
