# Estabilidad de sincronización de inventario

## Arquitectura

1. Zoho envía eventos a `POST /api/webhooks/zoho`.
2. El webhook coalesce cada `zoho_item_id` en `sync_queue`.
3. Cron-job.org llama cada minuto a `GET /api/cron/process-queue?cron_secret=...`.
4. El worker reclama trabajos con `FOR UPDATE SKIP LOCKED`, reutiliza un token Zoho por lote y actualiza Supabase.
5. El total, los snapshots y los balances de cada producto se publican en una sola transacción PostgreSQL.
6. Los fallos transitorios se reintentan con backoff; los definitivos quedan en `failed` con el error.

## Despliegue inicial sin interrupciones

1. Configurar en Vercel `CRON_SECRET` y `INVENTORY_SYNC_BATCH_SIZE=30`.
2. Desplegar el código. Antes de la migración usará un fallback compatible.
3. Pausar temporalmente el job de Cron-job.org.
4. Ejecutar en Supabase SQL Editor `src/lib/supabase/inventory-sync-queue-hardening.sql`.
5. Confirmar que la migración terminó sin errores.
6. Reanudar Cron-job.org con el mismo `CRON_SECRET` configurado en Vercel.
7. Ejecutar `npm run check:inventory-sync` hasta que `pending` llegue a cero.

La migración elimina pendientes duplicados, conserva un trabajo por producto y crea la escritura atómica del inventario. No borra productos, balances ni snapshots existentes durante la instalación.

## Respuesta esperada del cron

HTTP `200` con un cuerpo similar a:

```json
{
  "ok": true,
  "message": "Batch processing complete",
  "success": 30,
  "failed": 0,
  "deferred": 0
}
```

HTTP `401` significa que `cron_secret` no coincide. HTTP `500` indica configuración o fallo global. Un cuerpo con `failed > 0` requiere revisar `debug` y la columna `error` de `sync_queue`.

## Alertas recomendadas

- Alertar si existen trabajos `processing` por más de 10 minutos.
- Alertar si `failed > 0`.
- Alertar si el pendiente más antiguo supera 15 minutos.
- Conservar el cron cada minuto; subir el lote únicamente después de medir duración y límites de Zoho.

## Operaciones que deben evitarse

- No ejecutar `scripts/full-sync.js` para vaciar la cola: elimina tablas de inventario antes de reconstruirlas.
- No borrar todos los pendientes; primero coalescer por `zoho_item_id`.
- No usar `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el worker; requiere `SUPABASE_SERVICE_ROLE_KEY`.
