-- Cola robusta para sincronización Zoho -> Solcom.
-- Aplicar con el cron externo pausado durante la migración.
-- Es idempotente y conserva la API actual de sync_queue.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_item_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

LOCK TABLE public.sync_queue IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.sync_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_by text;

-- Limpiar estados heredados inválidos antes de crear el CHECK.
UPDATE public.sync_queue
SET status = 'failed',
    error = COALESCE(error, 'Estado inválido corregido por migración.'),
    updated_at = now()
WHERE status NOT IN ('pending', 'processing', 'completed', 'failed');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sync_queue_status_check'
      AND conrelid = 'public.sync_queue'::regclass
  ) THEN
    ALTER TABLE public.sync_queue
      ADD CONSTRAINT sync_queue_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
  END IF;
END;
$$;

-- Conservar solo el trabajo pendiente más antiguo de cada producto.
WITH ranked_pending AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY zoho_item_id
           ORDER BY created_at ASC, id ASC
         ) AS row_number
  FROM public.sync_queue
  WHERE status = 'pending'
)
DELETE FROM public.sync_queue queue
USING ranked_pending duplicate
WHERE queue.id = duplicate.id
  AND duplicate.row_number > 1;

-- Los workers nuevos reclaman atómicamente; cualquier duplicado processing
-- heredado se marca como fallido para que no existan dos escritores por item.
WITH ranked_processing AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY zoho_item_id
           ORDER BY updated_at DESC, id DESC
         ) AS row_number
  FROM public.sync_queue
  WHERE status = 'processing'
)
UPDATE public.sync_queue queue
SET status = 'failed',
    error = 'Trabajo processing duplicado cerrado por migración.',
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
FROM ranked_processing duplicate
WHERE queue.id = duplicate.id
  AND duplicate.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_queue_pending_item
  ON public.sync_queue(zoho_item_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_queue_processing_item
  ON public.sync_queue(zoho_item_id)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_sync_queue_ready
  ON public.sync_queue(status, next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_queue_retention
  ON public.sync_queue(status, updated_at);

CREATE OR REPLACE FUNCTION public.enqueue_inventory_sync_items(
  p_zoho_item_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_count integer := 0;
  inserted_count integer := 0;
  existing_pending_count integer := 0;
BEGIN
  WITH requested AS (
    SELECT DISTINCT btrim(item_id) AS zoho_item_id
    FROM unnest(COALESCE(p_zoho_item_ids, ARRAY[]::text[])) AS input(item_id)
    WHERE btrim(COALESCE(item_id, '')) <> ''
  )
  SELECT count(*) INTO requested_count FROM requested;

  WITH requested AS (
    SELECT DISTINCT btrim(item_id) AS zoho_item_id
    FROM unnest(COALESCE(p_zoho_item_ids, ARRAY[]::text[])) AS input(item_id)
    WHERE btrim(COALESCE(item_id, '')) <> ''
  )
  SELECT count(*) INTO existing_pending_count
  FROM requested
  JOIN public.sync_queue queue
    ON queue.zoho_item_id = requested.zoho_item_id
   AND queue.status = 'pending';

  WITH requested AS (
    SELECT DISTINCT btrim(item_id) AS zoho_item_id
    FROM unnest(COALESCE(p_zoho_item_ids, ARRAY[]::text[])) AS input(item_id)
    WHERE btrim(COALESCE(item_id, '')) <> ''
  ), queued AS (
    INSERT INTO public.sync_queue (
      zoho_item_id,
      status,
      attempts,
      error,
      next_attempt_at,
      created_at,
      updated_at
    )
    SELECT zoho_item_id, 'pending', 0, NULL, now(), now(), now()
    FROM requested
    ON CONFLICT (zoho_item_id) WHERE status = 'pending'
    DO UPDATE SET
      next_attempt_at = LEAST(sync_queue.next_attempt_at, now()),
      error = NULL,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM queued;

  RETURN jsonb_build_object(
    'requested', requested_count,
    'queued', GREATEST(0, requested_count - existing_pending_count),
    'coalesced', existing_pending_count,
    'affected', inserted_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_inventory_sync_jobs(
  p_batch_size integer,
  p_worker_id text,
  p_stale_after_seconds integer DEFAULT 300
)
RETURNS SETOF public.sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_batch_size integer := LEAST(50, GREATEST(1, COALESCE(p_batch_size, 20)));
  stale_before timestamp with time zone := now() - make_interval(
    secs => GREATEST(120, COALESCE(p_stale_after_seconds, 300))
  );
BEGIN
  IF btrim(COALESCE(p_worker_id, '')) = '' THEN
    RAISE EXCEPTION 'p_worker_id es requerido';
  END IF;

  -- Serializa únicamente la recuperación de trabajos vencidos.
  PERFORM pg_advisory_xact_lock(hashtext('inventory_sync_queue_stale_recovery'));

  -- Si llegó un evento nuevo mientras el trabajo anterior estaba atascado,
  -- el pendiente nuevo lo reemplaza y el processing viejo se cierra.
  UPDATE public.sync_queue stale
  SET status = 'failed',
      error = 'Trabajo vencido reemplazado por un evento más reciente.',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE stale.status = 'processing'
    AND stale.updated_at < stale_before
    AND EXISTS (
      SELECT 1
      FROM public.sync_queue pending
      WHERE pending.zoho_item_id = stale.zoho_item_id
        AND pending.status = 'pending'
    );

  UPDATE public.sync_queue stale
  SET status = 'pending',
      error = 'Trabajo recuperado por timeout del worker.',
      next_attempt_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE stale.status = 'processing'
    AND stale.updated_at < stale_before;

  -- Retención para impedir crecimiento indefinido de la tabla.
  DELETE FROM public.sync_queue
  WHERE status = 'completed'
    AND updated_at < now() - interval '7 days';

  DELETE FROM public.sync_queue
  WHERE status = 'failed'
    AND updated_at < now() - interval '30 days';

  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id
    FROM public.sync_queue queue
    WHERE queue.status = 'pending'
      AND queue.next_attempt_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.sync_queue processing
        WHERE processing.zoho_item_id = queue.zoho_item_id
          AND processing.status = 'processing'
      )
    ORDER BY queue.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT safe_batch_size
  ), claimed AS (
    UPDATE public.sync_queue queue
    SET status = 'processing',
        locked_at = now(),
        locked_by = p_worker_id,
        updated_at = now()
    FROM candidates
    WHERE queue.id = candidates.id
      AND queue.status = 'pending'
    RETURNING queue.*
  )
  SELECT * FROM claimed ORDER BY claimed.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_inventory_sync_job(
  p_job_id uuid,
  p_worker_id text,
  p_success boolean,
  p_retryable boolean DEFAULT true,
  p_error text DEFAULT NULL,
  p_max_attempts integer DEFAULT 5
)
RETURNS public.sync_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.sync_queue%ROWTYPE;
  next_attempts integer;
  should_retry boolean;
  retry_seconds integer;
BEGIN
  SELECT * INTO job
  FROM public.sync_queue
  WHERE id = p_job_id
    AND status = 'processing'
    AND locked_by = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabajo % no pertenece al worker % o ya no está processing',
      p_job_id, p_worker_id;
  END IF;

  next_attempts := job.attempts + 1;

  IF p_success THEN
    UPDATE public.sync_queue
    SET status = 'completed',
        attempts = next_attempts,
        error = NULL,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = now()
    WHERE id = job.id
    RETURNING * INTO job;
    RETURN job;
  END IF;

  -- Si ya existe un pendiente más nuevo, no duplicar el reintento.
  IF EXISTS (
    SELECT 1
    FROM public.sync_queue pending
    WHERE pending.zoho_item_id = job.zoho_item_id
      AND pending.status = 'pending'
  ) THEN
    UPDATE public.sync_queue
    SET status = 'failed',
        attempts = next_attempts,
        error = left(COALESCE(p_error, 'Fallo reemplazado por evento más reciente.'), 1000),
        locked_at = NULL,
        locked_by = NULL,
        updated_at = now()
    WHERE id = job.id
    RETURNING * INTO job;
    RETURN job;
  END IF;

  should_retry := COALESCE(p_retryable, true)
    AND next_attempts < GREATEST(1, COALESCE(p_max_attempts, 5));
  retry_seconds := LEAST(300, (15 * power(2, GREATEST(0, next_attempts - 1)))::integer);

  UPDATE public.sync_queue
  SET status = CASE WHEN should_retry THEN 'pending' ELSE 'failed' END,
      attempts = next_attempts,
      error = left(COALESCE(p_error, 'Error desconocido'), 1000),
      next_attempt_at = CASE
        WHEN should_retry THEN now() + make_interval(secs => retry_seconds)
        ELSE next_attempt_at
      END,
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE id = job.id
  RETURNING * INTO job;

  RETURN job;
END;
$$;

-- Publica el estado absoluto de un producto como una sola transacción. Si
-- falla items, stock_snapshots o inventory_balance, PostgreSQL revierte todo.
CREATE OR REPLACE FUNCTION public.replace_inventory_item_stock(
  p_item_id uuid,
  p_stock_total integer,
  p_snapshots jsonb,
  p_balances jsonb,
  p_source text DEFAULT 'sync'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_items integer := 0;
  snapshot_count integer := 0;
  balance_count integer := 0;
  calculated_total bigint := 0;
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'p_item_id es requerido';
  END IF;

  -- Serializa cualquier endpoint que publique el mismo producto mediante este
  -- RPC, incluso si uno proviene del cron de reconciliación y otro de la cola.
  PERFORM pg_advisory_xact_lock(
    hashtext('inventory_item_stock:' || p_item_id::text)
  );

  IF jsonb_typeof(COALESCE(p_snapshots, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_balances, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_snapshots y p_balances deben ser arreglos JSON';
  END IF;

  SELECT COALESCE(sum(balance.qty_on_hand), 0)
  INTO calculated_total
  FROM jsonb_to_recordset(COALESCE(p_balances, '[]'::jsonb)) AS balance(
    warehouse_id uuid,
    qty_on_hand integer
  );

  IF calculated_total <> COALESCE(p_stock_total, 0) THEN
    RAISE EXCEPTION 'Total inconsistente para item %: recibido %, balances %',
      p_item_id, p_stock_total, calculated_total;
  END IF;

  UPDATE public.items
  SET stock_total = COALESCE(p_stock_total, 0),
      updated_at = now()
  WHERE id = p_item_id;
  GET DIAGNOSTICS updated_items = ROW_COUNT;

  IF updated_items <> 1 THEN
    RAISE EXCEPTION 'Item local % no existe', p_item_id;
  END IF;

  DELETE FROM public.stock_snapshots
  WHERE item_id = p_item_id;

  INSERT INTO public.stock_snapshots (
    item_id,
    warehouse_id,
    qty,
    source_ts,
    synced_at
  )
  SELECT
    p_item_id,
    snapshot.warehouse_id,
    COALESCE(snapshot.qty, 0),
    COALESCE(snapshot.source_ts, now()),
    COALESCE(snapshot.synced_at, now())
  FROM jsonb_to_recordset(COALESCE(p_snapshots, '[]'::jsonb)) AS snapshot(
    warehouse_id uuid,
    qty integer,
    source_ts timestamp with time zone,
    synced_at timestamp with time zone
  );
  GET DIAGNOSTICS snapshot_count = ROW_COUNT;

  DELETE FROM public.inventory_balance
  WHERE item_id = p_item_id;

  INSERT INTO public.inventory_balance (
    item_id,
    warehouse_id,
    qty_on_hand,
    source,
    source_ts,
    updated_at
  )
  SELECT
    p_item_id,
    balance.warehouse_id,
    COALESCE(balance.qty_on_hand, 0),
    COALESCE(NULLIF(btrim(p_source), ''), 'sync'),
    COALESCE(balance.source_ts, now()),
    now()
  FROM jsonb_to_recordset(COALESCE(p_balances, '[]'::jsonb)) AS balance(
    warehouse_id uuid,
    qty_on_hand integer,
    source_ts timestamp with time zone
  );
  GET DIAGNOSTICS balance_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'stock_total', COALESCE(p_stock_total, 0),
    'snapshots', snapshot_count,
    'balances', balance_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_inventory_sync_items(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_inventory_sync_jobs(integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_inventory_sync_job(uuid, text, boolean, boolean, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_inventory_item_stock(uuid, integer, jsonb, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_inventory_sync_items(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_inventory_sync_jobs(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_inventory_sync_job(uuid, text, boolean, boolean, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_inventory_item_stock(uuid, integer, jsonb, jsonb, text) TO service_role;

COMMIT;
