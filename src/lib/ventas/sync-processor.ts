import { createZohoInvoiceFromPayload } from '@/app/api/ventas/invoices/route';
import { syncQuoteToZoho } from '@/app/api/ventas/quotes/route';
import { syncSalesOrderToZoho } from '@/app/api/ventas/sales-orders/route';
import {
    enqueueSalesSyncJob,
    markDocumentSyncState,
    normalizeSyncErrorCodeFromError,
    SalesDocumentType,
} from '@/lib/ventas/sync-state';

export type SalesSyncQueueRow = {
    id: string;
    document_type: SalesDocumentType;
    document_id: string;
    action: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    max_attempts: number;
    priority: number;
    idempotency_key: string | null;
    payload_hash: string | null;
    external_request_id: string | null;
    error_code: string | null;
    error_message: string | null;
    next_attempt_at: string;
    created_at: string;
    updated_at: string;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function retryDelaySeconds(attempt: number): number {
    const bounded = Math.min(Math.max(1, attempt), 12);
    const base = Math.min(900, 10 * (2 ** (bounded - 1)));
    const jitter = Math.floor(Math.random() * 10);
    return base + jitter;
}

function addSecondsToNow(seconds: number): string {
    return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
}

export async function enqueueDocumentForSync(params: {
    supabase: any;
    documentType: SalesDocumentType;
    documentId: string;
    idempotencyKey?: string | null;
    payloadHash?: string | null;
    externalRequestId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    priority?: number;
}): Promise<{ queued: boolean; job: any; error: any }> {
    return enqueueSalesSyncJob({
        supabase: params.supabase,
        documentType: params.documentType,
        documentId: params.documentId,
        idempotencyKey: params.idempotencyKey ?? null,
        payloadHash: params.payloadHash ?? null,
        externalRequestId: params.externalRequestId ?? null,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        priority: params.priority ?? 50,
        action: 'sync_create',
    });
}

async function syncSalesOrderById(supabase: any, orderId: string) {
    const orderLookup = await supabase
        .from('sales_orders')
        .select(`
            id,
            order_number,
            customer_id,
            warehouse_id,
            date,
            expected_delivery_date,
            payment_terms,
            delivery_method,
            shipping_charge,
            notes,
            salesperson_id,
            salesperson_name,
            status,
            items:sales_order_items(*)
        `)
        .eq('id', orderId)
        .single();

    if (orderLookup.error || !orderLookup.data) {
        throw new Error(orderLookup.error?.message || 'Orden de venta no encontrada para sincronizar.');
    }

    const order = orderLookup.data;
    await syncSalesOrderToZoho({
        supabase,
        orderId: String(order.id),
        orderNumber: String(order.order_number || ''),
        customerId: String(order.customer_id || ''),
        warehouseId: String(order.warehouse_id || ''),
        date: String(order.date || new Date().toISOString().slice(0, 10)),
        expectedDeliveryDate: normalizeText(order.expected_delivery_date) || null,
        paymentTerms: normalizeText(order.payment_terms) || null,
        deliveryMethod: normalizeText(order.delivery_method) || null,
        shippingCharge: Number.isFinite(Number(order.shipping_charge)) ? Number(order.shipping_charge) : 0,
        notes: normalizeText(order.notes) || null,
        salespersonId: normalizeText(order.salesperson_id) || null,
        salespersonName: normalizeText(order.salesperson_name) || null,
        status: normalizeText(order.status) || 'borrador',
        items: Array.isArray(order.items) ? order.items : [],
    });
}

async function syncQuoteById(supabase: any, quoteId: string) {
    const quoteLookup = await supabase
        .from('sales_quotes')
        .select(`
            id,
            quote_number,
            customer_id,
            warehouse_id,
            date,
            valid_until,
            notes,
            items:sales_quote_items(*)
        `)
        .eq('id', quoteId)
        .single();

    if (quoteLookup.error || !quoteLookup.data) {
        throw new Error(quoteLookup.error?.message || 'Cotización no encontrada para sincronizar.');
    }

    const quote = quoteLookup.data;
    await syncQuoteToZoho({
        supabase,
        quoteId: String(quote.id),
        quoteNumber: String(quote.quote_number || ''),
        customerId: String(quote.customer_id || ''),
        warehouseId: String(quote.warehouse_id || ''),
        date: String(quote.date || new Date().toISOString().slice(0, 10)),
        validUntil: normalizeText(quote.valid_until) || null,
        notes: normalizeText(quote.notes) || null,
        items: Array.isArray(quote.items) ? quote.items : [],
    });
}

async function syncInvoiceById(supabase: any, invoiceId: string) {
    const invoiceLookup = await supabase
        .from('sales_invoices')
        .select(`
            id,
            invoice_number,
            customer_id,
            warehouse_id,
            order_number,
            notes,
            date,
            due_date,
            terms,
            salesperson_id,
            shipping_charge,
            items:sales_invoice_items(*)
        `)
        .eq('id', invoiceId)
        .single();

    if (invoiceLookup.error || !invoiceLookup.data) {
        throw new Error(invoiceLookup.error?.message || 'Factura no encontrada para sincronizar.');
    }

    const invoice = invoiceLookup.data;
    await createZohoInvoiceFromPayload({
        supabase,
        invoiceId: String(invoice.id),
        invoiceNumber: String(invoice.invoice_number || ''),
        customerId: normalizeText(invoice.customer_id) || null,
        warehouseId: normalizeText(invoice.warehouse_id) || null,
        orderNumber: normalizeText(invoice.order_number) || null,
        notes: normalizeText(invoice.notes) || null,
        date: String(invoice.date || new Date().toISOString().slice(0, 10)),
        dueDate: normalizeText(invoice.due_date) || null,
        terms: normalizeText(invoice.terms) || null,
        salespersonLocalId: normalizeText(invoice.salesperson_id) || null,
        salespersonZohoId: null,
        salespersonName: null,
        shippingCharge: Math.max(0, Number(invoice.shipping_charge || 0)),
        items: Array.isArray(invoice.items) ? invoice.items : [],
    });
}

export async function syncSalesDocumentNow(params: {
    supabase: any;
    documentType: SalesDocumentType;
    documentId: string;
    externalRequestId?: string | null;
}): Promise<void> {
    const { supabase, documentType, documentId, externalRequestId = null } = params;

    if (documentType === 'sales_order') {
        await syncSalesOrderById(supabase, documentId);
    } else if (documentType === 'sales_quote') {
        await syncQuoteById(supabase, documentId);
    } else if (documentType === 'sales_invoice') {
        await syncInvoiceById(supabase, documentId);
    } else {
        throw new Error(`Tipo de documento no soportado: ${documentType}`);
    }

    await markDocumentSyncState({
        supabase,
        documentType,
        documentId,
        status: 'synced',
        externalRequestId,
        incrementAttempts: true,
    });
}

export async function acquirePendingSalesSyncJobs(params: {
    supabase: any;
    workerId: string;
    batchSize: number;
    staleProcessingMinutes?: number;
}): Promise<SalesSyncQueueRow[]> {
    const {
        supabase,
        workerId,
        batchSize,
        staleProcessingMinutes = 5,
    } = params;

    const staleBefore = new Date(Date.now() - staleProcessingMinutes * 60_000).toISOString();
    await supabase
        .from('sales_sync_queue')
        .update({
            status: 'pending',
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
            error_code: 'PROCESSING_STALE_RESET',
            error_message: 'Job reiniciado por lock vencido.',
        })
        .eq('status', 'processing')
        .lt('updated_at', staleBefore);

    const pendingQuery = await supabase
        .from('sales_sync_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(Math.max(1, Math.min(100, batchSize)));

    if (pendingQuery.error || !Array.isArray(pendingQuery.data) || pendingQuery.data.length === 0) {
        return [];
    }

    const ids = pendingQuery.data.map((row: any) => String(row.id));
    const lockResult = await supabase
        .from('sales_sync_queue')
        .update({
            status: 'processing',
            locked_at: new Date().toISOString(),
            locked_by: workerId,
            updated_at: new Date().toISOString(),
        })
        .in('id', ids)
        .eq('status', 'pending');

    if (lockResult.error) {
        return [];
    }

    const lockedRows = await supabase
        .from('sales_sync_queue')
        .select('*')
        .in('id', ids)
        .eq('status', 'processing')
        .eq('locked_by', workerId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

    if (lockedRows.error || !Array.isArray(lockedRows.data)) {
        return [];
    }

    return lockedRows.data as SalesSyncQueueRow[];
}

export async function finishSalesSyncJob(params: {
    supabase: any;
    job: SalesSyncQueueRow;
    success: boolean;
    error?: unknown;
}): Promise<void> {
    const { supabase, job, success, error } = params;
    const now = new Date().toISOString();
    const nextAttempts = Math.max(0, Number(job.attempts || 0)) + 1;

    if (success) {
        await supabase
            .from('sales_sync_queue')
            .update({
                status: 'completed',
                attempts: nextAttempts,
                error_code: null,
                error_message: null,
                locked_at: null,
                locked_by: null,
                updated_at: now,
            })
            .eq('id', job.id);
        return;
    }

    const errorMessage = String((error as any)?.message || error || 'Error desconocido');
    const errorCode = normalizeSyncErrorCodeFromError(error);
    const maxAttempts = Math.max(1, Number(job.max_attempts || 12));
    const shouldRetry = nextAttempts < maxAttempts;
    const nextAttemptAt = shouldRetry
        ? addSecondsToNow(retryDelaySeconds(nextAttempts))
        : now;

    await supabase
        .from('sales_sync_queue')
        .update({
            status: shouldRetry ? 'pending' : 'failed',
            attempts: nextAttempts,
            error_code: errorCode,
            error_message: errorMessage.slice(0, 1000),
            next_attempt_at: nextAttemptAt,
            locked_at: null,
            locked_by: null,
            updated_at: now,
        })
        .eq('id', job.id);

    await markDocumentSyncState({
        supabase,
        documentType: job.document_type,
        documentId: job.document_id,
        status: shouldRetry ? 'pending_sync' : 'failed_sync',
        errorCode,
        errorMessage: errorMessage.slice(0, 1000),
        externalRequestId: job.external_request_id || null,
        incrementAttempts: true,
    });
}
