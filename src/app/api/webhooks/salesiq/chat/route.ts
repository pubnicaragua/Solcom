import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const dynamic = 'force-dynamic';

// Prompt del sistema para Mía
const SYSTEM_PROMPT = `Sos Mía, la asistente virtual de Solis Comercial. Tu estilo es energético, vendedor, amable y directo al punto.
No hablás en párrafos largos, no repetís información innecesaria y evitás ser robótica.

REGLAS:
- Si el cliente pregunta por un producto, usá la información de inventario que se te proporciona como contexto.
- Siempre mencioná el nombre del producto, el stock disponible y el precio.
- Si el stock es 0, decile amablemente que no hay disponibilidad en este momento pero que puede consultar pronto.
- Si no encontraste productos relevantes, pedile que reformule su búsqueda o que sea más específico.
- Respondé siempre en español.
- Sé breve: máximo 2-3 oraciones.
- Si el cliente saluda o hace preguntas generales (no de productos), respondé de forma amable y ofrecé tu ayuda.
- Los precios están en dólares (USD).`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userMessage = body.message || body.question || body.text || '';
    const apiKey = body.api_key || request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');

    // Validar API Key
    const expectedApiKey = process.env.SALESIQ_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    // Buscar productos relevantes en la BD
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const searchTerm = userMessage.trim();

    const { data: products } = await supabase
      .from('items')
      .select('sku, name, color, state, category, marca, stock_total, price')
      .is('zoho_removed_at', null)
      .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,marca.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
      .limit(10);

    // Armar el contexto de inventario para ChatGPT
    let inventoryContext = '';
    if (products && products.length > 0) {
      inventoryContext = '\n\nINVENTARIO ENCONTRADO:\n';
      for (const p of products) {
        inventoryContext += `- ${p.name} | SKU: ${p.sku} | Stock: ${p.stock_total ?? 0} | Precio: $${p.price ?? 0} | Marca: ${p.marca ?? 'N/A'} | Color: ${p.color ?? 'N/A'} | Estado: ${p.state ?? 'N/A'}\n`;
      }
    } else {
      inventoryContext = '\n\nNo se encontraron productos que coincidan con la búsqueda del cliente en el inventario.';
    }

    // Llamar a OpenAI con el contexto
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + inventoryContext },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Lo siento, no pude procesar tu consulta en este momento.';

    // Respuesta plana para que Zoho la lea fácil
    return NextResponse.json({
      reply,
      products_found: products?.length || 0,
    });

  } catch (error) {
    console.error('SalesIQ Chat error:', error);
    return NextResponse.json(
      { error: 'Error interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// También soportar GET para pruebas rápidas desde el navegador
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get('message') || searchParams.get('q') || '';
  const apiKey = searchParams.get('api_key') || '';

  if (!message) {
    return NextResponse.json({
      info: 'Endpoint de chat inteligente Solis Comercial. Usa POST con { "message": "tu pregunta", "api_key": "clave" } o GET con ?message=tu+pregunta&api_key=clave',
    });
  }

  // Redirigir a POST internamente
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ message, api_key: apiKey }),
  });

  return POST(fakeRequest);
}
