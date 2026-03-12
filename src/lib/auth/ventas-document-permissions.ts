import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { AppRole } from './warehouse-permissions';
import { hasRolePermissionCode } from './module-permissions';

type SupabaseRouteClient = ReturnType<typeof createRouteHandlerClient>;

export type VentasDocumentKind = 'invoice' | 'sales_order' | 'quote';

const CREATE_PERMISSION_CODES: Record<VentasDocumentKind, string[]> = {
  invoice: ['ventas.create_invoice', 'ventas.create', 'ventas.write'],
  sales_order: ['ventas.create_sales_order', 'ventas.create', 'ventas.write'],
  quote: ['ventas.create_quote', 'ventas.create', 'ventas.write'],
};

function normalizeRoleForPermission(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export async function resolveRoleForPermissionChecks(
  supabase: SupabaseRouteClient,
  userId: string,
  fallbackRole: AppRole
): Promise<string> {
  const { data: profileRow } = await (supabase as any)
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const rawRole = normalizeRoleForPermission(profileRow?.role);
  if (rawRole) return rawRole;
  return normalizeRoleForPermission(fallbackRole || 'operator') || 'operator';
}

export async function canCreateVentasDocument(
  supabase: SupabaseRouteClient,
  role: string,
  kind: VentasDocumentKind
): Promise<boolean> {
  const codes = CREATE_PERMISSION_CODES[kind] || [];
  for (const code of codes) {
    if (!code) continue;
    if (await hasRolePermissionCode(supabase, role, code)) {
      return true;
    }
  }
  return false;
}

export function createPermissionDeniedMessage(kind: VentasDocumentKind): string {
  if (kind === 'invoice') return 'No tienes permiso para crear facturas';
  if (kind === 'sales_order') return 'No tienes permiso para crear órdenes de venta';
  return 'No tienes permiso para crear cotizaciones';
}
