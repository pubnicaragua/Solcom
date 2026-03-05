import { createZohoBooksClient } from '@/lib/zoho/books-client';

export interface ZohoTaxCatalogItem {
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    tax_type: string | null;
    is_value_added: boolean;
    is_editable: boolean;
    active: boolean;
}

type TaxCacheEntry = {
    expires_at: number;
    taxes: ZohoTaxCatalogItem[];
};

const TAX_CACHE_TTL_MS = 5 * 60 * 1000;
const taxCacheByOrg = new Map<string, TaxCacheEntry>();
const taxInflightByOrg = new Map<string, Promise<ZohoTaxCatalogItem[]>>();

function toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTaxRow(raw: any): ZohoTaxCatalogItem | null {
    const taxId = toText(raw?.tax_id || raw?.id);
    if (!taxId) return null;

    const taxName = toText(raw?.tax_name || raw?.name || taxId);
    const taxPercentage = Math.max(0, toNumber(raw?.tax_percentage ?? raw?.tax_percent ?? 0, 0));
    const taxType = toText(raw?.tax_type || raw?.type) || null;

    return {
        tax_id: taxId,
        tax_name: taxName || taxId,
        tax_percentage: taxPercentage,
        tax_type: taxType,
        is_value_added: toBoolean(raw?.is_value_added, false),
        is_editable: toBoolean(raw?.is_editable, true),
        active: toBoolean(raw?.is_active, true),
    };
}

async function fetchAllZohoTaxes(): Promise<ZohoTaxCatalogItem[]> {
    const client = createZohoBooksClient();
    if (!client) {
        throw new Error('Configuración de Zoho Books incompleta para cargar impuestos.');
    }

    const taxes: ZohoTaxCatalogItem[] = [];
    let page = 1;
    let hasMore = true;
    let guard = 0;

    while (hasMore && guard < 100) {
        guard += 1;
        const result = await client.request('GET', `/books/v3/settings/taxes?page=${page}&per_page=200`);
        const rows = Array.isArray(result?.taxes) ? result.taxes : [];
        for (const row of rows) {
            const normalized = normalizeTaxRow(row);
            if (normalized) taxes.push(normalized);
        }

        if (result?.page_context?.has_more_page) {
            page += 1;
        } else {
            hasMore = false;
        }
    }

    return taxes;
}

function getOrganizationKey(): string {
    return toText(process.env.ZOHO_BOOKS_ORGANIZATION_ID) || 'default';
}

export async function getZohoTaxCatalog(options?: { force_refresh?: boolean }): Promise<ZohoTaxCatalogItem[]> {
    const orgKey = getOrganizationKey();
    const now = Date.now();
    const forceRefresh = Boolean(options?.force_refresh);

    if (!forceRefresh) {
        const cached = taxCacheByOrg.get(orgKey);
        if (cached && now < cached.expires_at) {
            return cached.taxes;
        }
    }

    if (!forceRefresh && taxInflightByOrg.has(orgKey)) {
        return taxInflightByOrg.get(orgKey)!;
    }

    const requestPromise = (async () => {
        const taxes = await fetchAllZohoTaxes();
        taxCacheByOrg.set(orgKey, {
            taxes,
            expires_at: Date.now() + TAX_CACHE_TTL_MS,
        });
        return taxes;
    })();

    taxInflightByOrg.set(orgKey, requestPromise);
    try {
        return await requestPromise;
    } finally {
        taxInflightByOrg.delete(orgKey);
    }
}

export function buildTaxCatalogMap(taxes: ZohoTaxCatalogItem[]): Map<string, ZohoTaxCatalogItem> {
    const map = new Map<string, ZohoTaxCatalogItem>();
    for (const tax of taxes || []) {
        if (!tax?.tax_id) continue;
        map.set(String(tax.tax_id), tax);
    }
    return map;
}
