import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const CUSTOMER_SEARCH_SELECT = 'id, name, email, phone, ruc, zoho_contact_id';
const CUSTOMER_SEARCH_FALLBACK_SELECT = 'id, name, email, phone, ruc';
const DEFAULT_LIMIT = 25;
const SEARCH_LIMIT = 250;

interface CustomerRow {
    id: string;
    name: string;
    email: string;
    phone: string;
    ruc: string;
    zoho_contact_id?: string | null;
    _score?: number;
}

function cleanDisplayText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeText(value: unknown): string {
    return cleanDisplayText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function normalizeCompact(value: unknown): string {
    return normalizeText(value).replace(/\s+/g, '');
}

function escapeSearchTokenForOr(token: string): string {
    return token.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSearchTokens(search: string): string[] {
    return normalizeText(search)
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

function sanitizeCustomer(raw: any): CustomerRow {
    const id = String(raw?.id ?? '');
    const zohoContactId = cleanDisplayText(raw?.zoho_contact_id) || null;
    const email = cleanDisplayText(raw?.email);
    const phone = cleanDisplayText(raw?.phone);
    const ruc = cleanDisplayText(raw?.ruc);
    const rawName = cleanDisplayText(raw?.name);
    const fallbackName = email || phone || ruc || (zohoContactId ? `Cliente ${zohoContactId}` : `Cliente ${id}`);
    const name = rawName || fallbackName;

    return {
        id,
        name,
        email,
        phone,
        ruc,
        zoho_contact_id: zohoContactId,
    };
}

function buildDedupKey(customer: CustomerRow): string {
    const name = normalizeText(customer.name);
    const email = normalizeText(customer.email);
    const phone = normalizeText(customer.phone);
    const ruc = normalizeText(customer.ruc);
    const fingerprint = `${name}|${email}|${phone}|${ruc}`;

    if (fingerprint !== '|||') return fingerprint;
    return `id:${customer.zoho_contact_id || customer.id}`;
}

function matchesTokens(customer: CustomerRow, tokens: string[]): boolean {
    if (tokens.length === 0) return true;

    const haystack = normalizeText(`${customer.name} ${customer.email} ${customer.phone} ${customer.ruc}`);
    const compactHaystack = normalizeCompact(haystack);

    return tokens.every((token) => {
        const compactToken = token.replace(/\s+/g, '');
        return haystack.includes(token) || (compactToken.length > 0 && compactHaystack.includes(compactToken));
    });
}

function scoreCustomerMatch(customer: CustomerRow, normalizedSearch: string): number {
    if (!normalizedSearch) return 0;

    const name = normalizeText(customer.name);
    const email = normalizeText(customer.email);
    const phone = normalizeText(customer.phone);
    const ruc = normalizeText(customer.ruc);

    let score = 0;
    if (name === normalizedSearch) score += 400;
    else if (name.startsWith(normalizedSearch)) score += 260;
    else if (name.includes(normalizedSearch)) score += 170;

    if (email === normalizedSearch || phone === normalizedSearch || ruc === normalizedSearch) score += 140;
    if (email.includes(normalizedSearch) || phone.includes(normalizedSearch) || ruc.includes(normalizedSearch)) score += 80;
    if (customer.zoho_contact_id) score += 10;

    return score;
}

function finalizeCustomers(rows: any[], search: string): CustomerRow[] {
    const tokens = buildSearchTokens(search);
    const normalizedSearch = normalizeText(search);
    const dedup = new Map<string, CustomerRow>();

    for (const rawRow of rows || []) {
        const customer = sanitizeCustomer(rawRow);
        if (!customer.id) continue;
        if (!matchesTokens(customer, tokens)) continue;

        customer._score = scoreCustomerMatch(customer, normalizedSearch);
        const key = buildDedupKey(customer);
        const existing = dedup.get(key);

        if (!existing) {
            dedup.set(key, customer);
            continue;
        }

        const existingScore = existing._score || 0;
        const nextScore = customer._score || 0;

        if (nextScore > existingScore) {
            dedup.set(key, customer);
        }
    }

    const result = Array.from(dedup.values());
    result.sort((a, b) => {
        const scoreDiff = (b._score || 0) - (a._score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });

    return result.slice(0, DEFAULT_LIMIT);
}

function buildCustomersQuery(supabase: any, selectColumns: string, search: string) {
    const tokens = buildSearchTokens(search);
    const firstToken = tokens[0] || '';
    const safeToken = escapeSearchTokenForOr(firstToken);

    let query = supabase
        .from('customers')
        .select(selectColumns)
        .order('name', { ascending: true });

    if (tokens.length === 0) {
        return query.limit(DEFAULT_LIMIT);
    }

    if (!safeToken) {
        return query.limit(SEARCH_LIMIT);
    }

    return query
        .or(`name.ilike.%${safeToken}%,email.ilike.%${safeToken}%,ruc.ilike.%${safeToken}%,phone.ilike.%${safeToken}%`)
        .limit(SEARCH_LIMIT);
}

function toCustomerResponse(customer: CustomerRow) {
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
    const firstTry = await buildCustomersQuery(supabase, CUSTOMER_SEARCH_SELECT, search);

    if (firstTry.error) {
        const missingZohoColumn = String(firstTry.error.message || '').includes('zoho_contact_id');
        if (!missingZohoColumn) {
            throw firstTry.error;
        }

        const fallback = await buildCustomersQuery(supabase, CUSTOMER_SEARCH_FALLBACK_SELECT, search);
        if (fallback.error) throw fallback.error;
        return finalizeCustomers((fallback.data || []).map((c: any) => ({ ...c, zoho_contact_id: null })), search);
    }

    return finalizeCustomers(firstTry.data || [], search);
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
