-- =====================================================
-- CORREGIR TRIGGER QUE CAUSA ERROR 500
-- =====================================================

-- El problema: El trigger on_auth_user_created puede estar causando
-- conflictos con las operaciones internas de Supabase Auth

-- PASO 1: Eliminar el trigger actual
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- PASO 2: Eliminar la función actual
DROP FUNCTION IF EXISTS public.handle_new_user();

-- PASO 3: Crear función mejorada con manejo de errores
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insertar perfil solo si no existe
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Si hay error, loggear pero no fallar
    RAISE WARNING 'Error al crear perfil para %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;

-- PASO 4: Recrear el trigger con configuración segura
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- VERIFICAR QUE EL TRIGGER FUNCIONA
-- =====================================================

-- Ver el trigger
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'users'
  AND trigger_schema = 'auth';

-- Ver la función
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';

-- =====================================================
-- VERIFICAR QUE LOS PERFILES EXISTEN
-- =====================================================

SELECT 
  u.email,
  up.role,
  CASE 
    WHEN up.id IS NULL THEN '❌ SIN PERFIL'
    ELSE '✅ TIENE PERFIL'
  END as status
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com'
ORDER BY u.email;

-- =====================================================
-- SI TODO ESTÁ BIEN, DEBERÍAS VER:
-- =====================================================
/*
✅ Trigger recreado con manejo de errores
✅ Función con SECURITY DEFINER y search_path
✅ Todos los usuarios tienen perfil
✅ Ya no hay error 500 al hacer login
*/
