import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const MOCK_PERMISSIONS = [
  { code: 'inventory.view',   name: 'Ver Inventario',      module: 'inventory', description: 'Visualizar productos y existencias' },
  { code: 'inventory.create', name: 'Crear Artículo',      module: 'inventory', description: 'Agregar nuevos productos' },
  { code: 'inventory.edit',   name: 'Modificar Inventario', module: 'inventory', description: 'Editar productos y stock' },
  { code: 'inventory.delete', name: 'Eliminar Productos',  module: 'inventory', description: 'Eliminar productos del inventario' },
  { code: 'inventory.import', name: 'Importar Inventario', module: 'inventory', description: 'Importar datos de inventario' },
  { code: 'inventory.export', name: 'Exportar Inventario', module: 'inventory', description: 'Exportar inventario a CSV/PDF' },
  { code: 'ventas.view',      name: 'Ver Ventas',          module: 'ventas',    description: 'Ver registro de ventas y cotizaciones' },
  { code: 'ventas.create',    name: 'Crear Ventas',        module: 'ventas',    description: 'Crear y modificar ventas' },
  { code: 'transfers.view',   name: 'Ver Transferencias',   module: 'transfers', description: 'Ver transferencias entre bodegas' },
  { code: 'transfers.create', name: 'Crear Transferencias', module: 'transfers', description: 'Crear transferencias entre bodegas' },
  { code: 'reports.view',     name: 'Ver Reportes',         module: 'reports',   description: 'Acceder a métricas e informes' },
  { code: 'reports.export',   name: 'Exportar Reportes',    module: 'reports',   description: 'Exportar reportes a CSV/PDF' },
  { code: 'roles.view',       name: 'Ver Roles',            module: 'roles',     description: 'Ver roles y permisos' },
  { code: 'roles.manage',     name: 'Gestionar Roles',      module: 'roles',     description: 'Modificar roles y asignar permisos' },
  { code: 'users.view',       name: 'Ver Usuarios',         module: 'users',     description: 'Ver la lista de usuarios' },
  { code: 'users.manage',     name: 'Gestionar Usuarios',   module: 'users',     description: 'Crear y modificar usuarios' },
  { code: 'users.delete',     name: 'Eliminar Usuarios',    module: 'users',     description: 'Eliminar usuarios del sistema' },
  { code: 'settings.view',    name: 'Ver Configuración',       module: 'settings', description: 'Ver configuración del sistema' },
  { code: 'settings.edit',    name: 'Modificar Configuración', module: 'settings', description: 'Modificar configuración del sistema' },
  { code: 'ai-agents.use',    name: 'Usar Agentes IA',        module: 'ai-agents', description: 'Acceder y usar agentes de inteligencia artificial' },
];

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: permissions, error } = await supabase
      .from('permissions')
      .select('*')
      .order('module', { ascending: true });

    if (error) throw error;

    return NextResponse.json(permissions);
  } catch (error: any) {
    console.warn('Tabla permissions no encontrada, usando mock:', error.message);
    return NextResponse.json(MOCK_PERMISSIONS);
  }
}
