# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Descripción del proyecto

**Solis Comercial ERP** — Dashboard interno para Solis Comercial Nicaragua. Gestiona inventario, ventas, transferencias entre bodegas, reportes y usuarios con roles y permisos. Sincronizado con **Zoho Inventory** y **Zoho Books** vía webhooks y API.

---

## Stack tecnológico

- **Framework**: Next.js 14 (App Router, Server Components)
- **Lenguaje**: TypeScript
- **Base de datos / Auth**: Supabase (PostgreSQL + RLS + Auth)
- **Estilos**: Vanilla CSS — Tailwind instalado pero **no se usa** en componentes propios
- **Iconos**: `lucide-react`
- **Exportación**: `xlsx` (Excel), `jspdf` + `jspdf-autotable` (PDF)
- **Validación**: `zod`
- **Fechas**: `date-fns`
- **AI**: OpenAI + Groq SDK

---

## Comandos

```bash
npm run dev              # Servidor de desarrollo (puerto 3000)
npm run build            # Build de producción
npm run type-check       # Verificar TypeScript sin compilar
npm run lint             # ESLint
npm run check:kpis       # Diagnóstico de KPIs (producción)
npm run check:kpis:local # Diagnóstico de KPIs (local)

# Scripts manuales
node scripts/sync-warehouse-hierarchy.js   # Sincroniza jerarquía empresarial/almacén desde Zoho
```

---

## Path alias

```ts
"@/*" → "./src/*"
// Ejemplo: import Button from '@/components/ui/Button'
```

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/          # Login, signup, reset-password
│   ├── (dashboard)/     # Módulos protegidos (layout compartido)
│   │   ├── inventory/   # Inventario pivote
│   │   ├── ventas/      # Facturas y cotizaciones
│   │   ├── reports/     # Reportes con export PDF/Excel
│   │   ├── transfers/   # Transferencias entre bodegas
│   │   ├── roles/       # Gestión de usuarios y permisos
│   │   ├── settings/    # Configuración del sistema
│   │   ├── ai-agents/   # Agentes IA
│   │   └── fase2/       # Módulo en desarrollo
│   ├── api/             # ~70 route handlers (Next.js API)
│   ├── cliente/         # Portal de cliente externo
│   └── reuniones/       # Actas de reuniones (solo admins)
├── components/
│   ├── dashboard/       # Sidebar, Topbar, PivotInventoryTable, KPIGrid, etc.
│   ├── modals/          # Modales (editar producto, stock, transferencia)
│   ├── ui/              # Componentes base (Button, Card, Input, Select, Badge)
│   └── ventas/          # InvoicePreview, QuotePreview
├── hooks/
│   └── useUserRole.ts   # Hook principal: role, loading, hasModuleAccess()
├── lib/
│   ├── auth/
│   │   ├── warehouse-permissions.ts  # getWarehouseAccessScope, requireAdminProfile, getAuthenticatedProfile
│   │   └── module-permissions.ts     # MODULE_DEFINITIONS (13 módulos), ROLE_BASE_MODULES, hasRolePermissionCode
├── contexts/
│   └── SidebarContext.tsx
├── middleware.ts         # Protección de rutas y verificación de módulos
└── styles/
    └── globals.css      # Variables CSS, tokens de diseño
```

---

## Roles del sistema

| Role key   | Nombre UI         | Módulos                                          |
|------------|-------------------|--------------------------------------------------|
| `admin`    | Administrador     | Todos (13 módulos)                               |
| `manager`  | Gerente de Bodega | inventory, ventas, reports, ai-agents, transfers |
| `operator` | Vendedor          | inventory (lectura), ventas                      |
| `auditor`  | Auditor           | reports                                          |

Los roles custom se crean dinámicamente en la tabla `roles` de Supabase. Sus permisos se guardan en `role_permissions` usando el **nombre** del rol (no el UUID) como clave.

> ⚠️ La tabla `role_permissions` **no debe** tener CHECK constraint en la columna `role`. Si existe, eliminarlo con:
> ```sql
> ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
> ```

### Roles custom en el frontend (`roles/page.tsx`)
- Los roles custom usan `role.name` (no UUID) como `id` para que coincida con `role_permissions.role`
- Cada rol custom recibe un color de una paleta: `['#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#10B981', '#F97316']`
- El panel de permisos muestra el nombre buscando en `rolesWithCounts`, no solo en `ROLE_DEFINITIONS`

---

## Sistema de permisos

### Módulos (`module-permissions.ts`)
- `MODULE_DEFINITIONS`: 13 módulos con sus rutas
- `ROLE_BASE_MODULES`: módulos base por rol
- El Sidebar oculta módulos sin acceso **durante y después** del loading: `loading || !hasModuleAccess(module)`
- `hasRolePermissionCode(supabase, role, code)`: chequea un permiso granular contra `role_permissions`

### Permisos granulares
- Tabla `permissions`: `(code, name, module)`
- Tabla `role_permissions`: `(role TEXT, permission_code TEXT)`
- API: `GET/POST/DELETE /api/role-permissions`
- El frontend envía `{ role: string, permission_code: string }` (singular, no array)

### Módulo de Reuniones
- Solo visible para admins
- **No** debe estar en `publicRoutes` del middleware

---

## Tablas principales en Supabase

| Tabla                        | Descripción                                        |
|------------------------------|----------------------------------------------------|
| `user_profiles`              | Perfil con `role` (admin/manager/operator/auditor) |
| `roles`                      | Roles custom creados dinámicamente                 |
| `permissions`                | Catálogo de permisos granulares                    |
| `role_permissions`           | Asignación permiso→rol (usa nombre, no UUID)       |
| `user_module_permissions`    | Override de módulos por usuario                    |
| `user_warehouse_settings`    | Config de bodegas por usuario (flag all_warehouses)|
| `user_warehouse_permissions` | Bodegas específicas por usuario                    |
| `inventory_items`            | Productos sincronizados desde Zoho                 |
| `inventory_balance`          | Stock por bodega                                   |
| `warehouses`                 | Bodegas (con `warehouse_type` y `parent_warehouse_id`) |
| `invoices` / `quotes`        | Facturas y cotizaciones                            |
| `transfers`                  | Transferencias entre bodegas                       |

---

## Convenciones importantes

### API Routes
- Usar `createRouteHandlerClient({ cookies })` de `@supabase/auth-helpers-nextjs` en route handlers
- Usar `requireAdminProfile()` o `getAuthenticatedProfile()` desde `@/lib/auth/warehouse-permissions`
- Validar payloads con `zod`
- Retornar errores amigables en español

### Componentes
- Estilos van inline o en `globals.css` con variables CSS (`var(--brand-primary)`, etc.)
- **No usar Tailwind** en componentes nuevos
- Componentes UI base en `src/components/ui/`

### CSS Variables principales
```css
--brand-primary   /* Rojo Solis Comercial */
--brand-accent
--success
--warning
--danger
--muted
--panel
--border
--text
```

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # Solo server-side
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
ZOHO_BOOKS_CLIENT_ID             # Integración Zoho Books (separada)
ZOHO_BOOKS_CLIENT_SECRET
ZOHO_BOOKS_REFRESH_TOKEN
ZOHO_BOOKS_ORGANIZATION_ID
OPENAI_API_KEY
GROQ_API_KEY
```

---

## Credenciales de desarrollo

- **Admin dev**: `devjairsebas0110@gmail.com` / `123456`
- **Visitante (operator)**: `visitante@soliscomercialni.com` / `123456`

---

## Notas de arquitectura

- **Flujo de auth**: `middleware.ts` → `useUserRole` hook → chequeos a nivel componente con `hasModuleAccess()`
- **`useUserRole`** hace 2 queries a Supabase al montar (profile + module overrides). Incluye cleanup/abort para remounts rápidos en dev.
- **`getWarehouseAccessScope()`**: admin ve todas las bodegas; otros tienen scope explícito via `user_warehouse_settings` y `user_warehouse_permissions`
- **Portal cliente**: usuario especial hardcodeado (`8abe3739-ba0d-4b5b-9e67-a1d9b5e6c588`) con rutas `/cliente/*`
- **Exportación de inventario**: usa `window.open('/api/inventory/export?...')` — abre en nueva pestaña
- **Zoho Inventory** es la fuente de verdad para productos; sincronizado via cron (`/api/cron/sync-inventory`) y webhooks (`/api/webhooks/zoho`)
- **Zoho Books** maneja facturas/cotizaciones de ventas (integración separada)

---

## Jerarquía de bodegas

Las bodegas tienen una clasificación jerárquica sincronizada desde Zoho:

| warehouse_type | Descripción | parent_warehouse_id |
|---------------|-------------|---------------------|
| `empresarial` | Empresa/sucursal madre (MS, SC) | `NULL` |
| `almacen`     | Bodega física hija | UUID de la empresarial |
| `independiente` | Sin jerarquía | `NULL` |

**Endpoint Zoho**: `/books/v3/locations?is_hierarchical_response=true` (diferente de `/inventory/v1/warehouses` que no trae jerarquía)

**Sync**: `node scripts/sync-warehouse-hierarchy.js` — solo actualiza `warehouse_type` y `parent_warehouse_id`, no toca columnas existentes.

**Migración SQL**: `src/lib/supabase/warehouse-hierarchy-migration.sql`
