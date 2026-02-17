import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SALES_STORAGE_KEY = 'solis_comercial_sales';

function getSalesFromStorage(): any[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const stored = localStorage.getItem(SALES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ 
      sales: [],
      message: 'Las ventas se almacenan en el navegador (localStorage)'
    });
  } catch (error: any) {
    console.error('Error in GET /api/ventas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_name, customer_email, customer_phone, payment_method, items, total } = body;

    if (!customer_name || !customer_email || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      );
    }

    const sale = {
      id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customer_name,
      customer_email,
      customer_phone: customer_phone || null,
      payment_method,
      total,
      items,
      status: 'completada',
      created_at: new Date().toISOString()
    };

    return NextResponse.json({ 
      success: true, 
      sale,
      message: 'Venta registrada exitosamente'
    });

  } catch (error: any) {
    console.error('Error in POST /api/ventas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
