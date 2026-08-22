#!/usr/bin/env bash
# Delegador multiplataforma → la lógica vive en scripts/arrancar.mjs
cd "$(dirname "$0")"
exec node scripts/arrancar.mjs "$@"
