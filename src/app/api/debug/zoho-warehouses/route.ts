import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        if (!organizationId) {
            return NextResponse.json({ error: 'Falta ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
        }

        const auth = await getZohoAccessToken();
        if ('error' in auth) {
            return NextResponse.json({ error: auth.error }, { status: 500 });
        }

        const { accessToken, apiDomain } = auth;

        // Usar el endpoint de locations con respuesta jerárquica
        const url = `${apiDomain}/books/v3/locations?is_hierarchical_response=true&organization_id=${organizationId}`;

        const response = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: `Zoho error: ${response.status} - ${errorText}` }, { status: 500 });
        }

        const result = await response.json();

        // Log completo en consola
        console.log('\n========== ZOHO LOCATIONS HIERARCHICAL ==========');
        console.log(JSON.stringify(result, null, 2));
        console.log('==================================================\n');

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
