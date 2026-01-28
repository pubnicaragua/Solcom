export interface ZohoAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountOwner: string;
  appLinkName: string;
}

export interface ZohoInventoryItem {
  ID: string;
  ItemID: string;
  SKU: string;
  Name: string;
  Color?: string;
  State?: string;
  WarehouseCode: string;
  Quantity: number;
  LastUpdated: string;
}

export interface ZohoApiResponse<T> {
  code: number;
  data: T[];
  message?: string;
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
