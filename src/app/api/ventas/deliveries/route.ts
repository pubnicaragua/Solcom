import { NextRequest, NextResponse } from 'next/server';


export const dynamic = 'force-dynamic';import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// GET /api/ventas/deliveries — List deliveries with optional search
export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        let query = (supabase as any)
            .from('deliveries')
            .select('*')
            .eq('active', true)
            .order('name', { ascending: true });

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ deliveries: data || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/ventas/deliveries — Create a new delivery
export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const body = await req.json();
        const { name, phone } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'El nombre del delivery es requerido' }, { status: 400 });
        }

        const { data, error } = await (supabase as any)
            .from('deliveries')
            .insert({
                name: name.trim(),
                phone: phone?.trim() || null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ delivery: data }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
