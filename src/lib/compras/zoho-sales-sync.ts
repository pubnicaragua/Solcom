import type { ZohoBooksClient } from '@/lib/zoho/books-client';

type SupabaseLike = {
    from: (table: string) => any;
};

type SyncOptions = {
    supabase: SupabaseLike;
    zohoClient: ZohoBooksClient;
    dateStart: string;
    dateEnd: string;
    maxPages?: number;
    perPage?: number;
    maxDetails?: number;
    force?: boolean;
};

export type ZohoSalesSyncResult = {
    date_start: string;
    date_end: string;
    listed_invoices: number;
    detail_requests: number;
    skipped_unchanged: number;
    inactive_invoices: number;
    documents_upserted: number;
    lines_upserted: number;
    max_details_reached: boolean;
    repaired_missing_lines: number;
    sample_invoices: Array<{
        invoice_id: string;
        invoice_number: string;
        date: string;
        status: string;
        last_modified_time: string;
    }>;
};

type LocalItem = {
    id: string;
    sku: string | null;
    name: string | null;
    zoho_item_id: string | null;
};

type ItemLookup = {
    zohoItemId: string;
    sku: string;
};

const ACTIVE_INVOICE_STATUSES = new Set([
    'sent',
    'viewed',
    'overdue',
    'paid',
    'unpaid',
    'partially_paid',
    'partiallypaid',
    'open',
    'approved',
]);

function normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function normalizeStatus(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

function normalizeDateYmd(value: unknown): string | null {
    const text = normalizeText(value);
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseZohoTimestamp(value: unknown): string | null {
    const text = normalizeText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function sameInstant(left: unknown, right: unknown): boolean {
    const leftText = normalizeText(left);
    const rightText = normalizeText(right);
    if (!leftText || !rightText) return false;
    const leftTime = new Date(leftText).getTime();
    const rightTime = new Date(rightText).getTime();
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return leftText === rightText;
    return leftTime === rightTime;
}

function isActiveInvoiceStatus(status: string): boolean {
    if (!status) return true;
    return ACTIVE_INVOICE_STATUSES.has(status);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function resolveLocalItems(
    supabase: SupabaseLike,
    lookups: ItemLookup[],
    cache: Map<string, LocalItem | null>
): Promise<Map<string, LocalItem | null>> {
    const zohoItemIds = Array.from(new Set(lookups.map((entry) => entry.zohoItemId).filter(Boolean)));
    const skus = Array.from(new Set(lookups.map((entry) => entry.sku).filter(Boolean)));

    const missingZohoIds = zohoItemIds.filter((id) => !cache.has(`zoho:${id}`));
    if (missingZohoIds.length > 0) {
        const { data, error } = await supabase
            .from('items')
            .select('id, sku, name, zoho_item_id')
            .in('zoho_item_id', missingZohoIds);

        if (error) throw new Error(`No se pudieron resolver items locales: ${error.message}`);

        const foundIds = new Set<string>();
        for (const row of data || []) {
            const zohoItemId = normalizeText((row as LocalItem).zoho_item_id);
            if (!zohoItemId) continue;
            foundIds.add(zohoItemId);
            cache.set(`zoho:${zohoItemId}`, row as LocalItem);
            const sku = normalizeText((row as LocalItem).sku);
            if (sku) cache.set(`sku:${sku}`, row as LocalItem);
        }

        for (const id of missingZohoIds) {
            if (!foundIds.has(id)) cache.set(`zoho:${id}`, null);
        }
    }

    const missingSkus = skus.filter((sku) => !cache.has(`sku:${sku}`));
    if (missingSkus.length > 0) {
        const { data, error } = await supabase
            .from('items')
            .select('id, sku, name, zoho_item_id')
            .in('sku', missingSkus);

        if (error) throw new Error(`No se pudieron resolver SKUs locales: ${error.message}`);

        const foundSkus = new Set<string>();
        for (const row of data || []) {
            const sku = normalizeText((row as LocalItem).sku);
            if (!sku) continue;
            foundSkus.add(sku);
            cache.set(`sku:${sku}`, row as LocalItem);
            const zohoItemId = normalizeText((row as LocalItem).zoho_item_id);
            if (zohoItemId) cache.set(`zoho:${zohoItemId}`, row as LocalItem);
        }

        for (const sku of missingSkus) {
            if (!foundSkus.has(sku)) cache.set(`sku:${sku}`, null);
        }
    }

    return cache;
}

async function upsertDocument(
    supabase: SupabaseLike,
    invoice: any,
    rawPayload: any
): Promise<void> {
    const zohoInvoiceId = normalizeText(invoice?.invoice_id);
    if (!zohoInvoiceId) return;

    const { error } = await supabase
        .from('zoho_invoice_sales_documents')
        .upsert({
            zoho_invoice_id: zohoInvoiceId,
            invoice_number: normalizeText(invoice?.invoice_number) || null,
            status: normalizeStatus(invoice?.status) || null,
            invoice_date: normalizeDateYmd(invoice?.date),
            customer_name: normalizeText(invoice?.customer_name) || null,
            total: parseNumber(invoice?.total, 0),
            zoho_last_modified_at: parseZohoTimestamp(invoice?.last_modified_time),
            payload: rawPayload || {},
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'zoho_invoice_id' });

    if (error) throw new Error(`No se pudo guardar documento Zoho: ${error.message}`);
}

async function replaceInvoiceLines(
    supabase: SupabaseLike,
    invoice: any,
    localItemCache: Map<string, LocalItem | null>
): Promise<number> {
    const zohoInvoiceId = normalizeText(invoice?.invoice_id);
    if (!zohoInvoiceId) return 0;

    const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
    const lookups = lineItems.map((line: any) => ({
        zohoItemId: normalizeText(line?.item_id || line?.product_id),
        sku: normalizeText(line?.sku),
    }));

    await resolveLocalItems(supabase, lookups, localItemCache);

    const deleteResult = await supabase
        .from('zoho_invoice_sales_lines')
        .delete()
        .eq('zoho_invoice_id', zohoInvoiceId);

    if (deleteResult.error) {
        throw new Error(`No se pudieron reemplazar lineas Zoho: ${deleteResult.error.message}`);
    }

    const status = normalizeStatus(invoice?.status);
    const invoiceDate = normalizeDateYmd(invoice?.date);
    if (!isActiveInvoiceStatus(status) || !invoiceDate || lineItems.length === 0) return 0;

    const rows = lineItems
        .map((line: any, index: number) => {
            const zohoItemId = normalizeText(line?.item_id || line?.product_id);
            const lineSku = normalizeText(line?.sku);
            const quantity = parseNumber(line?.quantity, 0);
            if (!zohoItemId || quantity <= 0) return null;

            const localItem = localItemCache.get(`zoho:${zohoItemId}`) || localItemCache.get(`sku:${lineSku}`) || null;
            const lineItemId = normalizeText(line?.line_item_id) || `${zohoItemId}-${index + 1}`;
            const rate = parseNumber(line?.rate, 0);
            const amount = parseNumber(line?.item_total ?? line?.total, quantity * rate);

            return {
                zoho_invoice_id: zohoInvoiceId,
                zoho_invoice_number: normalizeText(invoice?.invoice_number) || null,
                zoho_line_item_id: lineItemId,
                zoho_item_id: zohoItemId,
                local_item_id: localItem?.id || null,
                sku: normalizeText(localItem?.sku || lineSku) || null,
                item_name: normalizeText(line?.name || localItem?.name) || null,
                invoice_date: invoiceDate,
                invoice_status: status || null,
                quantity,
                rate,
                amount,
                location_id: normalizeText(line?.location_id || invoice?.location_id || line?.warehouse_id) || null,
                location_name: normalizeText(line?.location_name || invoice?.location_name || line?.warehouse_name) || null,
                zoho_last_modified_at: parseZohoTimestamp(invoice?.last_modified_time),
                payload: line || {},
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        })
        .filter(Boolean);

    if (rows.length === 0) return 0;

    const { error } = await supabase
        .from('zoho_invoice_sales_lines')
        .upsert(rows, { onConflict: 'zoho_invoice_id,zoho_line_item_id' });

    if (error) throw new Error(`No se pudieron guardar lineas Zoho: ${error.message}`);
    return rows.length;
}

export async function syncZohoInvoiceSales(options: SyncOptions): Promise<ZohoSalesSyncResult> {
    const maxPages = clampInteger(options.maxPages, 3, 1, 20);
    const perPage = clampInteger(options.perPage, 200, 1, 200);
    const maxDetails = clampInteger(options.maxDetails, 60, 1, 1000);
    const force = options.force === true;

    const result: ZohoSalesSyncResult = {
        date_start: options.dateStart,
        date_end: options.dateEnd,
        listed_invoices: 0,
        detail_requests: 0,
        skipped_unchanged: 0,
        inactive_invoices: 0,
        documents_upserted: 0,
        lines_upserted: 0,
        max_details_reached: false,
        repaired_missing_lines: 0,
        sample_invoices: [],
    };

    const localItemCache = new Map<string, LocalItem | null>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
        const query = new URLSearchParams({
            date_start: options.dateStart,
            date_end: options.dateEnd,
            page: String(page),
            per_page: String(perPage),
            sort_column: 'created_time',
            sort_order: 'D',
        });

        const listResponse = await options.zohoClient.request('GET', `/books/v3/invoices?${query.toString()}`);
        const summaries = Array.isArray(listResponse?.invoices) ? listResponse.invoices : [];
        result.listed_invoices += summaries.length;

        for (const summary of summaries) {
            if (result.sample_invoices.length >= 10) break;
            result.sample_invoices.push({
                invoice_id: normalizeText(summary?.invoice_id),
                invoice_number: normalizeText(summary?.invoice_number),
                date: normalizeText(summary?.date),
                status: normalizeStatus(summary?.status),
                last_modified_time: normalizeText(summary?.last_modified_time),
            });
        }

        const invoiceIds = summaries.map((invoice: any) => normalizeText(invoice?.invoice_id)).filter(Boolean);
        const existingMap = new Map<string, any>();
        const linesCountMap = new Map<string, number>();

        if (invoiceIds.length > 0) {
            const { data, error } = await options.supabase
                .from('zoho_invoice_sales_documents')
                .select('zoho_invoice_id, status, invoice_date, zoho_last_modified_at')
                .in('zoho_invoice_id', invoiceIds);

            if (error) throw new Error(`No se pudo leer snapshot Zoho: ${error.message}`);
            for (const row of data || []) {
                existingMap.set(normalizeText(row.zoho_invoice_id), row);
            }

            const linesResult = await options.supabase
                .from('zoho_invoice_sales_lines')
                .select('zoho_invoice_id')
                .in('zoho_invoice_id', invoiceIds);

            if (linesResult.error) {
                throw new Error(`No se pudo leer lineas snapshot Zoho: ${linesResult.error.message}`);
            }

            for (const line of linesResult.data || []) {
                const id = normalizeText((line as any).zoho_invoice_id);
                if (!id) continue;
                linesCountMap.set(id, (linesCountMap.get(id) || 0) + 1);
            }
        }

        for (const summary of summaries) {
            const invoiceId = normalizeText(summary?.invoice_id);
            if (!invoiceId) continue;

            const status = normalizeStatus(summary?.status);
            const invoiceDate = normalizeDateYmd(summary?.date);
            const lastModified = parseZohoTimestamp(summary?.last_modified_time);
            const existing = existingMap.get(invoiceId);
            const unchanged = existing
                && sameInstant(existing.zoho_last_modified_at, lastModified)
                && normalizeStatus(existing.status) === status
                && normalizeDateYmd(existing.invoice_date) === invoiceDate;
            const hasStoredLines = (linesCountMap.get(invoiceId) || 0) > 0;

            if (!force && unchanged && hasStoredLines) {
                result.skipped_unchanged += 1;
                continue;
            }

            if (!force && unchanged && !hasStoredLines) {
                result.repaired_missing_lines += 1;
            }

            if (!isActiveInvoiceStatus(status)) {
                await upsertDocument(options.supabase, summary, summary);
                const deleteResult = await options.supabase
                    .from('zoho_invoice_sales_lines')
                    .delete()
                    .eq('zoho_invoice_id', invoiceId);
                if (deleteResult.error) {
                    throw new Error(`No se pudieron limpiar lineas inactivas: ${deleteResult.error.message}`);
                }
                result.inactive_invoices += 1;
                result.documents_upserted += 1;
                continue;
            }

            if (result.detail_requests >= maxDetails) {
                result.max_details_reached = true;
                continue;
            }

            const detailResponse = await options.zohoClient.request('GET', `/books/v3/invoices/${encodeURIComponent(invoiceId)}`);
            const invoice = detailResponse?.invoice || summary;
            result.detail_requests += 1;

            await upsertDocument(options.supabase, invoice, invoice);
            result.documents_upserted += 1;
            result.lines_upserted += await replaceInvoiceLines(options.supabase, invoice, localItemCache);
        }

        hasMore = Boolean(listResponse?.page_context?.has_more_page);
        page += 1;
    }

    return result;
}
