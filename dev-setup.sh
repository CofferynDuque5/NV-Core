#!/usr/bin/env bash
#
# NV Core · arranque de desarrollo en un solo comando.
#
#   ./dev-setup.sh            # BD (y Redis) en Docker + install + migraciones + arranca API y Web
#   ./dev-setup.sh --no-redis # sin Redis (el worker de posts programados queda desactivado)
#   ./dev-setup.sh --no-db    # no gestiona la BD (usa tu Postgres local en nvcore/nvcore)
#   ./dev-setup.sh --setup    # solo prepara (BD + install + migraciones), sin arrancar
#
set -euo pipefail
cd "$(dirname "$0")"

USE_DB=1; USE_REDIS=1; RUN=1
for arg in "$@"; do
  case "$arg" in
    --no-db) USE_DB=0 ;;
    --no-redis) USE_REDIS=0 ;;
    --setup) RUN=0 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done

log() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── Requisitos ───────────────────────────────────────────────────────────────
have node || { echo "Falta Node 20+. Instálalo: https://nodejs.org"; exit 1; }
have pnpm || { echo "Falta pnpm. Instálalo con: npm i -g pnpm"; exit 1; }

DB_URL="postgresql://nvcore:nvcore@localhost:5432/nvcore?schema=public"

# ── Base de datos (Docker) ───────────────────────────────────────────────────
if [ "$USE_DB" = "1" ]; then
  if ! have docker; then
    echo "Docker no está disponible. Usa --no-db y ten un Postgres local (rol/BD 'nvcore')."
    exit 1
  fi
  log "PostgreSQL (contenedor nvcore-db)"
  if [ -z "$(docker ps -aq -f name=^/nvcore-db$)" ]; then
    docker run --name nvcore-db \
      -e POSTGRES_USER=nvcore -e POSTGRES_PASSWORD=nvcore -e POSTGRES_DB=nvcore \
      -p 5432:5432 -d postgres:16 >/dev/null
    echo "  contenedor creado."
  else
    docker start nvcore-db >/dev/null 2>&1 || true
    echo "  contenedor ya existía, iniciado."
  fi

  if [ "$USE_REDIS" = "1" ]; then
    log "Redis (contenedor nvcore-redis)"
    if [ -z "$(docker ps -aq -f name=^/nvcore-redis$)" ]; then
      docker run --name nvcore-redis -p 6379:6379 -d redis:7-alpine >/dev/null
      echo "  contenedor creado."
    else
      docker start nvcore-redis >/dev/null 2>&1 || true
      echo "  contenedor ya existía, iniciado."
    fi
  fi

  log "Esperando a que PostgreSQL acepte conexiones…"
  for i in $(seq 1 30); do
    if docker exec nvcore-db pg_isready -U nvcore >/dev/null 2>&1; then echo "  listo."; break; fi
    [ "$i" = "30" ] && { echo "  timeout esperando a la BD."; exit 1; }
    sleep 1
  done
fi

# ── .env de desarrollo (si faltan) ───────────────────────────────────────────
if [ ! -f apps/api/.env ]; then
  log "Creando apps/api/.env (dev)"
  cp apps/api/.env.example apps/api/.env
  # valores mínimos para arrancar
  {
    echo "JWT_SECRET=dev-jwt-secret-change-me-0123456789abcdef"
    echo "ENCRYPTION_KEY=dev-encryption-key-change-me-0123456789ab"
    echo "DATABASE_URL=$DB_URL"
    [ "$USE_REDIS" = "1" ] && [ "$USE_DB" = "1" ] && echo "REDIS_URL=redis://localhost:6379"
  } >> apps/api/.env
fi
if [ ! -f apps/web/.env.local ]; then
  log "Creando apps/web/.env.local (dev)"
  echo "VITE_API_URL=http://localhost:4000" > apps/web/.env.local
fi

# ── Dependencias ─────────────────────────────────────────────────────────────
log "Instalando dependencias (pnpm install)"
pnpm install

# ── Esquema de base de datos ─────────────────────────────────────────────────
log "Aplicando migraciones de Prisma"
( cd apps/api && DATABASE_URL="$DB_URL" pnpm prisma migrate deploy && DATABASE_URL="$DB_URL" pnpm prisma generate )

if [ "$RUN" = "0" ]; then
  log "Preparación completa. Arranca con:  pnpm dev"
  exit 0
fi

# ── Arranque (API + Web en paralelo vía Turbo) ───────────────────────────────
log "Arrancando API (http://localhost:4000/api) y Web (http://localhost:3000)"
echo "  Ctrl+C para detener."
exec pnpm dev
