import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = createServerClient();
    try {
        // Delete all snapshots. Using a condition that is always true to bypass strict delete if enabled.
        // Assuming 'id' > 0 or similar.
        // Actually, we can use .neq('item_id', '00000000-0000-0000-0000-000000000000') if UUID, 
        // or just not specify a filter if allowed, but usually Supabase requires one.
        // Let's use a safe "all" filter.
        const { error, count } = await supabase.from('stock_snapshots').delete().neq('qty', -999999);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Tabla stock_snapshots limpiada correctamente.',
            count
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
