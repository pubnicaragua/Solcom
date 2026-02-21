import dotenv from 'dotenv';
import { getZohoAccessToken } from './src/lib/zoho/inventory-utils';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

async function testFetchSerials() {
    try {
        const auth = await getZohoAccessToken();
        const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl!, supabaseKey!);

        const { data: items, error } = await supabase.from('items').select('zoho_item_id').not('zoho_item_id', 'is', null).limit(1);

        if (error || !items || items.length === 0) {
            console.error('Failed to fetch item:', error || 'No items found');
            return;
        }

        const itemId = items[0].zoho_item_id;

        console.log('Testing with Item ID:', itemId);

        const url = `https://${auth.apiDomain}/inventory/v1/items/serialnumbers?organization_id=${organizationId}&item_id=${itemId}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${auth.accessToken}` }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2).substring(0, 1500));
    } catch (e) {
        console.error(e);
    }
}
testFetchSerials();
