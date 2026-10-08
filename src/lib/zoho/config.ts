export function normalizeZohoOrganizationId(value: unknown): string | null {
    const normalized = String(value ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '');

    if (!normalized) return null;

    if (!/^\d+$/.test(normalized)) {
        throw new Error(
            'ZOHO_BOOKS_ORGANIZATION_ID inválido: debe contener únicamente dígitos.'
        );
    }

    return normalized;
}

export function getZohoOrganizationId(): string | null {
    return normalizeZohoOrganizationId(process.env.ZOHO_BOOKS_ORGANIZATION_ID);
}

export function requireZohoOrganizationId(): string {
    const organizationId = getZohoOrganizationId();
    if (!organizationId) {
        throw new Error('Falta configurar ZOHO_BOOKS_ORGANIZATION_ID.');
    }
    return organizationId;
}
