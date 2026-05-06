# Integración con ChatQ (Sales IQ)

## 📋 **Documentación Técnica para Configuración**

Esta guía es para configuración técnica del sistema. No debe ser compartida con el cliente final.

## 🔌 **Configuración del Endpoint**

### Endpoint de API
```
https://tu-dominio.com/api/ai/chat
```

### Método de Autenticación
- **Tipo**: Bearer Token (opcional para futura implementación)
- **Headers**: 
  ```json
  {
    "Content-Type": "application/json"
  }
  ```

## 📤 **Formato de Request**

### Estructura JSON
```json
{
  "question": "¿Cuál es el stock del producto X?",
  "agentId": "customer-service",
  "context": "Eres un asistente de inventario para Solis Comercial."
}
```

### Parámetros
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `question` | String | Sí | Pregunta del usuario |
| `agentId` | String | No | Agente que responderá |
| `context` | String | No | Contexto del módulo o conversación |

## 📥 **Formato de Response**

### Estructura JSON
```json
{
  "answer": "Respuesta del asistente..."
}
```

### Campo principal de respuesta
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `answer` | String | Respuesta final generada por el backend |

## 🔧 **Configuración en ChatQ (Sales IQ)**

### Paso 1: Acceder a Configuración
1. Iniciar sesión en ChatQ/Sales IQ
2. Navegar a Settings → Integrations
3. Buscar sección de Custom API

### Paso 2: Configurar Endpoint
```
Endpoint URL: https://tu-dominio.com/api/ai/chat
Method: POST
```

### Paso 3: Configurar Headers
```
Content-Type: application/json
```

### Paso 4: Configurar Body Template
```json
{
  "question": "{{user_message}}",
  "agentId": "customer-service",
  "context": "Consulta recibida desde ChatQ"
}
```

### Paso 5: Configurar Response Mapping
```javascript
response.answer
```

## 🧪 **Pruebas de Integración**

### Test 1: Request Simple
```bash
curl -X POST https://tu-dominio.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Hola",
    "agentId": "customer-service"
  }'
```

### Test 2: Request con Contexto
```bash
curl -X POST https://tu-dominio.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuál es el stock de producto X?",
    "agentId": "customer-service",
    "context": "Eres un asistente de inventario"
  }'
```

### Test 3: Verificar Respuesta
```bash
curl -X POST https://tu-dominio.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Prueba de integración","agentId":"customer-service"}'
```

## 🔒 **Seguridad**

### Protección del Endpoint
- Implementar rate limiting por cliente
- Agregar autenticación JWT para producción
- Validar clientId antes de procesar requests
- Logs de auditoría de todas las transacciones

### Variables de Entorno
```env
DEEPSEEK_API_KEY=sk-c0c86466239346329c672768b1812428
```

## 📊 **Monitoreo**

### Métricas a Monitorear
- Requests por minuto
- Latencia promedio
- Tasa de error
- Consumo de tokens por cliente
- Saldo de créditos por cliente

### Alertas
- Saldo bajo (< $20)
- Alta tasa de error (> 5%)
- Latencia alta (> 5s)
- Requests anómalos

## 🚨 **Solución de Problemas**

### Error: Insufficient Credits
```
{
  "error": "Insufficient credits",
  "balance": 10.50,
  "required": 15.00
}
```
**Solución**: Recargar saldo del cliente

### Error: Client not found
```
{
  "error": "Client not found"
}
```
**Solución**: Verificar clientId correcto

### Error: Deepseek API error
```
{
  "error": "Deepseek API error",
  "details": "..."
}
```
**Solución**: Verificar API key de Deepseek y saldo

## 📈 **Escalabilidad**

### Para Múltiples Clientes
Agregar nuevos clientes en `clientsDB`:
```typescript
const clientsDB: Record<string, ClientCredits> = {
  'solis-comercial': {
    balance: 200,
    monthly_limit: 200,
    tokens_used_this_month: 0
  },
  'nuevo-cliente': {
    balance: 500,
    monthly_limit: 500,
    tokens_used_this_month: 0
  }
};
```

### Para Producción
- Mover clientesDB a Supabase
- Implementar sistema de pagos automático
- Agregar dashboard multi-tenant
- Implementar facturación automática

---

**Versión**: 1.0  
**Fecha**: 01/05/2026  
**Estado**: ✅ Funcional  
**Acceso**: Solo personal técnico
