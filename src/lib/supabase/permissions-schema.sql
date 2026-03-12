-- =====================================================
-- SCHEMA DE PERMISOS GRANULARES - SOLIS COMERCIAL
-- =====================================================
-- Ejecutar este SQL en Supabase SQL Editor

-- 1. Crear tabla de permisos
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- Ej: 'inventory.read', 'inventory.write'
  name TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL, -- Ej: 'inventory', 'reports', 'ventas'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear tabla de roles_permissions (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator', 'auditor')),
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role, permission_code)
);

-- 3. Habilitar RLS
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para permissions
CREATE POLICY "Todos pueden ver permisos"
  ON permissions
  FOR SELECT
  USING (true);

CREATE POLICY "Solo admins pueden modificar permisos"
  ON permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Políticas RLS para role_permissions
CREATE POLICY "Todos pueden ver role_permissions"
  ON role_permissions
  FOR SELECT
  USING (true);

CREATE POLICY "Solo admins pueden modificar role_permissions"
  ON role_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. Insertar permisos base
INSERT INTO permissions (code, name, description, module) VALUES
  -- Inventario
  ('inventory.read', 'Ver Inventario', 'Permite ver el inventario completo', 'inventory'),
  ('inventory.write', 'Modificar Inventario', 'Permite editar productos y stock', 'inventory'),
  ('inventory.delete', 'Eliminar Productos', 'Permite eliminar productos del inventario', 'inventory'),
  ('inventory.import', 'Importar Inventario', 'Permite importar datos de inventario', 'inventory'),
  ('inventory.export', 'Exportar Inventario', 'Permite exportar datos de inventario', 'inventory'),
  
  -- Reportes
  ('reports.read', 'Ver Reportes', 'Permite ver todos los reportes', 'reports'),
  ('reports.export', 'Exportar Reportes', 'Permite exportar reportes a PDF/Excel', 'reports'),
  
  -- Ventas
  ('ventas.read', 'Ver Ventas', 'Permite ver el módulo de ventas', 'ventas'),
  ('ventas.write', 'Crear Ventas', 'Permite crear y modificar ventas', 'ventas'),
  ('ventas.create_quote', 'Crear Cotización', 'Permite crear cotizaciones', 'ventas'),
  ('ventas.create_invoice', 'Crear Factura', 'Permite crear facturas', 'ventas'),
  ('ventas.create_sales_order', 'Crear Orden de Venta', 'Permite crear órdenes de venta', 'ventas'),
  
  -- Transferencias
  ('transfers.read', 'Ver Transferencias', 'Permite ver transferencias entre bodegas', 'transfers'),
  ('transfers.write', 'Crear Transferencias', 'Permite crear transferencias entre bodegas', 'transfers'),
  
  -- Usuarios
  ('users.read', 'Ver Usuarios', 'Permite ver la lista de usuarios', 'users'),
  ('users.write', 'Gestionar Usuarios', 'Permite crear y modificar usuarios', 'users'),
  ('users.delete', 'Eliminar Usuarios', 'Permite eliminar usuarios', 'users'),
  
  -- Roles
  ('roles.read', 'Ver Roles', 'Permite ver roles y permisos', 'roles'),
  ('roles.write', 'Gestionar Roles', 'Permite modificar roles y asignar permisos', 'roles'),
  
  -- Configuración
  ('settings.read', 'Ver Configuración', 'Permite ver la configuración del sistema', 'settings'),
  ('settings.write', 'Modificar Configuración', 'Permite modificar la configuración del sistema', 'settings'),
  
  -- IA
  ('ai.use', 'Usar Agentes IA', 'Permite usar los agentes de IA', 'ai-agents'),
  ('branding.view', 'Ver Logo de Marca', 'Permite ver el logo de la marca en la navegación', 'branding')
ON CONFLICT (code) DO NOTHING;

-- 7. Asignar permisos por defecto a roles
-- Admin: Todos los permisos
INSERT INTO role_permissions (role, permission_code)
SELECT 'admin', code FROM permissions
ON CONFLICT (role, permission_code) DO NOTHING;

-- Manager (Bodega): Inventario completo + Transferencias + Reportes
INSERT INTO role_permissions (role, permission_code) VALUES
  ('manager', 'inventory.read'),
  ('manager', 'inventory.write'),
  ('manager', 'inventory.export'),
  ('manager', 'transfers.read'),
  ('manager', 'transfers.write'),
  ('manager', 'reports.read'),
  ('manager', 'reports.export'),
  ('manager', 'ventas.read'),
  ('manager', 'ventas.create_quote'),
  ('manager', 'ventas.create_invoice'),
  ('manager', 'ventas.create_sales_order'),
  ('manager', 'branding.view')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Operator (Vendedor): Solo lectura de inventario
INSERT INTO role_permissions (role, permission_code) VALUES
  ('operator', 'inventory.read'),
  ('operator', 'reports.read'),
  ('operator', 'ventas.read'),
  ('operator', 'ventas.write'),
  ('operator', 'ventas.create_quote'),
  ('operator', 'ventas.create_invoice'),
  ('operator', 'ventas.create_sales_order'),
  ('operator', 'branding.view')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Auditor: Solo lectura de reportes
INSERT INTO role_permissions (role, permission_code) VALUES
  ('auditor', 'reports.read'),
  ('auditor', 'reports.export'),
  ('auditor', 'branding.view')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 8. Función para verificar permisos
CREATE OR REPLACE FUNCTION has_permission(user_id UUID, permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM user_profiles WHERE id = user_id;
  
  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM role_permissions 
    WHERE role = user_role AND permission_code = permission_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
