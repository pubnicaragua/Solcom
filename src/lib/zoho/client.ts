import type { ZohoAuthConfig, ZohoInventoryItem, ZohoApiResponse } from './types';

export class ZohoClient {
  private config: ZohoAuthConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: ZohoAuthConfig) {
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
        refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Zoho auth failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token || null;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

    return this.accessToken;
  }

  async fetchInventory(warehouseCode?: string): Promise<ZohoInventoryItem[]> {
    const token = await this.getAccessToken();
    const { accountOwner, appLinkName } = this.config;
    
    let url = `https://creator.zoho.com/api/v2/${accountOwner}/${appLinkName}/report/Inventory_Report`;
    
    if (warehouseCode) {
      url += `?criteria=WarehouseCode=="${warehouseCode}"`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Zoho API error: ${response.status}`);
    }

    const result: ZohoApiResponse<ZohoInventoryItem> = await response.json();
    return result.data || [];
  }
}

export function createZohoClient(): ZohoClient | null {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountOwner = process.env.ZOHO_ACCOUNT_OWNER;
  const appLinkName = process.env.ZOHO_APP_LINK_NAME;

  if (!clientId || !clientSecret || !refreshToken || !accountOwner || !appLinkName) {
    return null;
  }

  return new ZohoClient({
    clientId,
    clientSecret,
    refreshToken,
    accountOwner,
    appLinkName,
  });
}
