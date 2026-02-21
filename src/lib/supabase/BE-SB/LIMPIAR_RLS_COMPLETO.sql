-- LIMPIEZA COMPLETA Y CONFIGURACIÓN CORRECTA DE RLS
-- Ejecutar en Supabase SQL Editor

-- PASO 1: Deshabilitar RLS temporalmente
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- PASO 2: ELIMINAR TODAS LAS POLÍTICAS (incluyendo las viejas)
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
DROP POLICY IF EXISTS "admins_actualizar_perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_ver_todos_perfiles" ON public.user_profiles;
DROP POLICY IF EXISTS "permitir_insert_trigger" ON public.user_profiles;
DROP POLICY IF EXISTS "usuarios_ver_propio_perfil" ON public.user_profiles;

-- PASO 3: Eliminar función anterior si existe
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- PASO 4: Crear función SECURITY DEFINER con row_security OFF
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

-- PASO 5: Ajustar propietario y permisos
ALTER FUNCTION public.get_user_role(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon;

-- PASO 6: Habilitar RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- PASO 7: Crear SOLO las políticas nuevas (sin las viejas)
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

-- PASO 8: Verificar que SOLO existan las 4 políticas nuevas
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  cmd
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- PASO 9: Probar la función
SELECT public.get_user_role(auth.uid()) as mi_rol;
