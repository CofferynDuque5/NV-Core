# NV Core API (NestJS) — build from the repo root:
#   docker build -f apps/api/Dockerfile -t nvcore-api .
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

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
# The whole workspace (incl. node_modules, generated Prisma client, dist) is
# carried over — reliable over a slimmer prune for a Prisma app.
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
# Apply migrations, then start. `migrate deploy` is the production-safe command.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
