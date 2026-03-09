import { NextRequest, NextResponse } from 'next/server';

function parseNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (!Number.isInteger(parsed)) return null;
    if (parsed < 0) return null;
    return parsed;
}

export function getExpectedRowVersion(req: NextRequest, body: any): number | null {
    // Solo aceptamos versión explícita enviada en el payload.
    // Evita falsos positivos por headers/proxies y por null => 0.
    const bodyRowVersion = body
        && typeof body === 'object'
        && Object.prototype.hasOwnProperty.call(body, 'row_version')
        ? body.row_version
        : undefined;
    const bodyExpectedRowVersion = body
        && typeof body === 'object'
        && Object.prototype.hasOwnProperty.call(body, 'expected_row_version')
        ? body.expected_row_version
        : undefined;

    const candidates = [
        bodyRowVersion,
        bodyExpectedRowVersion,
    ];

    for (const candidate of candidates) {
        const parsed = parseNumeric(candidate);
        if (parsed !== null) return parsed;
    }
    return null;
}

export function getCurrentRowVersion(row: any): number | null {
    return parseNumeric(row?.row_version);
}

export function buildVersionConflictResponse(params: {
    expectedRowVersion: number;
    currentRowVersion: number | null;
    resourceId: string;
}) {
    const { expectedRowVersion, currentRowVersion, resourceId } = params;
    return NextResponse.json(
        {
            error: 'El documento fue modificado por otro usuario. Recarga antes de guardar.',
            code: 'VERSION_CONFLICT',
            expected_row_version: expectedRowVersion,
            current_row_version: currentRowVersion,
            resource_id: resourceId,
        },
        { status: 409 }
    );
}
