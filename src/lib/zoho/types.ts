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
  category_name?: string;
  category_id?: string;
  last_modified_time: string;
  brand?: string;
  // Custom fields
  cf_estado?: string;
  cf_color?: string;
  cf_marca?: string;
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
  page_context?: {
    page: number;
    per_page: number;
    has_more_page: boolean;
    total: number;
    total_pages: number;
  };
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

