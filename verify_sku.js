const https = require('https');

const SKU = process.argv[2];
if (!SKU) {
  console.error("Uso: node verify_sku.js <SKU>");
  process.exit(1);
}

// Pegar cookie si usas endpoints protegidos de Vercel
const COOKIE = "sb-pknkpvysiarfxvrhjqcx-auth-token=%7B%22access_token%22%3A%22eyJhbGciOiJFUzI1NiIsImtpZCI6IjU4MjZkYzU5LWM4YjEtNGNlMC1hMzZhLTdjNDQyM2ZkOTk5NSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3BrbmtwdnlzaWFyZnh2cmhqcWN4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI3NGI1YzgxOC1hZjE2LTRkMjUtOWQ0My05N2E1ZGE0MzJiOWMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc5MjExNzQxLCJpYXQiOjE3NzkyMDgxNDEsImVtYWlsIjoiZGV2amFpcnNlYmFzMDZAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiU2ViYXN0aWFuRGV2Iiwicm9sZSI6Im9wZXJhdG9yIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NzkyMDgxNDF9XSwic2Vzc2lvbl9pZCI6IjI0MjQ0ZmQzLTU1OTQtNGVmOC1hYzE2LTg1YzcyZTMwNTgyMSIsImlzX2Fub255bW91cyI6ZmFsc2V9.1ZjSl3xrpPx0fyyS5F4zzACRANPIz2D62jwoBXiDI-m3nAFPIl8sjIEajv7ITw479oRTnqrZZ_elRwqNCPJGDA%22%2C%22token_type%22%3A%22bearer%22%2C%22expires_in%22%3A3600%2C%22expires_at%22%3A1779211741%2C%22refresh_token%22%3A%22icw7pg2asctd%22%2C%22user%22%3A%7B%22id%22%3A%2274b5c818-af16-4d25-9d43-97a5da432b9c%22%2C%22aud%22%3A%22authenticated%22%2C%22role%22%3A%22authenticated%22%2C%22email%22%3A%22devjairsebas06%40gmail.com%22%2C%22email_confirmed_at%22%3A%222026-02-19T15%3A24%3A55.50596Z%22%2C%22phone%22%3A%22%22%2C%22confirmed_at%22%3A%222026-02-19T15%3A24%3A55.50596Z%22%2C%22last_sign_in_at%22%3A%222026-05-19T16%3A29%3A01.641846629Z%22%2C%22app_metadata%22%3A%7B%22provider%22%3A%22email%22%2C%22providers%22%3A%5B%22email%22%5D%7D%2C%22user_metadata%22%3A%7B%22email_verified%22%3Atrue%2C%22full_name%22%3A%22SebastianDev%22%2C%22role%22%3A%22operator%22%7D%2C%22identities%22%3A%5B%7B%22identity_id%22%3A%229fc4b41a-aa4a-48bb-bf6e-f8b8ea772899%22%2C%22id%22%3A%2274b5c818-af16-4d25-9d43-97a5da432b9c%22%2C%22user_id%22%3A%2274b5c818-af16-4d25-9d43-97a5da432b9c%22%2C%22identity_data%22%3A%7B%22email%22%3A%22devjairsebas06%40gmail.com%22%2C%22email_verified%22%3Afalse%2C%22phone_verified%22%3Afalse%2C%22sub%22%3A%2274b5c818-af16-4d25-9d43-97a5da432b9c%22%7D%2C%22provider%22%3A%22email%22%2C%22last_sign_in_at%22%3A%222026-02-19T15%3A24%3A55.490332Z%22%2C%22created_at%22%3A%222026-02-19T15%3A24%3A55.490411Z%22%2C%22updated_at%22%3A%222026-02-19T15%3A24%3A55.490411Z%22%2C%22email%22%3A%22devjairsebas06%40gmail.com%22%7D%5D%2C%22created_at%22%3A%222026-02-19T15%3A24%3A55.438307Z%22%2C%22updated_at%22%3A%222026-05-19T16%3A29%3A01.816905Z%22%2C%22is_anonymous%22%3Afalse%7D%2C%22weak_password%22%3Anull%7D";

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  console.log(`Buscando SKU: ${SKU}...`);
  
  // 1. Verificar en Zoho (no requiere cookie)
  try {
    const resZoho = await request(`https://solcom-erp.vercel.app/api/debug/verify-item?sku=${SKU}`);
    console.log("\n--- RESULTADO EN ZOHO ---");
    console.log(`Status: ${resZoho.status}`);
    console.log(JSON.stringify(resZoho.body, null, 2));
  } catch (err) {
    console.error("Error consultando Zoho:", err.message);
  }

  // 2. Verificar en DB local/produccion (requiere cookie)
  try {
    const options = {
      headers: { 'Cookie': COOKIE }
    };
    const resLocal = await request(`https://solcom-erp.vercel.app/api/inventory?search=${SKU}`, options);
    console.log("\n--- RESULTADO EN INVENTARIO LOCAL (DB) ---");
    console.log(`Status: ${resLocal.status}`);
    console.log(JSON.stringify(resLocal.body, null, 2));
  } catch (err) {
    console.error("Error consultando DB:", err.message);
  }
}

run();
