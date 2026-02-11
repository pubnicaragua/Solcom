const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/inventory/kpis/local', // Testing the NEW local endpoint
    method: 'GET',
};

console.log('🔍 Diagnosticar KPIs (LOCAL) - Consultando API...');
console.log(`URL: http://${options.hostname}:${options.port}${options.path}`);
console.log('---------------------------------------------------');

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode} ${res.statusCode === 200 ? '✅ OK' : '❌ ERROR'}`);
        try {
            const json = JSON.parse(data);
            if (json.debug) {
                console.log('\n📊 DATOS RECIBIDOS (Supabase):');
                console.log(`- Productos: ${json.totalProducts}`);
                console.log(`- Stock Total: ${json.totalStock}`);
                console.log(`- Valor Total: ${json.totalValue}`);

                console.log('\n🐛 INFO DE DEBUG:');
                console.log(`- Fuente: ${json.source}`);
                console.log(`- Mensaje: ${json.debug.message}`);
                console.log(`- Items Procesados: ${json.debug.itemsCount}`);

                if (json.source === 'supabase') {
                    // Check if count > 1000 to verify pagination works
                    if (json.totalProducts > 1000) {
                        console.log('\n✅ Paginación funcionando (más de 1000 items).');
                    } else {
                        console.log('\n⚠️ Alerta: Menos de 1000 items, verificar si es correcto o si la paginación falló.');
                    }
                }
            } else {
                console.log('Respuesta recibida (sin debug info):', data.substring(0, 200) + '...');
            }
        } catch (e) {
            console.error('Error parseando JSON:', e.message);
            console.log('Raw data:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('Error en la solicitud:', error.message);
});

req.end();
