import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const AGENT_PROMPTS: Record<string, string> = {
  'customer-service': 'Eres un agente de atención al cliente de Solis Comercial, una distribuidora de tecnología y electrónica en Nicaragua. Ayudas a los clientes con consultas sobre disponibilidad de productos, precios, marcas y entregas. Sé amable y profesional. Siempre responde en español.',
  'collections': 'Eres un agente de cobranza de Solis Comercial. Ayudas con recordatorios de pago y estados de cuenta. Sé cortés pero firme.',
  'quotes': 'Eres un agente de cotizaciones de Solis Comercial. Generas cotizaciones automáticas basadas en el inventario disponible. Sé preciso con los números y precios.',
  'invoicing': 'Eres un agente de facturación de Solis Comercial. Asistes en la emisión de facturas y documentos fiscales. Sé exacto y formal.',
  'audit': 'Eres un agente de auditoría de Solis Comercial. Detectas inconsistencias y anomalías en el inventario. Sé detallista y analítico.',
};

interface ItemRow {
  name: string;
  sku: string;
  color: string | null;
  marca: string | null;
  stock_total: number | null;
  price: number | null;
  category: string | null;
  state: string | null;
}

interface ApiKeyRow {
  name?: string | null;
  key?: string | null;
  full_key?: string | null;
  status?: string | null;
}

async function resolveDeepSeekKey(supabase: ReturnType<typeof createServerClient>): Promise<string | null> {
  if (process.env.DEEPSEEK_API_KEY) {
    return process.env.DEEPSEEK_API_KEY;
  }

  try {
    const { data, error } = await (supabase as any)
      .from('ai_api_keys')
      .select('name, key, full_key, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error cargando claves AI:', error);
      return null;
    }

    const keys = (data || []) as ApiKeyRow[];
    const preferred = keys.find((row) => {
      const label = `${row.name || ''}`.toLowerCase();
      const value = row.full_key || row.key || '';
      return label.includes('deepseek') && value.startsWith('sk-') && !value.startsWith('sk-solcom-');
    });

    if (preferred) {
      return preferred.full_key || preferred.key || null;
    }

    const fallback = keys.find((row) => {
      const value = row.full_key || row.key || '';
      return value.startsWith('sk-') && !value.startsWith('sk-solcom-');
    });

    return fallback?.full_key || fallback?.key || null;
  } catch (error) {
    console.error('No se pudo resolver la clave AI:', error);
    return null;
  }
}

async function logUsage(supabase: ReturnType<typeof createServerClient>, question: string, answer: string, requestType: string) {
  const estimatedTokens = Math.max(50, Math.ceil((question.length + answer.length) * 1.35));
  const estimatedCost = Number(((estimatedTokens / 1000) * 0.001111).toFixed(6));

  await (supabase as any).from('ai_usage_logs').insert({
    tokens: estimatedTokens,
    cost: estimatedCost,
    request_type: requestType,
  });
}

export async function POST(request: Request) {
  try {
    const { question, agentId = 'customer-service', context, image, url, useAI = false } = await request.json();

    if (!question && !image && !url) {
      return NextResponse.json(
        { error: 'Pregunta, imagen o URL requerida' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const lowerQ = (question || '').toLowerCase();
    const deepseekKey = await resolveDeepSeekKey(supabase);
    const conversationContext = typeof context === 'string' ? context.trim() : '';

    // Si hay URL, hacer scraping primero
    if (url) {
      try {
        const scrapeResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        const scrapeData = await scrapeResponse.json();
        
        if (scrapeData.success && scrapeData.content) {
          const urlSummary = `Analicé la URL: ${url}\n\nTítulo: ${scrapeData.content.title}\n\nDescripción: ${scrapeData.content.description}\n\nContenido: ${scrapeData.content.bodyText.substring(0, 500)}...\n\n${scrapeData.content.prices.length > 0 ? `Precios encontrados: ${scrapeData.content.prices.join(', ')}` : ''}`;
          
          await logUsage(supabase, question, urlSummary, 'url_analysis');
          return NextResponse.json({ answer: urlSummary });
        }
      } catch (error) {
        console.error('Error scraping URL:', error);
        return NextResponse.json({ answer: 'No pude analizar esa URL. Asegurate de que sea válida y accesible.' });
      }
    }

    // Si hay imagen, analizar con GPT-4 Vision
    if (image) {
      try {
        const visionResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/vision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image, 
            question: question || '¿Qué productos, precios o información de inventario ves en esta imagen?' 
          })
        });

        const visionData = await visionResponse.json();
        
        if (visionData.success && visionData.analysis) {
          await logUsage(supabase, question, visionData.analysis, 'image_analysis');
          return NextResponse.json({ answer: visionData.analysis });
        } else {
          const fallback = visionData.analysis || 'El análisis de imágenes no está disponible en este momento. Describe la imagen o tu necesidad en texto.';
          await logUsage(supabase, question, fallback, 'image_analysis_error');
          return NextResponse.json({ answer: fallback });
        }
      } catch (error) {
        console.error('Error con GPT-4 Vision:', error);
        const fallback = 'El análisis de imágenes no está disponible actualmente. Por favor describe la imagen o usa una consulta de texto.';
        return NextResponse.json({ answer: fallback });
      }
    }

    // Buscar productos relevantes en la tabla items basándose en la pregunta
    let items: ItemRow[] = [];

    // Extraer palabras clave de búsqueda (quitar palabras comunes)
    const stopWords = ['hay', 'tiene', 'tienen', 'cuantos', 'cuántos', 'cuanto', 'cuánto', 'del', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'en', 'por', 'para', 'con', 'sin', 'como', 'precio', 'costo', 'vale', 'stock', 'disponible', 'disponibilidad', 'productos', 'producto', 'buscar', 'quiero', 'necesito', 'me', 'es', 'son', 'hola', 'buenos', 'días', 'buenas', 'tardes'];
    const keywords = lowerQ.split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.includes(w));

    if (keywords.length > 0) {
      // Buscar por cada palabra clave en name, sku, marca, category
      const searchTerm = keywords.join(' ');
      const { data: searchResults } = await (supabase as any)
        .from('items')
        .select('name, sku, color, marca, stock_total, price, category, state')
        .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,marca.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
        .is('zoho_removed_at', null)
        .limit(20);

      if (searchResults && searchResults.length > 0) {
        items = searchResults as ItemRow[];
      } else {
        // Intentar con palabras individuales
        for (const kw of keywords) {
          if (kw.length < 3) continue;
          const { data: kwResults } = await (supabase as any)
            .from('items')
            .select('name, sku, color, marca, stock_total, price, category, state')
            .or(`name.ilike.%${kw}%,sku.ilike.%${kw}%,marca.ilike.%${kw}%`)
            .is('zoho_removed_at', null)
            .limit(15);
          if (kwResults && kwResults.length > 0) {
            items.push(...(kwResults as ItemRow[]));
            break;
          }
        }
      }
    }

    // Si no se encontraron productos relevantes, obtener resumen general
    if (items.length === 0) {
      const { data: allItems } = await (supabase as any)
        .from('items')
        .select('name, sku, color, marca, stock_total, price, category, state')
        .is('zoho_removed_at', null)
        .gt('stock_total', 0)
        .limit(50);
      items = (allItems || []) as ItemRow[];
    }

    const agentPrompt = AGENT_PROMPTS[agentId] || AGENT_PROMPTS['customer-service'];
    const answer = await generateSmartResponse(question, items, agentPrompt, agentId, conversationContext, deepseekKey);

    await logUsage(supabase, question, answer, `ai_chat_${agentId}`);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { 
        answer: 'Lo siento, estoy experimentando dificultades técnicas. Por favor, intenta de nuevo en unos momentos.'
      },
      { status: 200 }
    );
  }
}

async function generateSmartResponse(
  question: string, 
  items: ItemRow[], 
  agentPrompt: string,
  agentId: string,
  conversationContext: string,
  deepseekKey: string | null
): Promise<string> {
  try {
    // Preparar contexto de productos
    const totalProducts = items.length;
    const totalStock = items.reduce((sum, i) => sum + (i.stock_total || 0), 0);
    const brands = [...new Set(items.map(i => i.marca).filter(Boolean))];
    const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
    
    // Productos relevantes (top 15)
    const productList = items.slice(0, 15).map(i => 
      `- ${i.name} (SKU: ${i.sku}) | Stock: ${i.stock_total ?? 0} unidades${i.price ? ` | Precio: $${Number(i.price).toFixed(2)}` : ''}${i.marca ? ` | Marca: ${i.marca}` : ''}`
    ).join('\n');

    // Productos con stock bajo
    const lowStock = items.filter(i => (i.stock_total || 0) > 0 && (i.stock_total || 0) < 5);
    const lowStockList = lowStock.slice(0, 10).map(i => 
      `- ${i.name} (${i.sku}): ${i.stock_total} unidades`
    ).join('\n');

    const contexto = `
INFORMACIÓN DEL INVENTARIO:
- Total de productos encontrados: ${totalProducts}
- Stock total: ${totalStock.toLocaleString()} unidades
- Marcas disponibles: ${brands.slice(0, 10).join(', ')}${brands.length > 10 ? ` y ${brands.length - 10} más` : ''}
- Categorías: ${categories.slice(0, 10).join(', ')}${categories.length > 10 ? ` y ${categories.length - 10} más` : ''}

PRODUCTOS ENCONTRADOS:
${productList}
${items.length > 15 ? `\n(Y ${items.length - 15} productos más...)` : ''}

${lowStock.length > 0 ? `\nPRODUCTOS CON STOCK BAJO (menos de 5 unidades):\n${lowStockList}` : ''}
`;

    const combinedContext = [conversationContext, contexto]
      .filter((value) => value && value.trim().length > 0)
      .join('\n\n');

    if (!deepseekKey) {
      return generarRespuestaFallback(question, items, conversationContext);
    }

    // Llamar a DeepSeek
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `${agentPrompt}\n\nActúas como Mía en el módulo de compras. Usa el historial, el análisis de compras y el inventario en tiempo real. No des respuestas genéricas si tienes contexto. Si el producto exacto no aparece, dilo con honestidad y ofrece lo más cercano. Si preguntan qué comprar primero o el presupuesto estimado, usa primero el análisis de restock del contexto. Si preguntan “seguro?”, valida la respuesta anterior con el contexto disponible.`
          },
          {
            role: 'user',
            content: `${combinedContext}\n\nPREGUNTA DEL USUARIO:\n${question}\n\nResponde basándote en la información disponible. Si preguntan sobre stock bajo, menciona los productos listados. Si preguntan qué comprar primero, prioriza los productos críticos del análisis. Si preguntan precios, usa solo productos realmente encontrados. Si solicitan reportes de ventas o compras, usa el contexto del módulo si existe y aclara cuando falten datos.`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      console.error('Error de DeepSeek:', await response.text());
      return generarRespuestaFallback(question, items, conversationContext);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generarRespuestaFallback(question, items, conversationContext);

  } catch (error) {
    console.error('Error en generateSmartResponse:', error);
    return generarRespuestaFallback(question, items, conversationContext);
  }
}

function generarRespuestaFallback(question: string, items: ItemRow[], conversationContext = ''): string {
  const lq = question.toLowerCase();
  const totalProducts = items.length;
  const totalStock = items.reduce((sum, i) => sum + (i.stock_total || 0), 0);

  if (conversationContext) {
    const stockBajoMatch = conversationContext.match(/Productos CRÍTICOS \(prioridad alta\):\n([\s\S]*?)(?:\n\n|$)/i);
    const presupuestoMatch = conversationContext.match(/Presupuesto total estimado: C\$\s*([\d,.]+)/i);

    if ((lq.includes('qué debo comprar primero') || lq.includes('que debo comprar primero') || lq.includes('prioridad')) && stockBajoMatch?.[1]) {
      return `Prioriza estos productos primero:\n\n${stockBajoMatch[1].trim()}`;
    }

    if (lq.includes('presupuesto') && presupuestoMatch?.[1]) {
      return `El presupuesto estimado según el análisis actual es C$ ${presupuestoMatch[1]}.`;
    }

    if ((lq.includes('seguro') || lq.includes('confirma') || lq.includes('confirmas')) && stockBajoMatch?.[1]) {
      return `Sí. Según el análisis disponible, estos son los productos críticos detectados:\n\n${stockBajoMatch[1].trim()}`;
    }
  }

  // Stock bajo
  if (lq.includes('stock bajo') || lq.includes('poco stock')) {
    const lowStock = items.filter(i => (i.stock_total || 0) > 0 && (i.stock_total || 0) < 5);
    if (lowStock.length > 0) {
      const list = lowStock.slice(0, 10).map(i => `• ${i.name} (${i.sku}) — ${i.stock_total} unidades`).join('\n');
      return `Hay ${lowStock.length} productos con stock bajo (menos de 5 unidades):\n\n${list}`;
    }
  }

  // Precios
  if (lq.includes('precio') || lq.includes('cuesta')) {
    const withPrice = items.filter(i => i.price && Number(i.price) > 0);
    if (withPrice.length > 0 && withPrice.length <= 10) {
      const list = withPrice.map(i => `• ${i.name} — $${Number(i.price).toFixed(2)}`).join('\n');
      return `Precios:\n\n${list}`;
    }
  }

  // Productos encontrados
  if (items.length > 0 && items.length <= 15) {
    const list = items.slice(0, 10).map(i => 
      `• ${i.name} — Stock: ${i.stock_total ?? 0}${i.price ? ` — $${Number(i.price).toFixed(2)}` : ''}`
    ).join('\n');
    return `Encontré ${items.length} productos:\n\n${list}`;
  }

  return `Tengo ${totalProducts} productos con ${totalStock.toLocaleString()} unidades en stock. ¿Qué necesitas saber?`;
}

async function generateContextAwareResponse(question: string, context: string): Promise<string> {
  try {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    
    if (!deepseekKey) {
      // Fallback a respuesta básica si no hay API key
      return `Tengo el contexto pero necesito configurar DEEPSEEK_API_KEY para generar respuestas inteligentes.\n\nContexto disponible:\n${context.substring(0, 500)}...`;
    }

    // Llamar a DeepSeek para generar respuesta contextual
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Eres Mía, asistente de compras de Solis Comercial. Analiza el contexto proporcionado (historial de conversación, datos de inventario, análisis de restock) y responde de forma precisa y útil. Mantén coherencia con la conversación previa. Si el usuario pregunta sobre algo mencionado antes, usa esa información. Sé concisa pero completa.'
          },
          {
            role: 'user',
            content: `CONTEXTO:\n${context}\n\nPREGUNTA DEL USUARIO:\n${question}\n\nResponde basándote en el contexto y la conversación previa. Si hay productos con stock bajo mencionados antes, úsalos para responder. Si preguntan qué comprar primero, prioriza según urgencia y presupuesto del contexto.`
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error de DeepSeek:', error);
      // Fallback a respuesta básica
      return generarRespuestaBasica(question, context);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generarRespuestaBasica(question, context);

  } catch (error) {
    console.error('Error en generateContextAwareResponse:', error);
    return generarRespuestaBasica(question, context);
  }
}

function generarRespuestaBasica(question: string, context: string): string {
  const q = question.toLowerCase();
  
  // Extraer productos con stock bajo del historial
  const stockBajoMatch = context.match(/productos con stock bajo[\s\S]*?(?=\n\n|$)/i);
  const productosStockBajo = stockBajoMatch ? stockBajoMatch[0] : '';
  
  if ((q.includes('qué') || q.includes('que')) && (q.includes('comprar') || q.includes('primero') || q.includes('prioridad'))) {
    if (productosStockBajo) {
      return `Basándome en el análisis anterior, deberías priorizar:\n\n${productosStockBajo}\n\nTe recomiendo empezar por los que tienen menos de 2 unidades, ya que son los más críticos.`;
    }
    return 'Necesito que primero me muestres el análisis de stock bajo para poder recomendarte qué comprar primero.';
  }
  
  if (q.includes('presupuesto')) {
    const presupuestoMatch = context.match(/presupuesto[:\s]+(?:C\$|USD)?\s*([\d,\.]+)/i);
    if (presupuestoMatch) {
      return `El presupuesto estimado según el análisis es de C$ ${presupuestoMatch[1]}`;
    }
    return 'Para calcular el presupuesto necesito que me indiques qué productos y cantidades quieres comprar.';
  }
  
  return `Entiendo tu pregunta sobre: "${question}"\n\nPuedo ayudarte mejor si me das más detalles o si generas un análisis de restock primero.`;
}
