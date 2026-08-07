# NV Core — Prueba de carga (Sprint 2 · escala)

Cierra el DoD de escala: verificar que, con **~100k filas por tabla y por
tenant**, las listas y Analytics responden dentro de un SLA razonable y que los
índices compuestos del Sprint 2 se **usan de verdad** (index scan, no seq scan).

## Metodología
1. Postgres 16 efímero + `prisma migrate deploy` (crea los índices compuestos).
2. Sembrar un workspace (`fitness`) con [`scripts/load-seed.sql`](../scripts/load-seed.sql):
   **100.000 contactos**, **105.000 mensajes** (incl. un hilo "caliente" de 5.000
   en una sola conversación), **20.000 posts**, **2.000 conversaciones**.
3. `EXPLAIN ANALYZE` de las consultas dominantes.
4. Latencia HTTP end-to-end (NestJS + Prisma + serialización), medición en caliente.

## Índices — `EXPLAIN ANALYZE` (plan real)
| Consulta | Plan | Tiempo DB |
|---|---|---:|
| Contactos: `workspaceSlug` + `ORDER BY createdAt DESC LIMIT 100` | **Index Scan** `Contact_workspaceSlug_createdAt_idx` | ~0.5 ms |
| Mensajes de un hilo: `conversationId` + `ORDER BY createdAt DESC LIMIT 500` | **Index Scan** `Message_conversationId_createdAt_idx` | ~0.3 ms |
| Posts: `workspaceSlug` + `ORDER BY scheduledAt LIMIT 500` | **Index Scan** `Post_workspaceSlug_scheduledAt_idx` | ~0.15 ms |
| Analytics serie de mensajes (join + `date_trunc` GROUP BY, 30d) | Hash Aggregate + **Seq Scan** en `Message` | ~40 ms |

## Latencia HTTP end-to-end @ 100k filas (en caliente)
| Endpoint | Latencia | HTTP |
|---|---:|:--:|
| `GET /contacts?pageSize=100` (página 1) | **13 ms** | 200 |
| `GET /contacts?page=500` (paginación profunda) | **27 ms** | 200 |
| `GET /contacts?stage=Cliente` | **68 ms** | 200 |
| `GET /contacts?q=…` (búsqueda por subcadena) | **247 ms** ⚠️ | 200 |
| `GET /inbox/conversations` (2.000) | **12 ms** | 200 |
| `GET /inbox/conversations/:id/messages` (hilo de 5.000 → cap 500) | **9 ms** | 200 |
| `GET /analytics?days=30` | **64 ms** | 200 |
| `GET /analytics?days=90` | **104 ms** | 200 |
| `GET /posts` | **13 ms** | 200 |
| `GET /campaigns` | **5 ms** | 200 |

El hilo caliente devuelve exactamente **500** mensajes (cap `THREAD_CAP`) en orden
cronológico — antes traía el hilo completo. Todos los endpoints quedan **muy por
debajo de un SLA de 300 ms**.

## Hallazgos honestos (2 seguimientos, no bloqueantes a esta escala)
1. **Búsqueda de contactos por subcadena: ~247 ms.** `ILIKE %q%` no puede usar un
   índice btree → seq scan. A escala mayor conviene un índice **GIN `pg_trgm`**
   sobre nombre/email/empresa (requiere la extensión `pg_trgm` + migración). A
   100k es aceptable; a millones, no.
2. **Analytics agrega mensajes con Seq Scan** (~40 ms de los 64 ms). El índice
   compuesto es `(conversationId, createdAt)`; el filtro por ventana + tenant no
   lo aprovecha porque `Message` no tiene `workspaceSlug` propio. A millones de
   mensajes conviene **desnormalizar `workspaceSlug` en `Message`** (o índice por
   `createdAt`) para un index scan por rango.

## Veredicto
✅ **DoD de escala cumplido a 100k filas/tenant.** Las optimizaciones del Sprint 2
(listas acotadas + índices compuestos + Analytics por SQL) se comportan según lo
diseñado. Los 2 seguimientos aplican al pasar a *millones* de filas por tenant.
