require('dotenv').config({ path: '.env.local' });

async function testZohoAuth() {
    console.log('🔄 Probando token de Zoho...');

    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
    const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN;
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;

    if (!clientId || !clientSecret || !refreshToken) {
        console.error('❌ Faltan credenciales en .env.local');
        return;
    }

    const domain = 'https://accounts.zoho.com';
    const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
    });

    try {
        const res = await fetch(`${domain}/oauth/v2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const text = await res.text();
        console.log(`\nRespuesta Auth (Status: ${res.status}):`);

        if (res.ok) {
            const data = JSON.parse(text);
            if (data.access_token) {
                console.log(`✅ Token de acceso generado correctamente (termina en ...${data.access_token.slice(-6)})`);
                console.log(`🌐 API Domain: ${data.api_domain}`);

                // Prueba rápida a la API de Inventory
                console.log(`\n🔄 Probando acceso a la API de Inventory con el nuevo token...`);
                const invUrl = `${data.api_domain || 'https://www.zohoapis.com'}/inventory/v1/items?organization_id=${organizationId}&per_page=1`;
                const invRes = await fetch(invUrl, {
                    headers: { Authorization: `Zoho-oauthtoken ${data.access_token}` }
                });

                if (invRes.ok) {
                    console.log(`✅ Conexión a Zoho Inventory Exitosa. Status: ${invRes.status}`);
                } else {
                    console.log(`❌ Conexión a Zoho Inventory Falló. Status: ${invRes.status}`);
                    console.log(await invRes.text());
                }

            } else {
                console.log('❌ Auth exitoso pero no retornó access_token:');
                console.log(text);
            }
        } else {
            console.log('❌ Error al pedir token:');
            console.log(text);
        }
    } catch (e) {
        console.error('❌ Error de red:', e);
    }
}

testZohoAuth();
