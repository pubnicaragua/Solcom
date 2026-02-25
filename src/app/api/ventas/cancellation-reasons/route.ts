import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// GET /api/ventas/cancellation-reasons — List active reasons
export async function GET() {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data, error } = await (supabase as any)
            .from('cancellation_reasons')
            .select('*')
            .eq('active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            // Fallback local only if table does not exist yet.
            if (String(error.code || '') !== '42P01') {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({
                reasons: [
                    { id: 'local-1', label: 'Error en datos del cliente', sort_order: 1 },
                    { id: 'local-2', label: 'Producto agotado', sort_order: 2 },
                    { id: 'local-3', label: 'Cliente canceló el pedido', sort_order: 3 },
                    { id: 'local-4', label: 'Duplicado', sort_order: 4 },
                    { id: 'local-5', label: 'Error en precio o descuento', sort_order: 5 },
                    { id: 'local-6', label: 'Otro', sort_order: 99 },
                ],
            });
        }

        return NextResponse.json({ reasons: data || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/ventas/cancellation-reasons — Create a new reason
export async function POST(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const body = await req.json();
        const { label } = body;

        if (!label || label.trim().length === 0) {
            return NextResponse.json({ error: 'El motivo es requerido' }, { status: 400 });
        }

        // Get max sort_order
        const { data: existing } = await (supabase as any)
            .from('cancellation_reasons')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1);

        const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

        const { data, error } = await (supabase as any)
            .from('cancellation_reasons')
            .insert({
                label: label.trim(),
                sort_order: nextOrder,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ reason: data }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
