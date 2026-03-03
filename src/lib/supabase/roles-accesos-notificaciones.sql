-- 1. Crear tabla de roles
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  is_custom boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Insertar roles por defecto
INSERT INTO public.roles (name, description, is_custom) VALUES
  ('admin', 'Administrador', false),
  ('manager', 'Gerente de Bodega', false),
  ('operator', 'Vendedor', false),
  ('auditor', 'Auditor', false)
ON CONFLICT (name) DO NOTHING;

-- 2. Modificar user_profiles y role_permissions para quitar el CHECK constraint estático y agregar FK
DO $$
BEGIN
  -- Quitamos los check de roles fijos si existen
  ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Opcional: Agregar Foreign Key para asegurar integridad con la nueva tabla roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_fkey') THEN
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name) ON UPDATE CASCADE ON DELETE SET DEFAULT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_fkey') THEN
    ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Crear Tipos de Notificación
CREATE TABLE IF NOT EXISTS public.notification_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

INSERT INTO public.notification_types (code, name, description) VALUES
  ('low_stock', 'Stock Bajo', 'Notificar cuando un producto llega al stock mínimo'),
  ('sync_error', 'Error de Sincronización', 'Notificar errores al sincronizar con Zoho'),
  ('new_transfer', 'Nueva Transferencia', 'Notificar cuando se crea una transferencia de bodega'),
  ('new_sale', 'Venta Registrada', 'Notificar cuando un vendedor crea una nueva venta/factura'),
  ('report_ready', 'Reporte Generado', 'Notificar cuando un reporte asíncrono está listo para descargar'),
  ('login_alert', 'Alerta de Seguridad', 'Notificar sobre inicios de sesión sospechosos o bloqueos'),
  ('user_created', 'Usuario Creado', 'Notificar cuando se crea un nuevo usuario en el sistema'),
  ('role_change', 'Cambio de Permisos', 'Notificar cuando se modifican los permisos de un rol')
ON CONFLICT (code) DO NOTHING;

-- 4. Preferencias de Notificación por Rol
CREATE TABLE IF NOT EXISTS public.role_notification_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name text NOT NULL,
  notification_type_code text NOT NULL,
  is_enabled boolean DEFAULT true,
  UNIQUE(role_name, notification_type_code),
  FOREIGN KEY (role_name) REFERENCES public.roles(name) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (notification_type_code) REFERENCES public.notification_types(code) ON DELETE CASCADE
);

-- Asignar notificaciones por defecto a los roles principales
INSERT INTO public.role_notification_prefs (role_name, notification_type_code, is_enabled) VALUES
  ('admin', 'sync_error', true),
  ('admin', 'login_alert', true),
  ('manager', 'low_stock', true),
  ('manager', 'new_transfer', true),
  ('manager', 'new_sale', true),
  ('auditor', 'report_ready', true)
ON CONFLICT DO NOTHING;

-- 5. Tabla de Notificaciones en Tiempo Real (Historial por usuario)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar Supabase Realtime para la tabla de notificaciones
DO $$
BEGIN
  -- Si no existe la publicación, la creamos
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Si ya estaba añadida
END $$;

-- 6. Actualizar Permisos (Usar ON CONFLICT DO UPDATE para corregir nombres/descripciones duplicados)
INSERT INTO public.permissions (code, name, module, description) VALUES
  ('inventory.view', 'Ver Inventario', 'inventory', 'Visualizar lista de productos y existencias'),
  ('inventory.create', 'Crear Artículo', 'inventory', 'Agregar nuevos productos al inventario'),
  ('inventory.edit', 'Editar Artículo', 'inventory', 'Modificar productos existentes'),
  ('inventory.delete', 'Eliminar Artículo', 'inventory', 'Eliminar productos del inventario'),
  ('inventory.export', 'Exportar Inventario', 'inventory', 'Exportar inventario a CSV/PDF'),
  
  ('ventas.view', 'Ver Ventas', 'ventas', 'Ver registro de ventas y cotizaciones'),
  ('ventas.create', 'Crear Venta', 'ventas', 'Generar nuevas ventas y cotizaciones'),
  ('ventas.edit', 'Editar Venta', 'ventas', 'Modificar o anular ventas'),
  ('ventas.delete', 'Eliminar Venta', 'ventas', 'Eliminar registros de venta'),
  ('ventas.export', 'Exportar Ventas', 'ventas', 'Exportar ventas a CSV/PDF'),

  ('transfers.view', 'Ver Transferencias', 'transfers', 'Ver transferencias entre bodegas'),
  ('transfers.create', 'Crear Transferencia', 'transfers', 'Crear transferencias entre bodegas'),
  
  ('reports.view', 'Ver Reportes', 'reports', 'Acceder a métricas e informes'),
  ('reports.export', 'Exportar Reportes', 'reports', 'Exportar reportes a CSV/PDF'),
  ('roles.view', 'Gestionar Roles', 'roles', 'Crear y modificar roles y accesos'),
  ('users.view', 'Ver Usuarios', 'users', 'Ver y gestionar usuarios'),
  ('settings.view', 'Ver Configuración', 'settings', 'Ajustes del sistema'),
  ('ai-agents.use', 'Usar Agentes IA', 'ai-agents', 'Acceder y usar los agentes de inteligencia artificial'),
  ('branding.view', 'Ver Logo de Marca', 'branding', 'Permite ver el logo de la marca en la navegación')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- 6b. Limpiar permisos duplicados antiguos que no sigan el formato modulo.accion
-- (Esto elimina entradas legacy con códigos como 'Ver Inventario' en vez de 'inventory.view')
DELETE FROM public.role_permissions
WHERE permission_code NOT LIKE '%.%';

DELETE FROM public.permissions
WHERE code NOT LIKE '%.%';

-- 7. Vista solicitada: Obtener roles con correos
CREATE OR REPLACE VIEW public.vw_roles_with_emails AS
SELECT 
  u.id as user_id,
  u.email,
  p.full_name,
  p.role as role_name,
  r.description as role_description
FROM auth.users u
JOIN public.user_profiles p ON u.id = p.id
LEFT JOIN public.roles r ON p.role = r.name;
