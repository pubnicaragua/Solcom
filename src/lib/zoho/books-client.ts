import type { ZohoBooksConfig, ZohoBooksItem, ZohoBooksApiResponse } from './types';

type SharedBooksAuth = {
    accessToken: string | null;
    expiresAt: number;
    apiDomain: string;
    authDomainUsed: string;
    inFlight: Promise<ResolvedBooksAuth> | null;
    cooldownUntil: number;
    cooldownError: string;
};

type ResolvedBooksAuth = {
    accessToken: string;
    expiresAt: number;
    apiDomain: string;
    authDomainUsed: string;
};

const BOOKS_AUTH_REFRESH_SAFETY_MS = 60_000;
const BOOKS_AUTH_RATE_LIMIT_COOLDOWN_MS = 45_000;
const BOOKS_AUTH_ERROR_COOLDOWN_MS = 8_000;
const DEFAULT_ZOHO_API_DOMAIN = 'https://www.zohoapis.com';

const sharedBooksAuthByKey = new Map<string, SharedBooksAuth>();

function normalizeDomain(raw: string): string | null {
    const value = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
    if (!value) return null;
    try {
        const parsed = new URL(value.includes('://') ? value : `https://${value}`);
        return parsed.origin;
    } catch {
        return null;
    }
}

function authDomainCandidates(rawDomain: string | undefined): string[] {
    const candidates: string[] = [];
    const normalized = rawDomain ? normalizeDomain(rawDomain) : null;
    if (normalized) {
        candidates.push(normalized);
    }

    const fallbacks = [
        'https://accounts.zoho.com',
        'https://accounts.zoho.eu',
        'https://accounts.zoho.in',
        'https://accounts.zoho.com.au',
        'https://accounts.zoho.jp',
    ];
    for (const domain of fallbacks) {
        if (!candidates.includes(domain)) {
            candidates.push(domain);
        }
    }

    return candidates;
}

function isRateLimitedAuth(status: number, rawText: string): boolean {
    if (status === 429) return true;
    const text = String(rawText || '').toLowerCase();
    return text.includes('too many requests') || text.includes('access denied');
}

function toSafeSnippet(rawText: string): string {
    return String(rawText || '').slice(0, 180).replace(/\s+/g, ' ').trim();
}

export class ZohoBooksClient {
    private config: ZohoBooksConfig;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;
    private apiDomain: string = DEFAULT_ZOHO_API_DOMAIN; // Default, will be updated after auth

    constructor(config: ZohoBooksConfig) {
        this.config = config;
    }

    private getSharedAuthKey(): string {
        return `${this.config.clientId}::${this.config.refreshToken}`;
    }

    private getSharedAuthState(): SharedBooksAuth {
        const key = this.getSharedAuthKey();
        const existing = sharedBooksAuthByKey.get(key);
        if (existing) return existing;

        const created: SharedBooksAuth = {
            accessToken: null,
            expiresAt: 0,
            apiDomain: DEFAULT_ZOHO_API_DOMAIN,
            authDomainUsed: '',
            inFlight: null,
            cooldownUntil: 0,
            cooldownError: '',
        };
        sharedBooksAuthByKey.set(key, created);
        return created;
    }

    private applyResolvedAuth(state: SharedBooksAuth, resolved: ResolvedBooksAuth) {
        state.accessToken = resolved.accessToken;
        state.expiresAt = resolved.expiresAt;
        state.apiDomain = resolved.apiDomain;
        state.authDomainUsed = resolved.authDomainUsed;
        state.cooldownUntil = 0;
        state.cooldownError = '';

        this.accessToken = resolved.accessToken;
        this.tokenExpiry = resolved.expiresAt;
        this.apiDomain = resolved.apiDomain;
    }

    private async refreshAccessToken(state: SharedBooksAuth): Promise<ResolvedBooksAuth> {
        const domains = authDomainCandidates(process.env.ZOHO_AUTH_DOMAIN);
        const errors: string[] = [];
        let rateLimited = false;

        for (const authDomain of domains) {
            const response = await fetch(`${authDomain}/oauth/v2/token`, {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    refresh_token: this.config.refreshToken,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: 'refresh_token',
                }),
            });

            const rawText = await response.text();
            if (!response.ok) {
                errors.push(`${authDomain} -> ${response.status}: ${toSafeSnippet(rawText)}`);
                if (isRateLimitedAuth(response.status, rawText)) {
                    rateLimited = true;
                    break;
                }
                continue;
            }

            let data: any;
            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch {
                errors.push(`${authDomain} -> 200: invalid JSON response`);
                continue;
            }

            const accessToken = String(data?.access_token || '').trim();
            if (!accessToken) {
                errors.push(`${authDomain} -> 200 without access_token: ${toSafeSnippet(rawText)}`);
                continue;
            }

            const expiresInSecRaw = Number(data?.expires_in ?? data?.expires_in_sec ?? 3600);
            const expiresInSec = Number.isFinite(expiresInSecRaw) && expiresInSecRaw > 0
                ? expiresInSecRaw
                : 3600;
            const apiDomain = normalizeDomain(String(data?.api_domain || '')) || state.apiDomain || DEFAULT_ZOHO_API_DOMAIN;

            return {
                accessToken,
                expiresAt: Date.now() + (expiresInSec * 1000) - BOOKS_AUTH_REFRESH_SAFETY_MS,
                apiDomain,
                authDomainUsed: authDomain,
            };
        }

        const finalError = `Zoho Books auth failed on all domains. Attempts: ${errors.join(' | ')}`;
        state.cooldownError = finalError;
        state.cooldownUntil = Date.now() + (rateLimited ? BOOKS_AUTH_RATE_LIMIT_COOLDOWN_MS : BOOKS_AUTH_ERROR_COOLDOWN_MS);
        throw new Error(finalError);
    }

    private async getAccessToken(forceRefresh = false): Promise<string | null> {
        const now = Date.now();
        const state = this.getSharedAuthState();

        if (!forceRefresh && this.accessToken && now < this.tokenExpiry) {
            return this.accessToken;
        }

        if (!forceRefresh && state.accessToken && now < state.expiresAt) {
            this.accessToken = state.accessToken;
            this.tokenExpiry = state.expiresAt;
            this.apiDomain = state.apiDomain || DEFAULT_ZOHO_API_DOMAIN;
            return this.accessToken;
        }

        if (!forceRefresh && state.cooldownUntil > now) {
            throw new Error(state.cooldownError || 'Zoho Books auth temporalmente bloqueado por rate limit');
        }

        if (!forceRefresh && state.inFlight) {
            const resolved = await state.inFlight;
            this.applyResolvedAuth(state, resolved);
            return this.accessToken;
        }

        const refreshPromise = this.refreshAccessToken(state);
        if (!forceRefresh) {
            state.inFlight = refreshPromise;
        }

        try {
            const resolved = await refreshPromise;
            this.applyResolvedAuth(state, resolved);
            return this.accessToken;
        } finally {
            if (!forceRefresh) {
                state.inFlight = null;
            }
        }
    }

    private isAuthExpiredResponse(status: number, rawText: string): boolean {
        if (status !== 401) return false;
        const text = String(rawText || '').toLowerCase();
        return (
            text.includes('invalid oauth') ||
            text.includes('invalid token') ||
            text.includes('token expired') ||
            text.includes('expired token')
        );
    }

    async fetchItems(queryParams: string = ''): Promise<ZohoBooksItem[]> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        let allItems: ZohoBooksItem[] = [];
        let page = 1;
        let hasMorePages = true;
        let loopCount = 0;

        while (hasMorePages && loopCount < 50) { // Safety break
            loopCount++;
            const response = await fetch(
                `${this.apiDomain}/books/v3/items?organization_id=${organizationId}&page=${page}&per_page=200${queryParams ? '&' + queryParams : ''}`,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`,
                    },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Zoho Books API error (${this.apiDomain}): ${response.status} - ${errorText.substring(0, 200)}`);
            }

            const result: ZohoBooksApiResponse<ZohoBooksItem> = await response.json();
            const items = result.items || [];
            allItems = allItems.concat(items);

            // Check if there are more pages
            if (result.page_context?.has_more_page) {
                page++;
            } else {
                hasMorePages = false;
            }
        }

        return allItems;
    }

    async getItemDetails(itemId: string): Promise<ZohoBooksItem | null> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        const response = await fetch(`${this.apiDomain}/books/v3/items/${itemId}?organization_id=${organizationId}`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Zoho Books API error: ${response.status}`);
        }

        const result: ZohoBooksApiResponse<ZohoBooksItem> = await response.json();
        return result.item || null;
    }

    async getItemLocationDetails(itemId: string): Promise<any[]> {
        const result = await this.request('GET', `/inventory/v1/items/${itemId}/locationdetails`);
        return result?.item_location_details?.locations || [];
    }

    async request(method: string, endpoint: string, data?: any): Promise<any> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        const joiner = endpoint.includes('?') ? '&' : '?';
        const url = `${this.apiDomain}${endpoint}${joiner}organization_id=${organizationId}`;
        const body = data ? JSON.stringify(data) : undefined;

        const doFetch = (accessToken: string | null) =>
            fetch(url, {
                method,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken || ''}`,
                    'Content-Type': 'application/json',
                },
                body,
                cache: 'no-store',
            });

        let response = await doFetch(token);
        if (!response.ok) {
            const firstErrorText = await response.text();
            if (this.isAuthExpiredResponse(response.status, firstErrorText)) {
                const refreshedToken = await this.getAccessToken(true);
                response = await doFetch(refreshedToken);
                if (!response.ok) {
                    const retryErrorText = await response.text();
                    throw new Error(`Zoho Books API error: ${response.status} - ${retryErrorText}`);
                }
                return response.json();
            }
            throw new Error(`Zoho Books API error: ${response.status} - ${firstErrorText}`);
        }

        return response.json();
    }

    async createInventoryAdjustment(adjustmentData: any): Promise<any> {
        return this.request('POST', '/books/v3/inventoryadjustments', adjustmentData);
    }

    // Zoho Inventory API: Create Transfer Order
    async createTransferOrder(data: any): Promise<any> {
        // Note: Transfer Orders use the Inventory API endpoint, slightly different from Books
        // But the ZohoBooksClient generic request() should handle it if we route to correct domain/path
        // Usually /inventory/v1/transferorders

        // We need to override the path to use Inventory API structure if needed.
        // The current request() appends organization_id to books/v3/....
        // But transfer orders are /inventory/v1/...
        // Let's modify request or make a specialized call.

        // Wait, current `request` assumes `this.apiDomain + endpoint`.
        // If we pass `/inventory/v1/transferorders`, it becomes `https://inventory.zoho.com/api/v1/...`
        // Actually both Books and Inventory APIs often sit on `zohoapis.com`.
        // Let's assume `zohoapis.com/inventory/v1/...` works with the same token.

        return this.request('POST', '/inventory/v1/transferorders', data);
    }

    private isInvalidUrlError(error: any): boolean {
        const message = String(error?.message || '');
        return (
            message.includes('Invalid URL Passed') ||
            message.includes('Zoho Books API error: 404')
        );
    }

    private isInvalidDateError(error: any): boolean {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('invalid value passed for date');
    }

    private formatDateYmd(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private formatDateDmy(date: Date): string {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    // Zoho Inventory API: Mark as Received
    async markTransferOrderReceived(transferOrderId: string, preferredDate?: string | null): Promise<any> {
        const endpoints = [
            `/inventory/v1/transferorders/${transferOrderId}/markastransferred`,
            `/inventory/v1/transferorders/${transferOrderId}/status/transferred`,
            `/inventory/v1/transferorders/${transferOrderId}/status/received`,
            `/inventory/v1/transferorders/${transferOrderId}/status/receive`,
            `/inventory/v1/transferorders/${transferOrderId}/received`,
            `/inventory/v1/transferorders/${transferOrderId}/receive`,
        ];

        let lastError: any = null;
        for (const endpoint of endpoints) {
            try {
                return await this.request('POST', endpoint);
            } catch (error: any) {
                if (this.isInvalidDateError(error)) {
                    const now = new Date();
                    const dateCandidates = Array.from(
                        new Set([
                            String(preferredDate || '').trim(),
                            this.formatDateYmd(now),
                            this.formatDateDmy(now),
                        ].filter(Boolean))
                    );

                    const payloads = dateCandidates.flatMap((dateValue) => ([
                        { date: dateValue },
                        { transfer_date: dateValue },
                        { transferred_date: dateValue },
                        { mark_as_transferred_date: dateValue },
                    ]));

                    for (const payload of payloads) {
                        try {
                            return await this.request('POST', endpoint, payload);
                        } catch (dateRetryError: any) {
                            if (this.isInvalidDateError(dateRetryError)) {
                                lastError = dateRetryError;
                                continue;
                            }
                            throw dateRetryError;
                        }
                    }

                    for (const dateValue of dateCandidates) {
                        const queryEndpoints = [
                            `${endpoint}?date=${encodeURIComponent(dateValue)}`,
                            `${endpoint}?transfer_date=${encodeURIComponent(dateValue)}`,
                            `${endpoint}?transferred_date=${encodeURIComponent(dateValue)}`,
                        ];
                        for (const queryEndpoint of queryEndpoints) {
                            try {
                                return await this.request('POST', queryEndpoint);
                            } catch (queryRetryError: any) {
                                if (this.isInvalidDateError(queryRetryError)) {
                                    lastError = queryRetryError;
                                    continue;
                                }
                                throw queryRetryError;
                            }
                        }
                    }

                    lastError = error;
                    continue;
                }

                if (!this.isInvalidUrlError(error)) {
                    throw error;
                }
                lastError = error;
            }
        }

        throw lastError || new Error('Zoho receive endpoint not found');
    }

    // Zoho Inventory API: List Transfer Orders
    async listTransferOrders(page = 1): Promise<any> {
        return this.request('GET', `/inventory/v1/transferorders?page=${page}&per_page=200`);
    }

    async getWarehouses(): Promise<any> {
        return this.request('GET', '/books/v3/warehouses');
    }

    async createSalesOrder(data: {
        customer_id: string;
        date: string;
        shipment_date?: string;
        reference_number?: string;
        notes?: string;
        discount?: number;
        is_discount_before_tax?: boolean;
        shipping_charge?: number;
        salesperson_name?: string;
        location_id?: string;
        discount_type?: 'item_level' | 'entity_level';
        line_items: Array<{
            item_id: string;
            quantity: number;
            rate: number;
            discount?: string | number;
            tax_id?: string;
            description?: string;
            serial_number_value?: string;
            serial_numbers?: string[];
            location_id?: string;
            warehouse_id?: string;
            item_custom_fields?: Array<{
                customfield_id: string;
                value: string | number;
            }>;
        }>;
    }): Promise<{ salesorder_id: string; salesorder_number: string }> {
        const result = await this.request('POST', '/books/v3/salesorders', data);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al crear orden de venta en Zoho');
        }
        return {
            salesorder_id: result.salesorder.salesorder_id,
            salesorder_number: result.salesorder.salesorder_number,
        };
    }

    async updateSalesOrder(
        salesorderId: string,
        data: {
            customer_id: string;
            date: string;
            shipment_date?: string;
            reference_number?: string;
            notes?: string;
            discount?: number;
            is_discount_before_tax?: boolean;
            shipping_charge?: number;
            salesperson_name?: string;
            location_id?: string;
            discount_type?: 'item_level' | 'entity_level';
            line_items: Array<{
                item_id: string;
                quantity: number;
                rate: number;
                discount?: string | number;
                tax_id?: string;
                description?: string;
                serial_number_value?: string;
                serial_numbers?: string[];
                location_id?: string;
                warehouse_id?: string;
                item_custom_fields?: Array<{
                    customfield_id: string;
                    value: string | number;
                }>;
            }>;
        }
    ): Promise<{ salesorder_id: string; salesorder_number: string }> {
        const result = await this.request('PUT', `/books/v3/salesorders/${salesorderId}`, data);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al actualizar orden de venta en Zoho');
        }
        return {
            salesorder_id: result.salesorder?.salesorder_id || salesorderId,
            salesorder_number: result.salesorder?.salesorder_number || '',
        };
    }

    private isAlreadyStatusMessage(error: any, statusKeyword: 'open' | 'void'): boolean {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('already') && message.includes(statusKeyword);
    }

    async confirmSalesOrder(salesorderId: string): Promise<void> {
        const base = `/books/v3/salesorders/${salesorderId}`;
        const attempts = [
            `${base}/status/open`,
            `${base}/submit`,
            `${base}/approve`,
            `${base}/status/open`,
        ];

        const errors: string[] = [];
        for (const endpoint of attempts) {
            try {
                const result = await this.request('POST', endpoint);
                if (result?.code === 0 || result?.code === undefined) {
                    return;
                }
                errors.push(`${endpoint}: ${String(result?.message || `code ${result?.code}`)}`);
            } catch (error: any) {
                if (this.isAlreadyStatusMessage(error, 'open')) {
                    return;
                }
                errors.push(`${endpoint}: ${String(error?.message || 'Error desconocido')}`);
            }
        }

        throw new Error(`No se pudo confirmar la OV en Zoho. ${errors.slice(0, 4).join(' | ')}`);
    }

    async voidSalesOrder(salesorderId: string): Promise<void> {
        const endpoint = `/books/v3/salesorders/${salesorderId}/status/void`;
        try {
            const result = await this.request('POST', endpoint);
            if (result?.code === 0 || result?.code === undefined) {
                return;
            }
            throw new Error(String(result?.message || `code ${result?.code || 'desconocido'}`));
        } catch (error: any) {
            if (this.isAlreadyStatusMessage(error, 'void')) {
                return;
            }
            throw error;
        }
    }

    async createInvoice(data: {
        customer_id: string;
        date: string;
        due_date?: string;
        reference_number?: string;
        notes?: string;
        discount?: number;
        is_discount_before_tax?: boolean;
        shipping_charge?: number;
        salesperson_name?: string;
        location_id?: string;
        discount_type?: 'item_level' | 'entity_level';
        line_items: Array<{
            item_id: string;
            quantity: number;
            rate: number;
            discount?: string | number;
            tax_id?: string;
            description?: string;
            serial_number_value?: string;
            serial_numbers?: string[];
            location_id?: string;
            warehouse_id?: string;
            item_custom_fields?: Array<{
                customfield_id: string;
                value: string | number;
            }>;
        }>;
    }): Promise<{ invoice_id: string; invoice_number: string }> {
        const result = await this.request('POST', '/books/v3/invoices', data);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al crear factura en Zoho');
        }
        return {
            invoice_id: result.invoice.invoice_id,
            invoice_number: result.invoice.invoice_number,
        };
    }

    async convertSalesOrderToInvoice(salesorderId: string): Promise<{ invoice_id: string; invoice_number: string }> {
        const result = await this.request('POST', `/books/v3/invoices/fromsalesorder?salesorder_id=${salesorderId}`);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al convertir orden de venta a factura en Zoho');
        }
        return {
            invoice_id: result.invoice.invoice_id,
            invoice_number: result.invoice.invoice_number,
        };
    }

    async createEstimate(data: {
        customer_id: string;
        date: string;
        expiry_date?: string;
        reference_number?: string;
        notes?: string;
        discount?: number;
        is_discount_before_tax?: boolean;
        location_id?: string;
        discount_type?: 'item_level' | 'entity_level';
        line_items: Array<{
            item_id: string;
            quantity: number;
            rate: number;
            discount?: string | number;
            tax_id?: string;
            description?: string;
            item_custom_fields?: Array<{
                customfield_id: string;
                value: string | number;
            }>;
        }>;
    }): Promise<{ estimate_id: string; estimate_number: string }> {
        const result = await this.request('POST', '/books/v3/estimates', data);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al crear estimate en Zoho');
        }
        return {
            estimate_id: result.estimate.estimate_id,
            estimate_number: result.estimate.estimate_number,
        };
    }

    async updateEstimate(data: {
        estimate_id: string;
        customer_id: string;
        date: string;
        expiry_date?: string;
        reference_number?: string;
        notes?: string;
        discount?: number;
        is_discount_before_tax?: boolean;
        location_id?: string;
        discount_type?: 'item_level' | 'entity_level';
        line_items: Array<{
            item_id: string;
            quantity: number;
            rate: number;
            discount?: string | number;
            tax_id?: string;
            description?: string;
            item_custom_fields?: Array<{
                customfield_id: string;
                value: string | number;
            }>;
        }>;
    }): Promise<{ estimate_id: string; estimate_number: string }> {
        const { estimate_id, ...payload } = data;
        const result = await this.request('PUT', `/books/v3/estimates/${estimate_id}`, payload);
        if (result.code !== 0) {
            throw new Error(result.message || 'Error al actualizar estimate en Zoho');
        }
        return {
            estimate_id: result.estimate?.estimate_id || estimate_id,
            estimate_number: result.estimate?.estimate_number || '',
        };
    }
}

export function createZohoBooksClient(): ZohoBooksClient | null {
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    if (!clientId || !clientSecret || !refreshToken || !organizationId) {
        return null;
    }

    return new ZohoBooksClient({
        clientId,
        clientSecret,
        refreshToken,
        organizationId,
    });
}
