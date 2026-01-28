-- =====================================================
-- VERIFICAR QUE LOS USUARIOS ESTÁN CORRECTAMENTE CONFIGURADOS
-- =====================================================

-- 1. Ver todos los usuarios creados con sus perfiles
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at as user_created_at,
  up.full_name,
  up.role,
  up.created_at as profile_created_at
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com'
ORDER BY u.created_at DESC;

-- 2. Verificar que TODOS los usuarios tienen perfil
SELECT 
  u.email,
  CASE 
    WHEN up.id IS NULL THEN '❌ SIN PERFIL'
    ELSE '✅ TIENE PERFIL'
  END as status,
  up.role
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com';

-- 3. Si algún usuario NO tiene perfil, créalo manualmente:
-- (Reemplaza el UUID con el ID real del usuario)

/*
INSERT INTO public.user_profiles (id, email, full_name, role)
VALUES (
  'uuid-del-usuario-sin-perfil',
  'email@soliscomercialni.com',
  'Nombre del Usuario',
  'admin' -- o 'manager', 'operator', 'auditor'
);
*/

-- 4. Verificar políticas RLS
SELECT 
  schemaname, 
  tablename, 
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'user_profiles';

-- 5. Verificar que el trigger existe
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'user_profiles' 
   OR event_object_table = 'users';

-- 6. Probar que puedes consultar user_profiles
-- (Esto debería devolver los 4 usuarios)
SELECT 
  email,
  full_name,
  role
FROM public.user_profiles
ORDER BY created_at DESC;

-- =====================================================
-- SI TODO ESTÁ BIEN, DEBERÍAS VER:
-- =====================================================
/*
✅ 4 usuarios en auth.users
✅ 4 perfiles en user_profiles
✅ Todos con email_confirmed_at (no NULL)
✅ 3 políticas RLS activas
✅ 2 triggers activos (on_auth_user_created, set_updated_at)
*/
