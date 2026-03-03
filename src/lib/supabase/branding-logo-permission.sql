-- ============================================================
-- Branding Permission (Logo Visibility)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Permiso nuevo para controlar visibilidad del logo en navegación
INSERT INTO public.permissions (code, name, module, description) VALUES
  ('branding.view', 'Ver Logo de Marca', 'branding', 'Permite ver el logo de la marca en la navegación')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  description = EXCLUDED.description;

-- 2) Asignación por defecto (ajústalo luego desde Roles si quieres ocultarlo)
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('admin', 'branding.view'),
  ('manager', 'branding.view'),
  ('operator', 'branding.view'),
  ('auditor', 'branding.view')
ON CONFLICT (role, permission_code) DO NOTHING;
