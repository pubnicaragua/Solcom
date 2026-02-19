const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Checking permissions table...');
    const { data: permissions, error: pError, count: pCount } = await supabase
        .from('permissions')
        .select('*', { count: 'exact' });

    if (pError) {
        console.error('Error fetching permissions:', pError.message);
    } else {
        console.log(`Found ${pCount} permissions.`);
        if (pCount > 0) {
            console.log('Sample permission:', permissions[0]);
        }
    }

    console.log('\nChecking role_permissions table...');
    const { data: rolePermissions, error: rpError, count: rpCount } = await supabase
        .from('role_permissions')
        .select('*', { count: 'exact' });

    if (rpError) {
        console.error('Error fetching role_permissions:', rpError.message);
    } else {
        console.log(`Found ${rpCount} role_permissions.`);
    }

    console.log('\nChecking user_profiles table (to see roles)...');
    const { data: users, error: uError, count: uCount } = await supabase
        .from('user_profiles')
        .select('role', { count: 'exact' });

    if (uError) {
        console.error('Error fetching users:', uError.message);
    } else {
        const roles = users.reduce((acc, u) => {
            acc[u.role] = (acc[u.role] || 0) + 1;
            return acc;
        }, {});
        console.log(`Found ${uCount} users with roles:`, roles);
    }
}

check();
