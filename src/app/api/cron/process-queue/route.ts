import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import { syncItemStock } from '@/lib/zoho/sync-logic';

// Service Role Client (Bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Force dynamic execution for background worker
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // Optional basic security: Ensure this is only called with a cron job secret
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('cron_secret');
    const expectedSecret = process.env.CRON_SECRET || 'solcom-cron-key-123'; // Make sure to set this in Vercel/Env

    if (cronSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const debugLog: string[] = [];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const BATCH_SIZE = 15; // Safe threshold for Vercel Hobby 10s limit and Zoho Rate Limits

    try {
        debugLog.push('--- Starting Queue Processor ---');

        // 1. Fetch pending items
        // We use lock mechanisms (for update skip locked) conceptually, but Supabase SDK doesn't support it directly in JS.
        // Instead, we just fetch a batch and immediately mark them as 'processing'.
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
            return NextResponse.json({ message: 'No pending items in queue', processed: 0, debug: debugLog });
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

        // 5. Process each item reusing the token
        let successCount = 0;
        let failCount = 0;

        for (const queueItem of pendingItems) {
            try {
                const itemDebug: string[] = [];
                // CRUCIAL: Pass the existingAuth to prevent syncItemStock from requesting a new token!
                const result = await syncItemStock(queueItem.zoho_item_id, supabase, warehouseMap, itemDebug, auth);

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

        return NextResponse.json({
            message: 'Batch processing complete',
            total: pendingItems.length,
            success: successCount,
            failed: failCount,
            debug: debugLog
        });

    } catch (error: any) {
        debugLog.push(`FATAL: ${error.message}`);
        return NextResponse.json({ error: error.message, debug: debugLog }, { status: 500 });
    }
}
