import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  getAuthenticatedProfile,
  getWarehouseAccessScope,
  listWarehousesForScope,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouseType = searchParams.get('type') || '';

    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    if (!hasModuleAccess(moduleAccess, 'inventory')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const scope = await getWarehouseAccessScope(supabase, auth.userId, auth.role);
    const data = await listWarehousesForScope(supabase, scope, {
      activeOnly: true,
      warehouseType: warehouseType || undefined,
    });

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Warehouses error:', error);
    return NextResponse.json(
      { error: 'Error al obtener bodegas' },
      { status: 500 }
    );
  }
}
