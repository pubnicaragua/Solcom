import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

const AGENT_PROMPTS: Record<string, string> = {
  'customer-service': 'Eres un agente de atención al cliente de Solis Comercial. Ayudas a los clientes con consultas sobre disponibilidad de productos, precios y entregas. Sé amable y profesional.',
  'collections': 'Eres un agente de cobranza de Solis Comercial. Ayudas con recordatorios de pago y estados de cuenta. Sé cortés pero firme.',
  'quotes': 'Eres un agente de cotizaciones de Solis Comercial. Generas cotizaciones automáticas basadas en el inventario disponible. Sé preciso con los números.',
  'invoicing': 'Eres un agente de facturación de Solis Comercial. Asistes en la emisión de facturas y documentos fiscales. Sé exacto y formal.',
  'audit': 'Eres un agente de auditoría de Solis Comercial. Detectas inconsistencias y anomalías en el inventario. Sé detallista y analítico.',
};

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

    // Obtener inventario de Supabase
    const { data: inventory, error: dbError } = await supabase
      .from('stock_snapshots')
      .select(`
        qty,
        synced_at,
        warehouse_id,
        item_id
      `)
      .limit(100);

    if (dbError) {
      console.error('Database error:', dbError);
    }

    // Datos mock para demostración (en caso de que no haya datos en Supabase)
    const mockInventory = [
      { item: 'Laptop Dell Inspiron 15', sku: 'SKU-001', warehouse: 'X1', qty: 15, price: 450 },
      { item: 'Monitor LG 24"', sku: 'SKU-002', warehouse: 'X1', qty: 8, price: 150 },
      { item: 'Teclado Logitech', sku: 'SKU-003', warehouse: 'X4', qty: 25, price: 35 },
      { item: 'Mouse Inalámbrico', sku: 'SKU-004', warehouse: 'X4', qty: 30, price: 20 },
      { item: 'Impresora HP LaserJet', sku: 'SKU-005', warehouse: 'X5', qty: 5, price: 250 },
    ];

    const inventoryData = inventory && inventory.length > 0 ? inventory : mockInventory;
    const agentPrompt = AGENT_PROMPTS[agentId] || AGENT_PROMPTS['customer-service'];

    // Generar respuesta inteligente basada en la pregunta
    const answer = generateSmartResponse(question, inventoryData, agentPrompt, agentId);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { 
        error: 'Error en consulta IA', 
        details: error instanceof Error ? error.message : 'Unknown error',
        answer: 'Lo siento, estoy experimentando dificultades técnicas. Por favor, intenta de nuevo en unos momentos.'
      },
      { status: 200 } // Cambiar a 200 para que el frontend muestre el mensaje
    );
  }
}

function generateSmartResponse(
  question: string, 
  inventory: any[], 
  agentPrompt: string,
  agentId: string
): string {
  const lowerQuestion = question.toLowerCase();

  // Detectar tipo de consulta
  if (lowerQuestion.includes('cuánto') || lowerQuestion.includes('cuanto') || lowerQuestion.includes('cantidad')) {
    // Consulta de cantidad
    const item = inventory.find(i => 
      lowerQuestion.includes(i.item?.toLowerCase() || i.sku?.toLowerCase())
    );
    if (item) {
      return `Actualmente tenemos ${item.qty} unidades de ${item.item || item.sku} disponibles en la bodega ${item.warehouse || item.warehouse_id}.`;
    }
    return `Tenemos un total de ${inventory.reduce((sum, i) => sum + (i.qty || 0), 0)} unidades en inventario distribuidas en ${new Set(inventory.map(i => i.warehouse || i.warehouse_id)).size} bodegas.`;
  }

  if (lowerQuestion.includes('precio') || lowerQuestion.includes('costo') || lowerQuestion.includes('vale')) {
    const item = inventory.find(i => 
      lowerQuestion.includes(i.item?.toLowerCase() || i.sku?.toLowerCase())
    );
    if (item && item.price) {
      return `El precio de ${item.item || item.sku} es de $${item.price.toFixed(2)} por unidad.`;
    }
    return 'Para consultas de precios específicos, por favor indica el producto que te interesa.';
  }

  if (lowerQuestion.includes('stock bajo') || lowerQuestion.includes('poco inventario')) {
    const lowStock = inventory.filter(i => (i.qty || 0) < 10);
    if (lowStock.length > 0) {
      return `Tenemos ${lowStock.length} productos con stock bajo: ${lowStock.map(i => `${i.item || i.sku} (${i.qty} unidades)`).join(', ')}.`;
    }
    return 'Actualmente no tenemos productos con stock crítico.';
  }

  if (lowerQuestion.includes('bodega') || lowerQuestion.includes('almacén')) {
    const warehouses = [...new Set(inventory.map(i => i.warehouse || i.warehouse_id))];
    return `Tenemos ${warehouses.length} bodegas activas: ${warehouses.join(', ')}. Cada una con diferentes productos disponibles.`;
  }

  if (lowerQuestion.includes('cotización') || lowerQuestion.includes('cotizacion') || lowerQuestion.includes('presupuesto')) {
    if (agentId === 'quotes') {
      return 'Para generar una cotización, necesito que me indiques: 1) Qué productos te interesan, 2) Cantidad de cada uno, 3) Bodega de preferencia. Con esa información puedo preparar una cotización detallada.';
    }
  }

  if (lowerQuestion.includes('factura') || lowerQuestion.includes('documento fiscal')) {
    if (agentId === 'invoicing') {
      return 'Para emitir una factura, necesito los siguientes datos: 1) Nombre o razón social, 2) RUC/Cédula, 3) Productos y cantidades, 4) Forma de pago. ¿Con cuál de estos datos puedo ayudarte?';
    }
  }

  if (lowerQuestion.includes('pago') || lowerQuestion.includes('deuda') || lowerQuestion.includes('saldo')) {
    if (agentId === 'collections') {
      return 'Para consultar el estado de cuenta o gestionar pagos, necesito tu número de cliente o RUC. ¿Podrías proporcionármelo?';
    }
  }

  // Respuesta genérica informativa
  return `${agentPrompt}\n\nActualmente tenemos ${inventory.length} productos en inventario. ¿En qué puedo ayudarte específicamente? Puedo informarte sobre disponibilidad, precios, generar cotizaciones, o cualquier otra consulta relacionada con nuestro inventario.`;
}
