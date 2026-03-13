export interface InvoicePrefillItem {
    item_id: string;
    zoho_item_id?: string | null;
    description: string;
    quantity?: number;
    available_qty?: number | null;
    unit_price?: number;
    discount_percent?: number;
    serial_number_value?: string | null;
    tax_id?: string | null;
    tax_name?: string | null;
    tax_percentage?: number | null;
    price_profile_code?: string | null;
    warranty?: string | null;
}

export interface InvoicePrefillData {
    source_sales_order_id?: string | null;
    source_order_number?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    salesperson_id?: string | null;
    salesperson_name?: string | null;
    warehouse_id?: string | null;
    items?: InvoicePrefillItem[];
}

export const INVENTORY_INVOICE_PREFILL_STORAGE_KEY = 'inventory_invoice_prefill_v1';
