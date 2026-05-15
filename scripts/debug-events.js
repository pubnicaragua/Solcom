const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: events, error } = await supabase.from('inventory_events').select('*').eq('item_id', '349d3688-168c-4b5f-a450-7312d41ca3e8').eq('event_type', 'sale');
    if (error) {
        console.error(error);
        return;
    }
    console.log(events.map(e => ({ source: e.source, qty_delta: e.qty_delta, date: e.created_at })));
}
check();
