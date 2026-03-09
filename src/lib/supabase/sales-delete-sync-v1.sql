-- ============================================================
-- SALES DELETE SYNC V1
-- Auditoría de eliminación ERP <-> Zoho para facturas y OVs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sales_delete_sync_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  document_id UUID NOT NULL,
  document_number TEXT,
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  local_action TEXT NOT NULL DEFAULT 'none',
  local_result TEXT NOT NULL DEFAULT 'unknown',
  zoho_linked BOOLEAN NOT NULL DEFAULT false,
  zoho_external_id TEXT,
  zoho_operation TEXT NOT NULL DEFAULT 'none',
  zoho_result_status TEXT NOT NULL DEFAULT 'not_required',
  zoho_error_code TEXT,
  zoho_error_message TEXT,
  sync_job_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_delete_sync_audit_document_type_chk'
  ) THEN
    ALTER TABLE public.sales_delete_sync_audit
      ADD CONSTRAINT sales_delete_sync_audit_document_type_chk
      CHECK (document_type IN ('sales_invoice', 'sales_order'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_delete_sync_audit_zoho_result_status_chk'
  ) THEN
    ALTER TABLE public.sales_delete_sync_audit
      ADD CONSTRAINT sales_delete_sync_audit_zoho_result_status_chk
      CHECK (zoho_result_status IN ('not_required', 'success', 'pending', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_delete_sync_audit_document
  ON public.sales_delete_sync_audit(document_type, document_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_delete_sync_audit_zoho_status
  ON public.sales_delete_sync_audit(zoho_result_status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_delete_sync_audit_sync_job
  ON public.sales_delete_sync_audit(sync_job_id);

CREATE OR REPLACE FUNCTION public.update_sales_delete_sync_audit_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_delete_sync_audit_updated_at ON public.sales_delete_sync_audit;
CREATE TRIGGER trg_sales_delete_sync_audit_updated_at
BEFORE UPDATE ON public.sales_delete_sync_audit
FOR EACH ROW
EXECUTE FUNCTION public.update_sales_delete_sync_audit_updated_at();

ALTER TABLE public.sales_delete_sync_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sales_delete_sync_audit'
      AND policyname = 'Allow authenticated full access on sales_delete_sync_audit'
  ) THEN
    CREATE POLICY "Allow authenticated full access on sales_delete_sync_audit"
      ON public.sales_delete_sync_audit
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sales_delete_sync_audit'
      AND policyname = 'Allow service_role full access on sales_delete_sync_audit'
  ) THEN
    CREATE POLICY "Allow service_role full access on sales_delete_sync_audit"
      ON public.sales_delete_sync_audit
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
