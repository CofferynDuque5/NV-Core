#!/usr/bin/env bash
#
# NV Core · restauración de PostgreSQL desde un dump de backup-db.sh.
#
#   ./scripts/restore-db.sh ./backups/nvcore-20260101T000000Z.dump
#   DATABASE_URL=postgresql://... ./scripts/restore-db.sh <dump>
#
# DESTRUCTIVO: reemplaza el esquema público de la base destino. Pide
# confirmación explícita salvo que pases --yes. Úsalo para recuperación ante
# desastres o para clonar producción a staging.
#
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: pasa la ruta a un dump válido. Uso: $0 <archivo.dump> [--yes]" >&2
  exit 1
fi

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: define DATABASE_URL de la base destino." >&2
  exit 1
fi

CONFIRM="${2:-}"
if [[ "$CONFIRM" != "--yes" ]]; then
  # Oculta credenciales al mostrar el destino.
  SAFE="$(echo "$DB_URL" | sed -E 's#://[^@]+@#://***@#')"
  echo "⚠  Vas a RESTAURAR sobre: $SAFE"
  echo "   Esto SOBRESCRIBE los datos actuales de esa base."
  read -r -p "   Escribe 'restaurar' para continuar: " ans
  [[ "$ans" == "restaurar" ]] || { echo "Cancelado."; exit 1; }
fi

echo "→ pg_restore (--clean --if-exists) desde $DUMP"
# --clean --if-exists: elimina objetos previos antes de recrearlos.
# --no-owner --no-privileges: aplica bajo el rol de conexión actual.
# --single-transaction: todo-o-nada; si algo falla, no deja la base a medias.
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  --dbname "$DB_URL" "$DUMP"

echo "✓ restauración completa."
echo "  Recuerda aplicar migraciones pendientes si el dump es más antiguo que el código:"
echo "    pnpm --filter @nv/api exec prisma migrate deploy"
