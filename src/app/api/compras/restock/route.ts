import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usar el Service Key para sobrepasar RLS si estamos en una ruta Server-Side
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weeks = parseInt(searchParams.get('weeks') || '4', 10);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Llamada directa al RPC de base de datos
    const { data: analyticsRow, error } = await supabase
      .rpc('get_restock_analytics', { p_weeks: weeks });

    if (error) {
      console.error('[API Restock] Error fetching analytics:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      count: analyticsRow?.length || 0,
      data: analyticsRow || [] 
    });

  } catch (error) {
    console.error('[API Restock] Fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
