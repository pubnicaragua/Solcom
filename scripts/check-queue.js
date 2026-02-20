require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    const { data: queue, error } = await supabase.from('sync_queue').select('id, zoho_item_id, status, created_at').eq('status', 'pending').order('created_at', { ascending: true });
    if (error) {
        console.error(error);
        return;
    }
    console.log("Total pending:", queue.length);
    const index = queue.findIndex(q => q.zoho_item_id === '5776851000038104696');
    console.log("Item 5776851000038104696 is at position:", (index + 1) + " of " + queue.length);
}
check();
