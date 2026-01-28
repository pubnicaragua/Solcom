-- =====================================================
-- DIAGNÓSTICO COMPLETO DEL ERROR 500
-- =====================================================

-- 1. Verificar estructura de auth.identities (columna problemática)
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_schema = 'auth' 
  AND table_name = 'identities'
ORDER BY ordinal_position;

-- 2. Verificar que los identities existen para todos los usuarios
SELECT 
  u.email,
  i.provider,
  i.provider_id,
  CASE 
    WHEN i.id IS NULL THEN '❌ SIN IDENTITY'
    ELSE '✅ TIENE IDENTITY'
  END as status
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id
WHERE u.email LIKE '%@soliscomercialni.com'
ORDER BY u.email;

-- 3. Verificar políticas RLS en auth.users (pueden bloquear Auth)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE schemaname = 'auth';

-- 4. Verificar si hay triggers problemáticos en auth.users
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';

-- 5. Verificar extensiones necesarias
SELECT 
  extname,
  extversion
FROM pg_extension
WHERE extname IN ('pgcrypto', 'uuid-ossp', 'pgjwt');

-- =====================================================
-- POSIBLES PROBLEMAS Y SOLUCIONES
-- =====================================================

/*
PROBLEMA 1: Columna 'email' en auth.identities es GENERATED
- Si es GENERATED, no se puede insertar manualmente
- Solución: No insertar el campo email en identities

PROBLEMA 2: Falta provider_id en identities
- Auth requiere provider_id para funcionar
- Solución: Asegurar que provider_id existe

PROBLEMA 3: RLS bloqueando consultas internas de Auth
- Políticas RLS en auth.users pueden causar conflictos
- Solución: Verificar que no hay RLS en auth schema

PROBLEMA 4: Trigger fallando durante INSERT
- El trigger on_auth_user_created puede fallar
- Solución: Ya aplicada con EXCEPTION handler
*/
