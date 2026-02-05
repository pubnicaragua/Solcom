export interface ZohoAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountOwner: string;
  appLinkName: string;
}

export interface ZohoBooksConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
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

export interface ZohoBooksItem {
  item_id: string;
  name: string;
  sku: string;
  stock_on_hand: number;
  unit?: string;
  rate?: number;
  description?: string;
  last_modified_time: string;
}

export interface ZohoApiResponse<T> {
  code: number;
  data: T[];
  message?: string;
}

export interface ZohoBooksApiResponse<T> {
  code: number;
  message: string;
  items?: T[];
  item?: T;
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

