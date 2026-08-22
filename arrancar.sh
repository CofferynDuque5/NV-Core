#!/usr/bin/env bash
#
# NV Core — desarrollo local en un solo comando.
#
# Ejecuta de un tirón los pasos 2–4 del arranque local:
#   2) Instalar dependencias           (pnpm install)
#   3) Preparar la base de datos        (prisma generate + migrate deploy)
#   4) Levantar API (:4000) + Web (:3000)   (pnpm dev)
#
# El paso 1 (tener Node 20+, pnpm, y un PostgreSQL accesible) se verifica aquí,
# y si faltan los archivos .env se crean con valores de desarrollo sensatos
# (secretos aleatorios; nunca se commitean: apps/api/.env y apps/web/.env están
# en .gitignore).
#
# Uso:
#   ./arrancar.sh                 # pasos 2, 3 y 4
#   ./arrancar.sh --prepare-only  # solo pasos 2 y 3 (no levanta los servidores)
#   ./arrancar.sh --skip-install  # omite pnpm install (pasos 3 y 4)
#   ./arrancar.sh --help
#
set -euo pipefail

cd "$(dirname "$0")"

# ── Opciones ─────────────────────────────────────────────────────────────────
PREPARE_ONLY=0
SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --prepare-only) PREPARE_ONLY=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    -h|--help)
      sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Opción desconocida: $arg (usa --help)"; exit 2 ;;
  esac
done

# ── Log helpers ──────────────────────────────────────────────────────────────
if [ -t 1 ]; then B="\033[1m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; C="\033[36m"; N="\033[0m"; else B=""; G=""; Y=""; R=""; C=""; N=""; fi
step() { echo -e "\n${B}${C}▸ $*${N}"; }
ok()   { echo -e "  ${G}✓${N} $*"; }
warn() { echo -e "  ${Y}!${N} $*"; }
die()  { echo -e "\n${R}✗ $*${N}\n"; exit 1; }

# ── Paso 1: prerequisitos ────────────────────────────────────────────────────
step "Paso 1 · Prerequisitos"

command -v node >/dev/null 2>&1 || die "Falta Node.js 20+. Instálalo desde https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || warn "Node $(node -v) detectado; se recomienda Node 20 o superior."
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm no está en el PATH; intento activarlo con corepack…"
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@10.33.0 --activate >/dev/null 2>&1 || true
fi
command -v pnpm >/dev/null 2>&1 || die "Falta pnpm. Instálalo con: corepack enable  (o npm i -g pnpm)"
ok "pnpm $(pnpm -v)"

# Generar un secreto hexadecimal (32 bytes) sin depender de openssl.
gen_secret() { node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'; }

# Asegura que un archivo .env tenga una variable ACTIVA (no comentada); si no,
# la agrega al final. No toca valores que el usuario ya haya definido.
ensure_var() { # <archivo> <clave> <valor>
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -Eq "^${key}=" "$file"; then return 0; fi
  printf '%s=%s\n' "$key" "$value" >> "$file"
  ok "Definido ${key} en ${file}"
}

# apps/api/.env — DB + secretos
API_ENV="apps/api/.env"
if [ ! -f "$API_ENV" ]; then
  cp apps/api/.env.example "$API_ENV"
  ok "Creado $API_ENV a partir del ejemplo"
fi
ensure_var "$API_ENV" DATABASE_URL "postgresql://postgres:postgres@localhost:5432/nvcore?schema=public"
ensure_var "$API_ENV" JWT_SECRET "$(gen_secret)"
ensure_var "$API_ENV" ENCRYPTION_KEY "$(gen_secret)"

# apps/web/.env — apuntar la web al backend (si no, arranca en modo demo)
WEB_ENV="apps/web/.env"
ensure_var "$WEB_ENV" VITE_API_URL "http://localhost:4000"

# Leer DATABASE_URL efectiva del archivo (primera aparición activa).
DB_URL="$(grep -E '^DATABASE_URL=' "$API_ENV" | head -n1 | cut -d= -f2-)"
[ -n "$DB_URL" ] || die "DATABASE_URL vacío en $API_ENV. Defínelo y vuelve a ejecutar."

# Chequeo best-effort de que PostgreSQL responde (no bloquea si no se puede parsear).
hostport="$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/?]+).*#\2#')"
host="${hostport%%:*}"; port="${hostport##*:}"; [ "$port" = "$host" ] && port=5432
if command -v timeout >/dev/null 2>&1 && (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; then
  exec 3>&- 3<&- 2>/dev/null || true
  ok "PostgreSQL responde en ${host}:${port}"
else
  warn "No pude confirmar PostgreSQL en ${host}:${port}. Si la migración falla, revisa DATABASE_URL en $API_ENV o levanta Postgres (p. ej. 'docker compose up -d db')."
fi

# ── Paso 2: dependencias ─────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 1 ]; then
  step "Paso 2 · Dependencias (omitido con --skip-install)"
else
  step "Paso 2 · Instalar dependencias"
  pnpm install
  ok "Dependencias instaladas"
fi

# ── Paso 3: base de datos ────────────────────────────────────────────────────
step "Paso 3 · Preparar la base de datos"
pnpm --filter @nv/api exec prisma generate
ok "Cliente Prisma generado"
pnpm --filter @nv/api exec prisma migrate deploy
ok "Migraciones aplicadas"

# ── Paso 4: arrancar ─────────────────────────────────────────────────────────
if [ "$PREPARE_ONLY" -eq 1 ]; then
  step "Listo (preparación completa)"
  echo -e "  Levanta los servidores cuando quieras con: ${B}pnpm dev${N}"
  echo -e "  Web: ${C}http://localhost:3000${N}   API: ${C}http://localhost:4000/api${N}"
  exit 0
fi

step "Paso 4 · Levantar API (:4000) + Web (:3000)"
echo -e "  Web: ${C}http://localhost:3000${N}   API: ${C}http://localhost:4000/api${N}"
echo -e "  (Ctrl+C para detener)\n"
exec pnpm dev
