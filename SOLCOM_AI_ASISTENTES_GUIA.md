# 📘 Guía de Asistentes IA en Solcom AI

## 🎯 ¿Qué son los Asistentes en Solcom AI?

Los **Asistentes IA** que creas en el módulo Solcom AI son **configuraciones administrativas** que definen las capacidades y permisos de diferentes asistentes virtuales en tu sistema.

---

## ✅ Funcionalidad Actual

### 1. **Gestión Centralizada**
Desde `Solcom AI > Asistentes IA` puedes:
- ✅ Crear nuevos asistentes
- ✅ Definir sus capacidades (texto, inventario, ventas)
- ✅ Asignar descripciones
- ✅ Eliminar asistentes
- ✅ Ver todos los asistentes registrados

### 2. **Almacenamiento en Supabase**
Todos los asistentes se guardan en la tabla `ai_assistants`:
```sql
CREATE TABLE ai_assistants (
  id UUID PRIMARY KEY,
  name TEXT,
  description TEXT,
  capabilities JSONB,
  created_at TIMESTAMPTZ
);
```

### 3. **Capacidades Disponibles**
Cada asistente puede tener:
- **text**: Conversación general
- **inventory**: Acceso a datos de inventario
- **sales**: Acceso a datos de ventas

---

## 🔧 Uso en el Sistema

### **Mía - Asistente de Compras**
El asistente **Mía** que ves en el módulo de Compras AI:
- ✅ Está **hardcodeado** en el código
- ✅ Usa el endpoint `/api/ai/chat`
- ✅ Tiene acceso a inventario y análisis de compras
- ✅ **NO** lee de la tabla `ai_assistants`

**Código actual:**
```typescript
// src/components/compras/AIAssistant.tsx
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  body: JSON.stringify({
    question: text,
    context,
    agentId: 'audit' // Hardcodeado
  })
});
```

---

## 🔌 Integración con SalesIQ (Zoho)

### **¿Se pueden usar en SalesIQ?**
**SÍ**, pero requiere configuración adicional:

### **Paso 1: Webhook de SalesIQ**
Ya existe el endpoint:
```
/api/webhooks/salesiq/chat/route.ts
```

Este endpoint:
- ✅ Recibe mensajes de SalesIQ
- ✅ Busca productos en Supabase
- ✅ Genera respuestas con IA
- ✅ Devuelve la respuesta a SalesIQ

### **Paso 2: Configurar en SalesIQ**
1. Ir a SalesIQ > Settings > Developers > Webhooks
2. Agregar webhook:
   - **URL**: `https://tu-dominio.com/api/webhooks/salesiq/chat`
   - **Evento**: `chat.message.received`
   - **Método**: POST

### **Paso 3: API Key**
El webhook valida la API Key de SalesIQ:
```typescript
const apiKey = request.headers.get('X-SalesIQ-API-Key');
if (apiKey !== process.env.SALESIQ_API_KEY) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Agregar en `.env.local`:
```env
SALESIQ_API_KEY=tu_clave_de_salesiq
```

---

## 🚀 Cómo Reutilizar la Misma API Key

### **Opción 1: Usar la API Key de OpenAI/DeepSeek**
Todos los asistentes pueden compartir la misma clave:

1. **En Solcom AI**, crear una clave API:
   - Nombre: "Clave Principal"
   - Provider: "OpenAI" o "DeepSeek"
   - Key: Tu clave real

2. **En el código**, usar esa clave:
```typescript
// src/app/api/ai/chat/route.ts
const { data: apiKeys } = await supabase
  .from('ai_api_keys')
  .select('*')
  .eq('status', 'active')
  .limit(1)
  .single();

const apiKey = apiKeys?.key;
```

### **Opción 2: Variable de Entorno**
Más simple, usar directamente:
```env
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

---

## 📊 Ejemplo de Flujo Completo

### **Escenario: Cliente pregunta en SalesIQ**

1. **Cliente**: "¿Tienen iPhone 15 en stock?"

2. **SalesIQ** → Envía webhook a `/api/webhooks/salesiq/chat`

3. **Backend**:
   - Valida API Key
   - Busca "iPhone 15" en tabla `items`
   - Construye contexto con resultados
   - Llama a OpenAI/DeepSeek con el contexto
   - Genera respuesta inteligente

4. **Respuesta**: "Sí, tenemos 3 modelos de iPhone 15 disponibles..."

5. **SalesIQ** → Muestra respuesta al cliente

---

## 🔄 Cómo Conectar Asistentes de Solcom AI con el Sistema

### **Actualmente NO están conectados**
Los asistentes que creas en Solcom AI son solo registros administrativos.

### **Para conectarlos, necesitas:**

#### **Opción A: Modificar Mía**
```typescript
// src/components/compras/AIAssistant.tsx
const [selectedAssistant, setSelectedAssistant] = useState('mia');

// Cargar asistentes desde Supabase
const { data: assistants } = await supabase
  .from('ai_assistants')
  .select('*');

// Usar el asistente seleccionado
const response = await fetch('/api/ai/chat', {
  body: JSON.stringify({
    question: text,
    context,
    agentId: selectedAssistant // Dinámico
  })
});
```

#### **Opción B: Crear Nuevos Asistentes**
Crear componentes separados para cada asistente:
- `VentasAssistant.tsx` - Para ventas
- `InventarioAssistant.tsx` - Para inventario
- `SoporteAssistant.tsx` - Para soporte

Cada uno lee su configuración de `ai_assistants`.

---

## 🎨 UI Sugerida para Selector de Asistente

```typescript
<select onChange={(e) => setSelectedAssistant(e.target.value)}>
  <option value="mia">Mía - Compras</option>
  <option value="sales">Asistente de Ventas</option>
  <option value="support">Soporte Técnico</option>
</select>
```

---

## 📝 Resumen de Respuestas a tus Preguntas

### **¿Los asistentes creados en Solcom AI se pueden usar en el sistema?**
**Actualmente NO**, son solo registros administrativos. Necesitas modificar el código para conectarlos.

### **¿Se pueden usar en SalesIQ?**
**SÍ**, a través del webhook `/api/webhooks/salesiq/chat`, pero necesitas:
1. Configurar el webhook en SalesIQ
2. Agregar la API Key de SalesIQ en `.env.local`
3. Opcionalmente, modificar el webhook para leer asistentes de la BD

### **¿Reutilizan la misma API Key?**
**SÍ**, todos pueden compartir la misma clave de OpenAI/DeepSeek:
- Opción 1: Guardarla en `ai_api_keys` y leerla desde ahí
- Opción 2: Usar variable de entorno `OPENAI_API_KEY`

---

## 🛠️ Próximos Pasos Recomendados

### **Para hacer los asistentes funcionales:**

1. **Modificar el backend** para leer asistentes de la BD:
```typescript
// src/app/api/ai/chat/route.ts
const { agentId } = await request.json();

const { data: assistant } = await supabase
  .from('ai_assistants')
  .select('*')
  .eq('id', agentId)
  .single();

// Usar assistant.capabilities para determinar qué datos puede acceder
```

2. **Agregar selector de asistente** en la UI de Mía

3. **Crear permisos basados en capabilities**:
```typescript
if (assistant.capabilities.inventory) {
  // Permitir búsqueda en items
}
if (assistant.capabilities.sales) {
  // Permitir acceso a ventas
}
```

---

## 🔐 Seguridad

### **API Keys**
- ✅ Nunca expongas las claves en el frontend
- ✅ Usa variables de entorno
- ✅ Valida permisos en el backend
- ✅ Rota las claves periódicamente

### **Asistentes**
- ✅ Valida capabilities antes de dar acceso a datos
- ✅ Registra todos los usos en `ai_usage_logs`
- ✅ Implementa rate limiting si es necesario

---

## 📞 Soporte

Si necesitas implementar alguna de estas funcionalidades:
1. Modificar el código para conectar asistentes
2. Configurar SalesIQ
3. Crear nuevos asistentes personalizados

Podemos hacerlo paso a paso.

---

**Fecha:** Mayo 2026  
**Sistema:** Solcom / Software Nicaragua  
**Módulo:** Solcom AI
