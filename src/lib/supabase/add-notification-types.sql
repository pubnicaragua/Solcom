-- ============================================================
-- Script rápido: Agregar tipos de notificación faltantes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Agregar los nuevos tipos de notificación
INSERT INTO public.notification_types (code, name, description) VALUES
  ('user_created', 'Usuario Creado', 'Notificar cuando se crea un nuevo usuario en el sistema'),
  ('role_change', 'Cambio de Permisos', 'Notificar cuando se modifican los permisos de un rol')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Verificar todos los tipos de notificación disponibles
SELECT code, name, description FROM public.notification_types ORDER BY name;
