function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const value = String(raw).trim().toLowerCase();
    if (!value) return fallback;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(value)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(value)) return false;
    return fallback;
}

export function isSalesZohoRedisGuardsEnabled(): boolean {
    return parseBoolean(process.env.SALES_ZOHO_REDIS_GUARDS, false);
}

export function isSalesCartInvoicePrefillOnlyEnabled(): boolean {
    return parseBoolean(process.env.SALES_CART_INVOICE_PREFILL_ONLY, true);
}

export function isSalesPriceProfilesEnabled(): boolean {
    return parseBoolean(process.env.SALES_PRICE_PROFILES_ENABLED, false);
}

export function isSalesPickingFlowEnabled(): boolean {
    return parseBoolean(process.env.SALES_PICKING_FLOW_ENABLED, false);
}
