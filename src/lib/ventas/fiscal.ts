import type { ZohoTaxCatalogItem } from '@/lib/zoho/tax-catalog';

export class FiscalValidationError extends Error {
    status: number;
    code: string;
    details: any;

    constructor(message: string, code: string, status = 400, details?: any) {
        super(message);
        this.name = 'FiscalValidationError';
        this.code = code;
        this.status = status;
        this.details = details || null;
    }
}

export type FiscalLineInput = {
    item_id?: string | null;
    description?: string | null;
    quantity?: number;
    unit_price?: number;
    discount_percent?: number;
    tax_id?: string | null;
    tax_name?: string | null;
    tax_percentage?: number;
    warranty?: string | null;
};

export type FiscalLineNormalized = {
    item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    warranty: string | null;
    line_base: number;
    line_discount: number;
    line_taxable: number;
    line_tax: number;
    line_total: number;
    subtotal: number;
};

function round2(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value: unknown): number {
    return Math.max(0, Math.min(100, normalizeNumber(value, 0)));
}

export function normalizeWarranty(value: unknown): string | null {
    const text = normalizeText(value);
    return text || null;
}

export function withWarrantyInDescription(description: string, warranty?: string | null): string {
    const cleanDescription = normalizeText(description) || 'Artículo';
    const cleanWarranty = normalizeText(warranty);
    if (!cleanWarranty) return cleanDescription;
    if (cleanDescription.toLowerCase().includes('garantía')) return cleanDescription;
    return `${cleanDescription} | Garantía: ${cleanWarranty}`;
}

export function normalizeFiscalLine(params: {
    line: FiscalLineInput;
    taxCatalogMap: Map<string, ZohoTaxCatalogItem>;
    lineIndex: number;
}): FiscalLineNormalized {
    const { line, taxCatalogMap, lineIndex } = params;
    const quantity = normalizeNumber(line.quantity, NaN);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new FiscalValidationError(`Cantidad inválida en la línea ${lineIndex + 1}.`, 'INVALID_QUANTITY', 400);
    }

    const unitPrice = Math.max(0, normalizeNumber(line.unit_price, 0));
    const discountPercent = normalizePercent(line.discount_percent);
    const taxId = normalizeText(line.tax_id);
    if (!taxId) {
        throw new FiscalValidationError(`Selecciona impuesto en la línea ${lineIndex + 1}.`, 'TAX_REQUIRED', 400);
    }

    const tax = taxCatalogMap.get(taxId);
    if (!tax) {
        throw new FiscalValidationError(`Impuesto inválido en la línea ${lineIndex + 1}.`, 'INVALID_TAX_ID', 400, {
            tax_id: taxId,
            line_index: lineIndex,
        });
    }

    const lineBase = quantity * unitPrice;
    const lineDiscount = lineBase * (discountPercent / 100);
    const lineTaxable = lineBase - lineDiscount;
    const taxPercentage = Math.max(0, normalizeNumber(tax.tax_percentage, 0));
    const lineTax = lineTaxable * (taxPercentage / 100);
    const lineTotal = lineTaxable + lineTax;

    return {
        item_id: line.item_id ? String(line.item_id) : null,
        description: normalizeText(line.description) || 'Artículo',
        quantity,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        tax_id: tax.tax_id,
        tax_name: tax.tax_name,
        tax_percentage: taxPercentage,
        warranty: normalizeWarranty(line.warranty),
        line_base: round2(lineBase),
        line_discount: round2(lineDiscount),
        line_taxable: round2(lineTaxable),
        line_tax: round2(lineTax),
        line_total: round2(lineTotal),
        subtotal: round2(lineTaxable),
    };
}

export function computeFiscalTotals(lines: FiscalLineNormalized[], shippingCharge = 0) {
    const subtotal = round2(lines.reduce((sum, line) => sum + round2(line.line_taxable), 0));
    const taxAmount = round2(lines.reduce((sum, line) => sum + round2(line.line_tax), 0));
    const total = round2(subtotal + taxAmount + Math.max(0, normalizeNumber(shippingCharge, 0)));
    const effectiveTaxRate = subtotal > 0 ? round2((taxAmount / subtotal) * 100) : 0;
    const discountTotal = round2(lines.reduce((sum, line) => sum + round2(line.line_discount), 0));

    return {
        subtotal,
        tax_amount: taxAmount,
        total,
        tax_rate: effectiveTaxRate,
        discount_total: discountTotal,
    };
}
