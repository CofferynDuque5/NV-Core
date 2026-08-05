# NV Core web (React + Vite SPA) — build from the repo root:
#   docker build -f apps/web/Dockerfile -t nvcore-web .
# VITE_API_URL is inlined at build time and must be reachable from the
# BROWSER (e.g. the host-mapped API port), not the docker-internal hostname.
# syntax=docker/dockerfile:1

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nv/domain build
RUN pnpm --filter @nv/web build

# Runtime: a tiny Nginx serving the static dist/ (no Node server needed).
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
