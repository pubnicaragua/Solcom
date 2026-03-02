-- =====================================================
-- FIX: Eliminar CHECK constraint en role_permissions.role
-- para permitir roles personalizados (custom roles)
-- =====================================================
-- Ejecutar en Supabase SQL Editor

-- Eliminar el constraint que limita el rol a solo los 4 principales
ALTER TABLE role_permissions 
DROP CONSTRAINT IF EXISTS role_permissions_role_check;

-- Verificar que quedó sin constraint
-- (debe mostrar solo: unique y not null, sin check en role)
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'role_permissions'::regclass;
