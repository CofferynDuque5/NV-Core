# NV Core web (Next.js standalone) — build from the repo root:
#   docker build -f apps/web/Dockerfile -t nvcore-web .
# NEXT_PUBLIC_API_URL is inlined at build time and must be reachable from the
# BROWSER (e.g. the host-mapped API port), not the docker-internal hostname.
# syntax=docker/dockerfile:1

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nv/domain build
RUN pnpm --filter @nv/web build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# Next standalone output already bundles a minimal server + node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
