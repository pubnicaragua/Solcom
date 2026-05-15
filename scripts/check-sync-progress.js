const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkProgress() {
    // Count items updated since the sync started (roughly 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { count, error } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .gt('updated_at', oneHourAgo);
    
    if (error) {
        console.error(error);
        return;
    }

    const { data: lastItem } = await supabase
        .from('items')
        .select('name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

    console.log(`Total items synced in this session: ${count} / 1877`);
    console.log(`Percentage: ${((count / 1877) * 100).toFixed(1)}%`);
    if (lastItem && lastItem.length > 0) {
        console.log(`Last item processed: ${lastItem[0].name}`);
        console.log(`Timestamp: ${lastItem[0].updated_at}`);
    }
}
checkProgress();
