# Integración IA - Endpoint Unificado

## 🎯 **Resumen del Sistema**

Documento histórico adaptado al flujo actual del proyecto. La integración activa ya no usa un proxy dedicado y ahora centraliza las consultas en el endpoint oficial de IA.

Sistema actual:
- Uso del endpoint único `/api/ai/chat`
- Respuestas contextuales para módulos operativos
- Registro de uso en `ai_usage_logs`
- Integración con panel administrativo de Solcom AI
- Compatibilidad con flujos de chat del sistema

## 📊 **Estructura de Precios**

### Datos Reales del Cliente (Abril 2026)
- **Gasto OpenAI**: $214.15
- **Tokens consumidos**: 163,961,633
- **Costo por 1K tokens**: $0.001307

### Propuesta: 15% Más Barato
| Concepto | Valor |
|---------|-------|
| **Costo OpenAI (actual)** | $0.001307 por 1,000 tokens |
| **Descuento para cliente** | 15% |
| **Precio al cliente** | $0.001111 por 1,000 tokens |
| **Costo real Deepseek v4-flash** | $0.000099 por 1,000 tokens |
| **Margen de ganancia** | 11.2x (1,120%) |
| **Ahorro para cliente** | 15% ($32.12/mes) |

## 💰 **Cálculo de Ahorro y Ganancia**

### Fórmula de Cálculo

```
Precio al cliente = Costo OpenAI × (1 - 0.15)
Precio al cliente = $0.001307 × 0.85 = $0.001111/1K tokens

Ganancia por 1K tokens = Precio cliente - Costo Deepseek
Ganancia por 1K tokens = $0.001111 - $0.000099 = $0.001012

Margen = Precio cliente / Costo Deepseek
Margen = $0.001111 / $0.000099 = 11.2x
```

### Escenario Mensual (Basado en uso real)

| Métrica | OpenAI Actual | Deepseek Propuesto | Diferencia |
|---------|---------------|-------------------|------------|
| **Tokens/mes** | 163,961,633 | 163,961,633 | - |
| **Costo para cliente** | $214.15 | $182.03 | -$32.12 (15% ahorro) |
| **Costo real Deepseek** | - | $16.23 | - |
| **Ganancia neta** | - | $165.80 | Nuevo ingreso |
| **Ahorro anual cliente** | - | $385.44 | - |
| **Ingreso anual tuyo** | - | $1,989.60 | - |

## 🏗️ **Arquitectura**

```
Sales IQ → API Proxy → Deepseek API
                ↓
         Sistema de Créditos
                ↓
         Dashboard de Gestión
```

## 📁 **Archivos Implementados**

### 1. Endpoint oficial de IA
**Archivo:** `src/app/api/ai/chat/route.ts`

**Funciones:**
- Procesar preguntas del frontend
- Generar respuestas contextuales
- Consultar datos útiles del sistema cuando hace falta
- Registrar uso para estadísticas
- Servir como punto único de integración

**Uso:**
```bash
# POST - Hacer request al endpoint oficial
curl -X POST https://tu-dominio.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Hola",
    "agentId": "compras",
    "context": "Contexto operativo opcional"
  }'
```

### 2. Dashboard de Gestión
**Archivo:** `src/app/(dashboard)/deepseek-credits/page.tsx`

**Características:**
- Saldo disponible
- Tokens consumidos
- Límite mensual
- Transacciones recientes
- Estructura de precios
- Integración con Sales IQ

**Acceso:** `/deepseek-credits` (solo admin)

### 3. Sidebar
**Archivo:** `src/components/dashboard/Sidebar.tsx`

**Cambios:**
- Agregado icono `CreditCard`
- Nuevo menú "Créditos Deepseek"
- Solo visible para admins

## 🔌 **Integración con Sales IQ**

### Paso 1: Configurar Endpoint

En la configuración de Sales IQ, reemplazar:

**Antes:**
```
https://api.openai.com/v1/chat/completions
```

**Después:**
```
https://tu-dominio.com/api/ai/chat
```

### Paso 2: Formato de Request

Sales IQ debe enviar requests en este formato:

```json
{
  "question": "Pregunta del cliente",
  "agentId": "customer-service",
  "context": "Información útil del módulo actual"
}
```

### Paso 3: Respuesta

La API retorna:

```json
{
  "answer": "Respuesta generada por el backend"
}
```

## 🔧 **Configuración de Cliente**

### Agregar Nuevo Cliente

Editar `src/app/api/ai/chat/route.ts` según la lógica del agente:

```typescript
const clientsDB: Record<string, ClientCredits> = {
  'solis-comercial': {
    balance: 500,
    monthly_limit: 500,
    tokens_used_this_month: 0
  },
  'nuevo-cliente': {
    balance: 1000,
    monthly_limit: 1000,
    tokens_used_this_month: 0
  }
};
```

### Ajustar Precios

```typescript
const PRICING = {
  deepseek_cost_per_1k_tokens: 0.0001,
  client_charge_per_1k_tokens: 0.002,  // Ajustar según cliente
  markup: 20
};
```

## 🚀 **Pruebas**

### 1. Test del endpoint oficial

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuál es el stock de producto X?",
    "agentId": "customer-service"
  }'
```

### 2. Ver Dashboard

1. Iniciar servidor: `npm run dev`
2. Navegar a: `http://localhost:3000/deepseek-credits`
3. Ver saldo, tokens y transacciones

### 3. Integración Sales IQ

1. Configurar webhook en Sales IQ
2. Probar con mensaje de prueba
3. Verificar consumo en dashboard

## 📈 **Monitoreo**

### Métricas Clave

- **Saldo disponible**: Créditos restantes del cliente
- **Tokens/mes**: Consumo mensual de tokens
- **Costo real**: Gasto en Deepseek
- **Cobrado**: Ingreso del cliente
- **Margen**: Ganancia neta

### Alertas

El sistema retorna error 402 cuando:
- Saldo insuficiente
- Límite mensual excedido

```json
{
  "error": "Insufficient credits",
  "balance": 10.50,
  "required": 15.00
}
```

## 🔒 **Seguridad**

### API Key Deepseek

La API key está en el código del servidor (`.env.local` en producción):

```env
DEEPSEEK_API_KEY=sk-c0c86466239346329c672768b1812428
```

### Recomendaciones

1. **Mover a variables de entorno** en producción
2. **Implementar autenticación** en el proxy
3. **Rate limiting** por cliente
4. **Logs de auditoría** de todas las transacciones

## 🎯 **Próximos Pasos**

### Fase 1 - Actual
- ✅ API Proxy funcional
- ✅ Dashboard de gestión
- ✅ Sistema de créditos básico
- ✅ Integración en sidebar

### Fase 2 - Mejoras
- [ ] Base de datos Supabase para clientes
- [ ] Sistema de facturación automática
- [ ] Alertas de bajo saldo
- [ ] Reportes mensuales
- [ ] Multi-cliente

### Fase 3 - Avanzado
- [ ] Webhook de pago automático
- [ ] Panel de configuración por cliente
- [ ] Análisis de uso y tendencias
- [ ] Integración con Stripe/PayPal
- [ ] Sistema de paquetes y planes

## 💡 **Casos de Uso**

### 1. Reemplazar OpenAI en Sales IQ
- Configurar endpoint del proxy
- Reducir costos 95%
- Mantener funcionalidad

### 2. Agregar Análisis de Imágenes
- Deepseek soporta visión
- Procesar URLs de imágenes
- Extraer información visual

### 3. Agentes IA Personalizados
- Crear prompts específicos
- Contexto de inventario
- Respuestas personalizadas

## 📞 **Soporte**

Para problemas o preguntas:
1. Ver logs del servidor
2. Chequear dashboard de créditos
3. Verificar API key de Deepseek
4. Revisar configuración de Sales IQ

---

**Versión:** 1.0  
**Fecha:** 30/04/2026  
**Estado:** ✅ Funcional
