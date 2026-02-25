import { NextRequest, NextResponse } from 'next/server';

// GET /api/ventas/salespeople — Fetch active users from Zoho Books
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        // Get Zoho access token
        const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: process.env.ZOHO_BOOKS_REFRESH_TOKEN || '',
                client_id: process.env.ZOHO_BOOKS_CLIENT_ID || '',
                client_secret: process.env.ZOHO_BOOKS_CLIENT_SECRET || '',
                grant_type: 'refresh_token',
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            return NextResponse.json({ error: 'No se pudo autenticar con Zoho' }, { status: 500 });
        }

        const apiDomain = tokenData.api_domain || 'https://www.zohoapis.com';
        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID || '';

        // Fetch users from Zoho Books
        const usersRes = await fetch(
            `${apiDomain}/books/v3/users?organization_id=${orgId}`,
            {
                headers: { 'Authorization': `Zoho-oauthtoken ${tokenData.access_token}` },
                cache: 'no-store',
            }
        );

        const usersData = await usersRes.json();

        if (usersData.code !== 0) {
            return NextResponse.json({ error: usersData.message || 'Error al obtener usuarios' }, { status: 500 });
        }

        // Filter active users only and apply search
        let users = (usersData.users || [])
            .filter((u: any) => u.status === 'active')
            .map((u: any) => ({
                id: u.user_id,
                name: u.name,
                email: u.email,
                role: u.user_role,
                photo_url: u.photo_url || null,
            }));

        if (search) {
            const s = search.toLowerCase();
            users = users.filter((u: any) =>
                u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
            );
        }

        return NextResponse.json({ salespeople: users });
    } catch (error: any) {
        console.error('Salespeople API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
