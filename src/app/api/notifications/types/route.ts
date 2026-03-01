import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  try {
    const { data: types, error } = await supabase
      .from('notification_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json(types);
  } catch (error: any) {
    console.warn('Tabla notification_types no encontrada, usando datos mock:', error.message);
    return NextResponse.json([
      { id: 'nt-1', code: 'low_stock', name: 'Stock Bajo', description: 'Notificar cuando un producto llega al stock mínimo' },
      { id: 'nt-2', code: 'sync_error', name: 'Error de Sincronización', description: 'Notificar errores al sincronizar con Zoho' },
      { id: 'nt-3', code: 'new_transfer', name: 'Nueva Transferencia', description: 'Notificar cuando se crea una transferencia de bodega' },
      { id: 'nt-4', code: 'new_sale', name: 'Venta Creada', description: 'Notificar cuando se registra una nueva venta' },
      { id: 'nt-5', code: 'report_ready', name: 'Reporte Generado', description: 'Notificar cuando un reporte asíncrono está listo' },
      { id: 'nt-6', code: 'user_created', name: 'Usuario Creado', description: 'Notificar cuando se crea un nuevo usuario en el sistema' },
      { id: 'nt-7', code: 'role_change', name: 'Cambio de Permisos', description: 'Notificar cuando se modifican los permisos de un rol' }
    ]);
  }
}