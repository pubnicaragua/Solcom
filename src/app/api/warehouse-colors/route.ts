import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: colors, error } = await supabase
      .from('warehouse_colors')
      .select('*')
      .order('warehouse_code', { ascending: true });

    if (error) throw error;

    return NextResponse.json(colors || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { warehouse_code, warehouse_name, color, text_color } = await request.json();

    const { error } = await supabase
      .from('warehouse_colors')
      .upsert({ 
        warehouse_code, 
        warehouse_name, 
        color: color || '#3B82F6', 
        text_color: text_color || '#FFFFFF' 
      }, {
        onConflict: 'warehouse_code'
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
