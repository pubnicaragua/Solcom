import type { ZohoBooksConfig, ZohoBooksItem, ZohoBooksApiResponse } from './types';

export class ZohoBooksClient {
    private config: ZohoBooksConfig;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;
    private apiDomain: string = 'https://www.zohoapis.com'; // Default, will be updated after auth

    constructor(config: ZohoBooksConfig) {
        this.config = config;
    }

    private async getAccessToken(): Promise<string | null> {
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Detect region from environment or default to .com
        const authDomain = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';

        const response = await fetch(`${authDomain}/oauth/v2/token`, {
            method: 'POST',
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zoho Books auth failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token || null;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

        // Use the api_domain returned by Zoho (this is region-specific)
        if (data.api_domain) {
            this.apiDomain = data.api_domain;
        }

        return this.accessToken;
    }

    async fetchItems(): Promise<ZohoBooksItem[]> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        let allItems: ZohoBooksItem[] = [];
        let page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            const response = await fetch(
                `${this.apiDomain}/books/v3/items?organization_id=${organizationId}&page=${page}&per_page=200`,
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${token}`,
                    },
                    cache: 'no-store',
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Zoho Books API error: ${response.status} - ${errorText.substring(0, 200)}`);
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

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zoho Books API error: ${response.status} - ${errorText}`);
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
