-- Solución DEFINITIVA para recursión infinita en RLS
-- Ejecutar en Supabase SQL Editor como service_role

-- 1. Deshabilitar RLS temporalmente
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar TODAS las políticas existentes
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.user_profiles;
DROP POLICY IF EXISTS "Solo admins pueden ver todos los perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Solo admins pueden actualizar perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins pueden ver todos los perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins pueden actualizar perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "allow_own_profile_select" ON public.user_profiles;
DROP POLICY IF EXISTS "allow_admin_all_select" ON public.user_profiles;
DROP POLICY IF EXISTS "allow_admin_update" ON public.user_profiles;
DROP POLICY IF EXISTS "allow_admin_insert" ON public.user_profiles;

-- 3. Eliminar función anterior si existe
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- 4. Crear función SECURITY DEFINER con row_security OFF
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Desactivar RLS temporalmente para esta función
  PERFORM set_config('row_security', 'off', true);
  
  -- Leer el rol sin disparar RLS
  SELECT role INTO user_role
  FROM public.user_profiles
  WHERE id = user_id;
  
  RETURN COALESCE(user_role, 'operator');
END;
$$;

-- 5. Ajustar propietario y permisos de la función
-- Cambiar 'postgres' por el owner de tu base de datos si es diferente
ALTER FUNCTION public.get_user_role(uuid) OWNER TO postgres;

-- Revocar acceso público y conceder solo a authenticated
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon;

-- 6. Habilitar RLS nuevamente
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 7. Crear políticas que usan la función (SIN recursión)
CREATE POLICY "allow_own_profile_select"
  ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "allow_admin_all_select"
  ON public.user_profiles
  FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "allow_admin_update"
  ON public.user_profiles
  FOR UPDATE
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "allow_admin_insert"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 8. Verificar que las políticas se crearon correctamente
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  cmd
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- 9. Probar la función (debe retornar tu rol sin error)
SELECT public.get_user_role(auth.uid()) as mi_rol;
