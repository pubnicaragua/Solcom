import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { normalizeSalespersonId } from '@/lib/identifiers';
import { createZohoBooksClient } from '@/lib/zoho/books-client';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { buildTaxCatalogMap, getZohoTaxCatalog } from '@/lib/zoho/tax-catalog';
import {
    computeFiscalTotals,
    FiscalValidationError,
    normalizeFiscalLine,
} from '@/lib/ventas/fiscal';
import { enqueueDocumentForSync } from '@/lib/ventas/sync-processor';
import { recordDeleteSyncAudit } from '@/lib/ventas/delete-sync-audit';
import { markDocumentSyncState, normalizeSyncErrorCodeFromError } from '@/lib/ventas/sync-state';
import {
    buildVersionConflictResponse,
    getCurrentRowVersion,
    getExpectedRowVersion,
} from '@/lib/ventas/version-conflict';

function parseErrorMessage(raw: string): string {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.message === 'string' && parsed.message.trim()) return parsed.message.trim();
        if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) return parsed.error.message.trim();
    } catch {
        // no-op
    }
    return raw.slice(0, 240).trim() || 'Error desconocido';
}

function normalizeTrimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSerialInput(value: unknown): string {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry ?? '').trim())
            .filter(Boolean)
            .join(',');
    }
    return String(value ?? '')
        .replace(/[\n;]/g, ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(',');
}

function normalizeWarranty(value: unknown): string | null {
    const text = normalizeTrimmed(value);
    return text || null;
}

function extractMissingColumn(message: string): string | null {
    const text = String(message || '');
    let match = text.match(/Could not find the '([^']+)' column/i);
    if (match?.[1]) return match[1];
    match = text.match(/column \"?([a-zA-Z0-9_]+)\"? does not exist/i);
    if (match?.[1]) return match[1];
    return null;
}

async function insertInvoiceItemsWithColumnFallback(supabase: any, rows: any[]): Promise<{ error: any }> {
    if (!Array.isArray(rows) || rows.length === 0) return { error: null };

    const mutableRows = rows.map((row) => ({ ...row }));
    let retry = 0;
    while (retry < 12) {
        const result = await supabase.from('sales_invoice_items').insert(mutableRows);
        if (!result.error) return { error: null };

        const missingColumn = extractMissingColumn(result.error?.message || '');
        if (!missingColumn) return { error: result.error };

        let removed = false;
        for (const row of mutableRows) {
            if (Object.prototype.hasOwnProperty.call(row, missingColumn)) {
                delete row[missingColumn];
                removed = true;
            }
        }

        if (!removed) return { error: result.error };
        retry += 1;
    }

    return { error: new Error('No se pudieron insertar lineas de factura por columnas faltantes.') };
}

function normalizeZohoPaymentMode(value: unknown): string {
    const text = normalizeTrimmed(value).toLowerCase();
    if (!text) return 'cash';
    if (text.includes('efect') || text.includes('cash') || text.includes('contado')) return 'cash';
    if (text.includes('cheq') || text.includes('check')) return 'check';
    if (text.includes('transfer') || text.includes('banc') || text.includes('wire')) return 'banktransfer';
    if (text.includes('tarj') || text.includes('card') || text.includes('credit')) return 'creditcard';
    if (text.includes('remes')) return 'bankremittance';
    if (text.includes('auto')) return 'autotransaction';
    return 'others';
}

function isMissingZohoInvoiceColumnsError(message: string): boolean {
    const text = message.toLowerCase();
    return text.includes('zoho_invoice_id') || text.includes('zoho_invoice_number') || text.includes('zoho_synced_at');
}

function formatTodayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

type LocalInvoiceRow = {
    id: string;
    invoice_number: string;
    order_number: string | null;
    customer_id: string | null;
    date: string;
    total: number;
    payment_method: string | null;
    warehouse_id: string | null;
    status: string;
};

async function getOptionalZohoInvoiceMetadata(supabase: any, invoiceId: string): Promise<{
    zohoInvoiceId: string;
    zohoInvoiceNumber: string;
}> {
    const lookup = await (supabase as any)
        .from('sales_invoices')
        .select('zoho_invoice_id, zoho_invoice_number')
        .eq('id', invoiceId)
        .single();

    if (lookup?.error) {
        const text = String(lookup.error.message || '');
        if (!isMissingZohoInvoiceColumnsError(text)) {
            console.warn('[ventas/invoices/:id] No se pudo leer metadata Zoho:', text);
        }
        return { zohoInvoiceId: '', zohoInvoiceNumber: '' };
    }

    return {
        zohoInvoiceId: normalizeTrimmed((lookup.data as any)?.zoho_invoice_id),
        zohoInvoiceNumber: normalizeTrimmed((lookup.data as any)?.zoho_invoice_number),
    };
}

async function persistZohoInvoiceMetadata(
    supabase: any,
    invoiceId: string,
    zohoInvoiceId: string,
    zohoInvoiceNumber: string
) {
    if (!zohoInvoiceId && !zohoInvoiceNumber) return;
    const maybeUpdate = await (supabase as any)
        .from('sales_invoices')
        .update({
            zoho_invoice_id: zohoInvoiceId || null,
            zoho_invoice_number: zohoInvoiceNumber || null,
            zoho_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

    if (maybeUpdate?.error) {
        const text = String(maybeUpdate.error.message || '');
        if (!isMissingZohoInvoiceColumnsError(text)) {
            console.warn('[ventas/invoices/:id] No se pudo guardar metadata Zoho:', text);
        }
    }
}

async function fetchZohoInvoiceById(params: {
    accessToken: string;
    apiDomain: string;
    organizationId: string;
    zohoInvoiceId: string;
}) {
    const { accessToken, apiDomain, organizationId, zohoInvoiceId } = params;
    const response = await fetch(
        `${apiDomain}/books/v3/invoices/${encodeURIComponent(zohoInvoiceId)}?organization_id=${encodeURIComponent(organizationId)}`,
        {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            cache: 'no-store',
        }
    );

    const raw = await response.text();
    if (!response.ok) {
        throw new Error(`Zoho rechazó la lectura de factura: ${response.status} - ${parseErrorMessage(raw)}`);
    }

    let parsed: any = {};
    try {
        parsed = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error(`Zoho devolvió JSON inválido al leer factura: ${raw.slice(0, 180)}`);
    }

    if (parsed?.code !== 0) {
        throw new Error(`Zoho devolvió error al leer factura: ${String(parsed?.message || 'Error desconocido')}`);
    }

    const invoice = parsed?.invoice || {};
    return {
        id: normalizeTrimmed(invoice?.invoice_id),
        number: normalizeTrimmed(invoice?.invoice_number),
        status: normalizeTrimmed(invoice?.status).toLowerCase(),
        balance: normalizeNumber(invoice?.balance, Number.NaN),
        raw: invoice,
    };
}

async function findZohoInvoiceForLocalInvoice(params: {
    accessToken: string;
    apiDomain: string;
    organizationId: string;
    localInvoice: LocalInvoiceRow;
    zohoCustomerId: string;
    hintedZohoInvoiceNumber: string;
}) {
    const {
        accessToken,
        apiDomain,
        organizationId,
        localInvoice,
        zohoCustomerId,
        hintedZohoInvoiceNumber,
    } = params;

    const normalizedOrderNumber = normalizeTrimmed(localInvoice.order_number);
    const normalizedInvoiceNumber = normalizeTrimmed(localInvoice.invoice_number);
    const normalizedHintedNumber = normalizeTrimmed(hintedZohoInvoiceNumber);
    const expectedDate = normalizeTrimmed(localInvoice.date);
    const expectedTotal = normalizeNumber(localInvoice.total, 0);

    const fallbackMatches: Array<{ id: string; number: string }> = [];

    for (let page = 1; page <= 12; page++) {
        const response = await fetch(
            `${apiDomain}/books/v3/invoices?organization_id=${encodeURIComponent(organizationId)}&page=${page}&per_page=200`,
            {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                cache: 'no-store',
            }
        );

        const raw = await response.text();
        if (!response.ok) {
            throw new Error(`Zoho rechazó búsqueda de factura: ${response.status} - ${parseErrorMessage(raw)}`);
        }

        let parsed: any = {};
        try {
            parsed = raw ? JSON.parse(raw) : {};
        } catch {
            throw new Error(`Zoho devolvió JSON inválido al listar facturas: ${raw.slice(0, 180)}`);
        }

        if (parsed?.code !== 0) {
            throw new Error(`Zoho devolvió error al listar facturas: ${String(parsed?.message || 'Error desconocido')}`);
        }

        const invoices = Array.isArray(parsed?.invoices) ? parsed.invoices : [];
        for (const invoice of invoices) {
            const candidateId = normalizeTrimmed(invoice?.invoice_id);
            if (!candidateId) continue;

            const candidateNumber = normalizeTrimmed(invoice?.invoice_number);
            const candidateReference = normalizeTrimmed(invoice?.reference_number);
            const candidateCustomer = normalizeTrimmed(invoice?.customer_id);
            const candidateDate = normalizeTrimmed(invoice?.date);
            const candidateTotal = normalizeNumber(invoice?.total, Number.NaN);

            const strongMatch =
                (normalizedOrderNumber && candidateReference === normalizedOrderNumber) ||
                (normalizedInvoiceNumber && candidateReference === normalizedInvoiceNumber) ||
                (normalizedInvoiceNumber && candidateNumber === normalizedInvoiceNumber) ||
                (normalizedHintedNumber && candidateNumber === normalizedHintedNumber);

            if (strongMatch) {
                return { id: candidateId, number: candidateNumber };
            }

            const sameCustomer = !zohoCustomerId || candidateCustomer === zohoCustomerId;
            const sameDate = !!expectedDate && candidateDate === expectedDate;
            const sameTotal = Number.isFinite(candidateTotal) && Math.abs(candidateTotal - expectedTotal) < 0.01;
            if (sameCustomer && sameDate && sameTotal) {
                fallbackMatches.push({ id: candidateId, number: candidateNumber });
            }
        }

        const hasMore = Boolean(parsed?.page_context?.has_more_page);
        if (!hasMore) break;
    }

    if (fallbackMatches.length === 1) {
        return fallbackMatches[0];
    }

    if (fallbackMatches.length > 1) {
        throw new Error(
            'Se encontraron varias facturas similares en Zoho y no se pudo identificar una única factura para aplicar el pago.'
        );
    }

    throw new Error(
        `No se encontró la factura en Zoho para ${localInvoice.invoice_number}. ` +
        'Verifica que haya sido creada/sincronizada y que tenga referencia.'
    );
}

async function createZohoPayment(params: {
    accessToken: string;
    apiDomain: string;
    organizationId: string;
    zohoCustomerId: string;
    zohoInvoiceId: string;
    localInvoice: LocalInvoiceRow;
    amountToApply: number;
    zohoLocationId?: string;
}) {
    const {
        accessToken,
        apiDomain,
        organizationId,
        zohoCustomerId,
        zohoInvoiceId,
        localInvoice,
        amountToApply,
        zohoLocationId,
    } = params;

    const normalizedAmount = Math.round(Math.max(0, amountToApply) * 100) / 100;
    if (normalizedAmount <= 0) {
        throw new Error('Monto de pago inválido para sincronizar con Zoho.');
    }

    const referenceNumber = normalizeTrimmed(localInvoice.order_number) || normalizeTrimmed(localInvoice.invoice_number);
    const paymentModes = Array.from(new Set([
        normalizeZohoPaymentMode(localInvoice.payment_method),
        'cash',
        'others',
    ]));

    let lastModeError = '';
    for (const paymentMode of paymentModes) {
        const payload: any = {
            customer_id: zohoCustomerId,
            payment_mode: paymentMode,
            amount: normalizedAmount,
            date: normalizeTrimmed(localInvoice.date) || formatTodayYmd(),
            invoices: [
                {
                    invoice_id: zohoInvoiceId,
                    amount_applied: normalizedAmount,
                },
            ],
            description: `Pago registrado desde ERP (${localInvoice.invoice_number})`,
        };
        if (referenceNumber) payload.reference_number = referenceNumber;
        if (zohoLocationId) payload.location_id = zohoLocationId;

        const response = await fetch(
            `${apiDomain}/books/v3/customerpayments?organization_id=${encodeURIComponent(organizationId)}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                cache: 'no-store',
            }
        );

        const raw = await response.text();
        let parsed: any = {};
        try {
            parsed = raw ? JSON.parse(raw) : {};
        } catch {
            parsed = {};
        }

        const parsedMessage = parseErrorMessage(raw);
        if (!response.ok) {
            const lower = parsedMessage.toLowerCase();
            const isPaymentModeError = response.status === 400 &&
                (lower.includes('payment mode') || lower.includes('payment_mode') || lower.includes('modo de pago'));
            if (isPaymentModeError) {
                lastModeError = `${response.status} - ${parsedMessage}`;
                continue;
            }
            throw new Error(`Zoho rechazó el pago: ${response.status} - ${parsedMessage}`);
        }

        if (parsed?.code === 0) {
            return parsed?.payment || parsed?.customerpayment || parsed;
        }

        const message = String(parsed?.message || parsedMessage || 'Error desconocido');
        const isPaymentModeError = message.toLowerCase().includes('payment mode') || message.toLowerCase().includes('payment_mode');
        if (isPaymentModeError) {
            lastModeError = message;
            continue;
        }
        throw new Error(`Zoho devolvió error al registrar pago: ${message}`);
    }

    throw new Error(
        `Zoho rechazó el pago para ${localInvoice.invoice_number}. ` +
        `${lastModeError || 'No se pudo determinar un método de pago válido.'}`
    );
}

async function syncPaidInvoiceToZoho(supabase: any, invoiceId: string) {
    const organizationId = normalizeTrimmed(process.env.ZOHO_BOOKS_ORGANIZATION_ID || '');
    if (!organizationId) {
        throw new Error('Configuración incompleta: falta ZOHO_BOOKS_ORGANIZATION_ID.');
    }

    const { data: localInvoice, error: invoiceError } = await supabase
        .from('sales_invoices')
        .select('id, invoice_number, order_number, customer_id, date, total, payment_method, warehouse_id, status')
        .eq('id', invoiceId)
        .single();

    if (invoiceError || !localInvoice) {
        throw new Error(invoiceError?.message || 'Factura no encontrada.');
    }

    if (!localInvoice.customer_id) {
        throw new Error('No se puede marcar como pagada en Zoho sin cliente.');
    }

    const customerLookup = await (supabase as any)
        .from('customers')
        .select('id, name, zoho_contact_id')
        .eq('id', localInvoice.customer_id)
        .single();

    if (customerLookup.error) {
        const text = String(customerLookup.error.message || '');
        if (text.toLowerCase().includes('zoho_contact_id')) {
            throw new Error('Falta migración de clientes Zoho: columna zoho_contact_id no existe en customers.');
        }
        throw new Error(`No se pudo leer cliente para Zoho: ${text}`);
    }

    const zohoCustomerId = normalizeTrimmed((customerLookup.data as any)?.zoho_contact_id);
    const customerName = normalizeTrimmed((customerLookup.data as any)?.name) || 'cliente';
    if (!zohoCustomerId) {
        throw new Error(`El cliente "${customerName}" no está vinculado con Zoho. Sincroniza clientes primero.`);
    }

    const auth: any = await getZohoAccessToken();
    if (!auth || auth.error || !auth.accessToken || !auth.apiDomain) {
        throw new Error(auth?.error || 'No se pudo autenticar con Zoho.');
    }

    const metadata = await getOptionalZohoInvoiceMetadata(supabase, invoiceId);
    let zohoInvoiceId = metadata.zohoInvoiceId;
    let zohoInvoiceNumber = metadata.zohoInvoiceNumber;

    let invoiceDetail: Awaited<ReturnType<typeof fetchZohoInvoiceById>> | null = null;
    if (zohoInvoiceId) {
        try {
            invoiceDetail = await fetchZohoInvoiceById({
                accessToken: auth.accessToken,
                apiDomain: auth.apiDomain,
                organizationId,
                zohoInvoiceId,
            });
        } catch (error: any) {
            const text = String(error?.message || '').toLowerCase();
            const isNotFound = text.includes('404');
            if (!isNotFound) throw error;
            zohoInvoiceId = '';
        }
    }

    if (!invoiceDetail) {
        const resolved = await findZohoInvoiceForLocalInvoice({
            accessToken: auth.accessToken,
            apiDomain: auth.apiDomain,
            organizationId,
            localInvoice: localInvoice as LocalInvoiceRow,
            zohoCustomerId,
            hintedZohoInvoiceNumber: zohoInvoiceNumber,
        });
        zohoInvoiceId = resolved.id;
        if (!zohoInvoiceNumber) zohoInvoiceNumber = resolved.number;
        invoiceDetail = await fetchZohoInvoiceById({
            accessToken: auth.accessToken,
            apiDomain: auth.apiDomain,
            organizationId,
            zohoInvoiceId,
        });
    }

    if (!zohoInvoiceNumber) {
        zohoInvoiceNumber = invoiceDetail.number;
    }

    await persistZohoInvoiceMetadata(supabase, invoiceId, zohoInvoiceId, zohoInvoiceNumber);

    const alreadyPaid = invoiceDetail.status === 'paid' || (Number.isFinite(invoiceDetail.balance) && invoiceDetail.balance <= 0);
    if (alreadyPaid) {
        return;
    }

    let zohoLocationId = '';
    if (localInvoice.warehouse_id) {
        const whLookup = await supabase
            .from('warehouses')
            .select('id, zoho_warehouse_id')
            .eq('id', localInvoice.warehouse_id)
            .maybeSingle();
        if (!whLookup.error) {
            zohoLocationId = normalizeTrimmed((whLookup.data as any)?.zoho_warehouse_id);
        }
    }

    const amountFromBalance = Number.isFinite(invoiceDetail.balance) ? invoiceDetail.balance : normalizeNumber(localInvoice.total, 0);
    const amountToApply = Math.min(
        Math.max(0, amountFromBalance),
        Math.max(0, normalizeNumber(localInvoice.total, 0))
    );

    await createZohoPayment({
        accessToken: auth.accessToken,
        apiDomain: auth.apiDomain,
        organizationId,
        zohoCustomerId,
        zohoInvoiceId,
        localInvoice: localInvoice as LocalInvoiceRow,
        amountToApply: amountToApply > 0 ? amountToApply : normalizeNumber(localInvoice.total, 0),
        zohoLocationId: zohoLocationId || undefined,
    });

    // Re-read quickly so we can fail early if Zoho keeps it unpaid.
    invoiceDetail = await fetchZohoInvoiceById({
        accessToken: auth.accessToken,
        apiDomain: auth.apiDomain,
        organizationId,
        zohoInvoiceId,
    });

    const paidAfterSync = invoiceDetail.status === 'paid' || (Number.isFinite(invoiceDetail.balance) && invoiceDetail.balance <= 0);
    if (!paidAfterSync) {
        throw new Error(
            `Zoho aceptó el pago pero la factura sigue en estado "${invoiceDetail.status || 'desconocido'}" con balance ${invoiceDetail.balance}.`
        );
    }
}

// GET /api/ventas/invoices/[id] — Get invoice detail with items + customer
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { id } = params;

        const { data: invoice, error } = await supabase
            .from('sales_invoices')
            .select(`
        *,
        customer:customers(id, name, email, phone, ruc, address),
        items:sales_invoice_items(*)
      `)
            .eq('id', id)
            .order('sort_order', { referencedTable: 'sales_invoice_items', ascending: true })
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
        }

        return NextResponse.json({ invoice });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT /api/ventas/invoices/[id] — Update invoice (status, data, or full edit)
export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { id } = params;
        const body = await req.json();
        const expectedRowVersion = getExpectedRowVersion(req, body);

        // If only changing status
        if (body.status && Object.keys(body).length === 1) {
            const currentLookup = await supabase
                .from('sales_invoices')
                .select('id, row_version')
                .eq('id', id)
                .maybeSingle();

            if (currentLookup.error || !currentLookup.data) {
                return NextResponse.json({ error: currentLookup.error?.message || 'Factura no encontrada' }, { status: 404 });
            }

            const currentRowVersion = getCurrentRowVersion(currentLookup.data);
            if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
                return buildVersionConflictResponse({
                    expectedRowVersion,
                    currentRowVersion,
                    resourceId: id,
                });
            }

            const normalizedStatusValue = normalizeTrimmed(body.status) || String(body.status);
            const requestedStatus = normalizedStatusValue.toLowerCase();
            if (requestedStatus === 'pagada') {
                try {
                    await syncPaidInvoiceToZoho(supabase, id);
                } catch (syncError: any) {
                    return NextResponse.json(
                        { error: syncError?.message || 'No se pudo sincronizar el estado pagada con Zoho.' },
                        { status: 400 }
                    );
                }
            }

            let statusUpdateQuery = supabase
                .from('sales_invoices')
                .update({ status: normalizedStatusValue, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (expectedRowVersion !== null && currentRowVersion !== null) {
                statusUpdateQuery = statusUpdateQuery.eq('row_version', expectedRowVersion);
            }

            const { data, error } = await statusUpdateQuery.select().maybeSingle();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            if (!data) {
                if (expectedRowVersion === null || currentRowVersion === null) {
                    return NextResponse.json(
                        { error: 'No se pudo actualizar el estado de la factura. Recarga e intenta nuevamente.' },
                        { status: 409 }
                    );
                }
                return buildVersionConflictResponse({
                    expectedRowVersion: expectedRowVersion ?? -1,
                    currentRowVersion,
                    resourceId: id,
                });
            }
            return NextResponse.json({ invoice: data });
        }

        // Full update
        const {
            customer_id,
            date,
            due_date,
            status,
            discount_amount,
            shipping_charge,
            payment_method,
            notes,
            salesperson_id,
            items,
        } = body;

        const { data: currentInvoice, error: currentInvoiceError } = await supabase
            .from('sales_invoices')
            .select('id, shipping_charge, subtotal, tax_amount, row_version')
            .eq('id', id)
            .single();

        if (currentInvoiceError || !currentInvoice) {
            return NextResponse.json({ error: currentInvoiceError?.message || 'Factura no encontrada' }, { status: 404 });
        }

        const currentRowVersion = getCurrentRowVersion(currentInvoice);
        if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
            return buildVersionConflictResponse({
                expectedRowVersion,
                currentRowVersion,
                resourceId: id,
            });
        }

        const normalizedDiscountAmount = Math.max(0, normalizeNumber(discount_amount, 0));
        if (discount_amount !== undefined && normalizedDiscountAmount > 0) {
            return NextResponse.json(
                { error: 'El descuento global está deshabilitado en este flujo.', code: 'GLOBAL_DISCOUNT_DISABLED' },
                { status: 400 }
            );
        }

        const normalizedShippingCharge = shipping_charge !== undefined
            ? Math.max(0, normalizeNumber(shipping_charge, 0))
            : Math.max(0, normalizeNumber((currentInvoice as any).shipping_charge, 0));

        const updateData: any = { updated_at: new Date().toISOString() };
        if (customer_id !== undefined) updateData.customer_id = customer_id || null;
        if (date !== undefined) updateData.date = date;
        if (due_date !== undefined) updateData.due_date = due_date || null;
        if (status !== undefined) updateData.status = status;
        if (discount_amount !== undefined) updateData.discount_amount = 0;
        if (shipping_charge !== undefined) updateData.shipping_charge = Math.round(normalizedShippingCharge * 100) / 100;
        if (payment_method !== undefined) updateData.payment_method = payment_method || null;
        if (notes !== undefined) updateData.notes = notes || null;
        if (salesperson_id !== undefined) updateData.salesperson_id = normalizeSalespersonId(salesperson_id);

        // Recalculate totals if items provided
        if (Array.isArray(items) && items.length > 0) {
            const taxCatalog = await getZohoTaxCatalog();
            const taxCatalogMap = buildTaxCatalogMap(
                (taxCatalog || []).filter((tax) => tax.active && tax.is_editable)
            );

            const normalizedItems = items.map((item: any, index: number) => ({
                ...normalizeFiscalLine({
                    line: {
                        item_id: item?.item_id || null,
                        description: item?.description || item?.name || 'Artículo',
                        quantity: normalizeNumber(item?.quantity, Number.NaN),
                        unit_price: Math.max(0, normalizeNumber(item?.unit_price, 0)),
                        discount_percent: item?.discount_percent,
                        tax_id: item?.tax_id || null,
                        tax_name: item?.tax_name || null,
                        tax_percentage: item?.tax_percentage,
                        warranty: item?.warranty ?? null,
                    },
                    taxCatalogMap,
                    lineIndex: index,
                }),
                serial_number_value: normalizeSerialInput(
                    item?.serial_number_value ?? item?.serial_numbers ?? item?.serials
                ) || null,
                price_profile_code: normalizeTrimmed(item?.price_profile_code) || null,
            }));

            const totals = computeFiscalTotals(normalizedItems, normalizedShippingCharge);

            updateData.subtotal = totals.subtotal;
            updateData.tax_rate = totals.tax_rate;
            updateData.tax_amount = totals.tax_amount;
            updateData.total = totals.total;
            updateData.discount_amount = 0;

            const deleteResult = await supabase
                .from('sales_invoice_items')
                .delete()
                .eq('invoice_id', id);

            if (deleteResult.error) {
                return NextResponse.json(
                    { error: `No se pudieron reemplazar líneas de la factura: ${deleteResult.error.message}` },
                    { status: 500 }
                );
            }

            const lineItems = normalizedItems.map((item: any, index: number) => ({
                invoice_id: id,
                item_id: item.item_id || null,
                description: item.description || 'Artículo',
                quantity: Math.max(0, normalizeNumber(item.quantity, 0)),
                unit_price: Math.max(0, normalizeNumber(item.unit_price, 0)),
                discount_percent: Math.max(0, Math.min(100, normalizeNumber(item.discount_percent, 0))),
                tax_id: normalizeTrimmed(item.tax_id) || null,
                tax_name: normalizeTrimmed(item.tax_name) || null,
                tax_percentage: Math.max(0, normalizeNumber(item.tax_percentage, 0)),
                warranty: normalizeWarranty(item.warranty),
                serial_number_value: normalizeSerialInput(item.serial_number_value) || null,
                price_profile_code: normalizeTrimmed(item.price_profile_code) || null,
                subtotal: Math.round(Math.max(0, normalizeNumber(item.line_taxable, item.subtotal || 0)) * 100) / 100,
                sort_order: index,
            }));

            const { error: itemsError } = await insertInvoiceItemsWithColumnFallback(supabase, lineItems);
            if (itemsError) {
                return NextResponse.json({ error: itemsError.message }, { status: 500 });
            }
        } else if (shipping_charge !== undefined) {
            // Keep header totals coherent when only shipping changed.
            const currentSubtotal = Math.max(0, normalizeNumber((currentInvoice as any).subtotal, Number.NaN));
            const currentTaxAmount = Math.max(0, normalizeNumber((currentInvoice as any).tax_amount, Number.NaN));
            if (Number.isFinite(currentSubtotal) && Number.isFinite(currentTaxAmount)) {
                updateData.total = Math.round((currentSubtotal + currentTaxAmount + normalizedShippingCharge) * 100) / 100;
            }
        }

        let updateQuery = supabase
            .from('sales_invoices')
            .update(updateData)
            .eq('id', id);

        if (expectedRowVersion !== null && currentRowVersion !== null) {
            updateQuery = updateQuery.eq('row_version', expectedRowVersion);
        }

        const { data, error } = await updateQuery.select(`
        *,
        customer:customers(id, name, email, phone, ruc, address)
      `)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            if (expectedRowVersion === null || currentRowVersion === null) {
                return NextResponse.json(
                    { error: 'No se pudo actualizar la factura. Recarga e intenta nuevamente.' },
                    { status: 409 }
                );
            }
            return buildVersionConflictResponse({
                expectedRowVersion: expectedRowVersion ?? -1,
                currentRowVersion,
                resourceId: id,
            });
        }

        return NextResponse.json({ invoice: data });
    } catch (error: any) {
        if (error instanceof FiscalValidationError) {
            return NextResponse.json(
                { error: error.message, code: error.code, details: error.details || null },
                { status: error.status || 400 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/ventas/invoices/[id] — Delete invoice (only drafts)
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { id } = params;
        const externalRequestId = `delete_invoice_${id}_${Date.now()}`;

        // Verify it's a draft
        const { data: invoice } = await supabase
            .from('sales_invoices')
            .select('id, status, invoice_number, external_request_id')
            .eq('id', id)
            .maybeSingle();

        if (!invoice) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }

        if (invoice.status !== 'borrador') {
            return NextResponse.json(
                { error: 'Solo se pueden eliminar facturas en borrador' },
                { status: 400 }
            );
        }

        // If the invoice was already synchronized with Zoho, void it there and keep local record as canceled.
        const metadata = await getOptionalZohoInvoiceMetadata(supabase, id);
        if (metadata.zohoInvoiceId) {
            const zohoClient = createZohoBooksClient();
            if (!zohoClient) {
                const message = 'No se pudo anular en Zoho: configuración ZOHO_BOOKS_* incompleta.';
                const errorCode = normalizeSyncErrorCodeFromError(message);
                await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    status: 'failed_sync',
                    errorCode,
                    errorMessage: message,
                    externalRequestId,
                    incrementAttempts: true,
                });
                await recordDeleteSyncAudit({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    documentNumber: (invoice as any)?.invoice_number || null,
                    requestedBy: user.id,
                    localAction: 'soft_cancel',
                    localResult: 'kept',
                    zohoLinked: true,
                    zohoExternalId: metadata.zohoInvoiceId,
                    zohoOperation: 'void_invoice',
                    zohoResultStatus: 'failed',
                    zohoErrorCode: errorCode,
                    zohoErrorMessage: message,
                    metadata: { reason: 'missing_zoho_config' },
                });
                return NextResponse.json({ error: message }, { status: 500 });
            }

            try {
                await zohoClient.voidInvoice(metadata.zohoInvoiceId);
            } catch (zohoError: any) {
                const message = `No se pudo anular la factura en Zoho: ${zohoError?.message || 'Error desconocido'}`;
                const errorCode = normalizeSyncErrorCodeFromError(zohoError);
                const syncUpdate = await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    status: 'pending_sync',
                    errorCode,
                    errorMessage: message,
                    externalRequestId,
                    incrementAttempts: true,
                });

                const queueResult = await enqueueDocumentForSync({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    action: 'sync_delete',
                    externalRequestId,
                    errorCode,
                    errorMessage: message,
                    priority: 1,
                });

                await recordDeleteSyncAudit({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    documentNumber: (invoice as any)?.invoice_number || null,
                    requestedBy: user.id,
                    localAction: 'soft_cancel',
                    localResult: 'kept',
                    zohoLinked: true,
                    zohoExternalId: metadata.zohoInvoiceId,
                    zohoOperation: 'void_invoice',
                    zohoResultStatus: queueResult.error ? 'failed' : 'pending',
                    zohoErrorCode: errorCode,
                    zohoErrorMessage: message,
                    syncJobId: queueResult.job?.id || null,
                    metadata: { sync_status: syncUpdate.data?.sync_status || 'pending_sync' },
                });

                if (queueResult.error) {
                    return NextResponse.json(
                        {
                            error: `${message}. Además, no se pudo encolar reintento: ${queueResult.error.message || 'error desconocido'}`,
                            code: 'DELETE_SYNC_QUEUE_FAILED',
                        },
                        { status: 500 }
                    );
                }

                return NextResponse.json(
                    {
                        success: false,
                        deleted: false,
                        cancelled: false,
                        code: 'DELETE_SYNC_PENDING',
                        warning: message,
                        sync_status: 'pending_sync',
                        retry_job_id: queueResult.job?.id || null,
                    },
                    { status: 202 }
                );
            }

            const { data: cancelledInvoice, error: cancelError } = await supabase
                .from('sales_invoices')
                .update({
                    status: 'cancelada',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (cancelError) {
                await markDocumentSyncState({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    status: 'failed_sync',
                    errorCode: 'LOCAL_UPDATE_FAILED',
                    errorMessage: cancelError.message,
                    externalRequestId,
                    incrementAttempts: true,
                });
                await recordDeleteSyncAudit({
                    supabase,
                    documentType: 'sales_invoice',
                    documentId: id,
                    documentNumber: (invoice as any)?.invoice_number || null,
                    requestedBy: user.id,
                    localAction: 'soft_cancel',
                    localResult: 'failed',
                    zohoLinked: true,
                    zohoExternalId: metadata.zohoInvoiceId,
                    zohoOperation: 'void_invoice',
                    zohoResultStatus: 'success',
                    zohoErrorCode: 'LOCAL_UPDATE_FAILED',
                    zohoErrorMessage: cancelError.message,
                });
                return NextResponse.json({ error: cancelError.message }, { status: 500 });
            }

            await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: id,
                status: 'synced',
                externalRequestId,
                incrementAttempts: true,
            });
            await recordDeleteSyncAudit({
                supabase,
                documentType: 'sales_invoice',
                documentId: id,
                documentNumber: (invoice as any)?.invoice_number || null,
                requestedBy: user.id,
                localAction: 'soft_cancel',
                localResult: 'cancelled',
                zohoLinked: true,
                zohoExternalId: metadata.zohoInvoiceId,
                zohoOperation: 'void_invoice',
                zohoResultStatus: 'success',
            });

            return NextResponse.json({
                success: true,
                deleted: false,
                cancelled: true,
                invoice: cancelledInvoice || null,
            });
        }

        // Items deleted via CASCADE
        const { error } = await supabase
            .from('sales_invoices')
            .delete()
            .eq('id', id);

        if (error) {
            await recordDeleteSyncAudit({
                supabase,
                documentType: 'sales_invoice',
                documentId: id,
                documentNumber: (invoice as any)?.invoice_number || null,
                requestedBy: user.id,
                localAction: 'hard_delete',
                localResult: 'failed',
                zohoLinked: false,
                zohoOperation: 'none',
                zohoResultStatus: 'not_required',
                zohoErrorCode: 'LOCAL_DELETE_FAILED',
                zohoErrorMessage: error.message,
            });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await recordDeleteSyncAudit({
            supabase,
            documentType: 'sales_invoice',
            documentId: id,
            documentNumber: (invoice as any)?.invoice_number || null,
            requestedBy: user.id,
            localAction: 'hard_delete',
            localResult: 'deleted',
            zohoLinked: false,
            zohoOperation: 'none',
            zohoResultStatus: 'not_required',
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
