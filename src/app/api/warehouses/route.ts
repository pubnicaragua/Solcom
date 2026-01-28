import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('active', true)
      .order('code');

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Warehouses error:', error);
    return NextResponse.json(
      { error: 'Error al obtener bodegas' },
      { status: 500 }
    );
  }
}
