# Guía: Conectar Solcom con Zoho Sales IQ

## El Problema Actual

Tu dev te mostró un **Flow Bot** (flujo visual con tarjetas), pero eso **NO es lo que necesitas**.

Lo que necesitas es un **Answer Bot** que conecte directamente con tu webhook.

---

## Solución: Configuración Paso a Paso

### **Paso 1: Acceder a Sales IQ**

1. Entra a **Zoho Sales IQ**
2. Ve a **Settings** (⚙️ arriba derecha)
3. Selecciona **Bots** en el menú lateral

### **Paso 2: Crear Answer Bot**

1. Click en **"+ Add Bot"**
2. Selecciona **"Answer Bot"** (NO "Flow Bot")
3. Dale un nombre: **"Mía - Asistente Solcom"**

### **Paso 3: Configurar Webhook**

En la configuración del Answer Bot:

#### **A. Webhook URL**
```
https://solcom-erp.vercel.app/api/webhooks/salesiq/chat
```

#### **B. Method**
```
POST
```

#### **C. Headers**
```
Content-Type: application/json
x-api-key: Solcom_salesIq@42
```

#### **D. Request Body Template**
```json
{
  "message": "${message.content}",
  "visitor_id": "${visitor.id}",
  "session_id": "${chat.id}",
  "visitor_name": "${visitor.name}"
}
```

#### **E. Response Mapping**

- **Response Path:** `reply`
- Esto le dice a Sales IQ que la respuesta del bot está en `response.reply`

### **Paso 4: Configurar Comportamiento**

1. **Trigger:** Selecciona cuándo activar el bot
   - Opción recomendada: **"On every message"** (en cada mensaje)
   
2. **Fallback:** Qué hacer si el webhook falla
   - Opción recomendada: **"Transfer to operator"** (transferir a operador humano)

3. **Guardar** la configuración

---

## Cómo Funciona el Flujo

```
Cliente en Sales IQ
      ↓
   Escribe: "Tienen MacBook?"
      ↓
Sales IQ envía POST a tu webhook:
{
  "message": "Tienen MacBook?",
  "visitor_id": "abc123",
  "session_id": "xyz789"
}
      ↓
Tu endpoint (Solcom):
  1. Busca "MacBook" en inventario
  2. Encuentra productos
  3. Llama a OpenAI con contexto
  4. Genera respuesta inteligente
      ↓
Devuelve a Sales IQ:
{
  "reply": "¡Sí tenemos! MacBook Neo Gris ($1500, 3 en stock)...",
  "products_found": 2
}
      ↓
Sales IQ muestra la respuesta al cliente
```

---

## Diferencia: Flow Bot vs Answer Bot

### **Flow Bot (lo que te mostró tu dev)**
- ❌ Flujo visual con tarjetas
- ❌ Requiere programar cada paso manualmente
- ❌ No es flexible
- ❌ Difícil de mantener

### **Answer Bot (lo que necesitas)**
- ✅ Webhook directo
- ✅ Tu endpoint controla toda la lógica
- ✅ Muy flexible
- ✅ Fácil de mantener y actualizar

---

## Verificar que Funciona

### **Prueba 1: Desde el navegador**

Abre esta URL:
```
https://solcom-erp.vercel.app/api/webhooks/salesiq/chat?message=Tienen%20MacBook&api_key=Solcom_salesIq@42
```

Deberías ver:
```json
{
  "reply": "respuesta aquí...",
  "message": "respuesta aquí...",
  "response": "respuesta aquí...",
  "products_found": 2
}
```

### **Prueba 2: Desde Sales IQ**

1. En Sales IQ, ve a **Bots** → Tu bot → **Test**
2. Escribe: "Tienen MacBook?"
3. Deberías ver la respuesta del inventario

### **Prueba 3: En vivo**

1. Abre tu widget de Sales IQ en tu sitio web
2. Escribe una pregunta sobre productos
3. Verifica que Mía responda con datos reales del inventario

---

## Monitoreo de Uso

Ahora tu endpoint registra cada consulta en `ai_usage_logs`:

```sql
SELECT 
  user_id,
  model,
  total_tokens,
  metadata->>'products_found' as productos,
  created_at
FROM ai_usage_logs
WHERE endpoint = '/api/webhooks/salesiq/chat'
ORDER BY created_at DESC
LIMIT 50;
```

Esto te permite:
- Ver cuántas consultas se hacen
- Calcular el costo real
- Analizar qué productos buscan más

---

## Migrar de OpenAI a DeepSeek (Opcional)

Si quieres usar DeepSeek en lugar de OpenAI para ahorrar costos:

### **Opción A: Solo DeepSeek**
Cambiar en el endpoint:
```typescript
model: 'deepseek-chat' // en lugar de 'gpt-4o-mini'
```

### **Opción B: Híbrido Inteligente**
- Usar DeepSeek para consultas simples
- Usar OpenAI para consultas complejas o con imágenes

---

## Costos Estimados

### **Con OpenAI (actual)**
- Modelo: `gpt-4o-mini`
- Costo: ~$0.15 / $0.60 por 1M tokens
- **Estimado:** ~$30-50/mes para 10K consultas

### **Con DeepSeek**
- Modelo: `deepseek-chat`
- Costo: ~$0.14 / $0.28 por 1M tokens
- **Estimado:** ~$15-25/mes para 10K consultas

**Ahorro:** ~50% usando DeepSeek

---

## Preguntas Frecuentes

### **¿Necesito 2 webhooks?**
No. Solo necesitas 1 webhook:
- Sales IQ → Tu endpoint Solcom
- Tu endpoint internamente llama a OpenAI/DeepSeek

### **¿Puedo usar mi API Key de OpenAI?**
Sí, ya lo estás haciendo. Tu endpoint usa `OPENAI_API_KEY` de tu `.env.local`

### **¿Sales IQ funciona sin OpenAI?**
Sí. Sales IQ solo envía y recibe mensajes. No le importa si usas OpenAI, DeepSeek, o tu propia IA.

### **¿Cómo veo los logs?**
En tu módulo **Solcom AI** → **Uso de IA**, verás todas las consultas registradas.

---

## Próximos Pasos

1. ✅ Configurar Answer Bot en Sales IQ (siguiendo esta guía)
2. ✅ Probar con mensajes de prueba
3. ✅ Verificar que aparezcan en `ai_usage_logs`
4. ⏳ (Opcional) Migrar a DeepSeek para ahorrar costos
5. ⏳ (Opcional) Agregar análisis de imágenes con GPT-4 Vision

---

## Soporte

Si algo no funciona:
1. Revisa los logs en la consola de Vercel
2. Verifica que `OPENAI_API_KEY` esté configurada
3. Prueba el endpoint directamente desde el navegador
4. Verifica que Sales IQ esté enviando el formato correcto
