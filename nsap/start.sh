#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NSAP · arranque en local
#   ./start.sh          → modo desarrollo (recarga al guardar, --watch)
#   ./start.sh prod     → modo producción (sin watch)
#   ./start.sh test     → corre los tests
# Carga variables desde .env automáticamente (Node 20.6+ / 22).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

# 1) Node 20+ requerido
if ! command -v node >/dev/null 2>&1; then
  echo "✗ No se encontró Node.js. Instala Node 20+ (recomendado 22): https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $(node -v) es demasiado antiguo. Necesitas Node 20+ (recomendado 22)." >&2
  exit 1
fi

# 2) .env: si no existe, créalo desde la plantilla
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "ℹ  Creé .env desde .env.example. Edítalo si quieres configurar FB/IG/IA/n8n."
  else
    echo "ℹ  No hay .env ni .env.example; arranco con los valores por defecto."
  fi
fi

# 3) Dependencias
if [ ! -d node_modules ]; then
  echo "▸ Instalando dependencias (npm install)…"
  npm install
fi

# 4) Flag --env-file solo si existe .env
ENV_FLAG=()
[ -f .env ] && ENV_FLAG=(--env-file=.env)

# 5) Arranque según el modo
MODE="${1:-dev}"
case "$MODE" in
  dev)
    echo "▸ NSAP en desarrollo (--watch). Ctrl+C para salir."
    exec node "${ENV_FLAG[@]}" --watch server.js
    ;;
  prod|start)
    echo "▸ NSAP en producción."
    exec node "${ENV_FLAG[@]}" server.js
    ;;
  test)
    exec node "${ENV_FLAG[@]}" --test
    ;;
  *)
    echo "Uso: ./start.sh [dev|prod|test]" >&2
    exit 1
    ;;
esac
