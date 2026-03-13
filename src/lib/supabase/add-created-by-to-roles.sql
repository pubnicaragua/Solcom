-- Agregar columna created_by a la tabla roles
-- Registra el usuario que creó cada rol personalizado
-- Los roles del sistema (admin, manager, operator, auditor) tendrán NULL

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;
