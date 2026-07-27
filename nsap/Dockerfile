# ── NSAP · imagen de producción ──────────────────────────────────────────────
# Node 22 slim (Debian): evita compilaciones nativas de dependencias opcionales.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# 1) Dependencias (capa cacheable): solo package*.json primero.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Código de la app.
COPY . .

# 3) Carpeta de datos persistente (sesión Baileys, db.json, uploads).
#    El usuario "node" (no root) debe poder escribir en ella.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 4000

# Healthcheck simple contra el endpoint público.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
