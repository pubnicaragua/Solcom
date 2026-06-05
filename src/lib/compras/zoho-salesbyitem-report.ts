import type { ZohoBooksClient } from '@/lib/zoho/books-client';

type SupabaseLike = {
    from: (table: string) => any;
};

export type SalesByItemReportOptions = {
    supabase: SupabaseLike;
    zohoClient: ZohoBooksClient;
    dateStart: string;
    dateEnd: string;
    weeks: number;
    maxPages?: number;
    perPage?: number;
};

export type SalesByItemRestockRow = {
    item_id: string;
    sku: string;
    name: string;
    marca: string;
    category: string;
    color: string;
    state: string;
    location_name: string;
    price: number;
    stock_total: number;
    sales_sum: number;
    weekly_avg: number;
    restock_sugerido: number;
    presupuesto: number;
};

export type SalesByItemReportResult = {
    rows: SalesByItemRestockRow[];
    listed_rows: number;
    pages_read: number;
    has_more_page: boolean;
    period: {
        date_start: string;
        date_end: string;
        weeks: number;
    };
};

type LocalItem = {
    id: string;
    sku: string | null;
    name: string | null;
    marca: string | null;
    category: string | null;
    color: string | null;
    price: number | null;
    stock_total: number | null;
};

type ParsedReportRow = {
    sku: string;
    name: string;
    category: string;
    color: string;
    marca: string;
    state: string;
    locationName: string;
    quantitySold: number;
    amount: number;
    averagePrice: number;
    rate: number;
};

const CATEGORY_FIELD = 'custom_field_5776851000000094215';
const COLOR_FIELD = 'custom_field_5776851000000092037';
const BRAND_FIELD = 'custom_field_5776851000000090527';
const STATE_FIELD = 'custom_field_5776851000000090457';

const SELECT_COLUMNS = [
    { field: CATEGORY_FIELD, group: 'item' },
    { field: 'item_name', group: 'report' },
    { field: COLOR_FIELD, group: 'item' },
    { field: BRAND_FIELD, group: 'item' },
    { field: 'sku', group: 'item' },
    { field: 'quantity_sold', group: 'report' },
    { field: 'amount', group: 'report' },
    { field: 'average_price', group: 'report' },
    { field: 'location_name', group: 'branch' },
    { field: STATE_FIELD, group: 'item' },
    { field: 'rate', group: 'item' },
];

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function normalizeKey(value: unknown): string {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSkuKey(value: unknown): string {
    return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = normalizeText(value).replace(/[,$C\s]/g, '');
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getDirectRowValue(row: any, aliases: string[]): unknown {
    if (!row || typeof row !== 'object') return undefined;

    const aliasKeys = aliases.map(normalizeKey);
    for (const [key, value] of Object.entries(row)) {
        if (aliasKeys.includes(normalizeKey(key))) return value;
    }

    const cells = Array.isArray(row.cells) ? row.cells : Array.isArray(row.columns) ? row.columns : null;
    if (cells) {
        for (const cell of cells) {
            if (!cell || typeof cell !== 'object') continue;
            const field = normalizeKey((cell as any).field || (cell as any).api_name || (cell as any).name || (cell as any).label);
            if (!aliasKeys.includes(field)) continue;
            return (cell as any).value ?? (cell as any).formatted_value ?? (cell as any).text;
        }
    }

    return undefined;
}

function getRowValue(row: any, aliases: string[]): unknown {
    const direct = getDirectRowValue(row, aliases);
    if (direct !== undefined && direct !== null && normalizeText(direct) !== '') return direct;

    // Zoho report rows can split values into small namespaced objects. Avoid
    // generic `data` recursion here because response containers also use it.
    const nestedCandidates = [row?.values, row?.row, row?.item, row?.report, row?.branch].filter(Boolean);
    for (const candidate of nestedCandidates) {
        const value = getDirectRowValue(candidate, aliases);
        if (value !== undefined && value !== null && normalizeText(value) !== '') return value;
    }

    return undefined;
}

function parseReportArray(row: any[]): ParsedReportRow | null {
    if (row.length < SELECT_COLUMNS.length) return null;

    const values = row.map((cell) => {
        if (!cell || typeof cell !== 'object') return cell;
        return (cell as any).value ?? (cell as any).formatted_value ?? (cell as any).text ?? (cell as any).display_value;
    });

    const sku = normalizeText(values[4]);
    const quantitySold = parseNumber(values[5]);
    if (!sku || quantitySold <= 0) return null;

    return {
        category: normalizeText(values[0]),
        name: normalizeText(values[1]),
        color: normalizeText(values[2]),
        marca: normalizeText(values[3]),
        sku,
        quantitySold,
        amount: parseNumber(values[6]),
        averagePrice: parseNumber(values[7]),
        locationName: normalizeText(values[8]),
        state: normalizeText(values[9]),
        rate: parseNumber(values[10]),
    };
}

function parseReportRow(row: any): ParsedReportRow | null {
    if (Array.isArray(row)) return parseReportArray(row);

    const sku = normalizeText(getRowValue(row, ['sku', 'SKU', 'SKU (CODIGO DE ARTICULO)', 'SKU (CÓDIGO DE ARTÍCULO)']));
    const name = normalizeText(getRowValue(row, ['item_name', 'NOMBRE DEL ARTICULO', 'NOMBRE DEL ARTÍCULO', 'name']));
    const quantitySold = parseNumber(getRowValue(row, ['quantity_sold', 'CANTIDAD VENDIDA', 'quantity']));

    if (!sku || quantitySold <= 0) return null;

    return {
        sku,
        name,
        category: normalizeText(getRowValue(row, [CATEGORY_FIELD, 'category', 'categoria', 'CATEGORIA', 'CATEGORÍA'])),
        color: normalizeText(getRowValue(row, [COLOR_FIELD, 'color', 'COLOR'])),
        marca: normalizeText(getRowValue(row, [BRAND_FIELD, 'marca', 'brand', 'MARCA'])),
        state: normalizeText(getRowValue(row, [STATE_FIELD, 'estado', 'state', 'ESTADO'])),
        locationName: normalizeText(getRowValue(row, ['location_name', 'ubicacion', 'ubicación', 'UBICACION', 'UBICACIÓN'])),
        quantitySold,
        amount: parseNumber(getRowValue(row, ['amount', 'importe', 'IMPORTE'])),
        averagePrice: parseNumber(getRowValue(row, ['average_price', 'precio_promedio', 'PRECIO PROMEDIO'])),
        rate: parseNumber(getRowValue(row, ['rate', 'precio_de_venta', 'PRECIO DE VENTA'])),
    };
}

function collectReportRows(node: any, output: ParsedReportRow[], seen: WeakSet<object> = new WeakSet()) {
    if (!node) return;
    if (Array.isArray(node)) {
        const parsed = parseReportArray(node);
        if (parsed) {
            output.push(parsed);
            return;
        }
        for (const item of node) collectReportRows(item, output, seen);
        return;
    }
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    const parsed = parseReportRow(node);
    if (parsed) {
        output.push(parsed);
        return;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') collectReportRows(value, output, seen);
    }
}

function mergeRows(rows: ParsedReportRow[]): ParsedReportRow[] {
    const merged = new Map<string, ParsedReportRow>();

    for (const row of rows) {
        const key = normalizeSkuKey(row.sku);
        if (!key) continue;
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...row });
            continue;
        }

        const nextAmount = existing.amount + row.amount;
        const nextQty = existing.quantitySold + row.quantitySold;
        const locations = new Set([
            ...existing.locationName.split(',').map((value) => value.trim()).filter(Boolean),
            ...row.locationName.split(',').map((value) => value.trim()).filter(Boolean),
        ]);

        merged.set(key, {
            ...existing,
            name: existing.name || row.name,
            category: existing.category || row.category,
            color: existing.color || row.color,
            marca: existing.marca || row.marca,
            state: existing.state || row.state,
            locationName: Array.from(locations).join(','),
            quantitySold: nextQty,
            amount: nextAmount,
            averagePrice: nextQty > 0 ? nextAmount / nextQty : existing.averagePrice,
            rate: existing.rate || row.rate,
        });
    }

    return Array.from(merged.values());
}

async function fetchLocalItems(supabase: SupabaseLike, skus: string[]): Promise<Map<string, LocalItem>> {
    const skuKeys = new Set(skus.map(normalizeSkuKey).filter(Boolean));
    const itemMap = new Map<string, LocalItem>();

    const { data, error } = await supabase
        .from('items')
        .select('id, sku, name, marca, category, color, price, stock_total');

    if (error) throw new Error(`No se pudo leer inventario local: ${error.message}`);

    for (const row of data || []) {
        const item = row as LocalItem;
        const key = normalizeSkuKey(item.sku);
        if (key && skuKeys.has(key)) itemMap.set(key, item);
    }

    return itemMap;
}

export async function fetchSalesByItemRestock(options: SalesByItemReportOptions): Promise<SalesByItemReportResult> {
    const maxPages = clampInteger(options.maxPages, 10, 1, 50);
    const perPage = clampInteger(options.perPage, 200, 1, 200);
    const weeks = clampInteger(options.weeks, 4, 1, 52);

    const parsedRows: ParsedReportRow[] = [];
    let page = 1;
    let hasMorePage = false;

    while (page <= maxPages) {
        const query = new URLSearchParams({
            page: String(page),
            per_page: String(perPage),
            sort_order: 'A',
            sort_column: 'item_name',
            from_date: options.dateStart,
            to_date: options.dateEnd,
            filter_by: 'TransactionDate.CustomDate',
            select_columns: JSON.stringify(SELECT_COLUMNS),
            group_by: JSON.stringify([{ field: 'none', group: 'report' }]),
            usestate: 'true',
            entity_list: 'invoice',
            response_option: '1',
        });

        const response = await options.zohoClient.request('GET', `/books/v3/reports/salesbyitem?${query.toString()}`);
        const pageRows: ParsedReportRow[] = [];
        collectReportRows(response, pageRows);
        parsedRows.push(...pageRows);

        hasMorePage = Boolean(response?.page_context?.has_more_page);
        if (!hasMorePage || pageRows.length === 0) break;
        page += 1;
    }

    const mergedRows = mergeRows(parsedRows);
    const localItems = await fetchLocalItems(options.supabase, mergedRows.map((row) => row.sku));

    const restockRows = mergedRows.map((row) => {
        const local = localItems.get(normalizeSkuKey(row.sku));
        const stockTotal = Number(local?.stock_total ?? 0);
        const salesSum = Math.round(row.quantitySold * 100) / 100;
        const weeklyAvg = Math.round((salesSum / weeks) * 100) / 100;
        const price = row.rate || row.averagePrice || Number(local?.price ?? 0);
        // Restock = Ventas del Período - Stock Actual (mínimo 0)
        const restockSugerido = Math.max(Math.round((salesSum - stockTotal) * 100) / 100, 0);

        return {
            item_id: local?.id || `zoho-salesbyitem-${normalizeSkuKey(row.sku)}`,
            sku: row.sku,
            name: row.name || local?.name || row.sku,
            marca: row.marca || local?.marca || 'Sin marca',
            category: row.category || local?.category || 'Sin categoria',
            color: row.color || local?.color || 'Sin color',
            state: row.state || 'NUEVO',
            location_name: row.locationName || '',
            price,
            stock_total: stockTotal,
            sales_sum: salesSum,
            weekly_avg: weeklyAvg,
            restock_sugerido: restockSugerido,
            presupuesto: Math.round(restockSugerido * price * 100) / 100,
        };
    });

    restockRows.sort((a, b) => b.restock_sugerido - a.restock_sugerido);

    return {
        rows: restockRows,
        listed_rows: parsedRows.length,
        pages_read: page,
        has_more_page: hasMorePage,
        period: {
            date_start: options.dateStart,
            date_end: options.dateEnd,
            weeks,
        },
    };
}
