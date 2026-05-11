# Documentación para Desarrollador - Sistema de IA Solcom

## Variables de Entorno Necesarias

Crea o actualiza tu archivo `.env.local` con estas variables:

DEEPSEEK_API_KEY=sk-c0c86466239346329c672768b1812428

En el archivo test-deepseek-api.ts podes visualizar cual modelo esta utilizando, que es deepseek-v4

```bash
# ========================================
# SUPABASE (Base de Datos)
# ========================================
NEXT_PUBLIC_SUPABASE_URL=https://pknkpvysiarfxvrhjqcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmtwdnlzaWFyZnh2cmhqcWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1NTc4MjQsImV4cCI6MjA1MjEzMzgyNH0.wJRjE_fxNEzBMDy4Hx8Wy7Yv8pJNVQoTvhHNQjDjqJE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbmtwdnlzaWFyZnh2cmhqcWN4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjU1NzgyNCwiZXhwIjoyMDUyMTMzODI0fQ.Kq1pQjYZGxQX5Zt5Zt5Zt5Zt5Zt5Zt5Zt5Zt5Zt5Zt5

# Conexión directa PostgreSQL (para scripts)
SUPABASE_DB_URL=postgresql://postgres:9J8pjZWdCUO6uQxo@db.pknkpvysiarfxvrhjqcx.supabase.co:5432/postgres

# ========================================
# MODELOS DE IA
# ========================================

# OpenAI (para visión y fallback)
OPENAI_API_KEY=tu_clave_openai_aqui

# DeepSeek (modelo principal para texto)
DEEPSEEK_API_KEY=tu_clave_deepseek_aqui

# ========================================
# SALES IQ (Zoho)
# ========================================
SALESIQ_API_KEY=Solcom_salesIq@42

# ========================================
# GOOGLE MAPS (Módulo Rutas)
# ========================================
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_clave_google_maps_aqui

# ========================================
# ZOHO INVENTORY (Sincronización)
# ========================================
ZOHO_CLIENT_ID=tu_client_id_zoho
ZOHO_CLIENT_SECRET=tu_client_secret_zoho
ZOHO_REFRESH_TOKEN=tu_refresh_token_zoho
ZOHO_ORGANIZATION_ID=tu_organization_id_zoho
```

---

## Arquitectura del Sistema de IA

### **Componentes Principales**

```
┌─────────────────────────────────────────────────────────────┐
│                    SOLCOM IA SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Mía (Chat Interno)                                      │
│     └─ /api/ai/chat                                         │
│        ├─ DeepSeek V4 Flash (texto)                         │
│        ├─ Contexto de inventario                            │
│        └─ Historial de conversación                         │
│                                                             │
│  2. Sales IQ (Chat Externo)                                 │
│     └─ /api/webhooks/salesiq/chat                           │
│        ├─ OpenAI GPT-4o-mini (actual)                       │
│        ├─ Búsqueda inteligente en inventario                │
│        └─ Respuestas en tiempo real                         │
│                                                             │
│  3. Visión (Análisis de Imágenes)                           │
│     └─ /api/ai/vision                                       │
│        └─ Desactivado (DeepSeek no soporta)                 │
│                                                             │
│  4. Audio (Transcripción)                                   │
│     └─ Web Speech API (navegador)                           │
│        └─ Gratis, sin backend                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Cómo Funciona el Webhook de Sales IQ

### **Flujo Completo**

```
1. Cliente en Sales IQ escribe: "Tienen MacBook?"
   ↓
2. Sales IQ envía POST a:
   https://solcom-erp.vercel.app/api/webhooks/salesiq/chat
   
   Body:
   {
     "message": "Tienen MacBook?",
     "visitor_id": "abc123",
     "session_id": "xyz789",
     "visitor_name": "Juan Pérez"
   }
   
   Headers:
   x-api-key: Solcom_salesIq@42
   ↓
3. Endpoint Solcom procesa:
   
   a) Valida API Key
   b) Extrae palabras clave: ["macbook"]
   c) Busca en tabla `items`:
      - Filtra por: name, sku, marca, category
      - Excluye productos eliminados (zoho_removed_at IS NULL)
      - Límite: 30 productos
   
   d) Obtiene precios de venta:
      - Busca en `item_price_profiles`
      - Perfil: "barato" (precio de venta)
      - Reemplaza precio de costo por precio de venta
   
   e) Construye contexto para IA:
      INVENTARIO ENCONTRADO:
      - MacBook Neo Gris | SKU: MBN-001 | Stock: 3 | Precio: $1500 | Marca: Apple | Color: Gris
      - MacBook Neo Plata | SKU: MBN-002 | Stock: 2 | Precio: $1500 | Marca: Apple | Color: Plata
   
   f) Llama a OpenAI GPT-4o-mini:
      System: "Sos Mía, asistente de Solis Comercial... [contexto inventario]"
      User: "Tienen MacBook?"
   
   g) OpenAI responde:
      "¡Sí tenemos! Te ofrezco el MacBook Neo Gris ($1500, quedan 3) 
       y el MacBook Neo Plata ($1500, quedan 2). ¿Cuál te interesa?"
   
   h) Registra uso en `ai_usage_logs`:
      - user_id: "salesiq_visitor"
      - model: "gpt-4o-mini"
      - tokens: 150 prompt + 80 completion = 230 total
      - metadata: { products_found: 2 }
   ↓
4. Devuelve a Sales IQ:
   {
     "reply": "¡Sí tenemos! Te ofrezco...",
     "message": "¡Sí tenemos! Te ofrezco...",
     "response": "¡Sí tenemos! Te ofrezco...",
     "products_found": 2
   }
   ↓
5. Sales IQ muestra respuesta al cliente
```

---

## Búsqueda Inteligente de Productos

### **Algoritmo de Búsqueda**

```typescript
// 1. Limpiar mensaje del usuario
const cleanMsg = userMessage
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
  .replace(/[?¿!¡.,:;()"']/g, ''); // Quitar puntuación

// 2. Filtrar palabras vacías (stopwords)
const stopWords = [
  'hay', 'tienen', 'tienes', 'quiero', 'busco', 'necesito',
  'para', 'con', 'los', 'las', 'el', 'la', 'un', 'una',
  'me', 'puede', 'puedes', 'dar', 'precio', 'de', 'en',
  'es', 'que', 'a', 'por', 'favor', 'saber', 'si',
  'hola', 'buenas', 'tardes', 'dias', 'noches'
];

const searchWords = cleanMsg
  .split(/\s+/)
  .filter(w => w.length > 1 && !stopWords.includes(w));

// 3. Buscar en base de datos
// Cada palabra debe coincidir en: name, sku, marca, o category
for (const word of searchWords) {
  query = query.or(
    `name.ilike.%${word}%,
     sku.ilike.%${word}%,
     marca.ilike.%${word}%,
     category.ilike.%${word}%`
  );
}

// 4. Obtener precios de venta (perfil "barato")
const profiles = await supabase
  .from('item_price_profiles')
  .select('item_id, unit_price')
  .in('item_id', itemIds)
  .eq('profile_code', 'barato')
  .eq('active', true);
```

### **Ejemplos de Búsqueda**

| Usuario pregunta | Palabras clave | Resultados |
|------------------|----------------|------------|
| "Tienen MacBook?" | `["macbook"]` | Todos los productos con "macbook" en nombre/sku/marca |
| "Busco laptop HP color negro" | `["laptop", "hp", "negro"]` | Laptops HP de color negro |
| "Precio de iPhone 15 Pro" | `["iphone", "15", "pro"]` | iPhone 15 Pro (todas las variantes) |
| "Hola, buenos días" | `[]` | Sin resultados (solo saludo) |

---

## Prompt del Sistema (Personalidad de Mía)

```
Sos Mía, la asistente virtual de Solis Comercial. 
Tu estilo es energético, vendedor, amable y directo al punto.
Evitás respuestas largas y aburridas, pero SIEMPRE debes ser muy informativa.

REGLAS INFLEXIBLES:
- Cuando el cliente busque un producto, SIEMPRE revísalo en el inventario.
- Si lo encuentras, DEBES enumerar las opciones exactas especificando:
  * NOMBRE COMPLETO
  * COLOR
  * PRECIO (en USD)
  * STOCK
  
- Ejemplo: "¡Sí tenemos! Te ofrezco el MacBook Neo Gris ($1500, quedan 3) 
            y el MacBook Neo Plata ($1500, quedan 2)."

- No resumas diciendo "tenemos varios" sin especificar cuáles.
- Si stock es 0, decile amablemente que no hay disponibilidad.
- Si no hay productos, sugerí opciones o preguntá por algo más.
- Respondé siempre en español, de forma conversacional.
```

---

## Registro de Uso (ai_usage_logs)

Cada consulta se registra automáticamente:

```sql
INSERT INTO ai_usage_logs (
  user_id,
  session_id,
  model,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  endpoint,
  metadata
) VALUES (
  'salesiq_visitor',
  'xyz789',
  'gpt-4o-mini',
  150,
  80,
  230,
  '/api/webhooks/salesiq/chat',
  '{"products_found": 2}'
);
```

### **Consultar Uso**

```sql
-- Uso total del día
SELECT 
  COUNT(*) as consultas,
  SUM(total_tokens) as tokens_totales,
  AVG(total_tokens) as tokens_promedio
FROM ai_usage_logs
WHERE endpoint = '/api/webhooks/salesiq/chat'
  AND created_at >= CURRENT_DATE;

-- Productos más buscados
SELECT 
  metadata->>'products_found' as productos_encontrados,
  COUNT(*) as veces
FROM ai_usage_logs
WHERE endpoint = '/api/webhooks/salesiq/chat'
GROUP BY metadata->>'products_found'
ORDER BY veces DESC;
```

---

## Costos Estimados

### **Con OpenAI GPT-4o-mini (actual)**

| Volumen | Tokens/consulta | Costo/1M tokens | Costo mensual |
|---------|-----------------|-----------------|---------------|
| 1,000 consultas | ~250 tokens | $0.15 / $0.60 | ~$0.20 |
| 10,000 consultas | ~250 tokens | $0.15 / $0.60 | ~$2.00 |
| 100,000 consultas | ~250 tokens | $0.15 / $0.60 | ~$20.00 |

### **Con DeepSeek (alternativa)**

| Volumen | Tokens/consulta | Costo/1M tokens | Costo mensual |
|---------|-----------------|-----------------|---------------|
| 1,000 consultas | ~250 tokens | $0.14 / $0.28 | ~$0.10 |
| 10,000 consultas | ~250 tokens | $0.14 / $0.28 | ~$1.00 |
| 100,000 consultas | ~250 tokens | $0.14 / $0.28 | ~$10.00 |

**Ahorro con DeepSeek:** ~50%

---

## Migrar a DeepSeek (Opcional)

Si quieres cambiar de OpenAI a DeepSeek para ahorrar costos:

### **Paso 1: Obtener API Key de DeepSeek**
1. Registrarse en https://platform.deepseek.com
2. Crear API Key
3. Agregar a `.env.local`:
   ```bash
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
   ```

### **Paso 2: Modificar el endpoint**

En `src/app/api/webhooks/salesiq/chat/route.ts`:

```typescript
// Cambiar de:
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [...],
});

// A:
const deepseek = new OpenAI({ 
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

const completion = await deepseek.chat.completions.create({
  model: 'deepseek-chat',
  messages: [...],
});
```

---

## Pruebas y Debugging

### **Probar endpoint desde navegador**

```
https://solcom-erp.vercel.app/api/webhooks/salesiq/chat?message=Tienen%20MacBook&api_key=Solcom_salesIq@42
```

### **Probar con cURL**

```bash
curl -X POST https://solcom-erp.vercel.app/api/webhooks/salesiq/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: Solcom_salesIq@42" \
  -d '{
    "message": "Tienen MacBook?",
    "visitor_id": "test123",
    "session_id": "session456"
  }'
```

### **Ver logs en Vercel**

1. Ir a https://vercel.com/dashboard
2. Seleccionar proyecto Solcom
3. Ir a "Logs"
4. Filtrar por `/api/webhooks/salesiq/chat`

---

## Tablas de Base de Datos Involucradas

### **items**
```sql
- id (uuid)
- sku (text)
- name (text)
- color (text)
- state (text)
- category (text)
- marca (text)
- stock_total (integer)
- price (numeric) -- precio de costo
- zoho_removed_at (timestamp) -- NULL si activo
```

### **item_price_profiles**
```sql
- id (uuid)
- item_id (uuid) -- FK a items
- profile_code (text) -- ej: "barato"
- unit_price (numeric) -- precio de venta
- active (boolean)
```

### **ai_usage_logs**
```sql
- id (uuid)
- user_id (text)
- session_id (text)
- model (text)
- prompt_tokens (integer)
- completion_tokens (integer)
- total_tokens (integer)
- endpoint (text)
- metadata (jsonb)
- created_at (timestamp)
```

---

## Seguridad

### **Validación de API Key**

```typescript
const apiKey = 
  body.api_key || 
  searchParams.get('api_key') || 
  request.headers.get('x-api-key') || 
  request.headers.get('authorization')?.replace('Bearer ', '');

const expectedApiKey = process.env.SALESIQ_API_KEY;
if (expectedApiKey && apiKey !== expectedApiKey) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}
```

### **Rate Limiting (Recomendado)**

Considera agregar rate limiting para evitar abuso:

```typescript
// Ejemplo con Upstash Redis
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 h"), // 100 requests por hora
});

const { success } = await ratelimit.limit(visitor_id);
if (!success) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
}
```

---

## Próximos Pasos Recomendados

1. ✅ **Configurar Sales IQ** (siguiendo GUIA_SALESIQ_INTEGRACION.md)
2. ✅ **Probar endpoint** con mensajes de prueba
3. ✅ **Verificar logs** en `ai_usage_logs`
4. ⏳ **Agregar rate limiting** para seguridad
5. ⏳ **Migrar a DeepSeek** para ahorrar costos (opcional)
6. ⏳ **Agregar análisis de sentimiento** para mejorar respuestas
7. ⏳ **Implementar caché** para consultas frecuentes

---

## Soporte

Si tienes dudas o problemas:
1. Revisa los logs en Vercel
2. Verifica que todas las variables de entorno estén configuradas
3. Prueba el endpoint directamente desde el navegador
4. Consulta la documentación de Sales IQ: https://www.zoho.com/salesiq/help/
