import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '../../../../lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('item_id');
        const warehouseId = searchParams.get('warehouse_id');

        if (!itemId || !warehouseId) {
            return NextResponse.json(
                { error: 'Faltan parámetros requeridos: item_id y warehouse_id' },
                { status: 400 }
            );
        }

        // 1. Get a fresh token
        const auth = await getZohoAccessToken();
        if ('error' in auth || !auth.accessToken) {
            console.error('[Zoho Serials Auth Error]:', auth);
            return NextResponse.json({ error: 'No se pudo obtener el token de Zoho' }, { status: 500 });
        }

        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Falta configurar ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        const headers = { 'Authorization': `Zoho-oauthtoken ${auth.accessToken}` };

        // 2. Use the per-item serial numbers endpoint (works on both Books and Inventory API)
        //    show_transacted_out=false ensures we only get available serials (not sold/transferred)
        const url = `${auth.apiDomain}/inventory/v1/items/serialnumbers?item_id=${itemId}&show_transacted_out=false&location_id=${warehouseId}&organization_id=${organizationId}`;

        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Zoho Serials Error]:', errorText);
            return NextResponse.json({ error: 'Zoho API rechazó la solicitud' }, { status: response.status });
        }

        const data = await response.json();
        const serialNumbers = data.serial_numbers || [];

        // 3. Map to a clean response format
        const availableSerials = serialNumbers
            .filter((s: any) => s.status === 'active')
            .map((s: any) => ({
                serial_id: s.serialnumber_id,
                serial_code: s.serialnumber,
            }));

        return NextResponse.json({
            success: true,
            total_found: availableSerials.length,
            serials: availableSerials
        });

    } catch (error: any) {
        console.error('[Fetch Serials Catch Error]:', error.message);
        return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
    }
}
