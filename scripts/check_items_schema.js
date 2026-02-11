const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Using anon key for read

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Fetching one item to check schema...');
    const { data, error } = await supabase.from('items').select('*').limit(1);

    if (error) {
        console.error('Error fetching item:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Item columns:', Object.keys(data[0]));
        console.log('Sample data:', data[0]);
    } else {
        console.log('No items found in table.');
    }
}

checkSchema();
