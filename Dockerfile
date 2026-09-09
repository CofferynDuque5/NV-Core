# NV Marketing — imagen ALL-IN-ONE (un solo servicio, cualquier plataforma).
# La API (NestJS) también sirve la web (SPA) en el MISMO origen: una única URL,
# sin CORS ni configuración extra. Funciona en Render, Railway, Fly.io, DO App
# Platform, Google Cloud Run… cualquier hosting que construya un Dockerfile.
# syntax=docker/dockerfile:1

FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nv/domain build
RUN pnpm --filter @nv/api prisma:generate
RUN pnpm --filter @nv/api build
# La SPA se compila para hablar con la API en el MISMO host que la sirve.
ENV VITE_API_URL=same-origin
RUN pnpm --filter @nv/web build

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production
# Dónde está la web compilada, para servirla en el mismo origen que la API.
ENV WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api
# La plataforma inyecta $PORT; la API lo lee de env. Migra la BD y arranca.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
