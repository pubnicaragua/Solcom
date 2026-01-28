# 📡 API Documentation - Solis Comercial

## Información General

**Base URL:** `https://tu-dominio.com/api`  
**Autenticación:** API Key en headers  
**Formato:** JSON  
**Charset:** UTF-8

---

## 🔐 Autenticación

Todas las solicitudes deben incluir el header de autenticación:

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

### Obtener API Key

Contacta al administrador del sistema para obtener tu API Key personalizada.

---

## 📦 Endpoints de Inventario

### 1. Consultar Inventario

Obtiene el inventario con filtros opcionales y paginación.

**Endpoint:** `GET /api/inventory`

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Número de página (default: 1) |
| `limit` | number | No | Items por página (default: 50, max: 100) |
| `search` | string | No | Búsqueda por nombre o SKU |
| `warehouse` | string | No | Filtrar por código de bodega (X1, X4, X5, etc.) |
| `state` | string | No | Filtrar por estado (nuevo, usado) |

**Ejemplo de Solicitud:**

```bash
curl -X GET "https://tu-dominio.com/api/inventory?page=1&limit=20&warehouse=X1" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Respuesta Exitosa (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "item_name": "Laptop Dell Inspiron 15",
      "color": "Negro",
      "state": "nuevo",
      "sku": "SKU-001",
      "warehouse_code": "X1",
      "warehouse_name": "Bodega X1",
      "qty": 15,
      "synced_at": "2025-01-27T15:30:00Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 235,
  "totalPages": 12
}
```

---

### 2. Obtener KPIs

Obtiene métricas clave del inventario en tiempo real.

**Endpoint:** `GET /api/inventory/kpis`

**Ejemplo de Solicitud:**

```bash
curl -X GET "https://tu-dominio.com/api/inventory/kpis" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Respuesta Exitosa (200):**

```json
{
  "totalSKUs": 235,
  "totalUnits": 1847,
  "activeWarehouses": 3,
  "lastSync": "27 Ene 2025, 15:30"
}
```

---

### 3. Exportar Inventario (CSV)

Descarga el inventario completo o filtrado en formato CSV.

**Endpoint:** `GET /api/inventory/export`

**Query Parameters:** (mismos que `/api/inventory`)

**Ejemplo de Solicitud:**

```bash
curl -X GET "https://tu-dominio.com/api/inventory/export?warehouse=X1" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o inventario.csv
```

**Respuesta:** Archivo CSV descargable

---

## 🏢 Endpoints de Bodegas

### 4. Listar Bodegas

Obtiene todas las bodegas activas del sistema.

**Endpoint:** `GET /api/warehouses`

**Ejemplo de Solicitud:**

```bash
curl -X GET "https://tu-dominio.com/api/warehouses" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Respuesta Exitosa (200):**

```json
[
  {
    "id": "uuid",
    "code": "X1",
    "name": "Bodega X1",
    "active": true,
    "created_at": "2025-01-01T00:00:00Z"
  },
  {
    "id": "uuid",
    "code": "X4",
    "name": "Bodega X4",
    "active": true,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

---

## 🔄 Endpoints de Sincronización

### 5. Sincronizar desde Zoho

Inicia una sincronización manual desde Zoho Creator.

**Endpoint:** `POST /api/zoho/sync`

**Request Body:**

```json
{
  "force": false
}
```

**Ejemplo de Solicitud:**

```bash
curl -X POST "https://tu-dominio.com/api/zoho/sync" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

**Respuesta Exitosa (200):**

```json
{
  "success": true,
  "itemsProcessed": 235,
  "message": "Sincronización completada: 235 items procesados"
}
```

**Respuesta de Error (400):**

```json
{
  "error": "Datos inválidos",
  "details": [
    {
      "field": "force",
      "message": "Expected boolean, received string"
    }
  ]
}
```

---

## 🤖 Endpoints de Agentes IA

### 6. Consultar Agente IA

Envía una consulta a los agentes de inteligencia artificial.

**Endpoint:** `POST /api/ai/chat`

**Request Body:**

```json
{
  "question": "¿Cuántas laptops Dell hay en bodega X1?",
  "agentId": "customer-service"
}
```

**Agent IDs Disponibles:**
- `customer-service` - Atención al Cliente
- `collections` - Cobranza
- `quotes` - Cotizaciones
- `invoicing` - Facturación
- `audit` - Auditoría

**Ejemplo de Solicitud:**

```bash
curl -X POST "https://tu-dominio.com/api/ai/chat" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuántas laptops Dell hay en bodega X1?",
    "agentId": "customer-service"
  }'
```

**Respuesta Exitosa (200):**

```json
{
  "answer": "Actualmente hay 15 laptops Dell Inspiron 15 disponibles en la bodega X1."
}
```

---

## 🌐 Integración con Plataformas Externas

### Integración con Páginas Web

#### Opción 1: iFrame Embebido

```html
<iframe 
  src="https://tu-dominio.com/embed/inventory?warehouse=X1" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border-radius: 8px;"
></iframe>
```

#### Opción 2: Widget JavaScript

```html
<div id="solis-inventory-widget"></div>
<script src="https://tu-dominio.com/widget.js"></script>
<script>
  SolisWidget.init({
    container: '#solis-inventory-widget',
    apiKey: 'YOUR_API_KEY',
    warehouse: 'X1',
    theme: 'dark'
  });
</script>
```

---

### Integración con Facebook/Meta

#### Messenger Bot

Configura el webhook de Facebook Messenger:

**Webhook URL:** `https://tu-dominio.com/api/webhooks/facebook`  
**Verify Token:** Contacta al administrador

**Eventos suscritos:**
- `messages`
- `messaging_postbacks`

---

### Integración con WhatsApp Business

**Webhook URL:** `https://tu-dominio.com/api/webhooks/whatsapp`

**Ejemplo de mensaje automático:**

```json
{
  "to": "+50512345678",
  "type": "text",
  "text": {
    "body": "Hola, tenemos 15 laptops Dell disponibles en bodega X1. ¿Te interesa?"
  }
}
```

---

### Integración con Aplicaciones Móviles

#### Android (Kotlin)

```kotlin
import okhttp3.*
import org.json.JSONObject

val client = OkHttpClient()
val url = "https://tu-dominio.com/api/inventory"

val request = Request.Builder()
    .url(url)
    .addHeader("Authorization", "Bearer YOUR_API_KEY")
    .build()

client.newCall(request).execute().use { response ->
    val data = JSONObject(response.body?.string())
    // Procesar datos
}
```

#### iOS (Swift)

```swift
import Foundation

let url = URL(string: "https://tu-dominio.com/api/inventory")!
var request = URLRequest(url: url)
request.setValue("Bearer YOUR_API_KEY", forHTTPHeaderField: "Authorization")

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    guard let data = data else { return }
    let inventory = try? JSONDecoder().decode(InventoryResponse.self, from: data)
    // Procesar datos
}
task.resume()
```

---

## 📱 SDKs Oficiales

### JavaScript/TypeScript

```bash
npm install @solis-comercial/sdk
```

```typescript
import { SolisClient } from '@solis-comercial/sdk';

const client = new SolisClient({
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://tu-dominio.com/api'
});

// Obtener inventario
const inventory = await client.inventory.list({
  warehouse: 'X1',
  page: 1,
  limit: 20
});

// Consultar agente IA
const response = await client.ai.chat({
  question: '¿Cuántas laptops hay?',
  agentId: 'customer-service'
});
```

### Python

```bash
pip install solis-comercial
```

```python
from solis_comercial import SolisClient

client = SolisClient(
    api_key='YOUR_API_KEY',
    base_url='https://tu-dominio.com/api'
)

# Obtener inventario
inventory = client.inventory.list(
    warehouse='X1',
    page=1,
    limit=20
)

# Consultar agente IA
response = client.ai.chat(
    question='¿Cuántas laptops hay?',
    agent_id='customer-service'
)
```

---

## ⚠️ Códigos de Error

| Código | Descripción |
|--------|-------------|
| 200 | Solicitud exitosa |
| 400 | Datos inválidos en la solicitud |
| 401 | API Key inválida o faltante |
| 403 | Sin permisos para acceder al recurso |
| 404 | Recurso no encontrado |
| 429 | Límite de solicitudes excedido |
| 500 | Error interno del servidor |

---

## 🔒 Límites de Uso (Rate Limiting)

| Plan | Solicitudes/minuto | Solicitudes/día |
|------|-------------------|-----------------|
| Free | 60 | 1,000 |
| Basic | 300 | 10,000 |
| Pro | 1,000 | 100,000 |
| Enterprise | Ilimitado | Ilimitado |

---

## 🧪 Ambiente de Pruebas (Sandbox)

**Base URL:** `https://sandbox.tu-dominio.com/api`  
**API Key de prueba:** `test_sk_1234567890abcdef`

El ambiente sandbox contiene datos de prueba y no afecta la base de datos de producción.

---

## 📞 Soporte

**Email:** api@soliscomercialni.com  
**WhatsApp:** +505 1234-5678  
**Documentación:** https://docs.soliscomercialni.com  
**Status:** https://status.soliscomercialni.com

---

## 🔄 Changelog

### v1.0.0 (27 Ene 2025)
- ✅ Lanzamiento inicial
- ✅ Endpoints de inventario
- ✅ Endpoints de bodegas
- ✅ Sincronización Zoho
- ✅ Agentes IA
- ✅ Exportación CSV

---

## 📝 Ejemplos Completos

### Ejemplo 1: Consultar inventario y mostrar en página web

```html
<!DOCTYPE html>
<html>
<head>
  <title>Inventario Solis</title>
</head>
<body>
  <div id="inventory"></div>
  
  <script>
    async function loadInventory() {
      const response = await fetch('https://tu-dominio.com/api/inventory?warehouse=X1', {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY'
        }
      });
      
      const data = await response.json();
      const container = document.getElementById('inventory');
      
      data.data.forEach(item => {
        container.innerHTML += `
          <div>
            <h3>${item.item_name}</h3>
            <p>SKU: ${item.sku} | Cantidad: ${item.qty}</p>
          </div>
        `;
      });
    }
    
    loadInventory();
  </script>
</body>
</html>
```

### Ejemplo 2: Chatbot con Agente IA

```javascript
const readline = require('readline');
const https = require('https');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askAgent(question) {
  const data = JSON.stringify({
    question: question,
    agentId: 'customer-service'
  });

  const options = {
    hostname: 'tu-dominio.com',
    port: 443,
    path: '/api/ai/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const response = JSON.parse(body);
      console.log('Agente:', response.answer);
      promptUser();
    });
  });

  req.write(data);
  req.end();
}

function promptUser() {
  rl.question('Tú: ', (answer) => {
    if (answer.toLowerCase() === 'salir') {
      rl.close();
      return;
    }
    askAgent(answer);
  });
}

console.log('Chatbot iniciado. Escribe "salir" para terminar.');
promptUser();
```

---

**© 2025 Solis Comercial - ¡A tu servicio, siempre!**
