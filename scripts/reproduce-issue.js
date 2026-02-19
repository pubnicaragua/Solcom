require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkKeys() {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('--- Key Diagnosis ---');
    if (!anonKey) console.log('Checking Anon Key: MISSING');
    else console.log('Checking Anon Key: Present');

    if (!serviceKey) console.log('Checking Service Key: MISSING');
    else console.log('Checking Service Key: Present');

    if (anonKey && serviceKey) {
        if (anonKey === serviceKey) {
            console.error('CRITICAL ERROR: Keys are identical!');
        } else {
            console.log('Keys are different.');

            try {
                const parts = serviceKey.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    console.log('Service Key Role Claim:', payload.role);
                    if (payload.role !== 'service_role') {
                        console.error('ERROR: Service Key has role "' + payload.role + '". It MUST be "service_role"!');
                    } else {
                        console.log('Service Key Role is correct ("service_role").');
                    }
                } else {
                    console.error('ERROR: Service Key is not a valid JWT (does not have 3 parts).');
                }
            } catch (e) {
                console.error('Error decoding JWT:', e.message);
            }
        }
    }
}

checkKeys();
