function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export type LocalInvoiceStatus = 'borrador' | 'enviada' | 'pagada' | 'vencida' | 'cancelada';

export function mapZohoInvoiceStatusToLocal(
    zohoStatus: unknown,
    fallback: LocalInvoiceStatus = 'enviada'
): LocalInvoiceStatus {
    const normalized = normalizeText(zohoStatus);
    if (!normalized) return fallback;

    if (normalized === 'draft') return 'borrador';
    if (normalized === 'sent' || normalized === 'partially_paid' || normalized === 'unpaid' || normalized === 'open') {
        return 'enviada';
    }
    if (normalized === 'paid') return 'pagada';
    if (normalized === 'overdue') return 'vencida';
    if (normalized === 'void' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'written_off') {
        return 'cancelada';
    }

    return fallback;
}

export function normalizeLocalInvoiceStatus(
    value: unknown,
    fallback: LocalInvoiceStatus = 'borrador'
): LocalInvoiceStatus {
    const normalized = normalizeText(value);
    if (normalized === 'borrador' || normalized === 'enviada' || normalized === 'pagada' || normalized === 'vencida' || normalized === 'cancelada') {
        return normalized;
    }
    return fallback;
}
