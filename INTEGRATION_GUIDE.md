# 🚀 Guía de Integración - Solis Comercial API

## ¿Por qué los clientes se conectan a nosotros?

**Ventaja estratégica:** Al proporcionar endpoints API públicos, **los clientes se conectan a nuestro sistema**, lo que nos permite:

✅ **Evitar mantenimiento futuro** de integraciones con múltiples plataformas  
✅ **Control total** sobre los datos y la seguridad  
✅ **Escalabilidad** sin límites de plataformas externas  
✅ **Independencia** de cambios en APIs de terceros  
✅ **Monetización** mediante planes de uso de API  

---

## 🎯 Casos de Uso

### 1. Página Web Corporativa

**Objetivo:** Mostrar inventario en tiempo real en el sitio web de la empresa.

**Implementación:**

```html
<!-- Opción A: iFrame Simple -->
<iframe 
  src="https://api.soliscomercialni.com/embed/inventory" 
  width="100%" 
  height="600"
></iframe>

<!-- Opción B: Widget JavaScript -->
<div id="solis-widget"></div>
<script src="https://cdn.soliscomercialni.com/widget.js"></script>
<script>
  SolisWidget.init({
    container: '#solis-widget',
    apiKey: 'pk_live_abc123',
    filters: { warehouse: 'X1' }
  });
</script>
```

**Beneficios:**
- Inventario actualizado automáticamente
- Sin necesidad de backend propio
- Diseño responsive incluido

---

### 2. Aplicación Móvil (Android/iOS)

**Objetivo:** App móvil para vendedores con consulta de inventario.

**Flujo:**
1. Usuario abre la app
2. App consulta `/api/inventory` con filtros
3. Muestra productos disponibles
4. Usuario puede generar cotización vía `/api/ai/chat`

**Ejemplo Android (Kotlin):**

```kotlin
class InventoryRepository {
    private val client = OkHttpClient()
    private val baseUrl = "https://api.soliscomercialni.com"
    
    suspend fun getInventory(warehouse: String): List<Item> {
        val request = Request.Builder()
            .url("$baseUrl/api/inventory?warehouse=$warehouse")
            .addHeader("Authorization", "Bearer ${BuildConfig.API_KEY}")
            .build()
            
        return withContext(Dispatchers.IO) {
            client.newCall(request).execute().use { response ->
                val json = JSONObject(response.body?.string())
                parseItems(json.getJSONArray("data"))
            }
        }
    }
}
```

---

### 3. Chatbot de Facebook Messenger

**Objetivo:** Bot que responde consultas de inventario vía Messenger.

**Configuración:**

1. **Crear App en Facebook Developers**
   - Ir a https://developers.facebook.com
   - Crear nueva app → Messenger
   - Configurar webhook

2. **Configurar Webhook en Solis API**
   ```
   URL: https://api.soliscomercialni.com/webhooks/facebook
   Verify Token: [solicitar al admin]
   ```

3. **Eventos a suscribir:**
   - `messages`
   - `messaging_postbacks`

**Flujo de conversación:**

```
Usuario: "Hola"
Bot: "¡Hola! Soy el asistente de Solis Comercial. ¿En qué puedo ayudarte?"

Usuario: "¿Tienen laptops Dell?"
Bot: [Consulta /api/ai/chat]
Bot: "Sí, tenemos 15 laptops Dell Inspiron 15 en bodega X1. ¿Te interesa?"

Usuario: "Sí, dame el precio"
Bot: [Consulta /api/inventory]
Bot: "El precio es $450.00 c/u. ¿Deseas una cotización?"
```

---

### 4. WhatsApp Business API

**Objetivo:** Notificaciones automáticas y consultas vía WhatsApp.

**Proveedor recomendado:** Twilio

**Setup:**

1. **Crear cuenta en Twilio**
   - https://www.twilio.com/whatsapp

2. **Configurar Webhook**
   ```
   POST https://api.soliscomercialni.com/webhooks/whatsapp
   ```

3. **Enviar mensajes programáticos:**

```javascript
const twilio = require('twilio');
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

async function notifyLowStock(product) {
  await client.messages.create({
    from: 'whatsapp:+14155238886',
    to: 'whatsapp:+50512345678',
    body: `⚠️ Stock bajo: ${product.name} - Solo quedan ${product.qty} unidades`
  });
}
```

---

### 5. Sistema POS (Punto de Venta)

**Objetivo:** Integrar inventario en tiempo real con sistema de caja.

**Flujo:**

1. Cliente compra producto
2. POS consulta `/api/inventory` para verificar stock
3. POS registra venta
4. POS actualiza inventario vía `/api/zoho/sync`

**Ejemplo integración:**

```python
import requests

class SolisPOS:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.soliscomercialni.com"
        
    def check_stock(self, sku, warehouse):
        response = requests.get(
            f"{self.base_url}/api/inventory",
            params={"search": sku, "warehouse": warehouse},
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        data = response.json()
        return data['data'][0]['qty'] if data['data'] else 0
        
    def process_sale(self, sku, qty, warehouse):
        current_stock = self.check_stock(sku, warehouse)
        if current_stock >= qty:
            # Procesar venta
            return {"success": True, "remaining": current_stock - qty}
        else:
            return {"success": False, "error": "Stock insuficiente"}
```

---

### 6. Dashboard Personalizado (Power BI / Tableau)

**Objetivo:** Visualizaciones avanzadas con datos de Solis.

**Conexión Power BI:**

1. **Obtener datos → Web**
2. **URL:** `https://api.soliscomercialni.com/api/inventory`
3. **Headers:**
   ```
   Authorization: Bearer YOUR_API_KEY
   ```

4. **Transformar datos:**
   - Power Query Editor
   - Expandir columnas JSON
   - Crear relaciones

**Métricas sugeridas:**
- Valor total de inventario por bodega
- Rotación de productos
- Productos con stock crítico
- Tendencias de sincronización

---

### 7. Integración con ERP Externo

**Objetivo:** Sincronizar inventario con SAP, Oracle, o ERP personalizado.

**Arquitectura:**

```
ERP → Middleware → Solis API → Supabase
```

**Ejemplo Middleware (Node.js):**

```javascript
const express = require('express');
const axios = require('axios');

const app = express();

// Sincronización cada 5 minutos
setInterval(async () => {
  // 1. Obtener datos del ERP
  const erpData = await getERPInventory();
  
  // 2. Enviar a Solis API
  await axios.post('https://api.soliscomercialni.com/api/zoho/sync', {
    items: erpData
  }, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  
  console.log('Sync completed');
}, 5 * 60 * 1000);

app.listen(3000);
```

---

### 8. Notificaciones por Email (SendGrid)

**Objetivo:** Alertas automáticas de stock bajo.

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function checkAndNotify() {
  const response = await fetch('https://api.soliscomercialni.com/api/inventory/kpis', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  
  const kpis = await response.json();
  
  if (kpis.lowStockItems > 0) {
    await sgMail.send({
      to: 'admin@empresa.com',
      from: 'alerts@soliscomercialni.com',
      subject: '⚠️ Alerta: Stock Bajo',
      html: `<h2>Hay ${kpis.lowStockItems} productos con stock bajo</h2>`
    });
  }
}

// Ejecutar cada hora
setInterval(checkAndNotify, 60 * 60 * 1000);
```

---

### 9. Integración con Google Sheets

**Objetivo:** Exportar inventario automáticamente a Google Sheets.

**Google Apps Script:**

```javascript
function importInventory() {
  const API_KEY = 'YOUR_API_KEY';
  const url = 'https://api.soliscomercialni.com/api/inventory';
  
  const options = {
    'method': 'get',
    'headers': {
      'Authorization': 'Bearer ' + API_KEY
    }
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clear();
  
  // Headers
  sheet.appendRow(['SKU', 'Producto', 'Bodega', 'Cantidad', 'Última Sync']);
  
  // Data
  data.data.forEach(item => {
    sheet.appendRow([
      item.sku,
      item.item_name,
      item.warehouse_code,
      item.qty,
      item.synced_at
    ]);
  });
}

// Trigger automático cada hora
function createTrigger() {
  ScriptApp.newTrigger('importInventory')
    .timeBased()
    .everyHours(1)
    .create();
}
```

---

### 10. Smart TV / Pantallas Digitales

**Objetivo:** Dashboard en pantallas para almacén.

```html
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard Solis</title>
  <style>
    body {
      background: #071826;
      color: #E5E7EB;
      font-family: 'Poppins', sans-serif;
      margin: 0;
      padding: 40px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 30px;
      text-align: center;
    }
    .value {
      font-size: 48px;
      font-weight: 600;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>Dashboard en Tiempo Real</h1>
  <div class="grid" id="dashboard"></div>
  
  <script>
    async function updateDashboard() {
      const response = await fetch('https://api.soliscomercialni.com/api/inventory/kpis', {
        headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
      });
      
      const kpis = await response.json();
      
      document.getElementById('dashboard').innerHTML = `
        <div class="card">
          <div>Total SKUs</div>
          <div class="value">${kpis.totalSKUs}</div>
        </div>
        <div class="card">
          <div>Total Unidades</div>
          <div class="value">${kpis.totalUnits.toLocaleString()}</div>
        </div>
        <div class="card">
          <div>Bodegas Activas</div>
          <div class="value">${kpis.activeWarehouses}</div>
        </div>
      `;
    }
    
    updateDashboard();
    setInterval(updateDashboard, 30000); // Actualizar cada 30 segundos
  </script>
</body>
</html>
```

---

## 🔐 Seguridad y Mejores Prácticas

### 1. Proteger API Keys

❌ **NUNCA hacer esto:**
```javascript
// ¡NO EXPONER EN FRONTEND!
const API_KEY = 'sk_live_abc123';
```

✅ **Hacer esto:**
```javascript
// Backend (Node.js)
app.get('/api/proxy/inventory', async (req, res) => {
  const response = await fetch('https://api.soliscomercialni.com/api/inventory', {
    headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
  });
  res.json(await response.json());
});
```

### 2. Implementar Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests
});

app.use('/api/', limiter);
```

### 3. Validar Datos

```javascript
const { z } = require('zod');

const inventorySchema = z.object({
  warehouse: z.string().optional(),
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional()
});

app.get('/inventory', (req, res) => {
  const validated = inventorySchema.parse(req.query);
  // Procesar...
});
```

---

## 📊 Monitoreo y Logs

### Implementar Logging

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'api-calls.log' })
  ]
});

async function callAPI(endpoint) {
  logger.info(`Calling ${endpoint}`);
  const response = await fetch(endpoint);
  logger.info(`Response status: ${response.status}`);
  return response;
}
```

---

## 🎓 Recursos Adicionales

- **Documentación completa:** Ver `API_DOCUMENTATION.md`
- **Ejemplos de código:** https://github.com/solis-comercial/examples
- **Status de API:** https://status.soliscomercialni.com
- **Soporte técnico:** api@soliscomercialni.com

---

**© 2025 Solis Comercial - Conectamos tu negocio al futuro**
