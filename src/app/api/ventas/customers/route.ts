import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET /api/ventas/customers — Search customers from Zoho Contacts + Supabase
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        // Fetch from both sources in parallel
        const [zohoCustomers, supabaseCustomers] = await Promise.all([
            fetchZohoContacts(search),
            fetchSupabaseCustomers(search),
        ]);

        // Merge: Zoho first, then Supabase (deduplicated by name+phone)
        const seen = new Set<string>();
        const merged: any[] = [];

        for (const c of zohoCustomers) {
            const key = `${c.name.toLowerCase()}-${c.phone || ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(c);
            }
        }

        for (const c of supabaseCustomers) {
            const key = `${c.name.toLowerCase()}-${c.phone || ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(c);
            }
        }

        return NextResponse.json({ customers: merged });
    } catch (error: any) {
        console.error('Customers API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Fetch from Zoho Inventory contacts
async function fetchZohoContacts(search: string) {
    try {
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
        if (!tokenData.access_token) return [];

        const apiDomain = tokenData.api_domain || 'https://www.zohoapis.com';
        const orgId = process.env.ZOHO_BOOKS_ORGANIZATION_ID || '';

        // Build search param: Zoho supports contact_name_contains for search
        let url = `${apiDomain}/inventory/v1/contacts?organization_id=${orgId}&contact_type=customer&per_page=25&status=active`;
        if (search) {
            url += `&contact_name_contains=${encodeURIComponent(search)}`;
        }

        const res = await fetch(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${tokenData.access_token}` },
            cache: 'no-store',
        });

        const data = await res.json();

        if (data.code !== 0) return [];

        return (data.contacts || []).map((c: any) => ({
            id: c.contact_id,
            name: c.contact_name || '',
            email: c.email || '',
            phone: c.phone || c.mobile || '',
            ruc: c.contact_number || '',
            payment_terms: c.payment_terms_label || '',
            source: 'zoho' as const,
        }));
    } catch (err) {
        console.error('Zoho contacts fetch error:', err);
        return [];
    }
}

// Fetch from Supabase customers table
async function fetchSupabaseCustomers(search: string) {
    try {
        const supabase = createServerClient();

        let query = supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true })
            .limit(25);

        if (search) {
            query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,ruc.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, error } = await query;

        if (error) return [];

        return (data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            email: c.email || '',
            phone: c.phone || '',
            ruc: c.ruc || '',
            payment_terms: '',
            source: 'supabase' as const,
        }));
    } catch (err) {
        console.error('Supabase customers fetch error:', err);
        return [];
    }
}

// POST /api/ventas/customers — Create a new customer in Supabase
export async function POST(req: NextRequest) {
    try {
        const supabase = createServerClient();
        const body = await req.json();

        const { name, email, phone, ruc, address, notes } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'El nombre del cliente es requerido' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('customers')
            .insert({
                name: name.trim(),
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                ruc: ruc?.trim() || null,
                address: address?.trim() || null,
                notes: notes?.trim() || null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ customer: data }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
