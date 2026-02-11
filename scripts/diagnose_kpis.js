const http = require('http');

/*
  SCRIPT DE DIAGNÓSTICO DE KPIs
  
  Este script consulta el endpoint local de KPIs y muestra el resultado del debug.
  Úsalo si el dashboard vuelve a mostrar valores en 0 para ver el error exacto.
  
  Comando: npm run check:kpis
*/

console.log('🔍 Diagnosticar KPIs - Consultando API local...');
console.log('URL: http://localhost:3000/api/inventory/kpis');
console.log('---------------------------------------------------');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/inventory/kpis',
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode} ${res.statusCode === 200 ? '✅ OK' : '❌ ERROR'}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.debug) {
                console.log('\n📊 DATOS RECIBIDOS:');
                console.log(`- Productos: ${json.totalProducts}`);
                console.log(`- Stock Total: ${json.totalStock}`);
                console.log(`- Valor Total: ${json.totalValue}`);
                console.log(`- Bodegas Activas: ${json.activeWarehouses}`);
                console.log(`- Última Sincronización: ${json.lastSync}`);

                console.log('\n🐛 INFO DE DEBUG:');
                console.log(`- Fuente: ${json.source}`);

                if (json.source === 'zoho') {
                    console.log(`- Token OK: ${json.debug.tokenOk ? 'Sí' : 'No'}`);
                    console.log(`- Org ID OK: ${json.debug.orgIdOk ? 'Sí' : 'No'}`);
                    if (json.debug.firstError) {
                        console.log(`\n❌ ERROR DETECTADO EN ZOHO:`);
                        console.log(json.debug.firstError);
                    } else {
                        console.log('\n✅ No se reportaron errores de API.');
                    }
                    if (json.debug.sampleItem) {
                        console.log('\n📦 Ejemplo de Item de Zoho:');
                        console.log(JSON.stringify(json.debug.sampleItem, null, 2));
                    }
                } else if (json.source === 'supabase') {
                    console.log(`- Mensaje: ${json.debug.message}`);
                    console.log(`- Items Procesados: ${json.debug.itemsCount}`);
                    console.log(`- Fecha Cálculo: ${json.debug.calculationTime}`);
                    console.log('\n✅ Cálculo local exitoso (sin uso de API externa).');
                }
            } else {
                console.log('Respuesta recibida (sin debug info):', data.substring(0, 200) + '...');
            }
        } catch (e) {
            console.log('Error parseando respuesta:', e.message);
            console.log('Cuerpo:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Error de conexión con localhost: ${e.message}`);
    console.error('Asegúrate de que el servidor de desarrollo esté corriendo (npm run dev).');
});

req.end();
