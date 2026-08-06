#!/usr/bin/env bash
#
# NV Core · backup de PostgreSQL.
#
#   ./scripts/backup-db.sh                 # usa $DATABASE_URL, escribe en ./backups
#   DATABASE_URL=postgresql://... ./scripts/backup-db.sh
#   BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
#
# Genera un dump comprimido en formato custom (pg_dump -Fc), que restore-db.sh
# reproduce con pg_restore. Rota automáticamente: conserva los últimos
# $BACKUP_KEEP (default 14).
#
set -euo pipefail

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: define DATABASE_URL (postgresql://user:pass@host:port/db)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/nvcore-$STAMP.dump"

echo "→ pg_dump → $OUT"
# -Fc: custom/comprimido · --no-owner/--no-privileges: portable entre entornos.
pg_dump "$DB_URL" -Fc --no-owner --no-privileges -f "$OUT"

echo "→ verificando integridad del dump"
pg_restore --list "$OUT" >/dev/null

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ backup OK ($SIZE): $OUT"

# Rotación: conserva los N más recientes.
COUNT="$(ls -1t "$BACKUP_DIR"/nvcore-*.dump 2>/dev/null | wc -l | tr -d ' ')"
if (( COUNT > BACKUP_KEEP )); then
  ls -1t "$BACKUP_DIR"/nvcore-*.dump | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
    echo "→ rotando (elimino) $old"
    rm -f "$old"
  done
fi
