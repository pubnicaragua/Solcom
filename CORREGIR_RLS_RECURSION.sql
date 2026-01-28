-- =====================================================
-- CORREGIR RECURSIÓN INFINITA EN POLÍTICAS RLS
-- =====================================================

-- PROBLEMA: Las políticas RLS tienen recursión infinita
-- cuando intentan consultar user_profiles desde user_profiles

-- SOLUCIÓN: Eliminar políticas recursivas y crear políticas simples

-- 1. Eliminar todas las políticas actuales
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON user_profiles;
DROP POLICY IF EXISTS "Solo admins pueden ver todos los perfiles" ON user_profiles;
DROP POLICY IF EXISTS "Solo admins pueden actualizar perfiles" ON user_profiles;

-- 2. Crear políticas NO recursivas usando auth.uid() directamente

-- Política 1: Los usuarios pueden ver su propio perfil
CREATE POLICY "usuarios_ver_propio_perfil"
ON user_profiles
FOR SELECT
USING (auth.uid() = id);

-- Política 2: Los admins pueden ver todos los perfiles
-- IMPORTANTE: No consultar user_profiles dentro de la política
CREATE POLICY "admins_ver_todos_perfiles"
ON user_profiles
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM user_profiles WHERE role = 'admin'
  )
);

-- Política 3: Los admins pueden actualizar perfiles
CREATE POLICY "admins_actualizar_perfiles"
ON user_profiles
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM user_profiles WHERE role = 'admin'
  )
);

-- Política 4: Permitir INSERT para el trigger (SECURITY DEFINER)
CREATE POLICY "permitir_insert_trigger"
ON user_profiles
FOR INSERT
WITH CHECK (true);

-- =====================================================
-- VERIFICAR POLÍTICAS
-- =====================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies 
WHERE tablename = 'user_profiles';

-- =====================================================
-- RESULTADO ESPERADO
-- =====================================================
/*
Deberías ver 4 políticas:
1. usuarios_ver_propio_perfil (SELECT)
2. admins_ver_todos_perfiles (SELECT)
3. admins_actualizar_perfiles (UPDATE)
4. permitir_insert_trigger (INSERT)

Sin recursión infinita.
*/
