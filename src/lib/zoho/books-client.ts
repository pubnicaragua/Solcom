import type { ZohoBooksConfig, ZohoBooksItem, ZohoBooksApiResponse } from './types';

export class ZohoBooksClient {
    private config: ZohoBooksConfig;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor(config: ZohoBooksConfig) {
        this.config = config;
    }

    private async getAccessToken(): Promise<string | null> {
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
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
            throw new Error(`Zoho Books auth failed: ${response.status}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token || null;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

        return this.accessToken;
    }

    async fetchItems(): Promise<ZohoBooksItem[]> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        const response = await fetch(`https://www.zohobooks.com/api/v3/items?organization_id=${organizationId}`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error(`Zoho Books API error: ${response.status}`);
        }

        const result: ZohoBooksApiResponse<ZohoBooksItem> = await response.json();
        return result.items || [];
    }

    async getItemDetails(itemId: string): Promise<ZohoBooksItem | null> {
        const token = await this.getAccessToken();
        const { organizationId } = this.config;

        const response = await fetch(`https://www.zohobooks.com/api/v3/items/${itemId}?organization_id=${organizationId}`, {
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
