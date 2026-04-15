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
Evitás respuestas largas y aburridas, pero SIEMPRE debes ser muy informativa.

REGLAS INFLEXIBLES:
- Cuando el cliente busque un producto, SIEMPRE revísalo en el inventario. Si lo encuentras, DEBES enumerar las opciones exactas especificando el NOMBRE COMPLETO, COLOR, PRECIO (en USD) y STOCK.
- Ejemplo si hay varios: "¡Sí tenemos! Te ofrezco el MacBook Neo Gris ($1500, quedan 3) y el MacBook Neo Plata ($1500, quedan 2)". 
- No resumas diciendo "tenemos varios" sin decir de cuáles colores o modelos exactamente. ¡El cliente necesita saber las opciones!
- Si el stock es 0, decile amablemente que no hay disponibilidad en este momento pero que puede consultar pronto.
- Si el inventario proporcionado dice "No se encontraron productos...", dile al cliente que no tienes exactamente ese modelo y sugiérele opciones o pregúntale por algo más.
- Respondé siempre en español, de forma muy conversacional.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userMessage = body.message || body.question || body.text || '';
    const searchParams = new URL(request.url).searchParams;
    const apiKey = body.api_key || searchParams.get('api_key') || request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');

    // Validar API Key
    const expectedApiKey = process.env.SALESIQ_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    // Extraer palabras clave para la búsqueda en BD ignorando palabras comunes de conexión
    const cleanMsg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[?¿!¡.,:;()"']/g, '');
    const stopWords = ['hay', 'tienen', 'tienes', 'quiero', 'busco', 'necesito', 'para', 'con', 'los', 'las', 'el', 'la', 'un', 'una', 'me', 'puede', 'puedes', 'dar', 'precio', 'de', 'en', 'es', 'que', 'a', 'por', 'favor', 'saber', 'si', 'hola', 'buenas', 'tardes', 'dias', 'noches', 'algun', 'alguna', 'alguno', 'estoy', 'buscando'];
    const searchWords = cleanMsg.split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.includes(w));

    // Buscar productos relevantes en la BD
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let query = supabase
      .from('items')
      .select('id, sku, name, color, state, category, marca, stock_total, price')
      .is('zoho_removed_at', null);

    // Si encontramos palabras clave, agremos condiciones AND para cada palabra
    // Cada palabra debe existir en el nombre, sku, marca o categoría
    if (searchWords.length > 0) {
      for (const word of searchWords) {
        query = query.or(`name.ilike.%${word}%,sku.ilike.%${word}%,marca.ilike.%${word}%,category.ilike.%${word}%`);
      }
    } else {
      // Si no quedaron palabras (ej. solo dijo "hola"), devolvemos algo vacío para que la IA decida cómo responder
      query = query.limit(0);
    }
    
    const { data: products } = await query.limit(10);

    // Si encontramos productos, vamos a buscar su precio oficial en la lista llamada "barato"
    if (products && products.length > 0) {
      const itemIds = products.map((p) => p.id);
      const { data: profiles } = await supabase
        .from('item_price_profiles')
        .select('item_id, unit_price, profile_code')
        .in('item_id', itemIds)
        .eq('profile_code', 'barato')
        .eq('active', true);

      // Reemplazar el precio base de costo por el precio de venta de la lista "barato"
      if (profiles && profiles.length > 0) {
        for (const p of products) {
          const profile = profiles.find((prof) => prof.item_id === p.id && prof.unit_price > 0);
          if (profile) {
             p.price = profile.unit_price;
          }
        }
      }
    }

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
