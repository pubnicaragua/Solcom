# 🔍 Análisis del Endpoint Zoho Books Invoices API v3

## ⚠️ Aclaración Importante sobre la URL

La URL `https://books.zoho.com/api/v3/invoices/editpage?organization_id=872034702` **NO es un endpoint REST**. Es una URL de la **interfaz web de Zoho Books** (la página de edición de factura en el navegador). 

Los endpoints reales de la API REST son:

| Acción | Método | Endpoint Real |
|--------|--------|---------------|
| Crear factura | `POST` | `/books/v3/invoices?organization_id=872034702` |
| Actualizar factura | `PUT` | `/books/v3/invoices/{invoice_id}?organization_id=872034702` |
| Obtener factura | `GET` | `/books/v3/invoices/{invoice_id}?organization_id=872034702` |
| Listar facturas | `GET` | `/books/v3/invoices?organization_id=872034702` |

Base URL: `https://www.zohoapis.com`

---

## 📋 Campos Completos del Objeto Invoice (Zoho API v3)

### Campos de Cabecera que YA usan en tu sistema

| Campo | Tipo | ¿Usado en tu código? | Ubicación |
|-------|------|----------------------|-----------|
| `customer_id` | string | ✅ Sí | `invoices/route.ts:443` |
| `date` | string (YYYY-MM-DD) | ✅ Sí | `invoices/route.ts:444` |
| `due_date` | string | ✅ Sí | `invoices/route.ts:449` |
| `reference_number` | string | ✅ Sí | `invoices/route.ts:451` |
| `notes` | string | ✅ Sí | `invoices/route.ts:452` |
| `shipping_charge` | number | ✅ Sí | `invoices/route.ts:453` |
| `location_id` | string | ✅ Sí (warehouse→zoho_warehouse_id) | `invoices/route.ts:454` |
| `discount_type` | `item_level` / `entity_level` | ✅ Sí (hardcoded `item_level`) | `invoices/route.ts:446` |
| `is_discount_before_tax` | boolean | ✅ Sí (hardcoded `true`) | `invoices/route.ts:447` |
| `salesperson_name` | string | ✅ Sí | `invoices/route.ts:457` |
| `salesperson_id` | string | ✅ Sí | `invoices/route.ts:457` |

### Campos de Cabecera DISPONIBLES que NO usan (potencialmente útiles)

| Campo | Tipo | Para qué sirve | 🔥 Prioridad |
|-------|------|----------------|-------------|
| `invoice_number` | string | Asignar número personalizado de factura | 🔴 Alta |
| `payment_terms` | number | Días para pagar (ej: 15, 30, 60) | 🔴 Alta |
| `payment_terms_label` | string | Etiqueta visible (ej: "Net 15", "Net 30") | 🟡 Media |
| `exchange_rate` | number | Tipo de cambio para moneda extranjera | 🟡 Media |
| `currency_id` | string | ID de la moneda a usar | 🟡 Media |
| `currency_code` | string | Código ISO moneda (USD, NIO, etc.) | 🟡 Media |
| `template_id` | string | Plantilla de diseño de factura | 🟡 Media |
| `is_inclusive_tax` | boolean | Impuesto incluido en precio | 🟡 Media |
| `adjustment` | number | Ajuste global al total | 🟢 Baja |
| `adjustment_description` | string | Razón del ajuste | 🟢 Baja |
| `terms` | string | Términos y condiciones (texto libre) | 🟡 Media |
| `payment_expected_date` | string | Fecha esperada de pago | 🟢 Baja |
| `custom_fields` | array | Campos personalizados a nivel factura | 🔴 Alta |
| `allow_partial_payments` | boolean | Permite pagos parciales | 🟡 Media |
| `billing_address` | object | Dirección de facturación | 🟡 Media |
| `shipping_address` | object | Dirección de envío | 🟡 Media |
| `contact_persons` | array | IDs de personas de contacto | 🟢 Baja |
| `payment_options` | object | Gateways de pago habilitados | 🟢 Baja |
| `discount` | number | Descuento global (entity_level) | ⚠️ Deshabilitado |
| `recurring_invoice_id` | string | ID factura recurrente padre | 🟢 Baja |
| `salesorder_id` | string | Vincular con orden de venta existente | 🔴 Alta |

### Campos CFDI (México) — Relevantes para tu organización

| Campo | Tipo | Para qué sirve | 🔥 Prioridad |
|-------|------|----------------|-------------|
| `cfdi_usage` | string | Uso del CFDI (SAT) | 🔴 Crítico |
| `cfdi_reference_type` | string | Tipo de referencia CFDI | 🟡 Media |
| `reference_invoice_id` | string | Factura de referencia (notas de crédito) | 🟡 Media |

**Valores válidos de `cfdi_usage`:**
- `acquisition_of_merchandise` — Adquisición de mercancías
- `return_discount_bonus` — Devoluciones, descuentos o bonificaciones
- `general_expense` — Gastos en general
- `buildings` — Construcciones
- `furniture_office_equipment` — Mobiliario y equipo de oficina
- `transport_equipment` — Equipo de transporte
- `computer_equipmentdye_molds_tools` — Equipo de cómputo
- `payment` — Pagos
- `payroll` — Nómina
- `no_tax_effect` — Sin efecto fiscal

---

## 📦 Campos de Line Items (líneas de factura)

### Campos que YA usan

| Campo | Tipo | ¿Usado? |
|-------|------|---------|
| `item_id` | string | ✅ `invoices/route.ts:338` |
| `quantity` | number | ✅ `invoices/route.ts:339` |
| `rate` | number | ✅ `invoices/route.ts:340` |
| `description` | string | ✅ `invoices/route.ts:341` |
| `tax_id` | string | ✅ `invoices/route.ts:345` |
| `discount` | string (ej: "10%") | ✅ `invoices/route.ts:349` |
| `serial_number_value` | string | ✅ `invoices/route.ts:353` |
| `serial_numbers` | string[] | ✅ `invoices/route.ts:354` |
| `item_custom_fields` | array | ✅ (warranty) `invoices/route.ts:358` |

### Campos de Line Items DISPONIBLES que NO usan

| Campo | Tipo | Para qué sirve | 🔥 Prioridad |
|-------|------|----------------|-------------|
| `location_id` | string | Bodega específica por línea | 🔴 Alta |
| `warehouse_id` | string | Alternativa a `location_id` por línea | 🔴 Alta |
| `item_type` / `product_type` | string | `goods` / `services` / `capital_goods` | 🟡 Media |
| `project_id` | string | Asociar línea a proyecto | 🟢 Baja |
| `project_name` | string | Nombre del proyecto | 🟢 Baja |
| `unit` | string | Unidad de medida | 🟡 Media |
| `header_name` | string | Agrupar líneas bajo encabezados | 🟡 Media |
| `header_id` | string | ID del encabezado de grupo | 🟡 Media |
| `tags` | array | Etiquetas por línea de item | 🟢 Baja |
| `sat_item_key_code` | number | Código de producto/servicio SAT | 🔴 Crítico (CFDI) |
| `unitkey_code` | string | Código de unidad SAT (ej: "E48") | 🔴 Crítico (CFDI) |
| `tds_tax_id` | string | ID de impuesto TDS | 🟢 Baja |
| `expense_id` | string | Vincular con gasto existente | 🟢 Baja |
| `discount_amount` | number | Descuento como monto fijo | 🟡 Media |
| `tax_treatment_code` | string | Tratamiento fiscal especial | 🟡 Media |

---

## 🏗️ Estructura del Objeto Address (billing/shipping)

```json
{
  "address": "4900 Hopyard Rd, Suite 310",
  "street2": "McMillan Avenue",
  "city": "Pleasanton",
  "state": "CA",
  "zip": "94588",
  "country": "Nicaragua",
  "fax": "+505-XXXX-XXXX"
}
```

---

## 🧠 Análisis como Backend Senior

### 1. Gaps Críticos en tu implementación actual

**a) No hay edición de facturas (PUT)**
Tu `invoices/route.ts` solo tiene `GET` (listar) y `POST` (crear). **No existe un handler PUT/PATCH** para editar facturas. El endpoint real de Zoho para esto sería:
```
PUT /books/v3/invoices/{invoice_id}?organization_id=872034702
```
Tu `books-client.ts` tampoco tiene método `updateInvoice()`, aunque sí tiene `updateSalesOrder()` y `updateEstimate()`.

**b) No se envía `invoice_number` a Zoho**
Generas `invoice_number` localmente (`FAC-2026-00001`) pero no lo pasas a Zoho en el payload. Zoho genera su propio número. Podrías sincronizarlos enviando `invoice_number` en el payload o usando `reference_number` para correlacionar.

**c) El `payment_terms` no se mapea**
Tienes un sistema local de terms (`1_dia`, `7_dias`, `30_dias`, etc.) pero no envías `payment_terms` (número de días) ni `payment_terms_label` a Zoho. Zoho usa estos campos para calcular automáticamente la fecha de vencimiento.

**d) CFDI no está implementado**
Si operan en México/Centroamérica con facturación electrónica, los campos `cfdi_usage`, `sat_item_key_code`, y `unitkey_code` son **mandatorios** para generar CFDI válidos.

### 2. Datos que podrías aprovechar inmediatamente

| Mejora | Esfuerzo | Impacto |
|--------|----------|---------|
| Enviar `invoice_number` local como `reference_number` | Bajo | Alto — correlación bidireccional |
| Mapear `terms` → `payment_terms` (días numéricos) | Bajo | Alto — Zoho calcula due_date |
| Agregar `location_id` por línea de item | Medio | Alto — multi-bodega por factura |
| Implementar `updateInvoice()` en books-client | Medio | Crítico — no pueden editar |
| Enviar `billing_address` del customer | Medio | Medio — datos completos |
| Agregar `allow_partial_payments` | Bajo | Medio — flexibilidad de pagos |
| Custom fields a nivel factura | Medio | Alto — datos fiscales/legales |

### 3. Recomendaciones Arquitectónicas

1. **Crear `updateInvoice()` en `books-client.ts`** — Siguiendo el patrón exacto de `updateSalesOrder()` y `updateEstimate()` que ya tienes; es prácticamente copiar y adaptar.

2. **Mapeo bidireccional de números** — Cuando Zoho crea la factura, ya guardas `zoho_invoice_id` y `zoho_invoice_number`. Pero cuando creas en Zoho, deberías enviar tu `invoice_number` como `reference_number` para que sea buscable desde Zoho.

3. **`payment_terms` automático** — Tu map `TERMS_DAYS_MAP` ya tiene la conversión de labels a días. Solo necesitas incluir esos días en el payload de Zoho:
   ```typescript
   if (terms) {
     const days = TERMS_DAYS_MAP[terms];
     if (days !== undefined) {
       basePayload.payment_terms = days;
       basePayload.payment_terms_label = `Net ${days}`;
     }
   }
   ```

4. **Multi-bodega por línea** — Tu sistema actual envía un `location_id` global. Zoho permite enviar `location_id` o `warehouse_id` **por cada línea de item**, útil si vendes stock de diferentes bodegas en una misma factura.

### 4. Acciones del endpoint `editpage`

La URL que compartiste (`/invoices/editpage`) en Zoho Books web expone estos **formularios/campos en la UI**:

- Selección de cliente (customer)
- Número de factura
- Número de orden / referencia
- Fecha de factura y vencimiento
- Términos de pago
- Vendedor (salesperson)
- Líneas de producto (item, qty, rate, discount, tax)
- Números de serie
- Shipping charge
- Ajustes
- Notas y Términos
- Campos personalizados
- Dirección de facturación/envío
- Template de factura
- Archivos adjuntos

Todo esto es editable vía la API REST con `PUT /books/v3/invoices/{invoice_id}`.

---

## 📊 Resumen Ejecutivo

| Categoría | Estado | Acción |
|-----------|--------|--------|
| Creación de facturas | ✅ Funcional | Mejorar payload con más campos |
| Edición de facturas | ❌ No existe | Implementar `PUT` route + `updateInvoice()` |
| Campos fiscales CFDI | ❌ Ausente | Evaluar si aplica por país |
| Mapeo de payment_terms | ⚠️ Parcial | Enviar `payment_terms` a Zoho |
| Multi-bodega por línea | ⚠️ No implementado | Enviar `location_id` por item |
| Correlación invoice_number | ⚠️ Desconectado | Enviar como `reference_number` |
| Custom fields nivel factura | ⚠️ Solo warranty en items | Ampliar a nivel cabecera |
| Direcciones billing/shipping | ❌ No se envían | Leer del customer y enviar |
