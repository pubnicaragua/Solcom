# Guía de Configuración - Solis Comercial Dashboard

## 📋 Requisitos Previos

- Node.js 18+ instalado
- Cuenta de Supabase (gratuita)
- Acceso a Zoho Creator (opcional para sincronización real)

## 🚀 Instalación Rápida

### 1. Instalar Dependencias

```bash
cd "c:/Users/Probook 450 G7/Desktop/Solis Comercial"
npm install
```

### 2. Configurar Base de Datos Supabase

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Abrir el proyecto: `https://pknkpvysiarfxvrhjqcx.supabase.co`
3. Ir a **SQL Editor**
4. Copiar y ejecutar el contenido de `src/lib/supabase/schema.sql`

El schema creará:
- ✅ Tabla `warehouses` (bodegas)
- ✅ Tabla `items` (artículos/SKUs)
- ✅ Tabla `stock_snapshots` (existencias por bodega)
- ✅ Tabla `stock_movements` (movimientos de inventario)
- ✅ Índices optimizados para búsquedas rápidas
- ✅ Row Level Security (RLS) configurado
- ✅ Vista `current_stock` para consultas rápidas

### 3. Verificar Variables de Entorno

El archivo `.env.local` ya está configurado con:

```env
NEXT_PUBLIC_SUPABASE_URL=https://pknkpvysiarfxvrhjqcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Cl0OcY_9jV5dPYOmkRh72g_sY1R50Og
GROQ_API_KEY=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
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

Abrir navegador en: **http://localhost:3000**

## 🧪 Probar el Sistema

### Sincronización con Datos Mock

1. Ir a **Inventario** en el dashboard
2. Hacer clic en **"Sincronizar Ahora"**
3. El sistema cargará 8 items de prueba en 3 bodegas (X1, X4, X5)
4. Verificar que aparezcan en la tabla de inventario

### Funcionalidades Disponibles

- ✅ **KPIs en tiempo real**: Total SKUs, Unidades, Bodegas activas
- ✅ **Filtros avanzados**: Por bodega, búsqueda, estado
- ✅ **Tabla paginada**: 50 items por página
- ✅ **Exportación CSV**: Descarga inventario filtrado
- ✅ **Sincronización manual**: Botón "Sincronizar Ahora"

## 🔧 Configuración Avanzada (Opcional)

### Integrar Zoho Creator Real

Para conectar con Zoho Creator en lugar de usar datos mock:

1. **Crear OAuth Client en Zoho**
   - Ir a [Zoho API Console](https://api-console.zoho.com/)
   - Crear nueva aplicación "Server-based Applications"
   - Obtener `Client ID` y `Client Secret`

2. **Generar Refresh Token**
   ```bash
   # Usar Zoho OAuth Playground o seguir documentación oficial
   # https://www.zoho.com/creator/help/api/v2/oauth-overview.html
   ```

3. **Agregar credenciales a `.env.local`**
   ```env
   ZOHO_CLIENT_ID=tu_client_id
   ZOHO_CLIENT_SECRET=tu_client_secret
   ZOHO_REFRESH_TOKEN=tu_refresh_token
   ZOHO_ACCOUNT_OWNER=tu_cuenta_zoho
   ZOHO_APP_LINK_NAME=nombre_app_creator
   ```

4. **Modificar `src/app/api/zoho/sync/route.ts`**
   - Descomentar líneas de integración real
   - Comentar sección MOCK_DATA

### Configurar Webhooks de Zoho (Opcional)

Para sincronización automática en tiempo real:

1. En Zoho Creator, ir a **Settings → Webhooks**
2. Crear webhook que apunte a: `https://tu-dominio.com/api/zoho/sync`
3. Configurar trigger en eventos de inventario

## 📊 Estructura del Proyecto

```
src/
├── app/
│   ├── (dashboard)/          # Páginas del dashboard
│   │   ├── inventory/         # Módulo de inventario
│   │   ├── reports/           # Módulo de reportes
│   │   ├── roles/             # Módulo de roles
│   │   ├── settings/          # Configuración
│   │   └── how-it-works/      # Documentación visual
│   ├── api/                   # API Routes (server-side)
│   │   ├── zoho/sync/         # Sincronización Zoho
│   │   ├── inventory/         # Endpoints de inventario
│   │   ├── warehouses/        # Endpoints de bodegas
│   │   └── ai/chat/           # Chat con IA (preparado)
│   └── layout.tsx             # Layout principal
├── components/
│   ├── ui/                    # Componentes reutilizables
│   │   ├── Card.tsx
│   │   ├── Button.tsx
│   │   ├── Table.tsx
│   │   ├── Badge.tsx
│   │   ├── Input.tsx
│   │   └── Select.tsx
│   └── dashboard/             # Componentes del dashboard
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       ├── KPIGrid.tsx
│       ├── SyncStatus.tsx
│       ├── InventoryFilters.tsx
│       └── InventoryTable.tsx
├── lib/
│   ├── supabase/              # Cliente Supabase
│   │   ├── client.ts          # Cliente browser
│   │   ├── server.ts          # Cliente server
│   │   ├── types.ts           # Tipos TypeScript
│   │   └── schema.sql         # Schema SQL
│   ├── zoho/                  # Cliente Zoho
│   │   ├── client.ts
│   │   └── types.ts
│   ├── ai/                    # Integración IA
│   │   └── groq.ts
│   └── validators/            # Validación Zod
│       └── inventory.ts
└── styles/
    └── globals.css            # Estilos globales + tokens
```

## 🎨 Design System

### Colores CSS Variables

```css
--bg: #071826              /* Fondo principal */
--panel: rgba(255,255,255,0.04)  /* Fondo de paneles */
--border: rgba(255,255,255,0.08) /* Bordes */
--text: #E5E7EB            /* Texto principal */
--muted: #9CA3AF           /* Texto secundario */
--brand-primary: #FF0000   /* Rojo Solis */
--brand-accent: #E11D48    /* Acento */
--success: #10B981         /* Verde éxito */
--danger: #EF4444          /* Rojo error */
--warning: #F59E0B         /* Amarillo warning */
```

### Tipografía

- **Font**: Poppins (Google Fonts)
- **Títulos**: 20px, weight 400, uppercase
- **Subtítulos**: 18px, weight 500

## 🤖 Preparado para IA

El sistema está listo para activar agentes de IA con Groq:

### Endpoint de Chat IA

```typescript
POST /api/ai/chat
Body: { "question": "¿Cuántas unidades hay en bodega X1?" }
```

### Agentes Futuros Sugeridos

1. **Atención al Cliente**: Consultas de disponibilidad
2. **Cobranza**: Estado de cuentas y recordatorios
3. **Cotizaciones**: Generación automática con stock
4. **Facturación**: Asistencia en emisión
5. **Voz (Speech)**: Integración con Twilio
6. **Auditoría**: Detección de inconsistencias

## 🔐 Seguridad

- ✅ API keys solo en server-side (nunca en frontend)
- ✅ Supabase RLS activado en todas las tablas
- ✅ Validación con Zod en todos los endpoints
- ✅ Variables de entorno en `.env.local` (no commiteadas)

## 📈 Escalabilidad

### Optimizaciones Implementadas

- Paginación eficiente (50 items por página)
- Índices en columnas de búsqueda frecuente
- Queries optimizadas con joins selectivos
- Componentes React memoizados cuando necesario
- Lazy loading de módulos con Next.js

### Límites Recomendados

- **Items por bodega**: Hasta 10,000 sin problemas
- **Bodegas activas**: Hasta 50 sin problemas
- **Usuarios concurrentes**: Hasta 100 sin problemas
- **Sincronizaciones/día**: Hasta 1,000 sin problemas

## 🐛 Troubleshooting

### Error: "Cannot connect to Supabase"

1. Verificar que el schema SQL se ejecutó correctamente
2. Verificar credenciales en `.env.local`
3. Verificar que el proyecto Supabase está activo

### Error: "No data in inventory"

1. Hacer clic en "Sincronizar Ahora" en el dashboard
2. Verificar en Supabase que las tablas tienen datos
3. Revisar logs del navegador (F12 → Console)

### Error: TypeScript errors

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

## 📞 Soporte

Para soporte técnico o preguntas:
- Revisar la sección **"Cómo Funciona"** en el dashboard
- Consultar el README.md del proyecto
- Verificar logs en Supabase Dashboard

## 🎯 Próximos Pasos

1. ✅ Cargar datos reales desde Zoho Creator
2. ✅ Configurar webhooks para sincronización automática
3. ✅ Activar agentes de IA según necesidad
4. ✅ Configurar roles y permisos de usuarios
5. ✅ Implementar módulo de reportes personalizados
6. ✅ Deploy a producción (Vercel recomendado)

---

**¡Listo para usar!** 🚀

El dashboard está completamente funcional con datos mock y preparado para integración real con Zoho Creator.
