-- ============================================================
-- PERMISOS POR BODEGA (USUARIO)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Configuración general por usuario para visibilidad de stock
CREATE TABLE IF NOT EXISTS public.user_warehouse_settings (
  user_id UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  all_warehouses BOOLEAN NOT NULL DEFAULT false,
  can_view_stock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Permisos explícitos por bodega
CREATE TABLE IF NOT EXISTS public.user_warehouse_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  can_view_stock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wh_permissions_user ON public.user_warehouse_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wh_permissions_wh ON public.user_warehouse_permissions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_user_wh_permissions_user_wh ON public.user_warehouse_permissions(user_id, warehouse_id);

-- 3) updated_at automático
CREATE OR REPLACE FUNCTION public.set_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_warehouse_settings_updated_at ON public.user_warehouse_settings;
CREATE TRIGGER trg_user_warehouse_settings_updated_at
BEFORE UPDATE ON public.user_warehouse_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_user_warehouse_permissions_updated_at ON public.user_warehouse_permissions;
CREATE TRIGGER trg_user_warehouse_permissions_updated_at
BEFORE UPDATE ON public.user_warehouse_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_timestamp_updated_at();

-- 4) RLS
ALTER TABLE public.user_warehouse_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_warehouse_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own warehouse settings" ON public.user_warehouse_settings;
CREATE POLICY "Users can read own warehouse settings"
  ON public.user_warehouse_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage warehouse settings" ON public.user_warehouse_settings;
CREATE POLICY "Admins manage warehouse settings"
  ON public.user_warehouse_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can read own warehouse permissions" ON public.user_warehouse_permissions;
CREATE POLICY "Users can read own warehouse permissions"
  ON public.user_warehouse_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage warehouse permissions" ON public.user_warehouse_permissions;
CREATE POLICY "Admins manage warehouse permissions"
  ON public.user_warehouse_permissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

