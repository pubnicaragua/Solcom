import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createServerClient();

        // Fetch unique brands
        const { data, error } = await supabase
            .from('items')
            .select('marca')
            .not('marca', 'is', null)
            .order('marca') as any;

        if (error) throw error;

        // Get unique values (Supabase .distict() or Set)
        // Note: PostgREST doesn't have a simple distinct on select without custom query or rpc usually, 
        // but we can do it in JS for small datasets or use .select('marca').distinct? No, logic below.
        // Actually, simply fetching all and de-duping in JS is fine for < 10k items.

        const brands = Array.from(new Set(data.map((item: any) => item.marca))).filter(Boolean);

        return NextResponse.json(brands);
    } catch (error) {
        return NextResponse.json({ error: 'Error fetching brands' }, { status: 500 });
    }
}
