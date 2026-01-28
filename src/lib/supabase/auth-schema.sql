-- =====================================================
-- SCHEMA DE AUTENTICACIÓN Y ROLES - SOLIS COMERCIAL
-- =====================================================
-- Ejecutar este SQL en Supabase SQL Editor

-- 1. Crear tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator', 'auditor')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS en user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS para user_profiles
CREATE POLICY "Los usuarios pueden ver su propio perfil"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Solo admins pueden ver todos los perfiles"
  ON user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden actualizar perfiles"
  ON user_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger para ejecutar la función
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 6. Función para actualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger para updated_at en user_profiles
DROP TRIGGER IF EXISTS set_updated_at ON user_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- INSERTAR USUARIOS DE PRUEBA
-- =====================================================

-- Nota: Estos usuarios deben crearse desde la interfaz de Supabase Auth
-- o mediante la función auth.signup()

-- Para crear usuarios de prueba, ejecuta en Supabase SQL Editor:

-- Usuario Admin (después de crear en Auth UI)
-- INSERT INTO user_profiles (id, email, full_name, role)
-- VALUES (
--   'uuid-del-usuario-admin',
--   'admin@soliscomercialni.com',
--   'Administrador',
--   'admin'
-- );

-- Usuario Manager
-- INSERT INTO user_profiles (id, email, full_name, role)
-- VALUES (
--   'uuid-del-usuario-manager',
--   'manager@soliscomercialni.com',
--   'Gerente',
--   'manager'
-- );

-- Usuario Operator
-- INSERT INTO user_profiles (id, email, full_name, role)
-- VALUES (
--   'uuid-del-usuario-operator',
--   'operator@soliscomercialni.com',
--   'Operador',
--   'operator'
-- );

-- Usuario Auditor
-- INSERT INTO user_profiles (id, email, full_name, role)
-- VALUES (
--   'uuid-del-usuario-auditor',
--   'auditor@soliscomercialni.com',
--   'Auditor',
--   'auditor'
-- );

-- =====================================================
-- PERMISOS POR ROL
-- =====================================================

/*
ADMIN:
  - Acceso completo a todos los módulos
  - Puede gestionar usuarios y roles
  - Puede modificar configuración del sistema
  
MANAGER:
  - Acceso a Inventario (lectura/escritura)
  - Acceso a Reportes (lectura)
  - Acceso a Agentes IA
  - NO puede gestionar roles ni configuración
  
OPERATOR:
  - Acceso a Inventario (solo lectura)
  - Acceso a Reportes (solo lectura)
  - NO puede usar Agentes IA
  
AUDITOR:
  - Acceso a Reportes (solo lectura)
  - NO puede modificar inventario
  - NO puede usar Agentes IA
*/

-- =====================================================
-- VERIFICAR INSTALACIÓN
-- =====================================================

-- Verificar que la tabla existe
SELECT * FROM user_profiles LIMIT 1;

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'user_profiles';

-- Verificar triggers
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'user_profiles';
