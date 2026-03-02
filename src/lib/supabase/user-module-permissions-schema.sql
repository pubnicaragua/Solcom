-- ============================================================
-- PERMISOS POR MODULO (OVERRIDES POR USUARIO)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module ~ '^[a-z0-9-]+$'),
  can_access BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user ON public.user_module_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module ON public.user_module_permissions(module);

CREATE OR REPLACE FUNCTION public.set_user_module_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_module_permissions_updated_at ON public.user_module_permissions;
CREATE TRIGGER trg_user_module_permissions_updated_at
BEFORE UPDATE ON public.user_module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_user_module_permissions_updated_at();

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own module overrides" ON public.user_module_permissions;
CREATE POLICY "Users can read own module overrides"
  ON public.user_module_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage module overrides" ON public.user_module_permissions;
CREATE POLICY "Admins manage module overrides"
  ON public.user_module_permissions
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
