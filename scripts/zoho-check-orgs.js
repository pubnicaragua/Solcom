/**
 * zoho-check-orgs.js
 * Prueba ambos sets de credenciales y lista organizaciones + un test de items
 */
require('dotenv').config({ path: '.env.local' });

async function tryCredentials(name, clientId, clientSecret, refreshToken) {
    console.log(`\n── Probando ${name} ──`);
    if (!clientId || !refreshToken) {
        console.log(`   ⚠️  No hay credenciales para ${name}`);
        return null;
    }

    const domains = [
        process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com',
        'https://accounts.zoho.com',
    ];

    for (const domain of [...new Set(domains)]) {
        try {
            const res = await fetch(`${domain}/oauth/v2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token',
                }).toString(),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                    const apiDomain = data.api_domain || 'https://www.zohoapis.com';
                    console.log(`   ✅ Token OK (api_domain: ${apiDomain})`);

                    // List orgs
                    const orgsRes = await fetch(`${apiDomain}/inventory/v1/organizations`, {
                        headers: { Authorization: `Zoho-oauthtoken ${data.access_token}` },
                    });
                    const orgsData = await orgsRes.json();

                    if (orgsData.organizations) {
                        for (const org of orgsData.organizations) {
                            console.log(`   📦 Org: [${org.organization_id}] ${org.name}`);

                            // Test fetching items with this org
                            const testRes = await fetch(
                                `${apiDomain}/inventory/v1/items?organization_id=${org.organization_id}&per_page=5&page=1`,
                                { headers: { Authorization: `Zoho-oauthtoken ${data.access_token}` } }
                            );
                            const testData = await testRes.json();
                            if (testData.items) {
                                const total = testData.page_context?.total || testData.items.length;
                                console.log(`      → Items accesibles: ${total} (mostrando ${testData.items.length})`);
                                for (const it of testData.items.slice(0, 3)) {
                                    console.log(`         - [${it.sku}] ${it.name} | stock: ${it.stock_on_hand}`);
                                }
                            } else {
                                console.log(`      → Error: ${testData.message || JSON.stringify(testData).substring(0, 100)}`);
                            }
                        }
                    } else {
                        console.log(`   ❌ No organizations found: ${JSON.stringify(orgsData).substring(0, 200)}`);
                    }
                    return { token: data.access_token, apiDomain };
                }
            }
        } catch (e) {
            console.log(`   ❌ Error con ${domain}: ${e.message}`);
        }
    }
    console.log(`   ❌ No se pudo autenticar con ${name}`);
    return null;
}

async function main() {
    console.log('══════════════════════════════════════════════════');
    console.log('   DIAGNÓSTICO DE CONEXIÓN ZOHO');
    console.log('══════════════════════════════════════════════════');

    console.log(`\n   ZOHO_BOOKS_ORGANIZATION_ID en .env: ${process.env.ZOHO_BOOKS_ORGANIZATION_ID}`);

    await tryCredentials(
        'ZOHO_BOOKS',
        process.env.ZOHO_BOOKS_CLIENT_ID,
        process.env.ZOHO_BOOKS_CLIENT_SECRET,
        process.env.ZOHO_BOOKS_REFRESH_TOKEN,
    );

    await tryCredentials(
        'ZOHO (Inventory)',
        process.env.ZOHO_CLIENT_ID,
        process.env.ZOHO_CLIENT_SECRET,
        process.env.ZOHO_REFRESH_TOKEN,
    );

    console.log('\n══════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
