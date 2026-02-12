
import { NextResponse } from 'next/server';
import { ZohoBooksClient } from '@/lib/zoho/books-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing id param' }, { status: 400 });
    }

    try {
        const client = new ZohoBooksClient({
            clientId: process.env.ZOHO_CLIENT_ID!,
            clientSecret: process.env.ZOHO_CLIENT_SECRET!,
            refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
            organizationId: process.env.ZOHO_ORGANIZATION_ID!,
        });

        // Use api/v3/items/{id}
        // getItemDetails uses hardcoded URL, which might be risky, but let's try it.
        // Or better: use request() method which uses valid domain

        let item;
        try {
            // Try standard request first as it handles domain automatically
            // But valid endpoint for single item in Inventory API is /inventory/v1/items/{id} or Books /books/v3/items/{id}
            // ZohoBooksClient uses /books/v3...
            const response = await client.request('GET', `/books/v3/items/${id}`);
            item = response.item;
        } catch (e) {
            // Fallback to getItemDetails if the above fails
            console.error('Request failed, trying getItemDetails', e);
            item = await client.getItemDetails(id);
        }

        return NextResponse.json({ item });

    } catch (error: any) {
        return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
}
