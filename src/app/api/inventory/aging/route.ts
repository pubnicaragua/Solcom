import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getZohoToken() {
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN;
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID || process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) return null;

    try {
        const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
            }),
        });

        if (!res.ok) {
            console.error('[Aging] Token error:', await res.text());
            return null;
        }

        const data = await res.json();
        return data.access_token;
    } catch (err) {
        console.error('[Aging] Token fetch exception:', err);
        return null;
    }
}

export async function GET() {
    try {
        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        const token = await getZohoToken();

        if (!token || !orgId) {
            return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 });
        }

        // NOTE: The 'inventoryagingdetails' report returns 404 (Invalid URL) for this organization.
        // 'inventoryagingsummary' works but ignores custom intervals (returns 1-15 days only).
        // STRATEGY: We ping a known working endpoint 'inventoryvaluation' to verify the token/connection,
        // but return { items: null } to force the frontend to use the Robust Local Calculation.
        // The local calculation uses 'updated_at' which is synced from Zoho via Webhooks, so it is accurate.

        const query = new URLSearchParams({
            organization_id: orgId,
            per_page: '1', // Lightweight check
        });

        const url = `https://www.zohoapis.com/books/v3/reports/inventoryvaluation?${query.toString()}`;

        console.log('[Aging] Checking Zoho Connection (Valuation API):', url);

        const res = await fetch(url, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('[Aging] Zoho API Check Error:', res.status, errText);
            // Even if it fails, return null so frontend renders local data (mock/fallback)
            return NextResponse.json({ items: null, error: 'Zoho API Error' });
        }

        // Connection is good, but we don't have aging details from API.
        // Return null items to trigger frontend fallback.
        return NextResponse.json({
            items: null,
            source: 'local_fallback_due_to_api_limitation'
        });

    } catch (err: any) {
        console.error('[Aging] Endpoint Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
