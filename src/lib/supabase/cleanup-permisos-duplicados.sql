-- ============================================================
-- SCRIPT DE LIMPIEZA v2: Ejecutar en Supabase SQL Editor
-- Corrige permisos duplicados y habilita roles personalizados
-- Fecha: Marzo 2026
-- ============================================================

-- ==========================================
-- PASO 1: Eliminar CHECK constraints
-- ==========================================
DO $$
BEGIN
  ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==========================================
-- PASO 2: Asegurar roles personalizados
-- ==========================================
INSERT INTO public.roles (name, description, is_custom) VALUES
  ('BODEGUERO', 'Encargado de bodega', true)
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- PASO 3: Limpiar TODAS las entradas legacy
-- Primero borrar role_permissions que referencian códigos viejos
-- ==========================================
DELETE FROM public.role_permissions
WHERE permission_code NOT LIKE '%.%';

-- Luego borrar permisos con formato viejo de la tabla permissions
DELETE FROM public.permissions
WHERE code NOT LIKE '%.%';

-- ==========================================
-- PASO 4: Insertar/Actualizar permisos canónicos (ÚNICA fuente de verdad)
-- ==========================================
INSERT INTO public.permissions (code, name, module, description) VALUES
  -- Inventario
  ('inventory.view',   'Ver Inventario',      'inventory', 'Visualizar productos y existencias'),
  ('inventory.create', 'Crear Artículo',      'inventory', 'Agregar nuevos productos'),
  ('inventory.edit',   'Modificar Inventario', 'inventory', 'Editar productos y stock'),
  ('inventory.delete', 'Eliminar Productos',  'inventory', 'Eliminar productos del inventario'),
  ('inventory.import', 'Importar Inventario', 'inventory', 'Importar datos de inventario'),
  ('inventory.export', 'Exportar Inventario', 'inventory', 'Exportar inventario a CSV/PDF'),
  -- Ventas
  ('ventas.view',   'Ver Ventas',   'ventas', 'Ver registro de ventas y cotizaciones'),
  ('ventas.create', 'Crear Ventas', 'ventas', 'Crear y modificar ventas'),
  -- Transferencias
  ('transfers.view',   'Ver Transferencias',   'transfers', 'Ver transferencias entre bodegas'),
  ('transfers.create', 'Crear Transferencias', 'transfers', 'Crear transferencias entre bodegas'),
  -- Reportes
  ('reports.view',   'Ver Reportes',      'reports', 'Acceder a métricas e informes'),
  ('reports.export', 'Exportar Reportes', 'reports', 'Exportar reportes a CSV/PDF'),
  -- Roles
  ('roles.view',   'Ver Roles',        'roles', 'Ver roles y permisos'),
  ('roles.manage', 'Gestionar Roles',  'roles', 'Modificar roles y asignar permisos'),
  -- Usuarios
  ('users.view',   'Ver Usuarios',       'users', 'Ver la lista de usuarios'),
  ('users.manage', 'Gestionar Usuarios', 'users', 'Crear y modificar usuarios'),
  ('users.delete', 'Eliminar Usuarios',  'users', 'Eliminar usuarios del sistema'),
  -- Configuración
  ('settings.view', 'Ver Configuración',       'settings', 'Ver configuración del sistema'),
  ('settings.edit', 'Modificar Configuración', 'settings', 'Modificar configuración del sistema'),
  -- Agentes IA
  ('ai-agents.use', 'Usar Agentes IA', 'ai-agents', 'Acceder y usar agentes de inteligencia artificial'),
  -- Branding
  ('branding.view', 'Ver Logo de Marca', 'branding', 'Permite ver el logo de la marca en la navegación')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- ==========================================
-- PASO 5: Eliminar duplicados en role_permissions
-- ==========================================
DELETE FROM public.role_permissions a
USING public.role_permissions b
WHERE a.id > b.id 
  AND a.role = b.role 
  AND a.permission_code = b.permission_code;

-- ==========================================
-- PASO 6: Re-asignar permisos del BODEGUERO correctamente (limpiar y rehacer)
-- ==========================================
DELETE FROM public.role_permissions WHERE role = 'BODEGUERO';
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('BODEGUERO', 'inventory.view'),
  ('BODEGUERO', 'transfers.view'),
  ('BODEGUERO', 'transfers.create')
ON CONFLICT DO NOTHING;

-- ==========================================
-- PASO 7: Asegurar permisos del admin (todos los permisos)
-- ==========================================
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'admin', code FROM public.permissions
ON CONFLICT DO NOTHING;

-- ==========================================
-- PASO 8: Asegurar tipos de notificación completos
-- ==========================================
INSERT INTO public.notification_types (code, name, description) VALUES
  ('low_stock', 'Stock Bajo', 'Notificar cuando un producto llega al stock mínimo'),
  ('sync_error', 'Error de Sincronización', 'Notificar errores al sincronizar con Zoho'),
  ('new_transfer', 'Nueva Transferencia', 'Notificar cuando se crea una transferencia de bodega'),
  ('new_sale', 'Venta Registrada', 'Notificar cuando un vendedor crea una nueva venta/factura'),
  ('report_ready', 'Reporte Generado', 'Notificar cuando un reporte asíncrono está listo para descargar'),
  ('login_alert', 'Alerta de Seguridad', 'Notificar sobre inicios de sesión sospechosos o bloqueos'),
  ('user_created', 'Usuario Creado', 'Notificar cuando se crea un nuevo usuario en el sistema'),
  ('role_change', 'Cambio de Permisos', 'Notificar cuando se modifican los permisos de un rol')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- ==========================================
-- PASO 9: Verificar resultado
-- ==========================================
SELECT 
  rp.role,
  p.module,
  p.name as permiso,
  p.description
FROM public.role_permissions rp
JOIN public.permissions p ON rp.permission_code = p.code
ORDER BY rp.role, p.module, p.code;
