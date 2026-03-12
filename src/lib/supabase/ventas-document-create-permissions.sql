-- Permisos granulares de creación de documentos de ventas
-- Ejecutar en Supabase SQL Editor

INSERT INTO public.permissions (code, name, description, module) VALUES
  ('ventas.create_quote', 'Crear Cotización', 'Permite crear cotizaciones', 'ventas'),
  ('ventas.create_invoice', 'Crear Factura', 'Permite crear facturas', 'ventas'),
  ('ventas.create_sales_order', 'Crear Orden de Venta', 'Permite crear órdenes de venta', 'ventas')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- Mantener comportamiento actual para roles base.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('manager', 'ventas.create_quote'),
  ('manager', 'ventas.create_invoice'),
  ('manager', 'ventas.create_sales_order'),
  ('operator', 'ventas.create_quote'),
  ('operator', 'ventas.create_invoice'),
  ('operator', 'ventas.create_sales_order')
ON CONFLICT (role, permission_code) DO NOTHING;
