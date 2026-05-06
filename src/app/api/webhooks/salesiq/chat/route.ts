import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';
// NO usar edge runtime - Supabase y OpenAI SDK necesitan Node.js APIs completas

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

// ============================================================
// Helper: Construir respuesta en formato Zoho SalesIQ Zobot
// Zoho espera: { replies: [{ action: "reply", text: "..." }] }
// ============================================================
function zohoReply(text: string) {
  return NextResponse.json({
    replies: [
      {
        action: 'reply',
        text,
      },
    ],
  });
}

function zohoError(text: string, status = 200) {
  // Incluso en errores devolvemos 200 con un mensaje amigable
  // porque Zoho interpreta cualquier status != 200 como "Error while contacting webhook server"
  return NextResponse.json({
    replies: [
      {
        action: 'reply',
        text,
      },
    ],
  }, { status });
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada');
  }

  return new OpenAI({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ============================================================
    // 1. Autenticación: API Key por query param o header
    // ============================================================
    const searchParams = new URL(request.url).searchParams;
    const apiKey = searchParams.get('api_key') || request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');

    const expectedApiKey = process.env.SALESIQ_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      console.error('SalesIQ Auth failed. Received:', apiKey, 'Expected:', expectedApiKey);
      return zohoError('No autorizado. Verifica tu API key.');
    }

    // ============================================================
    // 2. Extraer el mensaje del visitante
    //    Zoho Zobot Webhook envía: { handler, operation, request: { message: { text } }, visitor: {...} }
    //    Pero también soportamos formato libre para pruebas manuales
    // ============================================================
    const handler = body.handler || '';       // "trigger", "message", "chat"
    const operation = body.operation || '';   // "chat", "message"

    // Si es un trigger (primera visita, antes de que el usuario escriba), enviar saludo
    if (handler === 'trigger') {
      return zohoReply('¡Hola! 👋 Soy Mía, tu asistente virtual de Solis Comercial. ¿En qué te puedo ayudar? Pregúntame por cualquier producto y te digo precio, disponibilidad y opciones. 🛒');
    }

    // Extraer texto del mensaje - intentar formato Zoho primero, luego formato libre
    const userMessage =
      body.request?.message?.text ||  // Formato Zoho Zobot Webhook
      body.message ||                 // Formato libre (pruebas)
      body.question ||                // Alternativo
      body.text ||                    // Alternativo
      '';

    if (!userMessage.trim()) {
      return zohoReply('No logré entender tu mensaje. ¿Podrías escribirme qué producto estás buscando? 😊');
    }

    console.log(`[SalesIQ] Handler: ${handler}, Operation: ${operation}, Message: "${userMessage}"`);

    // ============================================================
    // 3. Buscar productos en la base de datos
    // ============================================================
    const cleanMsg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[?¿!¡.,:;()"']/g, '');
    const stopWords = ['hay', 'tienen', 'tienes', 'quiero', 'busco', 'necesito', 'para', 'con', 'los', 'las', 'el', 'la', 'un', 'una', 'me', 'puede', 'puedes', 'dar', 'precio', 'de', 'en', 'es', 'que', 'a', 'por', 'favor', 'saber', 'si', 'hola', 'buenas', 'tardes', 'dias', 'noches', 'algun', 'alguna', 'alguno', 'estoy', 'buscando'];
    const searchWords = cleanMsg.split(/\s+/).filter((w: string) => w.length > 1 && !stopWords.includes(w));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let query = supabase
      .from('items')
      .select('id, sku, name, color, state, category, marca, stock_total, price')
      .is('zoho_removed_at', null);

    if (searchWords.length > 0) {
      for (const word of searchWords) {
        query = query.or(`name.ilike.%${word}%,sku.ilike.%${word}%,marca.ilike.%${word}%,category.ilike.%${word}%`);
      }
    } else {
      query = query.limit(0);
    }
    
    const { data: products } = await query.limit(30);

    // ============================================================
    // 4. Obtener precios de venta (lista "barato")
    // ============================================================
    if (products && products.length > 0) {
      const itemIds = products.map((p) => p.id);
      const { data: profiles } = await supabase
        .from('item_price_profiles')
        .select('item_id, unit_price, profile_code')
        .in('item_id', itemIds)
        .eq('profile_code', 'barato')
        .eq('active', true);

      if (profiles && profiles.length > 0) {
        for (const p of products) {
          const profile = profiles.find((prof) => prof.item_id === p.id && prof.unit_price > 0);
          if (profile) {
             p.price = profile.unit_price;
          }
        }
      }
    }

    // ============================================================
    // 5. Armar contexto de inventario para ChatGPT
    // ============================================================
    let inventoryContext = '';
    if (products && products.length > 0) {
      inventoryContext = '\n\nINVENTARIO ENCONTRADO:\n';
      for (const p of products) {
        inventoryContext += `- ${p.name} | SKU: ${p.sku} | Stock: ${p.stock_total ?? 0} | Precio: $${p.price ?? 0} | Marca: ${p.marca ?? 'N/A'} | Color: ${p.color ?? 'N/A'} | Estado: ${p.state ?? 'N/A'}\n`;
      }
    } else {
      inventoryContext = '\n\nNo se encontraron productos que coincidan con la búsqueda del cliente en el inventario.';
    }

    // ============================================================
    // 6. Llamar a OpenAI
    // ============================================================
    const openai = getOpenAIClient();
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

    console.log(`[SalesIQ] Reply (${products?.length || 0} products found): "${reply.substring(0, 100)}..."`);

    // ============================================================
    // 7. Devolver en formato Zoho Zobot Webhook
    // ============================================================
    return zohoReply(reply);

  } catch (error) {
    console.error('SalesIQ Chat error:', error);
    // Temporalmente mostrar el error real para depuración
    const errorMsg = error instanceof Error ? error.message : String(error);
    return zohoReply(`[DEBUG] Error: ${errorMsg.substring(0, 200)}`);
  }
}

// También soportar GET para pruebas rápidas desde el navegador
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get('message') || searchParams.get('q') || '';
  const apiKey = searchParams.get('api_key') || '';

  if (!message) {
    return NextResponse.json({
      info: 'Endpoint de chat Zobot Webhook - Solis Comercial',
      usage: 'GET: ?message=tu+pregunta&api_key=clave | POST: Zoho SalesIQ Zobot Webhook format',
      zoho_format: '{ handler: "message", request: { message: { text: "pregunta" } } }',
    });
  }

  // Simular formato Zoho para redirigir a POST
  const fakeRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handler: 'message',
      operation: 'message',
      request: { message: { text: message } },
      api_key: apiKey,
    }),
  });

  return POST(fakeRequest);
}
