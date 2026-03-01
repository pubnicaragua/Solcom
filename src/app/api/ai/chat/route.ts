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

export async function POST(request: Request) {
  try {
    const { question, agentId = 'customer-service' } = await request.json();

    if (!question) {
      return NextResponse.json(
        { error: 'Pregunta requerida' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const lowerQ = question.toLowerCase();

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
    const answer = generateSmartResponse(question, items, agentPrompt, agentId);

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

function generateSmartResponse(
  question: string, 
  items: ItemRow[], 
  agentPrompt: string,
  agentId: string
): string {
  const lq = question.toLowerCase();

  // Estadísticas rápidas
  const totalProducts = items.length;
  const totalStock = items.reduce((sum, i) => sum + (i.stock_total || 0), 0);
  const brands = [...new Set(items.map(i => i.marca).filter(Boolean))];
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

  // Consulta de saludo
  if (lq.match(/^(hola|buenos|buenas|hey|saludos)/)) {
    return `¡Hola! Soy el asistente virtual de **Solis Comercial** 🇳🇮. Tengo acceso en tiempo real a nuestro catálogo de **${totalProducts} productos** con un stock total de **${totalStock.toLocaleString()} unidades**.\n\nPuedo ayudarte con:\n• Disponibilidad y stock de productos\n• Precios\n• Búsqueda por marca, categoría o nombre\n• Productos con stock bajo\n\n¿En qué puedo ayudarte?`;
  }

  // Consulta de cantidad / disponibilidad
  if (lq.includes('cuánto') || lq.includes('cuanto') || lq.includes('cantidad') || lq.includes('hay') || lq.includes('disponible') || lq.includes('stock')) {
    if (items.length > 0 && items.length <= 20) {
      const list = items.slice(0, 10).map(i => 
        `• **${i.name}** (${i.sku}) — ${i.stock_total ?? 0} unidades${i.price ? ` — $${Number(i.price).toFixed(2)}` : ''}${i.marca ? ` — ${i.marca}` : ''}`
      ).join('\n');
      const extra = items.length > 10 ? `\n\n...y ${items.length - 10} productos más.` : '';
      return `Encontré **${items.length} productos** relacionados:\n\n${list}${extra}\n\nStock total: **${totalStock.toLocaleString()} unidades**`;
    }
    if (lq.includes('stock bajo') || lq.includes('poco')) {
      const lowStock = items.filter(i => (i.stock_total || 0) > 0 && (i.stock_total || 0) < 5);
      if (lowStock.length > 0) {
        const list = lowStock.slice(0, 10).map(i => `• **${i.name}** (${i.sku}) — ${i.stock_total} unidades`).join('\n');
        return `Hay **${lowStock.length} productos** con stock bajo (menos de 5 unidades):\n\n${list}`;
      }
      return 'No encontré productos con stock crítico en los resultados actuales.';
    }
    return `Tenemos **${totalProducts} productos** con un stock total de **${totalStock.toLocaleString()} unidades** en nuestro inventario.\n\n¿Buscas algún producto en particular? Dime el nombre, SKU o marca.`;
  }

  // Consulta de precio
  if (lq.includes('precio') || lq.includes('costo') || lq.includes('vale') || lq.includes('cuánto cuesta')) {
    const withPrice = items.filter(i => i.price && Number(i.price) > 0);
    if (withPrice.length > 0 && withPrice.length <= 15) {
      const list = withPrice.slice(0, 10).map(i => 
        `• **${i.name}** — **$${Number(i.price).toFixed(2)}** (Stock: ${i.stock_total ?? 0})`
      ).join('\n');
      return `Precios encontrados:\n\n${list}`;
    }
    if (withPrice.length > 15) {
      return `Encontré **${withPrice.length} productos** con precio. ¿Podrías ser más específico? Dime el nombre, marca o SKU del producto que te interesa.`;
    }
    return 'No encontré precios para esa búsqueda. Intenta con el nombre exacto o SKU del producto.';
  }

  // Consulta de marcas
  if (lq.includes('marca') || lq.includes('marcas')) {
    if (brands.length > 0) {
      return `Trabajamos con **${brands.length} marcas**, entre ellas:\n\n${brands.slice(0, 20).map(b => `• ${b}`).join('\n')}\n\n¿Te interesa alguna marca en particular?`;
    }
    return 'Tenemos múltiples marcas disponibles. ¿Cuál te interesa?';
  }

  // Consulta de categorías
  if (lq.includes('categoría') || lq.includes('categoria') || lq.includes('categorias') || lq.includes('categorías') || lq.includes('tipo')) {
    if (categories.length > 0) {
      return `Nuestras categorías de productos:\n\n${categories.slice(0, 15).map(c => `• ${c}`).join('\n')}\n\n¿Qué categoría te interesa?`;
    }
  }

  // Cotizaciones
  if (lq.includes('cotización') || lq.includes('cotizacion') || lq.includes('presupuesto')) {
    return 'Para generar una cotización necesito:\n1. **Productos** que te interesan (nombre o SKU)\n2. **Cantidad** de cada uno\n3. **Datos de contacto**\n\n¿Con cuál de estos datos empezamos?';
  }

  // Si hay items relevantes, mostrarlos
  if (items.length > 0 && items.length <= 20) {
    const list = items.slice(0, 10).map(i => 
      `• **${i.name}** (${i.sku})${i.marca ? ` — ${i.marca}` : ''} — Stock: ${i.stock_total ?? 0}${i.price ? ` — $${Number(i.price).toFixed(2)}` : ''}`
    ).join('\n');
    const extra = items.length > 10 ? `\n\n...y ${items.length - 10} productos más.` : '';
    return `Encontré estos productos:\n\n${list}${extra}\n\n¿Necesitas más detalles de alguno?`;
  }

  // Respuesta genérica
  return `¡Hola! Soy el asistente de **Solis Comercial**. Tengo acceso a **${totalProducts} productos** en tiempo real.\n\nPuedes preguntarme sobre:\n• **Disponibilidad**: "¿Tienen laptops Dell?"\n• **Precios**: "¿Cuánto cuesta el iPhone 15?"\n• **Stock**: "¿Cuántas unidades hay de Apple?"\n• **Marcas**: "¿Qué marcas manejan?"\n• **Categorías**: "¿Qué categorías tienen?"\n\n¿En qué puedo ayudarte?`;
}
