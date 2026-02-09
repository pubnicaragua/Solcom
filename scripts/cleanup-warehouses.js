const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manually load .env if it exists
try {
    const envPath = path.resolve(__dirname, '../.env');
    console.log('Loading .env from:', envPath);
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^[\"\']|[\"\']$/g, '');
        }
    });
} catch (err) {
    console.log('Error loading .env file:', err.message);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function cleanup() {
    console.log('Fetching warehouses...');
    const { data: current, error } = await supabase.from('warehouses').select('*');
    if (error) { console.error('Supabase error:', error); return; }

    const byZohoId = new Map();
    const toDelete = [];

    for (const w of current) {
        if (!w.zoho_warehouse_id) {
            // Check if there is another one with the same code that DOES have a Zoho ID
            const hasPeer = current.some(other => other.code === w.code && other.zoho_warehouse_id && other.id !== w.id);
            if (hasPeer) {
                console.log('Deleting legacy record without Zoho ID but has peer:', w.code);
                toDelete.push(w.id);
            }
            continue;
        }

        const existing = byZohoId.get(w.zoho_warehouse_id);
        if (existing) {
            console.log(`Duplicate for Zoho ID ${w.zoho_warehouse_id}: Keeping '${existing.code}' (${existing.id}), Deleting '${w.code}' (${w.id})`);
            toDelete.push(w.id);
        } else {
            byZohoId.set(w.zoho_warehouse_id, w);
        }
    }

    if (toDelete.length > 0) {
        console.log(`Deleting ${toDelete.length} duplicate/legacy warehouses...`);
        for (let i = 0; i < toDelete.length; i += 50) {
            const batch = toDelete.slice(i, i + 50);
            await supabase.from('warehouses').delete().in('id', batch);
        }
        console.log('Deletion complete.');
    } else {
        console.log('No duplicates found.');
    }

    console.log('Cleanup finished.');
}

cleanup();
