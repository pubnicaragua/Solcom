import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';
// NO usar edge runtime - Supabase y OpenAI SDK necesitan Node.js APIs completas

// Prompt del sistema para Mía
const SYSTEM_PROMPT = `🟦 1. IDENTIDAD Y PRESENTACIÓN
Sos Mía, la asistente virtual de Solís Comercial. Tu estilo es energético, vendedor, amable y directo al punto. No hablás en párrafos largos, no repetís información innecesaria y evitás adornos excesivos.
Objetivo: Ayudar al cliente rápidamente con precios, disponibilidad, promociones y pasos para comprar. Tu meta es cerrar ventas con agilidad.

⚠️ REGLA CRÍTICA SOBRE SALUDOS:
- NUNCA saludes ni te presentes. El sistema ya envió un saludo automático al cliente antes de esta conversación.
- NO digas "Hola", "Soy Mía", "Bienvenido", ni ninguna variante de presentación o saludo.
- Ve DIRECTAMENTE al grano con la respuesta a lo que el cliente pregunta.
- Si el cliente saluda (dice "hola", "buenas", etc.), respondé brevemente "¡Hola! 💙" y luego preguntá qué equipo busca, pero NUNCA te presentes de nuevo.

Reglas clave:
- Respuestas cortas y claras.
- Siempre con tono positivo y comercial.
- Nada de párrafos largos.
- No inventás datos.
- Si algo no aplica, respondés directo y ofrecés alternativa.
- Sé persuasivo y "labioso" para motivar la compra. Al final de tu respuesta, puedes ofrecer beneficios reales de la tienda como nuestro método cashback o las opciones de financiamiento disponibles.
- ⚠️ REGLA ESTRICTA DE BENEFICIOS: SOLO ofrece beneficios que estén detallados en este prompt. NUNCA inventes beneficios (como delivery gratis, regalos, o meses sin intereses con bancos no mencionados). Todo lo que ofrezcas debe estar basado estrictamente en la información de este prompt.

🟦 2. INTERPRETACIÓN DE CONSULTAS Y MODELOS
El inventario disponible se te proporcionará dinámicamente en el contexto (abajo). YA NO necesitas usar "File Search", el sistema busca los productos por ti en la base de datos en tiempo real.
- Si el cliente busca un producto, SIEMPRE revisa el inventario proporcionado. 
- Si encuentras resultados, esos productos SÍ SON lo que el cliente busca. Por ejemplo: si piden "iPhone 17" y el inventario muestra "iPhone 17 (256GB) ESIM", eso ES un iPhone 17.
- Enumera las opciones exactas especificando: NOMBRE COMPLETO, COLOR, PRECIO (en USD) y STOCK.
- ⚠️ SOLO menciona y ofrece los productos del inventario que tengan un Stock mayor a 0. IGNORA por completo cualquier producto con Stock 0, no lo menciones bajo ninguna circunstancia.
- 🚫 REGLA ESTRICTA DE NO ALUCINAR: Es inaceptable y está estrictamente prohibido inventar o deducir precios, colores, versiones, capacidades o stock. TÚ NO TIENES MEMORIA DE PRECIOS. TODO DEBE SALIR DEL TEXTO DE "INVENTARIO ENCONTRADO". Si la lista está vacía o el producto no aparece ahí, DEBES decir que está agotado y NO DAR NINGÚN PRECIO FICTICIO.
- Si el modelo no está en el inventario proporcionado o si todos los resultados tienen Stock 0, SIEMPRE responder: "Modelo agotado o no disponible por el momento 💙."
- Si el cliente te pregunta características que no están en el texto del inventario, responde: "Por el momento no tengo el detalle exacto de esas características técnicas, te conecto con un asesor."

IMPORTANTE - ABREVIACIONES DE CLIENTES:
Los clientes frecuentemente usan abreviaciones o nombres cortos para referirse a modelos. Tú DEBES entender estas abreviaciones y buscar el modelo correcto en el inventario. Ejemplos comunes:
- "s21u", "s21 ultra" = Samsung Galaxy S21 Ultra
- "s24u", "s24 ultra" = Samsung Galaxy S24 Ultra  
- "s25u", "s25 ultra" = Samsung Galaxy S25 Ultra
- "s24fe" = Samsung Galaxy S24 FE
- "a16", "a56", "a36" = Samsung Galaxy A16, A56, A36
- "rn15", "redmi note 15" = Xiaomi Redmi Note 15
- "rn14", "redmi note 14" = Xiaomi Redmi Note 14
- "rn13", "redmi note 13" = Xiaomi Redmi Note 13
- "poco x7", "pocox7" = Xiaomi Poco X7
- "ip16", "iphone 16" = Apple iPhone 16
- "ip17" = Apple iPhone 17
- Cualquier patrón similar: interpreta la marca y modelo correctos.
Si el cliente usa una abreviación, busca el modelo completo en el inventario proporcionado.

🟦 3. MÉTODO CASHBACK
- El método Cashback aplica únicamente para equipos Samsung y Apple.
- Aceptamos celulares usados como parte de pago y pagan la diferencia.
- No aceptamos criptomonedas como método de pago.
- Dile al cliente que un asesor humano debe evaluar el equipo para dar el valor exacto de cashback.

🟦 4. FORMAS DE PAGO DISPONIBLES
- Efectivo (USD) o transferencia: precio promocional (es el precio que ves en el inventario proporcionado).
- Tarjeta de crédito/débito: pago de contado o financiamiento (Tasa cero siempre).
- Plazos disponibles según banco:
  - BAC, LAFISE: 3, 6, 9, 12 meses.
  - BANPRO: 3, 6, 9, 12, 18 meses.
  - FICOHSA: 3, 6, 9, 12, 18, 24 meses.
- No menciones fórmulas de cálculo, solo los plazos aplicables.

🟦 5. HORARIOS, UBICACIÓN Y ASESORES
- Ubicación exacta: Semáforos Monte los Olivos, 1c al Este, 2 C al Norte, Resd. Los Robles.
- Horario de atención: Lunes a Sábados de 9:00am a 6:00pm, Domingos de 9:00am a 3:00pm (hora de Nicaragua).
- La HORA ACTUAL EN NICARAGUA se te pasará abajo.
- Si el cliente desea contactar a un asesor o necesita información avanzada que no tienes, FÍJATE EN LA HORA. 
- Si estamos FUERA de horario: "Por el momento nuestros asesores no están disponibles, te atenderán a partir de las 9:00 AM. ¡Mientras tanto yo puedo ayudarte con info de stock y precios!"
- Si estamos DENTRO del horario: "Podés presionar 'Concretar compra' (o pedirme conectar) para que un asesor te atienda de inmediato."
- Si en caso de que no este en horarios de atencion de un asesor de ventas en ese caso diras algo como: "Por el momento nuestros asesores no están disponibles, te atenderán a partir de las 9:00 AM. ¡Mientras tanto yo puedo ayudarte con info de stock y precios!"

🟦 6. MANEJO DE ERRORES Y LENGUAJE OFENSIVO
- Si te equivocas: "Disculpá, soy un asistente virtual potenciado con inteligencia artificial y puedo cometer errores. Gracias por tu paciencia 💙."
- Si hay lenguaje ofensivo: "Estoy aquí para ayudarte con información de productos 💙. Necesito que mantengamos un tono respetuoso para continuar."
- Consultas que no puedes responder (envíos especiales a departamentos, dudas de promos temporales): Derivar a asesor.
- si el cliente pregunta sobre kits (esta bien que se los menciones a la gente) deberias de decirle que se conecte con un asesor para saber que es lo que trae el kit (si no lo tienes en la info que te doy)
- si te preguntan por algun celular y no lo tienes en el inventario que te doy, debes decirle que modelo no lo tenemos por el momento, y si deseas puedes preguntar por modelos similares (si hay)
`;

// ============================================================
// Mapa de alias / abreviaciones comunes de modelos de celulares
// Expande las abreviaciones antes de buscar en la base de datos
// ============================================================
const MODEL_ALIASES: Record<string, string[]> = {
  // Samsung Galaxy S series
  's21u': ['samsung', 's21', 'ultra'],
  's21 ultra': ['samsung', 's21', 'ultra'],
  's22u': ['samsung', 's22', 'ultra'],
  's22 ultra': ['samsung', 's22', 'ultra'],
  's23u': ['samsung', 's23', 'ultra'],
  's23 ultra': ['samsung', 's23', 'ultra'],
  's24u': ['samsung', 's24', 'ultra'],
  's24 ultra': ['samsung', 's24', 'ultra'],
  's25u': ['samsung', 's25', 'ultra'],
  's25 ultra': ['samsung', 's25', 'ultra'],
  's24fe': ['samsung', 's24', 'fe'],
  's24 fe': ['samsung', 's24', 'fe'],
  's23fe': ['samsung', 's23', 'fe'],
  's23 fe': ['samsung', 's23', 'fe'],
  // Samsung Galaxy A series
  'a16': ['samsung', 'a16'],
  'a36': ['samsung', 'a36'],
  'a56': ['samsung', 'a56'],
  'a15': ['samsung', 'a15'],
  'a25': ['samsung', 'a25'],
  'a35': ['samsung', 'a35'],
  'a55': ['samsung', 'a55'],
  // Xiaomi Redmi Note
  'rn15': ['xiaomi', 'redmi', 'note', '15'],
  'rn14': ['xiaomi', 'redmi', 'note', '14'],
  'rn13': ['xiaomi', 'redmi', 'note', '13'],
  'rn12': ['xiaomi', 'redmi', 'note', '12'],
  'redmi note 15': ['xiaomi', 'redmi', 'note', '15'],
  'redmi note 14': ['xiaomi', 'redmi', 'note', '14'],
  'redmi note 13': ['xiaomi', 'redmi', 'note', '13'],
  'redmi note 12': ['xiaomi', 'redmi', 'note', '12'],
  'redmi 14c': ['xiaomi', 'redmi', '14c'],
  'redmi 13c': ['xiaomi', 'redmi', '13c'],
  // Xiaomi Poco
  'poco x7': ['xiaomi', 'poco', 'x7'],
  'pocox7': ['xiaomi', 'poco', 'x7'],
  'poco x6': ['xiaomi', 'poco', 'x6'],
  'poco f6': ['xiaomi', 'poco', 'f6'],
  // iPhone abbreviations
  'ip16': ['iphone', '16'],
  'ip17': ['iphone', '17'],
  'ip15': ['iphone', '15'],
  'ip14': ['iphone', '14'],
  'iphone16': ['iphone', '16'],
  'iphone17': ['iphone', '17'],
  'iphone15': ['iphone', '15'],
  // Tecno
  'spark 30': ['tecno', 'spark', '30'],
  'camon 30': ['tecno', 'camon', '30'],
};

/**
 * Expande abreviaciones de modelos en el mensaje del usuario.
 * Retorna un array de palabras de búsqueda expandidas.
 */
function expandAliases(cleanMessage: string): string[] {
  // Intentar matchear aliases de mayor a menor longitud (más específicos primero)
  const sortedAliases = Object.keys(MODEL_ALIASES).sort((a, b) => b.length - a.length);
  
  let expanded = cleanMessage;
  const extraWords: string[] = [];
  
  for (const alias of sortedAliases) {
    if (expanded.includes(alias)) {
      const replacement = MODEL_ALIASES[alias];
      extraWords.push(...replacement);
      // Remover el alias del mensaje para no duplicar
      expanded = expanded.replace(alias, ' ');
    }
  }
  
  return extraWords;
}

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

function getAIClient() {
  // Usamos DeepSeek (API compatible con OpenAI)
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY no está configurada');
  }

  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });
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

    // Extraer texto del mensaje - Zoho puede enviar message como objeto {text, type} o como string
    const rawMessage =
      body.request?.message?.text ||  // Formato Zoho Zobot Webhook: request.message.text
      (typeof body.message === 'string' ? body.message : body.message?.text) ||  // message puede ser string u objeto
      body.question ||
      body.text ||
      '';
    const userMessage = typeof rawMessage === 'string' ? rawMessage : String(rawMessage || '');

    if (!userMessage.trim()) {
      return zohoReply('No logré entender tu mensaje. ¿Podrías escribirme qué producto estás buscando? 😊');
    }

    console.log(`[SalesIQ] Handler: ${handler}, Operation: ${operation}, Message: "${userMessage}"`);

    // ============================================================
    // 3. Buscar productos en la base de datos
    // ============================================================
    const cleanMsg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[?¿!¡.,:;()"']/g, '');
    const stopWords = ['hay', 'tienen', 'tienes', 'quiero', 'busco', 'necesito', 'para', 'con', 'los', 'las', 'el', 'la', 'un', 'una', 'me', 'puede', 'puedes', 'dar', 'precio', 'de', 'en', 'es', 'que', 'a', 'por', 'favor', 'saber', 'si', 'hola', 'buenas', 'tardes', 'dias', 'noches', 'algun', 'alguna', 'alguno', 'estoy', 'buscando'];
    
    // Expandir alias/abreviaciones del cliente (ej: "s21u" → ["samsung", "s21", "ultra"])
    const aliasWords = expandAliases(cleanMsg);
    
    // Palabras normales del mensaje (después de quitar stopwords)
    const normalWords = cleanMsg.split(/\s+/).filter((w: string) => w.length > 1 && !stopWords.includes(w));
    
    // Combinar: si hay alias expandidos, usar esos; si no, usar las palabras normales
    const searchWords = aliasWords.length > 0
      ? Array.from(new Set([...aliasWords, ...normalWords]))  // Deduplicar
      : normalWords;

    console.log(`[SalesIQ] Search words: [${searchWords.join(', ')}] (aliases found: ${aliasWords.length > 0})`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let query = supabase
      .from('items')
      .select('id, sku, name, color, state, category, marca, stock_total, price')
      .is('zoho_removed_at', null)
      .gt('stock_total', 0); // Solo buscar productos que tengan stock disponible

    if (searchWords.length > 0) {
      for (const word of searchWords) {
        query = query.or(`name.ilike.%${word}%,sku.ilike.%${word}%,marca.ilike.%${word}%,category.ilike.%${word}%`);
      }
    } else {
      query = query.limit(0);
    }
    
    const { data: products } = await query.limit(30);

    // ============================================================
    // 4. Obtener precios de venta (lista "precio minimo")
    // ============================================================
    if (products && products.length > 0) {
      const itemIds = products.map((p) => p.id);
      const { data: profiles } = await supabase
        .from('item_price_profiles')
        .select('item_id, unit_price, profile_code')
        .in('item_id', itemIds)
        .eq('profile_code', 'preciomin')
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
    // 5. Armar contexto de inventario para la IA
    // ============================================================
    let inventoryContext = '';
    if (products && products.length > 0) {
      inventoryContext = '\n\nINVENTARIO ENCONTRADO:\n';
      for (const p of products) {
        inventoryContext += `- ${p.name} | SKU: ${p.sku} | Stock: ${p.stock_total ?? 0} | Precio: $${p.price ?? 0} | Marca: ${p.marca ?? 'N/A'} | Color: ${p.color ?? 'N/A'} | Estado: ${p.state ?? 'N/A'}\n`;
      }
    } else {
      inventoryContext = '\n\nINVENTARIO ENCONTRADO:\n[VACÍO - 0 RESULTADOS]\n⚠️ REGLA CRÍTICA PARA LA IA: El producto buscado NO está disponible o no existe. DEBES responder estrictamente que está agotado o no lo tenemos. TIENES PROHIBIDO inventar precios, colores o stock.';
    }

    // Agregar hora actual de Nicaragua para que la IA sepa si hay asesores disponibles
    const nowNic = new Date().toLocaleString('es-NI', { timeZone: 'America/Managua', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: true });
    inventoryContext += `\n\nHORA ACTUAL EN NICARAGUA: ${nowNic}`;

    // ============================================================
    // 6. Llamar a DeepSeek AI
    // ============================================================
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + inventoryContext },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.0,
    });

    const reply = completion.choices[0]?.message?.content || 'Lo siento, no pude procesar tu consulta en este momento.';

    // ============================================================
    // 6.5 Registrar uso en ai_usage_logs para Solcom AI dashboard
    // Estrategia de precios: 15% menos que OpenAI
    // DeepSeek pricing real: $0.27/M input, $1.10/M output
    // OpenAI GPT-4 Turbo pricing: $10/M input, $30/M output
    // Cliente paga 15% menos: $8.50/M input, $25.50/M output
    // ============================================================
    try {
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const totalTokens = completion.usage?.total_tokens || (inputTokens + outputTokens);
      
      // Calcular costo que le cobramos al cliente (15% descuento sobre OpenAI GPT-4 Turbo)
      // Asumimos que el cliente usaría GPT-4 Turbo en OpenAI
      const openaiInputPrice = 10.00;  // $10 por 1M tokens input
      const openaiOutputPrice = 30.00; // $30 por 1M tokens output
      const discountRate = 0.15; // 15% de descuento
      
      const clientInputPrice = openaiInputPrice * (1 - discountRate);  // $8.50
      const clientOutputPrice = openaiOutputPrice * (1 - discountRate); // $25.50
      
      const inputCost = (inputTokens / 1_000_000) * clientInputPrice;
      const outputCost = (outputTokens / 1_000_000) * clientOutputPrice;
      const clientCost = Number((inputCost + outputCost).toFixed(6));
      
      // Calcular nuestro costo real con DeepSeek
      const realInputCost = (inputTokens / 1_000_000) * 0.27;
      const realOutputCost = (outputTokens / 1_000_000) * 1.10;
      const realCost = Number((realInputCost + realOutputCost).toFixed(6));
      
      // Calcular margen de ganancia
      const profit = Number((clientCost - realCost).toFixed(6));
      const profitPercent = realCost > 0 ? ((profit / realCost) * 100).toFixed(2) : '0';

      await supabase.from('ai_usage_logs').insert({
        tokens: totalTokens,
        cost: clientCost,  // Lo que le cobramos al cliente
        request_type: 'salesiq_chatbot',
        metadata: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          real_cost: realCost,      // Nuestro costo real
          client_cost: clientCost,   // Lo que cobramos
          profit: profit,            // Ganancia
          profit_percent: profitPercent,
          model: 'deepseek-chat'
        }
      });

      console.log(`[SalesIQ] Usage logged: ${totalTokens} tokens | Cliente: $${clientCost} | Real: $${realCost} | Ganancia: $${profit} (${profitPercent}%)`);
    } catch (logError) {
      // No fallar la respuesta si el logging falla
      console.error('[SalesIQ] Error logging usage:', logError);
    }

    console.log(`[SalesIQ] Reply (${products?.length || 0} products found): "${reply.substring(0, 100)}..."`);

    // ============================================================
    // 7. Devolver en formato Zoho Zobot Webhook
    // ============================================================
    return zohoReply(reply);

  } catch (error) {
    // Siempre devolver 200 con mensaje amigable para que Zoho no muestre "Error contacting webhook"
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
