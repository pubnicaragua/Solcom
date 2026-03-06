import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createZohoInvoiceFromPayload } from '@/app/api/ventas/invoices/route';
import {
    buildSyncStatusPayload,
    markDocumentSyncState,
    normalizeSyncErrorCodeFromError,
} from '@/lib/ventas/sync-state';
import { enqueueDocumentForSync } from '@/lib/ventas/sync-processor';
import {
    buildVersionConflictResponse,
    getCurrentRowVersion,
    getExpectedRowVersion,
} from '@/lib/ventas/version-conflict';

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isNonRecoverableSendError(message: string): boolean {
    const text = String(message || '').toLowerCase();
    if (!text) return false;
    return (
        text.includes('requiere') && text.includes('serial') ||
        text.includes('seriales inválidos') ||
        text.includes('no está vinculado con zoho') ||
        text.includes('no tiene zoho_item_id') ||
        text.includes('no se puede enviar a zoho sin cliente') ||
        text.includes('impuesto inválido') ||
        text.includes('invalid tax') ||
        text.includes('vendedor') && text.includes('válido')
    );
}

// POST /api/ventas/invoices/[id]/send — Transition explicit from draft -> sent and sync Zoho.
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const expectedRowVersion = getExpectedRowVersion(req, body);
        const invoiceId = params.id;
        const externalRequestId = `send_${invoiceId}_${Date.now()}`;

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
                status,
                row_version,
                items:sales_invoice_items(*)
            `)
            .eq('id', invoiceId)
            .maybeSingle();

        if (invoiceLookup.error || !invoiceLookup.data) {
            return NextResponse.json({ error: invoiceLookup.error?.message || 'Factura no encontrada' }, { status: 404 });
        }

        const invoice = invoiceLookup.data as any;
        const currentStatus = normalizeText(invoice.status).toLowerCase();
        if (currentStatus !== 'borrador') {
            return NextResponse.json(
                { error: 'Solo se pueden enviar facturas en borrador.', code: 'INVALID_STATE' },
                { status: 409 }
            );
        }

        const currentRowVersion = getCurrentRowVersion(invoice);
        if (expectedRowVersion !== null && currentRowVersion !== null && expectedRowVersion !== currentRowVersion) {
            return buildVersionConflictResponse({
                expectedRowVersion,
                currentRowVersion,
                resourceId: invoiceId,
            });
        }

        try {
            const zohoSync = await createZohoInvoiceFromPayload({
                supabase,
                invoiceId: String(invoice.id),
                invoiceNumber: normalizeText(invoice.invoice_number) || null,
                customerId: normalizeText(invoice.customer_id) || null,
                warehouseId: normalizeText(invoice.warehouse_id) || null,
                orderNumber: normalizeText(invoice.order_number) || null,
                notes: normalizeText(invoice.notes) || null,
                date: normalizeText(invoice.date) || new Date().toISOString().slice(0, 10),
                dueDate: normalizeText(invoice.due_date) || null,
                terms: normalizeText(invoice.terms) || null,
                salespersonLocalId: normalizeText(invoice.salesperson_id) || null,
                salespersonZohoId: null,
                salespersonName: null,
                shippingCharge: Math.max(0, normalizeNumber(invoice.shipping_charge, 0)),
                items: Array.isArray(invoice.items) ? invoice.items : [],
            });

            let statusUpdateQuery = supabase
                .from('sales_invoices')
                .update({
                    status: 'enviada',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);

            if (expectedRowVersion !== null && currentRowVersion !== null) {
                statusUpdateQuery = statusUpdateQuery.eq('row_version', expectedRowVersion);
            }

            const statusUpdate = await statusUpdateQuery
                .select('*')
                .maybeSingle();

            if (!statusUpdate.error && !statusUpdate.data && expectedRowVersion !== null && currentRowVersion !== null) {
                return buildVersionConflictResponse({
                    expectedRowVersion,
                    currentRowVersion,
                    resourceId: invoiceId,
                });
            }

            if (statusUpdate.error || !statusUpdate.data) {
                return NextResponse.json(
                    { error: statusUpdate.error?.message || 'No se pudo actualizar estado de la factura.' },
                    { status: 500 }
                );
            }

            const syncUpdate = await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoiceId,
                status: 'synced',
                externalRequestId,
                incrementAttempts: true,
            });

            return NextResponse.json({
                invoice: {
                    ...statusUpdate.data,
                    ...buildSyncStatusPayload(syncUpdate.data || {}),
                    external_request_id: externalRequestId,
                    zoho_invoice_id: zohoSync.zoho_invoice_id,
                    zoho_invoice_number: zohoSync.zoho_invoice_number,
                },
                status: 'synced',
            });
        } catch (error: any) {
            const message = String(error?.message || error || 'No se pudo sincronizar factura en Zoho.');
            if (isNonRecoverableSendError(message)) {
                return NextResponse.json(
                    {
                        error: message,
                        code: 'SEND_VALIDATION_ERROR',
                    },
                    { status: 400 }
                );
            }

            const errorCode = normalizeSyncErrorCodeFromError(error);
            await supabase
                .from('sales_invoices')
                .update({
                    status: 'enviada',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);

            const syncUpdate = await markDocumentSyncState({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoiceId,
                status: 'pending_sync',
                errorCode,
                errorMessage: message,
                externalRequestId,
                incrementAttempts: true,
            });

            await enqueueDocumentForSync({
                supabase,
                documentType: 'sales_invoice',
                documentId: invoiceId,
                externalRequestId,
                errorCode,
                errorMessage: message,
                priority: 10,
            });

            return NextResponse.json(
                {
                    status: 'pending_sync',
                    warning: message,
                    code: errorCode,
                    invoice: {
                        id: invoiceId,
                        status: 'enviada',
                        ...buildSyncStatusPayload(syncUpdate.data || {}),
                        external_request_id: externalRequestId,
                    },
                },
                { status: 202 }
            );
        }
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Error interno.' }, { status: 500 });
    }
}
