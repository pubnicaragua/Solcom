import { NextRequest, NextResponse } from 'next/server';

function parseNumeric(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0) return null;
    return Math.floor(parsed);
}

export function getExpectedRowVersion(req: NextRequest, body: any): number | null {
    const fromHeader = req.headers.get('If-Match-Version')
        || req.headers.get('if-match-version')
        || req.headers.get('If-Match')
        || req.headers.get('if-match');

    const candidates = [
        fromHeader,
        body?.row_version,
        body?.expected_row_version,
        body?.version,
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

