# CLAUDE.md — Solis Comercial ERP

Guía de contexto para el asistente AI sobre este proyecto.

---

## Descripción del proyecto

**Solis Comercial ERP** es un dashboard interno para la empresa Solis Comercial Nicaragua. Gestiona inventario, ventas, transferencias entre bodegas, reportes y usuarios con roles y permisos. Está sincronizado con **Zoho Inventory** vía webhooks y API.

---

## Stack tecnológico

- **Framework**: Next.js 14 (App Router, Server Components)
- **Lenguaje**: TypeScript
- **Base de datos / Auth**: Supabase (PostgreSQL + RLS + Auth)
- **Estilos**: Vanilla CSS (sin Tailwind en componentes propios) — Tailwind instalado pero no se usa activamente
- **Iconos**: `lucide-react`
- **Exportación**: `xlsx` (Excel), `jspdf` + `jspdf-autotable` (PDF)
- **Validación**: `zod`
- **AI**: OpenAI + Groq SDK
- **Dev server**: `npm run dev` (puerto 3000)

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
│   ├── api/             # Route handlers (Next.js API)
│   ├── cliente/         # Portal de cliente externo
│   └── reuniones/       # Actas de reuniones (solo admins)
├── components/
│   ├── dashboard/       # Sidebar, Topbar, PivotInventoryTable, etc.
│   ├── modals/          # Modales (editar producto, stock, transferencia)
│   ├── ui/              # Componentes base (Button, Card, Input, Select, Badge)
│   └── ventas/          # InvoicePreview, QuotePreview
├── hooks/
│   └── useUserRole.ts   # Hook principal de autenticación y permisos
├── lib/
│   ├── auth/
│   │   ├── warehouse-permissions.ts  # getWarehouseAccessScope, requireAdminProfile
│   │   └── module-permissions.ts     # MODULE_DEFINITIONS, ROLE_BASE_MODULES
│   ├── supabase/        # Scripts SQL de migraciones
│   └── zoho/            # Lógica de sincronización con Zoho
├── contexts/
│   └── SidebarContext.tsx
├── middleware.ts         # Protección de rutas y verificación de módulos
└── styles/
    └── globals.css      # Variables CSS, tokens de diseño
```

---

## Roles del sistema

| Role key   | Nombre UI          | Acceso                                    |
|------------|--------------------|-------------------------------------------|
| `admin`    | Administrador      | Todo                                      |
| `manager`  | Gerente de Bodega  | Inventario, Transferencias, Reportes      |
| `operator` | Vendedor           | Inventario (lectura), Ventas              |
| `auditor`  | Auditor            | Reportes                                  |

Los roles custom se crean dinámicamente en la tabla `roles` de Supabase. Sus permisos se guardan en `role_permissions` usando el **nombre** del rol (no el UUID) como clave.

> ⚠️ La tabla `role_permissions` **no debe** tener CHECK constraint en la columna `role`. Si existe, hay que eliminarlo con:
> ```sql
> ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
> ```

---

## Sistema de permisos

### Módulos (`module-permissions.ts`)
- `MODULE_DEFINITIONS`: lista de módulos con sus rutas
- `ROLE_BASE_MODULES`: qué módulos tiene cada rol base
- El Sidebar oculta módulos sin acceso **durante y después** del loading (`loading || !hasModuleAccess(module)`)

### Permisos granulares (`role_permissions` tabla)
- Tabla: `permissions` (code, name, module)
- Tabla: `role_permissions` (role TEXT, permission_code TEXT)
- API: `GET/POST/DELETE /api/role-permissions`
- El frontend envía `{ role: string, permission_code: string }` (singular, no array)

### Módulo de Reuniones
- Solo visible para admins
- No debe estar en `publicRoutes` del middleware

---

## Tablas principales en Supabase

| Tabla                      | Descripción                                  |
|----------------------------|----------------------------------------------|
| `user_profiles`            | Perfil con `role` (admin/manager/operator/auditor) |
| `roles`                    | Roles custom creados dinámicamente           |
| `permissions`              | Catálogo de permisos granulares              |
| `role_permissions`         | Asignación permiso→rol                       |
| `user_module_permissions`  | Override de módulos por usuario              |
| `user_warehouse_settings`  | Config de bodegas por usuario                |
| `user_warehouse_permissions` | Bodegas específicas por usuario            |
| `inventory_items`          | Productos sincronizados desde Zoho           |
| `inventory_balance`        | Stock por bodega                             |
| `warehouses`               | Bodegas                                      |
| `invoices` / `quotes`      | Facturas y cotizaciones                      |
| `transfers`                | Transferencias entre bodegas                 |

---

## Convenciones importantes

### API Routes
- Siempre usar `createRouteHandlerClient({ cookies })` para Supabase en route handlers
- Usar `requireAdminProfile()` o `getAuthenticatedProfile()` desde `@/lib/auth/warehouse-permissions`
- Validar payloads con `zod`
- Retornar errores amigables en español

### Componentes
- Todos los estilos van inline o en `globals.css` con variables CSS (`var(--brand-primary)`, `var(--muted)`, etc.)
- No usar Tailwind en componentes nuevos
- Componentes UI base están en `src/components/ui/`

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

## Credenciales de desarrollo

- **Admin dev**: `devjairsebas0110@gmail.com` / `123456`
- **Visitante (operator)**: `visitante@soliscomercialni.com` / `123456`

---

## Comandos útiles

```bash
npm run dev          # Servidor de desarrollo (puerto 3000)
npm run build        # Build de producción
npm run type-check   # Verificar TypeScript sin compilar
npm run lint         # ESLint
```

---

## Notas de arquitectura

- El **middleware** (`src/middleware.ts`) protege todas las rutas y verifica permisos por módulo antes de renderizar la página
- El **`useUserRole` hook** hace 2 queries a Supabase al montar (profile + module overrides) — hay un delay intencional de 1-2s en el Sidebar mientras carga
- La exportación de inventario a Excel/PDF usa `window.open('/api/inventory/export?...')` que abre en nueva pestaña
- Los roles custom usan su **nombre** (no UUID) como key en `role_permissions`
- Zoho Inventory es la fuente de verdad para productos; se sincroniza via cron y webhooks
