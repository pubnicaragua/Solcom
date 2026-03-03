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
    const familyOf = searchParams.get('family_of') || '';

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

    if (familyOf) {
      const parent = data.find((warehouse) => warehouse.id === familyOf);
      if (!parent) {
        return NextResponse.json([], { status: 200 });
      }

      const family = data
        .filter((warehouse) => warehouse.id === familyOf || warehouse.parent_warehouse_id === familyOf)
        .sort((a, b) => {
          if (a.id === familyOf) return -1;
          if (b.id === familyOf) return 1;
          return String(a.code || '').localeCompare(String(b.code || ''));
        });

      return NextResponse.json(family, { status: 200 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Warehouses error:', error);
    return NextResponse.json(
      { error: 'Error al obtener bodegas' },
      { status: 500 }
    );
  }
}
