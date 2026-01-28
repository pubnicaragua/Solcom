# 🔄 Integración con Zoho Creator API

## Estado Actual

**Actualmente usando datos MOCK para pruebas locales.**

El sistema está preparado para integrarse con Zoho Creator API, pero por ahora utiliza datos de prueba para desarrollo.

---

## Datos Mock Actuales

### Endpoint: `/api/zoho/sync`

Cuando ejecutas la sincronización, el sistema carga estos datos de prueba:

```javascript
const mockZohoData = [
  {
    item_name: 'Laptop Dell Inspiron 15',
    color: 'Negro',
    state: 'nuevo',
    sku: 'SKU-001',
    warehouse_code: 'X1',
    qty: 15,
  },
  {
    item_name: 'Monitor LG 24"',
    color: 'Plata',
    state: 'nuevo',
    sku: 'SKU-002',
    warehouse_code: 'X1',
    qty: 8,
  },
  {
    item_name: 'Teclado Logitech K380',
    color: 'Gris',
    state: 'nuevo',
    sku: 'SKU-003',
    warehouse_code: 'X4',
    qty: 25,
  },
  {
    item_name: 'Mouse Inalámbrico',
    color: 'Negro',
    state: 'nuevo',
    sku: 'SKU-004',
    warehouse_code: 'X4',
    qty: 30,
  },
  {
    item_name: 'Impresora HP LaserJet',
    color: 'Blanco',
    state: 'nuevo',
    sku: 'SKU-005',
    warehouse_code: 'X5',
    qty: 5,
  },
  {
    item_name: 'Webcam Logitech C920',
    color: 'Negro',
    state: 'usado',
    sku: 'SKU-006',
    warehouse_code: 'X1',
    qty: 3,
  },
  {
    item_name: 'Audífonos Sony WH-1000XM4',
    color: 'Negro',
    state: 'nuevo',
    sku: 'SKU-007',
    warehouse_code: 'X4',
    qty: 12,
  },
  {
    item_name: 'Router TP-Link Archer',
    color: 'Negro',
    state: 'nuevo',
    sku: 'SKU-008',
    warehouse_code: 'X5',
    qty: 7,
  },
];
```

### Bodegas Mock:
- **X1** - Bodega X1
- **X4** - Bodega X4
- **X5** - Bodega X5

---

## Configuración para Zoho Creator API Real

### 1. Obtener Credenciales de Zoho

1. Ir a [Zoho API Console](https://api-console.zoho.com/)
2. Crear una nueva aplicación "Self Client"
3. Obtener:
   - **Client ID**
   - **Client Secret**
   - **Refresh Token**

### 2. Configurar Variables de Entorno

Agregar a `.env.local`:

```env
# Zoho Creator API
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_REFRESH_TOKEN=your_refresh_token_here
ZOHO_ACCOUNT_OWNER_NAME=your_account_name
ZOHO_APP_NAME=your_app_name
ZOHO_FORM_NAME=your_form_name
```

### 3. Estructura de Datos Esperada de Zoho

El sistema espera que Zoho Creator devuelva datos en este formato:

```json
{
  "data": [
    {
      "ID": "123456",
      "Item_Name": "Laptop Dell Inspiron 15",
      "Color": "Negro",
      "State": "nuevo",
      "SKU": "SKU-001",
      "Warehouse_Code": "X1",
      "Quantity": 15,
      "Last_Updated": "2025-01-27T15:30:00Z"
    }
  ],
  "code": 3000,
  "message": "Success"
}
```

### 4. Mapeo de Campos

| Campo Zoho | Campo Supabase | Tipo |
|------------|----------------|------|
| `Item_Name` | `name` | TEXT |
| `Color` | `color` | TEXT |
| `State` | `state` | TEXT |
| `SKU` | `sku` | TEXT (unique) |
| `Warehouse_Code` | `code` | TEXT |
| `Quantity` | `qty` | INTEGER |
| `Last_Updated` | `synced_at` | TIMESTAMP |

---

## Implementación Real

### Archivo: `src/lib/zoho/client.ts`

El cliente de Zoho ya está implementado y listo para usar:

```typescript
import { ZohoClient } from '@/lib/zoho/client';

const zohoClient = new ZohoClient({
  clientId: process.env.ZOHO_CLIENT_ID!,
  clientSecret: process.env.ZOHO_CLIENT_SECRET!,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
  accountOwnerName: process.env.ZOHO_ACCOUNT_OWNER_NAME!,
  appName: process.env.ZOHO_APP_NAME!,
  formName: process.env.ZOHO_FORM_NAME!,
});

// Obtener inventario
const inventory = await zohoClient.getInventory();
```

### Modificar `/api/zoho/sync/route.ts`

Para activar la integración real, reemplazar la sección de datos mock:

```typescript
// CAMBIAR DE:
const mockZohoData = [...];
const zohoItems = mockZohoData;

// A:
const zohoClient = new ZohoClient({
  clientId: process.env.ZOHO_CLIENT_ID!,
  clientSecret: process.env.ZOHO_CLIENT_SECRET!,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
  accountOwnerName: process.env.ZOHO_ACCOUNT_OWNER_NAME!,
  appName: process.env.ZOHO_APP_NAME!,
  formName: process.env.ZOHO_FORM_NAME!,
});

const zohoItems = await zohoClient.getInventory();
```

---

## Flujo de Sincronización

### 1. Manual (Botón "Sincronizar Ahora")

```
Usuario → Click "Sincronizar Ahora"
       → POST /api/zoho/sync
       → Zoho Client obtiene datos
       → Valida con Zod schemas
       → Inserta/actualiza en Supabase
       → Retorna resultado
```

### 2. Automática (Cron Job - Futuro)

Configurar en `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/zoho/sync",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Esto ejecutará la sincronización cada 5 minutos.

---

## Esquema de Zoho Creator Recomendado

### Formulario: "Inventario"

**Campos requeridos:**

1. **Item_Name** (Single Line)
   - Nombre del producto

2. **Color** (Single Line)
   - Color del producto

3. **State** (Dropdown)
   - Opciones: nuevo, usado

4. **SKU** (Single Line, Unique)
   - Código único del producto

5. **Warehouse_Code** (Dropdown)
   - Opciones: X1, X4, X5, etc.

6. **Quantity** (Number)
   - Cantidad disponible

7. **Last_Updated** (Date-Time)
   - Última actualización (auto)

### Workflow Recomendado en Zoho

```
ON UPDATE of Inventario
  → Trigger webhook to /api/zoho/sync
  → Actualizar Last_Updated = NOW()
```

---

## Testing de Integración

### 1. Probar Autenticación

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "grant_type=refresh_token"
```

### 2. Probar Obtención de Datos

```bash
curl -X GET "https://creator.zoho.com/api/v2/YOUR_ACCOUNT/YOUR_APP/report/All_Inventario" \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

### 3. Probar Sincronización

```bash
curl -X POST http://localhost:3000/api/zoho/sync \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

## Manejo de Errores

El sistema maneja automáticamente:

✅ **Token expirado** - Renueva automáticamente  
✅ **Rate limiting** - Reintenta con backoff  
✅ **Datos inválidos** - Valida con Zod y registra errores  
✅ **Conexión fallida** - Retorna error descriptivo  

---

## Monitoreo

### Logs de Sincronización

Todos los syncs se registran en la tabla `stock_snapshots`:

```sql
SELECT 
  items.name,
  warehouses.code,
  stock_snapshots.qty,
  stock_snapshots.synced_at
FROM stock_snapshots
JOIN items ON items.id = stock_snapshots.item_id
JOIN warehouses ON warehouses.id = stock_snapshots.warehouse_id
ORDER BY synced_at DESC
LIMIT 100;
```

### Verificar Última Sincronización

```sql
SELECT MAX(synced_at) as last_sync 
FROM stock_snapshots;
```

---

## Migración de Mock a Real

### Checklist:

- [ ] Obtener credenciales de Zoho Creator
- [ ] Agregar variables de entorno
- [ ] Configurar formulario en Zoho Creator
- [ ] Modificar `/api/zoho/sync/route.ts`
- [ ] Probar autenticación
- [ ] Probar sincronización manual
- [ ] Configurar cron job (opcional)
- [ ] Monitorear logs

---

## Troubleshooting

### Error: "Invalid client"
- Verificar Client ID y Client Secret
- Regenerar credenciales en Zoho API Console

### Error: "Invalid refresh token"
- Generar nuevo refresh token
- Verificar scopes: `ZohoCreator.report.READ`

### Error: "Form not found"
- Verificar nombres exactos en variables de entorno
- Verificar permisos en Zoho Creator

### Datos no se sincronizan
- Verificar estructura de datos de Zoho
- Revisar logs en consola del servidor
- Verificar políticas RLS en Supabase

---

## Próximos Pasos

1. ✅ Sistema funciona con datos mock
2. 🔄 Obtener credenciales de Zoho Creator
3. 🔄 Configurar variables de entorno
4. 🔄 Activar integración real
5. 🔄 Configurar sincronización automática

---

**Estado:** ✅ Listo para integración real cuando tengas las credenciales de Zoho Creator
