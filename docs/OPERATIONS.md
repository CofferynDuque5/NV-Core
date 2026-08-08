# NV Core — Operaciones (deploy · health · backups · rollback)

Runbook para operar NV Core en producción. Complementa el
[RC audit](./RELEASE-CANDIDATE-AUDIT.md).

## 1. Variables de entorno

La API valida su entorno al arrancar (zod, `apps/api/src/config/env.validation.ts`)
y **no arranca en producción sin** `JWT_SECRET` ni `ENCRYPTION_KEY`. Referencia
completa: [`apps/api/.env.example`](../apps/api/.env.example).

Mínimos de producción:

| Variable | Obligatoria | Nota |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres. |
| `JWT_SECRET` | ✅ | ≥16 chars. `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | ✅ | 32 hex (16 bytes). `openssl rand -hex 16`. Cifra tokens en reposo. |
| `CORS_ORIGINS` | ✅ | Allowlist separada por comas (sin `*`). |
| `REDIS_URL` | ✅ (prod) | **Obligatoria en producción** (la API no arranca sin ella): la publicación programada usa BullMQ; sin Redis los posts programados nunca se publican. En dev/local es opcional (cola *inline*). |
| `NV_ADMIN_EMAIL` / `NV_ADMIN_PASSWORD` | ⛅ | Si ambas, siembra un Owner al arrancar. Úsalas solo para el bootstrap y rota la contraseña. |

Nunca subas `.env` al repo. `docker-compose.yml` no trae secretos por defecto.

## 2. Deploy

### Docker Compose (single-host)
```bash
cp .env.docker.example .env      # define JWT_SECRET, ENCRYPTION_KEY, etc.
docker compose up --build -d     # web :3000, api :4000
docker compose exec api node -e "require('child_process')"  # (opcional) shell
```
Las migraciones se aplican en el arranque del contenedor api
(`prisma migrate deploy` en el CMD del Dockerfile).

### Manual / orquestador
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @nv/api exec prisma migrate deploy   # SIEMPRE antes de arrancar la nueva versión
node apps/api/dist/main.js                          # api
# servir apps/web/dist como estático detrás de Nginx (ver apps/web/Dockerfile)
```

**Orden seguro de release:** aplicar migraciones (aditivas, compatibles con la
versión anterior) → desplegar API → desplegar web. Las migraciones del proyecto
son aditivas, así que la versión N-1 sigue funcionando durante el rollout.

## 3. Health checks

| Endpoint | Uso | Semántica |
|---|---|---|
| `GET /api/health` | **liveness** | El proceso responde. No toca dependencias. Nunca reinicia por un downstream lento. |
| `GET /api/health/ready` | **readiness** | Hace **ping real** a Postgres (`SELECT 1`) y a Redis. `200` si la DB responde (Redis `inline`/`ok`); **`503`** si la DB está caída o Redis `down`. |

Configura el balanceador/orquestador para enrutar tráfico según
`/api/health/ready` y reiniciar según `/api/health`.

## 4. Backups y restauración

Scripts en [`scripts/`](../scripts) (requieren `pg_dump`/`pg_restore` en PATH).

### Backup
```bash
DATABASE_URL=postgresql://user:pass@host:5432/nvcore \
BACKUP_DIR=/mnt/backups BACKUP_KEEP=14 \
  ./scripts/backup-db.sh
```
Genera `nvcore-<UTC>.dump` (formato custom comprimido), verifica su integridad
(`pg_restore --list`) y **rota** conservando los últimos `BACKUP_KEEP` (default 14).

**Programación (cron diario 03:00 UTC):**
```
0 3 * * *  cd /opt/nv-core && DATABASE_URL=... BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh >> /var/log/nvcore-backup.log 2>&1
```
Guarda los dumps **fuera del host** de la DB (objeto/almacenamiento remoto) y
prueba la restauración periódicamente — un backup no verificado no es un backup.

### Restauración (recuperación ante desastres)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/nvcore \
  ./scripts/restore-db.sh /mnt/backups/nvcore-<UTC>.dump
```
Es **destructivo** (`--clean --if-exists --single-transaction`): pide confirmar
escribiendo `restaurar` (o pasa `--yes` para no interactivo). Tras restaurar un
dump antiguo, aplica migraciones pendientes:
```bash
pnpm --filter @nv/api exec prisma migrate deploy
```

## 5. Rollback

1. **Código:** vuelve a desplegar la imagen/artefacto de la versión anterior.
   Como las migraciones son aditivas, la versión previa opera sobre el esquema
   nuevo sin cambios.
2. **Datos (solo si una migración corrompió datos):** restaura el último dump
   *previo* al deploy con `restore-db.sh`. Asume pérdida de lo escrito desde ese
   backup — de ahí la importancia de la frecuencia del cron.
3. **Verifica** con `GET /api/health/ready` (debe dar `200`) y un login de prueba.

## 6. Verificación de integraciones (handoff con credenciales)

El código de los canales está probado con **fixtures realistas** (unit, mock de
`fetch`), pero la **verificación contra las APIs reales requiere credenciales de
sandbox** que no viven en el repo. Pasos para cerrar el DoD del Sprint 1:

### WhatsApp — Cloud API oficial (canal primario)
El adaptador por defecto es ahora `cloud-api` (oficial). Baileys queda como
opción con riesgo (librería no oficial → posible baneo del número).
1. Crea una app de Meta + WhatsApp Business, obtén `WHATSAPP_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` y `META_APP_SECRET`.
2. Define esas variables en el entorno de la API.
3. **Enviar texto:** `POST /api/workspaces/:ws/messaging/send` (o lanzar una
   campaña WhatsApp). Debe devolver un `wamid.*`.
4. **Media/plantilla:** el transporte soporta imagen/video/documento por URL y
   plantillas pre-aprobadas (`sendWhatsAppMedia`, `sendWhatsAppTemplate`).
5. **Recepción:** registra el webhook `POST /api/integrations/whatsapp/webhook`
   en Meta (verifica firma HMAC `X-Hub-Signature-256`).
6. **Errores esperados** (taxonomía ya implementada): token expirado (code 190 →
   `auth`), throttling (`rate_limit`, reintenta con backoff), media (`media`),
   fuera de ventana 24h (`recipient`), 5xx (`transient`).

### Meta Graph — Facebook / Instagram
1. Conecta una Página + cuenta IG Business (Connection rows o env `FB_*`/`IG_*`).
2. Publica una campaña a `fb`/`ig` y valida el `post_id`/media id real.
3. Verifica manejo de expiración de token y límites de rate contra la Graph real.

> **Recomendación CTO:** ejecutar estos pasos en una **beta cerrada** con 3–5
> números/cuentas reales antes de la venta general. Añadir un job de CI que corra
> la suite de integración con credenciales de sandbox (secrets del repo) para que
> "verde en CI" signifique "funciona contra Meta".

## 7. Observabilidad

- **Sentry**: activa con `SENTRY_DSN` (no-op sin ella).
- **request-id**: cada request lleva `x-request-id` (middleware) para correlación.
- **Shutdown**: la API llama `enableShutdownHooks()`, así que en `SIGTERM` cierra
  Prisma y los workers/colas de BullMQ antes de salir (rollout sin cortar jobs).

### Métricas (Prometheus)

`GET /api/metrics` expone métricas en formato Prometheus (text exposition v0.0.4),
sin dependencias externas. Protégelo con `METRICS_TOKEN` (se exige
`Authorization: Bearer <token>`; sin la variable el endpoint es abierto — úsalo
solo así en dev) **y** restríngelo a la red interna de scrape.

Series expuestas:

| Métrica | Tipo | Labels | Para qué |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route` (patrón, p.ej. `/api/workspaces/:workspace/contacts`), `status` | Tráfico y tasa de error por endpoint. La ruta es el **patrón**, nunca el id → sin explosión de cardinalidad. |
| `http_request_duration_seconds` | histogram | `method`, `route` | Latencia (p50/p95/p99 vía `histogram_quantile`). |
| `nv_domain_events_total` | counter | `event`, `status` (`ok`/`error`) | Salud del negocio (mensajes, publicaciones, campañas, jobs). |
| `nv_dependency_up` | gauge | `dependency` (`database`/`queue`) | 1 si la dependencia respondió al scrape, 0 si no. |
| `nv_build_info` | gauge | `env` | Metadatos de runtime (valor siempre 1). |

Ejemplo de `scrape_config` de Prometheus:
```yaml
scrape_configs:
  - job_name: nv-core-api
    metrics_path: /api/metrics
    authorization: { credentials: "<METRICS_TOKEN>" }
    static_configs: [{ targets: ["api:3000"] }]
```

### Reglas de alerta (PromQL)

Punto de partida para Alertmanager (ajusta umbrales a tu SLO):
```yaml
groups:
  - name: nv-core
    rules:
      - alert: NvApiDown
        expr: up{job="nv-core-api"} == 0
        for: 2m
      - alert: NvDatabaseDown
        expr: nv_dependency_up{dependency="database"} == 0
        for: 1m
      - alert: NvQueueDown
        expr: nv_dependency_up{dependency="queue"} == 0
        for: 5m
      - alert: NvHighErrorRate            # >5% de 5xx durante 10m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m])) > 0.05
        for: 10m
      - alert: NvHighLatencyP95           # p95 > 1s durante 10m
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 1
        for: 10m
      - alert: NvDomainEventErrors        # fallos de envío/publicación
        expr: sum(rate(nv_domain_events_total{status="error"}[15m])) > 0
        for: 15m
```
> El **wiring de Alertmanager/PagerDuty es configuración de despliegue** (endpoints
> y credenciales fuera del repo). NV Core provee las métricas y las reglas; el
> operador conecta el receptor.

### Alta disponibilidad (mínima)

- **API sin estado**: escala horizontal a ≥2 réplicas detrás del balanceador;
  enruta por `/api/health/ready` y reinicia por `/api/health`. El estado vive en
  Postgres y Redis (compartidos), no en el proceso.
- **Postgres**: usa una réplica gestionada (o streaming replication) para
  failover; los backups (§4) cubren la recuperación ante desastres.
- **Redis**: requerido en producción (la publicación programada lo necesita);
  usa una instancia gestionada con persistencia.

### Simulacro de restauración (verificado)

El restore se probó de punta a punta contra Postgres real: `backup-db.sh` generó
un dump, se restauró en una base limpia con `pg_restore` y los conteos de filas
(`Contact`/`User`/`Segment`) **coincidieron exactamente** con el origen. Repite
este simulacro periódicamente — un backup no restaurado no es un backup.
