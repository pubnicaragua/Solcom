# 🔍 Análisis del Endpoint Zoho Books Sales Orders API v3

## ⚠️ Aclaración sobre la URL

La URL `https://books.zoho.com/api/v3/salesorders/editpage?organization_id=872034702` **NO es un endpoint REST**. Es la **interfaz web** de edición de Zoho Books.

Los endpoints reales de la API REST son:

| Acción | Método | Endpoint Real |
|--------|--------|---------------|
| Crear OV | `POST` | `/books/v3/salesorders?organization_id=872034702` |
| Actualizar OV | `PUT` | `/books/v3/salesorders/{salesorder_id}?organization_id=872034702` |
| Obtener OV | `GET` | `/books/v3/salesorders/{salesorder_id}?organization_id=872034702` |
| Listar OVs | `GET` | `/books/v3/salesorders?organization_id=872034702` |
| Confirmar (open) | `POST` | `/books/v3/salesorders/{id}/status/open` |
| Anular (void) | `POST` | `/books/v3/salesorders/{id}/status/void` |

Base URL: `https://www.zohoapis.com`

---

## 📊 Tu Implementación Actual (Estado muy avanzado)

Tu sistema de OVs es **significativamente más maduro** que el de facturas. Tienes:

| Funcionalidad | Archivo | Estado |
|---------------|---------|--------|
| Crear OV local + Zoho | `sales-orders/route.ts` (698 líneas) | ✅ Completo |
| Editar OV local + sync Zoho | `[id]/route.ts` (929 líneas) | ✅ Completo con rollback |
| Convertir OV → Factura | `[id]/convert/route.ts` (872 líneas) | ✅ Avanzado con multi-bodega |
| Confirmar/Cancelar en Zoho | `books-client.ts` | ✅ `confirmSalesOrder()` + `voidSalesOrder()` |
| Actualizar en Zoho | `books-client.ts` | ✅ `updateSalesOrder()` |

---

## 📋 Campos del Objeto Sales Order (Zoho API v3)

### Campos de Cabecera que YA usan

| Campo Zoho | ¿Usado? | Ubicación en tu código |
|------------|---------|----------------------|
| `customer_id` | ✅ | `route.ts:297` |
| `date` | ✅ | `route.ts:298` |
| `line_items` | ✅ | `route.ts:299` |
| `reference_number` | ✅ (usa `order_number`) | `route.ts:300` |
| `discount_type` | ✅ (hardcoded `item_level`) | `route.ts:301` |
| `is_discount_before_tax` | ✅ (hardcoded `true`) | `route.ts:302` |
| `shipment_date` | ✅ (como `expected_delivery_date`) | `route.ts:305` |
| `notes` | ✅ | `route.ts:306` |
| `salesperson_name` | ✅ | `route.ts:307` |
| `location_id` | ✅ (warehouse→zoho_warehouse_id) | `route.ts:308` |

### Campos Disponibles que NO usan (potencialmente útiles)

| Campo Zoho | Tipo | Para qué sirve | 🔥 Prioridad |
|------------|------|----------------|-------------|
| `salesorder_number` | string | Número personalizado de OV | 🟡 Media |
| `delivery_method` | string | Método de entrega (Air, Road, etc.) | 🔴 Alta |
| `delivery_method_id` | string | ID del método de entrega | 🟡 Media |
| `exchange_rate` | number | Tipo de cambio | 🟡 Media |
| `currency_id` / `currency_code` | string | Moneda de la OV | 🟡 Media |
| `template_id` | string | Plantilla de diseño | 🟢 Baja |
| `is_inclusive_tax` | boolean | Impuesto incluido en precio | 🟡 Media |
| `shipping_charge` | number | Cargo por envío | 🔴 Alta |
| `adjustment` | number | Ajuste global al total | 🟡 Media |
| `adjustment_description` | string | Descripción del ajuste | 🟡 Media |
| `terms` | string | Términos y condiciones (texto libre) | 🟡 Media |
| `custom_fields` | array | Campos personalizados a nivel OV | 🔴 Alta |
| `billing_address` | object | Dirección de facturación | 🟡 Media |
| `shipping_address` | object | Dirección de envío | 🔴 Alta |
| `contact_persons` | array | IDs personas de contacto | 🟢 Baja |
| `estimate_id` | string | Vincular con cotización existente | 🟡 Media |
| `zcrm_potential_id` | string | Vincular con deal de CRM | 🟢 Baja |
| `salesperson_id` | string | ID del vendedor en Zoho | 🔴 Alta |
| `merchant_id` | string | ID del merchant | 🟢 Baja |
| `discount` | number/string | Descuento global | ⚠️ Deshabilitado |
| `tags` | array | Etiquetas nivel OV | 🟡 Media |

---

## 📦 Campos de Line Items (líneas de OV)

### Campos que YA usan

| Campo | ¿Usado? |
|-------|---------|
| `item_id` | ✅ |
| `quantity` | ✅ |
| `rate` | ✅ |
| `description` | ✅ |
| `tax_id` | ✅ |
| `discount` (porcentaje) | ✅ |
| `serial_number_value` | ✅ (en update) |
| `item_custom_fields` | ✅ (warranty) |

### Campos de Line Items NO usados

| Campo | Tipo | Para qué sirve | 🔥 Prioridad |
|-------|------|----------------|-------------|
| `location_id` (por línea) | string | Bodega por línea | ✅ Ya lo usan en convert! |
| `warehouse_id` (por línea) | string | Alt a location_id | ✅ Ya lo usan en convert! |
| `product_type` | `goods`/`services` | Tipo de producto | 🟡 Media |
| `unit` | string (ej: "Nos") | Unidad de medida | 🟡 Media |
| `hsn_or_sac` | number | Código HSN/SAC fiscal | 🟡 Media |
| `sat_item_key_code` | number | Código producto SAT (CFDI) | 🔴 Crítico si aplica |
| `unitkey_code` | string | Código unidad SAT (ej: "E48") | 🔴 Crítico si aplica |
| `project_id` | string | Asociar línea a proyecto | 🟢 Baja |
| `tags` (por línea) | array | Etiquetas por línea | 🟢 Baja |
| `tds_tax_id` | string | ID impuesto TDS | 🟢 Baja |
| `tax_exemption_id/code` | string | Exención fiscal | 🟢 Baja |
| `tax_treatment_code` | string | Tratamiento fiscal especial | 🟡 Media |
| `item_order` | number | Orden del item | ✅ Ya manejan con `sort_order` |

---

## 🧠 Análisis de Backend Senior

### 1. Fortalezas de tu implementación actual

**a) Patrón de rollback robusto**
Tu `[id]/route.ts` tiene un sistema de rollback completo: si falla la sincronización con Zoho después de editar localmente, restaura tanto los datos de la OV como las líneas de items y reservas de seriales. Esto es **producción-grade**.

**b) Multi-bodega en conversión OV→Factura**
El `convert/route.ts` implementa un sistema avanzado que:
- Detecta seriales en múltiples bodegas de la misma familia
- Divide líneas automáticamente por bodega
- Prueba múltiples variantes de payload (`warehouse_id` vs `location_id`) con fallback

**c) column-fallback defensivo**
El patrón `insertSalesOrderItemsWithColumnFallback()` es defensivo: si la tabla no tiene una columna, la elimina del insert y reintenta. Muy robusto para migración progresiva.

### 2. Gaps y oportunidades

| Gap | Impacto | Esfuerzo |
|-----|---------|----------|
| **`shipping_charge` no se envía a Zoho** | Alto — facturas sí lo envían, OVs no | Bajo |
| **`salesperson_id` no se envía** (solo `name`) | Alto — nombre puede fallar si hay duplicados | Bajo |
| **`delivery_method` existe local pero no se envía** | Medio — tu tabla tiene el campo | Bajo |
| **`shipping_address` no se envía** | Medio — útil para logística | Medio |
| **Duplicación masiva de código** | Técnico — utilidades repetidas en 3 archivos | Alto (refactor) |
| **No hay `shipping_charge` en create** | Medio — solo facturas lo soportan | Bajo |

### 3. Datos locales que ya tienes pero NO envías a Zoho

Tu `POST` acepta estos campos que **no se mapean al payload de Zoho**:

```
payment_terms    → Zoho no lo recibe (aunque sí lo aceptaría como terms o payment_terms_label)
delivery_method  → Zoho tiene delivery_method nativo, no se envía
shipping_zone    → No existe en Zoho, pero podría ir en custom_fields
source           → Solo metadata local, no aplica para Zoho
```

### 4. Comparación OV vs Facturas en tu sistema

| Aspecto | Facturas | Órdenes de Venta |
|---------|----------|-------------------|
| Crear | ✅ `POST` | ✅ `POST` |
| Editar | ❌ **No existe** | ✅ `PUT` con rollback |
| Detalle | ✅ Implícito en GET list | ✅ `GET /[id]` dedicado |
| Sincronizar Zoho | ✅ Automático si `status=enviada` | ✅ Opcional (`sync_to_zoho=true`) |
| Sync bidireccional | ✅ Guarda `zoho_invoice_id/number` | ✅ Guarda `zoho_salesorder_id/number` |
| Confirmar en Zoho | ❌ No (facturas no tienen ese concepto) | ✅ `confirmSalesOrder()` |
| Cancelar/Void | ❌ No implementado | ✅ `voidSalesOrder()` |
| Convertir OV→Factura | N/A | ✅ Con seriales multi-bodega |
| Multi-bodega por línea | ❌ Solo global | ✅ En conversión |
| Reserva de seriales | ✅ Valida en creación | ✅ CRUD completo con rollback |
| Rollback por fallo Zoho | ✅ Borra factura local | ✅ Restaura OV + items + reservas |

> **Conclusión**: Las facturas necesitan un **refactor significativo** para ponerse al nivel de las OVs.

### 5. Recomendaciones concretas

#### Quick wins (bajo esfuerzo, alto impacto)

1. **Enviar `delivery_method` a Zoho** — Ya lo capturas del body, solo falta agregarlo al payload:
   ```typescript
   if (delivery_method) orderPayload.delivery_method = delivery_method;
   ```

2. **Enviar `shipping_charge`** — Las OVs en Zoho aceptan este campo:
   ```typescript
   if (shippingCharge > 0) orderPayload.shipping_charge = shippingCharge;
   ```

3. **Enviar `salesperson_id` además del `name`** — Usar el mismo patrón de fallback que tienes en facturas.

4. **Enviar `payment_terms` a Zoho como `terms`**:
   ```typescript
   if (payment_terms) orderPayload.terms = payment_terms;
   ```

#### Mejoras a mediano plazo

5. **Extraer utilidades compartidas** — `normalizeNumber`, `normalizeText`, `normalizeSerialInput`, `normalizeWarranty`, `extractMissingColumn`, `insertItemsWithColumnFallback` están **copiadas idénticas** en 3 archivos. Deberían estar en `@/lib/ventas/utils.ts`.

6. **Enviar `shipping_address`** — Leer la dirección del customer o permitir override por OV:
   ```typescript
   if (customer.address) {
     orderPayload.shipping_address = {
       address: customer.address,
       city: customer.city,
       country: "Nicaragua"
     };
   }
   ```

7. **Vincular `estimate_id`** — Si eventualmente implementan cotizaciones → OV → factura, Zoho permite vincular la cadena completa.

---

## 📊 Resumen Ejecutivo Comparativo con Facturas

| Categoría | Facturas | Órdenes de Venta |
|-----------|----------|-------------------|
| Madurez del código | ⚠️ Media | ✅ Alta |
| CRUD completo | ❌ Falta PUT | ✅ Completo |
| Sync Zoho | ✅ | ✅ |
| Rollback | ⚠️ Básico | ✅ Avanzado |
| Multi-bodega | ❌ | ✅ |
| Seriales | ✅ | ✅ (con reservas) |
| Campos enviados a Zoho | ~12 campos | ~8 campos |
| Campos disponibles no usados | ~18 campos | ~15 campos |
| Refactor necesario | 🔴 Alto | 🟡 Medio (dedup utilities) |
