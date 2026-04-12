import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos el Service Role para tener acceso a la base de datos sin depender de cookies de usuario
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');
    const search = searchParams.get('search');
    const apiKey = searchParams.get('api_key') || request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');

    // 1. Validar API Key de SalesIQ (Configurar SALESIQ_API_KEY en .env.local)
    const expectedApiKey = process.env.SALESIQ_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json({ error: 'No autorizado / Invalid API Key' }, { status: 401 });
    }

    if (!sku && !search) {
      return NextResponse.json({ error: 'Debes enviar el parametro sku o search' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from('items')
      .select('id, sku, name, color, state, category, marca, stock_total, price')
      .is('zoho_removed_at', null);

    if (sku) {
      query = query.eq('sku', sku).limit(1);
    } else if (search) {
      const trimmed = search.trim();
      query = query.or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`).limit(5);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
      }
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Formatear respuesta limpia para el bot
    const formatItem = (item: any) => ({
      sku: item.sku,
      name: item.name,
      stock_disponible: item.stock_total || 0,
      price: item.price || 0,
      brand: item.marca,
      category: item.category,
      state: item.state,
      color: item.color,
    });

    // Enviar solo el primer resultado de forma plana para que Zoho lo lea sin problema
    // Zoho tiene bugs leyendo arreglos multidimensionales en variables de texto.
    return NextResponse.json(formatItem(data[0]));
  } catch (error) {
    console.error('SalesIQ Webhook error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
