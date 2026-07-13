#!/usr/bin/env node
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAllQueueRows() {
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('sync_queue')
            .select('zoho_item_id, status, attempts, error, created_at, updated_at')
            .range(from, from + pageSize - 1);

        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }

    return rows;
}

async function main() {
    const maxPendingAgeMinutes = Math.max(
        1,
        Number(process.env.INVENTORY_SYNC_MAX_PENDING_AGE_MINUTES || 15)
    );
    const rows = await fetchAllQueueRows();
    const statusCounts = {};
    const pendingFrequency = new Map();

    for (const row of rows) {
        statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
        if (row.status === 'pending') {
            pendingFrequency.set(
                row.zoho_item_id,
                (pendingFrequency.get(row.zoho_item_id) || 0) + 1
            );
        }
    }

    const pendingRows = statusCounts.pending || 0;
    const uniquePending = pendingFrequency.size;
    const duplicatePending = pendingRows - uniquePending;
    const failedRows = rows.filter((row) => row.status === 'failed');
    const processingRows = rows.filter((row) => row.status === 'processing');
    const oldestPending = rows
        .filter((row) => row.status === 'pending')
        .map((row) => row.created_at)
        .filter(Boolean)
        .sort()[0] || null;
    const staleBefore = Date.now() - 10 * 60 * 1000;
    const staleProcessing = processingRows.filter(
        (row) => new Date(row.updated_at).getTime() < staleBefore
    );
    const oldestPendingAgeMinutes = oldestPending
        ? Math.floor((Date.now() - new Date(oldestPending).getTime()) / 60000)
        : 0;
    const pendingIsLate = oldestPendingAgeMinutes > maxPendingAgeMinutes;

    const summary = {
        total: rows.length,
        status: statusCounts,
        unique_pending_items: uniquePending,
        duplicate_pending_rows: duplicatePending,
        oldest_pending_at: oldestPending,
        oldest_pending_age_minutes: oldestPendingAgeMinutes,
        max_pending_age_minutes: maxPendingAgeMinutes,
        stale_processing_over_10m: staleProcessing.length,
        failed_with_error: failedRows.filter((row) => row.error).length,
        healthy: duplicatePending === 0
            && !pendingIsLate
            && failedRows.length === 0
            && staleProcessing.length === 0,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (
        duplicatePending > 0
        || pendingIsLate
        || failedRows.length > 0
        || staleProcessing.length > 0
    ) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('No se pudo diagnosticar la cola:', error.message || error);
    process.exit(2);
});
