import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const CUSTOMER_SEARCH_SELECT = 'id, name, email, phone, ruc, zoho_contact_id';
const CUSTOMER_SEARCH_FALLBACK_SELECT = 'id, name, email, phone, ruc';

function toCustomerResponse(customer: any) {
    return {
        id: customer.id,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        ruc: customer.ruc || '',
        payment_terms: '',
        source: customer.zoho_contact_id ? ('zoho' as const) : ('supabase' as const),
    };
}

async function fetchSupabaseCustomers(supabase: any, search: string) {
    const applySearch = (query: any) => {
        if (!search) return query;
        return query.or(`name.ilike.%${search}%,email.ilike.%${search}%,ruc.ilike.%${search}%,phone.ilike.%${search}%`);
    };

    let query = supabase
        .from('customers')
        .select(CUSTOMER_SEARCH_SELECT)
        .order('name', { ascending: true })
        .limit(25);
    query = applySearch(query);

    const firstTry = await query;

    if (firstTry.error) {
        const missingZohoColumn = String(firstTry.error.message || '').includes('zoho_contact_id');
        if (!missingZohoColumn) {
            throw firstTry.error;
        }

        let fallbackQuery = supabase
            .from('customers')
            .select(CUSTOMER_SEARCH_FALLBACK_SELECT)
            .order('name', { ascending: true })
            .limit(25);
        fallbackQuery = applySearch(fallbackQuery);

        const fallback = await fallbackQuery;
        if (fallback.error) throw fallback.error;

        return (fallback.data || []).map((c: any) => ({
            ...c,
            zoho_contact_id: null,
        }));
    }

    return firstTry.data || [];
}

// GET /api/ventas/customers — Search customers from local Supabase
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get('search') || '').trim();
        const customers = await fetchSupabaseCustomers(supabase, search);
        return NextResponse.json({ customers: customers.map(toCustomerResponse) });
    } catch (error: any) {
        console.error('Customers API error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/ventas/customers — Create a new customer in Supabase
export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

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
