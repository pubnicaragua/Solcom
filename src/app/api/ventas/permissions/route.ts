import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';
import {
  canCreateVentasDocument,
  resolveRoleForPermissionChecks,
} from '@/lib/auth/ventas-document-permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const auth = await getAuthenticatedProfile(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const moduleAccess = await getEffectiveModuleAccess(supabase, auth.userId, auth.role);
    const canAccessVentasModule = hasModuleAccess(moduleAccess, 'ventas');

    const roleForPermission = await resolveRoleForPermissionChecks(
      supabase,
      auth.userId,
      auth.role
    );

    const [canCreateQuote, canCreateInvoice, canCreateSalesOrder] = await Promise.all([
      canCreateVentasDocument(supabase, roleForPermission, 'quote'),
      canCreateVentasDocument(supabase, roleForPermission, 'invoice'),
      canCreateVentasDocument(supabase, roleForPermission, 'sales_order'),
    ]);

    return NextResponse.json({
      module_access: canAccessVentasModule,
      can_create_quote: canCreateQuote,
      can_create_invoice: canCreateInvoice,
      can_create_sales_order: canCreateSalesOrder,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
