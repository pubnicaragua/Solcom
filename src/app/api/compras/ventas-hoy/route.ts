import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: topSales, error } = await supabase.rpc('get_top_sales_today');

    if (error) {
      console.error('[API Top Sales] Error fetching top sales:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      count: topSales?.length || 0,
      data: topSales || [] 
    });

  } catch (error) {
    console.error('[API Top Sales] Fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
