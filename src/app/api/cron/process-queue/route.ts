// NextResponse removed — using custom jsonResponse with no-cache headers
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { syncItemStock } from '@/lib/zoho/sync-logic';

// Service Role Client (Bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Force dynamic execution, NEVER cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Helper to create response with no-cache headers
function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify({ ...data, timestamp: new Date().toISOString() }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'CDN-Cache-Control': 'no-store',
            'Vercel-CDN-Cache-Control': 'no-store',
        },
    });
}

export async function GET(request: Request) {
    // Optional basic security: Ensure this is only called with a cron job secret
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = process.env.CRON_SECRET || 'solcom-cron-key-123'; // Make sure to set this in Vercel/Env

    if (cronSecret !== expectedSecret) {
        return jsonResponse({ error: 'Unauthorized cron request' }, 401);
    }

    const debugLog: string[] = [];
    const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const BATCH_SIZE = 7; // Production confirmed: 2.3-4.0s warm. Cron every 1min keeps Vercel warm, avoiding cold starts

    try {
        debugLog.push(`--- Starting Queue Processor (Key: ${keyType}) ---`);

        // DEBUG: Count all items by status
        const { data: allItems } = await supabase.from('sync_queue').select('status');
        const statusCounts: Record<string, number> = {};
        (allItems || []).forEach((r: any) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
        debugLog.push(`Queue status counts: ${JSON.stringify(statusCounts)}`);

        // 1. Fetch pending items
        const { data: pendingItems, error: fetchErr } = await supabase
            .from('sync_queue')
            .select('id, zoho_item_id, attempts')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(BATCH_SIZE);

        if (fetchErr) {
            throw new Error(`Failed to fetch from queue: ${fetchErr.message}`);
        }

        if (!pendingItems || pendingItems.length === 0) {
            return jsonResponse({ message: 'No pending items in queue', processed: 0, debug: debugLog });
        }

        const itemIdsToProcess = pendingItems.map(item => item.id);

        // 2. Mark as processing to prevent overlapping cron jobs from taking the same items
        const { error: lockErr } = await supabase
            .from('sync_queue')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .in('id', itemIdsToProcess);

        if (lockErr) {
            throw new Error(`Failed to lock items for processing: ${lockErr.message}`);
        }

        debugLog.push(`Locked ${pendingItems.length} items for processing.`);

        // 3. Obtain Zoho Token ONLY ONCE for the entire batch
        debugLog.push('Requesting global Zoho Token for batch...');
        const auth = await getZohoAccessToken();
        if (!auth || 'error' in auth) {
            // Revert status since we couldn't even start
            await supabase.from('sync_queue').update({ status: 'pending', error: 'Zoho token error' }).in('id', itemIdsToProcess);
            throw new Error(`Global Zoho auth failed: ${(auth as any)?.error || 'Unknown'}`);
        }
        debugLog.push('Global Zoho Token obtained.');

        // 4. Load warehouses once
        const { data: warehouses } = await supabase.from('warehouses').select('id, zoho_warehouse_id, active').not('zoho_warehouse_id', 'is', null);
        const warehouseMap = new Map((warehouses || []).map((w: any) => [String(w.zoho_warehouse_id), { id: w.id, active: w.active }]));

        // Ensure auth object only has the fields syncItemStock expects
        const cleanAuth = { accessToken: auth.accessToken, apiDomain: auth.apiDomain };

        // 5. Process each item reusing the token
        let successCount = 0;
        let failCount = 0;

        for (const queueItem of pendingItems) {
            try {
                const itemDebug: string[] = [];
                // CRUCIAL: Pass the existingAuth to prevent syncItemStock from requesting a new token!
                const result = await syncItemStock(queueItem.zoho_item_id, supabase, warehouseMap, itemDebug, cleanAuth);

                // Merge item-level debug logs into global debug log for visibility
                itemDebug.forEach(line => debugLog.push(`  [${queueItem.zoho_item_id}] ${line}`));

                // Check if syncItemStock actually succeeded (it swallows errors internally)
                const hasErrors = itemDebug.some(line => line.includes('ERROR'));

                if (hasErrors || (result.snapshotsCreated === 0 && result.stockTotal === 0)) {
                    // syncItemStock failed silently — put back in queue for retry
                    failCount++;
                    const isFinalFailure = queueItem.attempts >= 3;
                    await supabase
                        .from('sync_queue')
                        .update({
                            status: isFinalFailure ? 'failed' : 'pending',
                            error: itemDebug.filter(l => l.includes('ERROR')).join(' | ') || 'Unknown silent failure',
                            updated_at: new Date().toISOString(),
                            attempts: queueItem.attempts + 1
                        })
                        .eq('id', queueItem.id);
                    debugLog.push(`❌ Silent fail ${queueItem.zoho_item_id} (attempt ${queueItem.attempts + 1})`);
                } else {
                    // Mark successful
                    await supabase
                        .from('sync_queue')
                        .update({
                            status: 'completed',
                            updated_at: new Date().toISOString(),
                            attempts: queueItem.attempts + 1
                        })
                        .eq('id', queueItem.id);

                    successCount++;
                    debugLog.push(`✅ Processed ${queueItem.zoho_item_id} (Snaps: ${result.snapshotsCreated}, Total: ${result.stockTotal})`);
                }

            } catch (err: any) {
                failCount++;
                const isFinalFailure = queueItem.attempts >= 3;
                debugLog.push(`❌ Failed ${queueItem.zoho_item_id}: ${err.message}`);

                // Mark failed or return to pending if retries left
                await supabase
                    .from('sync_queue')
                    .update({
                        status: isFinalFailure ? 'failed' : 'pending',
                        error: err.message,
                        updated_at: new Date().toISOString(),
                        attempts: queueItem.attempts + 1
                    })
                    .eq('id', queueItem.id);
            }
        }

        debugLog.push('--- Queue Processor Finished ---');

        return jsonResponse({
            message: 'Batch processing complete',
            total: pendingItems.length,
            success: successCount,
            failed: failCount,
            debug: debugLog
        });

    } catch (error: any) {
        debugLog.push(`FATAL: ${error.message}`);
        return jsonResponse({ error: error.message, debug: debugLog }, 500);
    }
}
