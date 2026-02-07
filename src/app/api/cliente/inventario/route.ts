import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value,
              ...options,
            });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({
              name,
              value: '',
              ...options,
            });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({
              name,
              value: '',
              ...options,
            });
          },
        },
      }
    );

    // Verificar que el usuario esté autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Obtener warehouses activos
    const { data: warehouses, error: warehousesError } = await supabase
      .from('warehouses')
      .select('*')
      .eq('active', true)
      .order('code', { ascending: true });

    if (warehousesError) throw warehousesError;

    // Obtener TODOS los stock snapshots más recientes con items y warehouses
    const { data: stockSnapshots, error: snapshotsError } = await supabase
      .from('stock_snapshots')
      .select(`
        id,
        item_id,
        warehouse_id,
        qty,
        synced_at,
        items (
          id,
          sku,
          name,
          category,
          color,
          state,
          marca,
          price,
          stock_total
        ),
        warehouses (
          id,
          code,
          name,
          active
        )
      `)
      .order('synced_at', { ascending: false });

    if (snapshotsError) throw snapshotsError;

    // Agrupar por item_id y warehouse_id para obtener el snapshot más reciente
    const latestSnapshots = new Map();
    (stockSnapshots || []).forEach((snapshot: any) => {
      const key = `${snapshot.item_id}-${snapshot.warehouse_id}`;
      if (!latestSnapshots.has(key)) {
        latestSnapshots.set(key, snapshot);
      }
    });

    const items = Array.from(latestSnapshots.values());

    return NextResponse.json({
      warehouses: warehouses || [],
      items: items || [],
      timestamp: new Date().toISOString(),
      total: items.length
    });
  } catch (error: any) {
    console.error('Error en /api/cliente/inventario:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener inventario' },
      { status: 500 }
    );
  }
}
