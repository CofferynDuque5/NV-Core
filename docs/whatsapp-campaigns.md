# WhatsApp · Campañas a grupos, variables e historial (fusión NSAP → NV-Core)

Estas capacidades (antes en la app standalone NSAP) ahora viven dentro de
NV-Core, por workspace, con su modelo multi-empresa, roles y diseño.

## Qué se añadió
- **Grupos reales de WhatsApp**: al **Sincronizar** (pestaña Conexión / botón
  de WhatsApp) se guardan los grupos con su JID (`Group.remoteJid`, `synced`).
  La página **Grupos** los lista y permite definir **variables por grupo**.
- **Campañas → grupos objetivo**: una campaña puede apuntar a grupos de WhatsApp
  (`CampaignTarget`) y/o a redes (Facebook/Instagram). Incluye **mensaje** con
  variables `{{grupo}}` `{{fecha}}` `{{hora}}` + variables por grupo, **horario**
  (una vez / diaria / **semanal** por días), **adjuntos** y **formato IG**
  (feed/reel/historia/carrusel).
- **Scheduler real**: un runner en proceso evalúa las campañas cada 30 s y
  **entrega de verdad** a cada grupo (con retardo anti-spam) y a las redes,
  registrando cada intento en el **Historial** (`SendLog`).
- **Publicación Meta**: Facebook (texto/foto/reel) e Instagram
  (feed/reel/historia/carrusel) + **métricas/insights** en el Historial.

## Cómo ejecutarlo en local
Requisitos: Node 20+, PostgreSQL y (opcional) Redis. El repo ya trae
`dev-setup.sh` que levanta DB+Redis en Docker, instala e inicia todo.

Aplicar la migración nueva y arrancar:
```bash
pnpm install
pnpm --filter @nv/api exec prisma migrate deploy   # aplica la migración campaign_groups_send_log
pnpm --filter @nv/api exec prisma generate
pnpm dev                                            # o: pnpm --filter @nv/api start:dev + @nv/web dev
```

### Variables de entorno relevantes
| Variable | Descripción |
|---|---|
| `DATABASE_URL` | PostgreSQL (obligatoria para persistir grupos/campañas/historial). |
| `REDIS_URL` | Opcional; el scheduler de campañas funciona sin Redis (tick en proceso). |
| `WHATSAPP_GROUP_DELAY_MS` | Retardo entre grupos al enviar (por defecto 4000). |
| `META_GRAPH_VERSION` | Versión de la Graph API (por defecto v21.0). |

### Credenciales de Facebook / Instagram
Se resuelven **por workspace** desde las `Connection` (canal `fb`/`ig`:
`handle` = Page/IG Business id, `token` = access token). Como respaldo global se
aceptan `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `IG_BUSINESS_ID`, `IG_ACCESS_TOKEN`.
Instagram exige URLs públicas del media (los adjuntos se publican por URL).

## Flujo de uso
1. **Conexión** → conectar WhatsApp (QR en el panel) → **Sincronizar** grupos.
2. **Grupos** → definir variables por grupo (opcional).
3. **Campañas** → nueva campaña: mensaje, grupos objetivo, horario, adjuntos,
   redes/formato → **Enviar** ahora o dejar programada.
4. **Historial** → ver resultados y **métricas** de las publicaciones sociales.
