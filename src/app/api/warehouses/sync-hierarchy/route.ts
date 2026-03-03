import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';

export const dynamic = 'force-dynamic';

interface ZohoLocation {
    location_id: string;
    location_name: string;
    is_location_active: boolean;
    is_primary_location: boolean;
    is_child_present: boolean;
    parent_location_id?: string;
    parent_location_name?: string;
    depth: number;
    child_locations: ZohoLocation[];
    child_count: number;
}

/**
 * Sincroniza la jerarquía de bodegas desde Zoho Books.
 * Usa /books/v3/locations?is_hierarchical_response=true
 * para obtener la relación empresarial → almacén.
 *
 * Solo ACTUALIZA las columnas warehouse_type y parent_warehouse_id
 * en warehouses existentes. No modifica code, name, active ni zoho_warehouse_id.
 */
export async function POST() {
    try {
        const supabase = createRouteHandlerClient({ cookies });

        // Solo admins pueden ejecutar este sync
        const auth = await requireAdminProfile(supabase);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json(
                { error: 'Falta ZOHO_BOOKS_ORGANIZATION_ID' },
                { status: 500 }
            );
        }

        const zohoAuth = await getZohoAccessToken();
        if ('error' in zohoAuth) {
            return NextResponse.json({ error: zohoAuth.error }, { status: 500 });
        }

        const { accessToken, apiDomain } = zohoAuth;
        const url = `${apiDomain}/books/v3/locations?is_hierarchical_response=true&organization_id=${organizationId}`;

        const response = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Zoho locations error: ${response.status} - ${errorText}` },
                { status: 500 }
            );
        }

        const result = await response.json();
        const locations: ZohoLocation[] = result.locations || [];

        if (locations.length === 0) {
            return NextResponse.json({
                success: true,
                updated: 0,
                message: 'No se encontraron ubicaciones en Zoho',
            });
        }

        // Cargar todas las bodegas actuales para hacer el mapeo por zoho_warehouse_id
        const { data: existingWarehouses } = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id');

        const warehouseByZohoId = new Map<string, string>();
        for (const wh of existingWarehouses || []) {
            if (wh.zoho_warehouse_id) {
                warehouseByZohoId.set(wh.zoho_warehouse_id, wh.id);
            }
        }

        let updated = 0;
        const errors: string[] = [];

        // Procesar ubicaciones empresariales (depth=0 con hijos)
        for (const loc of locations) {
            const parentSupabaseId = warehouseByZohoId.get(loc.location_id);

            if (parentSupabaseId) {
                // Marcar como empresarial
                const { error } = await supabase
                    .from('warehouses')
                    .update({
                        warehouse_type: 'empresarial',
                        parent_warehouse_id: null, // Empresariales no tienen padre
                        zoho_location_id: loc.location_id,
                    })
                    .eq('id', parentSupabaseId);

                if (error) {
                    errors.push(`Error actualizando ${loc.location_name}: ${error.message}`);
                } else {
                    updated++;
                }
            }

            // Procesar los almacenes hijos
            for (const child of loc.child_locations || []) {
                const childSupabaseId = warehouseByZohoId.get(child.location_id);
                if (!childSupabaseId) continue;

                const updatePayload: Record<string, any> = {
                    warehouse_type: 'almacen',
                    zoho_location_id: child.location_id,
                };

                // Enlazar al padre si existe en Supabase
                if (parentSupabaseId) {
                    updatePayload.parent_warehouse_id = parentSupabaseId;
                }

                const { error } = await supabase
                    .from('warehouses')
                    .update(updatePayload)
                    .eq('id', childSupabaseId);

                if (error) {
                    errors.push(`Error actualizando ${child.location_name}: ${error.message}`);
                } else {
                    updated++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            updated,
            total_locations: locations.length,
            errors: errors.length > 0 ? errors : undefined,
            message: `Jerarquía actualizada: ${updated} bodegas clasificadas`,
        });
    } catch (error) {
        console.error('Warehouse hierarchy sync error:', error);
        return NextResponse.json(
            {
                error: 'Error sincronizando jerarquía de bodegas',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
