import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { isSalesPriceProfilesEnabled } from '@/lib/ventas/feature-flags';

export const dynamic = 'force-dynamic';

type ParsedRow = Record<string, any>;

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeHeader(value: unknown): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeProfileCode(value: unknown): string {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return raw
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
    if (value === null || value === undefined || value === '') return fallback;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'si', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    return fallback;
}

function parsePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.max(0, value) : null;
    }

    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d.,-]/g, '');
    if (!cleaned) return null;

    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';

    let normalized = cleaned;
    if (decimalSeparator === ',') {
        normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
        normalized = normalized.replace(/,/g, '');
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, parsed);
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingTable(error: any): boolean {
    return String(error?.code || '') === '42P01';
}

function defaultProfileNameFromCode(code: string): string {
    return code
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || code;
}

function chunk<T>(values: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        result.push(values.slice(i, i + size));
    }
    return result;
}

async function fetchItemMaps(
    supabase: ReturnType<typeof createRouteHandlerClient>,
    rows: ParsedRow[],
    keyMap: Record<string, string>
) {
    const itemIds = new Set<string>();
    const skus = new Set<string>();
    const zohoIds = new Set<string>();

    for (const row of rows) {
        const itemId = normalizeText(row[keyMap.item_id]);
        const sku = normalizeText(row[keyMap.sku]);
        const zohoItemId = normalizeText(row[keyMap.zoho_item_id]);
        if (itemId) {
            if (isUuid(itemId)) {
                itemIds.add(itemId);
            } else {
                // "Item ID" puede venir desde Zoho (numérico), en ese caso es zoho_item_id
                zohoIds.add(itemId);
            }
        }
        if (sku) skus.add(sku);
        if (zohoItemId) zohoIds.add(zohoItemId);
    }

    const byId = new Map<string, string>();
    const bySku = new Map<string, string>();
    const byZoho = new Map<string, string>();

    for (const idsChunk of chunk(Array.from(itemIds), 500)) {
        const result = await (supabase as any)
            .from('items')
            .select('id, sku, zoho_item_id')
            .in('id', idsChunk);
        if (result.error) throw result.error;
        for (const row of result.data || []) {
            const id = normalizeText(row?.id);
            if (!id) continue;
            byId.set(id, id);
            const sku = normalizeText(row?.sku).toLowerCase();
            if (sku) bySku.set(sku, id);
            const zoho = normalizeText(row?.zoho_item_id);
            if (zoho) byZoho.set(zoho, id);
        }
    }

    for (const skuChunk of chunk(Array.from(skus), 500)) {
        const result = await (supabase as any)
            .from('items')
            .select('id, sku, zoho_item_id')
            .in('sku', skuChunk);
        if (result.error) throw result.error;
        for (const row of result.data || []) {
            const id = normalizeText(row?.id);
            if (!id) continue;
            const sku = normalizeText(row?.sku).toLowerCase();
            if (sku) bySku.set(sku, id);
            const zoho = normalizeText(row?.zoho_item_id);
            if (zoho) byZoho.set(zoho, id);
        }
    }

    for (const zohoChunk of chunk(Array.from(zohoIds), 500)) {
        const result = await (supabase as any)
            .from('items')
            .select('id, sku, zoho_item_id')
            .in('zoho_item_id', zohoChunk);
        if (result.error) throw result.error;
        for (const row of result.data || []) {
            const id = normalizeText(row?.id);
            if (!id) continue;
            const sku = normalizeText(row?.sku).toLowerCase();
            if (sku) bySku.set(sku, id);
            const zoho = normalizeText(row?.zoho_item_id);
            if (zoho) byZoho.set(zoho, id);
        }
    }

    return { byId, bySku, byZoho };
}

function resolveProfileCode(params: {
    rawProfileName: string;
    knownProfilesByCode: Map<string, { code: string; name: string }>;
    knownProfilesByName: Map<string, { code: string; name: string }>;
}) {
    const rawProfileName = normalizeText(params.rawProfileName);
    if (!rawProfileName) return { code: '', name: '' };

    const byName = params.knownProfilesByName.get(rawProfileName.toLowerCase());
    if (byName) return byName;

    const normalizedCode = normalizeProfileCode(rawProfileName);
    const byCode = params.knownProfilesByCode.get(normalizedCode);
    if (byCode) return byCode;

    return {
        code: normalizedCode,
        name: rawProfileName,
    };
}

async function getKnownProfiles(
    supabase: ReturnType<typeof createRouteHandlerClient>
) {
    const byCode = new Map<string, { code: string; name: string }>();
    const byName = new Map<string, { code: string; name: string }>();

    const result = await (supabase as any)
        .from('price_profiles')
        .select('code, name');

    if (result.error) {
        if (!isMissingTable(result.error)) throw result.error;
        return { byCode, byName, hasDefinitionsTable: false };
    }

    for (const row of result.data || []) {
        const code = normalizeProfileCode(row?.code);
        const name = normalizeText(row?.name) || defaultProfileNameFromCode(code);
        if (!code) continue;
        byCode.set(code, { code, name });
        byName.set(name.toLowerCase(), { code, name });
    }
    return { byCode, byName, hasDefinitionsTable: true };
}

// POST /api/pricing/profiles/import
// form-data: file, target_profile, replace, currency_code, warehouse_id
export async function POST(req: NextRequest) {
    try {
        if (!isSalesPriceProfilesEnabled()) {
            return NextResponse.json(
                { error: 'Pricing profiles deshabilitado por feature flag.' },
                { status: 404 }
            );
        }

        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'Archivo requerido.' }, { status: 400 });
        }

        const fileName = normalizeText(file.name) || 'import.xlsx';
        const targetProfileRaw = normalizeText(formData.get('target_profile'));
        const targetProfileCode = normalizeProfileCode(targetProfileRaw);
        const replaceExisting = parseBoolean(formData.get('replace'), true);
        const currencyCode = normalizeText(formData.get('currency_code')) || 'USD';
        const warehouseId = normalizeText(formData.get('warehouse_id')) || null;

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
            return NextResponse.json({ error: 'El archivo no contiene hojas.' }, { status: 400 });
        }
        const worksheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as ParsedRow[];
        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'El archivo no contiene datos.' }, { status: 400 });
        }

        const headers = Object.keys(rows[0] || {});
        const headerMap: Record<string, string> = {};
        for (const header of headers) {
            headerMap[normalizeHeader(header)] = header;
        }

        const keyMap = {
            item_id: headerMap.item_id || headerMap.id || '',
            sku: headerMap.sku || headerMap.codigo || headerMap.codigo_sku || '',
            zoho_item_id: headerMap.zoho_item_id || headerMap.item_id_zoho || headerMap.zoho_id || '',
            profile_code: headerMap.profile_code || headerMap.price_profile_code || '',
            unit_price: headerMap.pricelist_rate
                || headerMap.price_list_rate
                || headerMap.unit_price
                || headerMap.price
                || headerMap.precio
                || headerMap.tarifa
                || '',
        };

        if (!keyMap.item_id && !keyMap.sku && !keyMap.zoho_item_id) {
            return NextResponse.json(
                { error: 'El archivo debe incluir item_id, sku o zoho_item_id para identificar productos.' },
                { status: 400 }
            );
        }

        const rowBasedMode = Boolean(keyMap.profile_code && keyMap.unit_price);
        const singleProfileMode = !rowBasedMode && Boolean(targetProfileCode && keyMap.unit_price);

        // Formato Zoho export típico: SKU + PriceList Rate (sin profile_code por fila).
        // Aquí exigimos target_profile para saber a qué lista aplicar ese precio.
        if (!rowBasedMode && keyMap.unit_price && !targetProfileCode) {
            return NextResponse.json(
                { error: 'Este archivo usa una sola columna de precio. Selecciona "Aplicar a una lista específica" antes de importar.' },
                { status: 400 }
            );
        }

        const ignoredHeaders = new Set([
            keyMap.item_id,
            keyMap.sku,
            keyMap.zoho_item_id,
            keyMap.profile_code,
            keyMap.unit_price,
            headerMap.name,
            headerMap.nombre,
            headerMap.description,
            headerMap.descripcion,
            headerMap.marca,
            headerMap.color,
            headerMap.categoria,
            headerMap.stock,
            headerMap.cantidad,
            headerMap.qty,
            headerMap.cost,
            headerMap.costo,
        ].filter(Boolean));

        const matrixProfileColumns = !rowBasedMode && !singleProfileMode
            ? headers.filter((header) => {
                if (ignoredHeaders.has(header)) return false;
                const numericCount = rows.reduce((count, row) => {
                    const parsed = parsePrice(row[header]);
                    return parsed === null ? count : count + 1;
                }, 0);
                return numericCount > 0;
            })
            : [];

        if (!rowBasedMode && !singleProfileMode && matrixProfileColumns.length === 0) {
            return NextResponse.json(
                { error: 'No se detectaron columnas de precios para importar.' },
                { status: 400 }
            );
        }

        const priceTableCheck = await (supabase as any)
            .from('item_price_profiles')
            .select('id')
            .limit(1);
        if (priceTableCheck.error && isMissingTable(priceTableCheck.error)) {
            return NextResponse.json(
                { error: 'Falta migración de pricing. Ejecuta sales-pricing-profiles-v1.sql.' },
                { status: 500 }
            );
        }
        if (priceTableCheck.error) throw priceTableCheck.error;

        const knownProfiles = await getKnownProfiles(supabase);
        const profileNamesByCode = new Map<string, string>();
        const itemsByKey = await fetchItemMaps(supabase, rows, keyMap);

        const unresolvedSamples: Array<{ row: number; item_ref: string }> = [];
        const priceByCompositeKey = new Map<string, {
            item_id: string;
            warehouse_id: string | null;
            profile_code: string;
            unit_price: number;
            currency_code: string;
            active: boolean;
            metadata: Record<string, any>;
        }>();
        const importedProfileCodes = new Set<string>();

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const itemIdRaw = normalizeText(row[keyMap.item_id]);
            const skuRaw = normalizeText(row[keyMap.sku]).toLowerCase();
            const zohoItemIdRaw = normalizeText(row[keyMap.zoho_item_id]);

            // "Item ID" de Zoho export no es UUID local, por lo tanto lo tratamos como Zoho ID
            const resolvedItemId = (
                (itemIdRaw ? itemsByKey.byZoho.get(itemIdRaw) : '')
                || (skuRaw ? itemsByKey.bySku.get(skuRaw) : '')
                || (zohoItemIdRaw ? itemsByKey.byZoho.get(zohoItemIdRaw) : '')
                || ''
            );

            if (!resolvedItemId) {
                if (unresolvedSamples.length < 25) {
                    unresolvedSamples.push({
                        row: i + 2,
                        item_ref: itemIdRaw || skuRaw || zohoItemIdRaw || '(sin identificador)',
                    });
                }
                continue;
            }

            const candidates: Array<{ rawProfile: string; price: number | null }> = [];
            if (rowBasedMode) {
                candidates.push({
                    rawProfile: normalizeText(row[keyMap.profile_code]),
                    price: parsePrice(row[keyMap.unit_price]),
                });
            } else if (singleProfileMode) {
                candidates.push({
                    rawProfile: targetProfileCode,
                    price: parsePrice(row[keyMap.unit_price]),
                });
            } else {
                for (const profileHeader of matrixProfileColumns) {
                    candidates.push({
                        rawProfile: profileHeader,
                        price: parsePrice(row[profileHeader]),
                    });
                }
            }

            for (const candidate of candidates) {
                if (candidate.price === null) continue;
                const resolvedProfile = resolveProfileCode({
                    rawProfileName: candidate.rawProfile,
                    knownProfilesByCode: knownProfiles.byCode,
                    knownProfilesByName: knownProfiles.byName,
                });
                if (!resolvedProfile.code) continue;

                importedProfileCodes.add(resolvedProfile.code);
                profileNamesByCode.set(
                    resolvedProfile.code,
                    resolvedProfile.name || defaultProfileNameFromCode(resolvedProfile.code)
                );

                const key = `${resolvedItemId}::${warehouseId || ''}::${resolvedProfile.code}`;
                priceByCompositeKey.set(key, {
                    item_id: resolvedItemId,
                    warehouse_id: warehouseId,
                    profile_code: resolvedProfile.code,
                    unit_price: Number(candidate.price.toFixed(4)),
                    currency_code: currencyCode,
                    active: true,
                    metadata: {
                        source: 'xls_import',
                        file_name: fileName,
                        imported_at: new Date().toISOString(),
                    },
                });
            }
        }

        const rowsToInsert = Array.from(priceByCompositeKey.values());
        if (rowsToInsert.length === 0) {
            return NextResponse.json(
                {
                    error: 'No se encontraron filas válidas para importar.',
                    unresolved_count: unresolvedSamples.length,
                    unresolved_samples: unresolvedSamples,
                },
                { status: 400 }
            );
        }

        if (replaceExisting && importedProfileCodes.size > 0) {
            for (const profileCode of importedProfileCodes) {
                let deleteQuery = (supabase as any)
                    .from('item_price_profiles')
                    .delete()
                    .eq('profile_code', profileCode);

                deleteQuery = warehouseId
                    ? deleteQuery.eq('warehouse_id', warehouseId)
                    : deleteQuery.is('warehouse_id', null);

                const deletion = await deleteQuery;
                if (deletion.error) throw deletion.error;
            }
        }

        for (const rowsChunk of chunk(rowsToInsert, 500)) {
            const insertion = await (supabase as any)
                .from('item_price_profiles')
                .insert(rowsChunk);
            if (insertion.error) throw insertion.error;
        }

        if (knownProfiles.hasDefinitionsTable && importedProfileCodes.size > 0) {
            const definitions = Array.from(importedProfileCodes).map((code) => ({
                code,
                name: profileNamesByCode.get(code) || defaultProfileNameFromCode(code),
                currency_code: currencyCode,
                active: true,
            }));

            const defsUpsert = await (supabase as any)
                .from('price_profiles')
                .upsert(definitions, { onConflict: 'code' });
            if (defsUpsert.error && !isMissingTable(defsUpsert.error)) {
                throw defsUpsert.error;
            }
        }

        return NextResponse.json({
            success: true,
            imported_rows: rowsToInsert.length,
            profile_codes: Array.from(importedProfileCodes),
            unresolved_count: unresolvedSamples.length,
            unresolved_samples: unresolvedSamples,
            mode: rowBasedMode ? 'row_based' : (singleProfileMode ? 'single_profile' : 'matrix'),
            replaced_existing: replaceExisting,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Error interno.' },
            { status: 500 }
        );
    }
}
