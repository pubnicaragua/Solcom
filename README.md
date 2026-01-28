# Solis Comercial - Dashboard de Inventario Multi-Bodega

![Solis Comercial](https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png)

**¡A tu servicio, siempre!**

Sistema completo de gestión de inventario multi-bodega con sincronización Zoho Creator, agentes IA, y API pública para integraciones externas.

## ✨ Módulos Completados y Funcionales

### 📦 Inventario
- ✅ KPIs en tiempo real (Total SKUs, Unidades, Bodegas activas, Última sync)
- ✅ Filtros avanzados (bodega, búsqueda, estado)
- ✅ Tabla estilo Excel con paginación (50 items/página)
- ✅ Exportación a CSV
- ✅ Componente SyncStatus con botón "Sincronizar Ahora"
- ✅ Datos mock para pruebas (8 items en 3 bodegas)

### 📊 Reportes
- ✅ Dashboard con métricas clave
- ✅ Análisis por categoría con gráficos de barras
- ✅ Top 10 productos más vendidos
- ✅ Filtros por período (7, 30, 90, 365 días)
- ✅ Exportación a Excel y PDF

### 👥 Roles y Permisos
- ✅ 4 roles predefinidos (Administrador, Gerente, Operador, Auditor)
- ✅ Sistema de permisos granular por módulo
- ✅ Gestión visual de permisos
- ✅ Contador de usuarios por rol

### ⚙️ Configuración
- ✅ Conexión Supabase con status en tiempo real
- ✅ Configuración de sincronización Zoho (intervalos)
- ✅ Sistema de notificaciones (toggle switches)
- ✅ Preferencias generales (idioma, zona horaria)
- ✅ Lista de endpoints API públicos documentados
- ✅ Información del sistema (versión, última actualización)

### 🤖 Agentes IA (100% Funcional)
- ✅ **6 Agentes Disponibles:**
  1. **Atención al Cliente** - Consultas de productos y disponibilidad
  2. **Cobranza** - Gestión de recordatorios de pago
  3. **Cotizaciones** - Generación automática basada en inventario
  4. **Facturación** - Asistencia en emisión de facturas
  5. **Voz (Speech)** - Integración con Twilio (preparado)
  6. **Auditoría** - Detección de inconsistencias
- ✅ Chat en tiempo real con interfaz moderna
- ✅ Integración con Groq AI
- ✅ Estadísticas de uso por agente
- ✅ Ejemplos de consultas incluidos

### 📖 Cómo Funciona
- ✅ Diagrama visual de 6 pasos del flujo de datos
- ✅ Explicación detallada de arquitectura
- ✅ Guía de próximos pasos
- ✅ Información sobre escalabilidad y seguridad

## 🌐 API Pública para Integraciones Externas

**Estrategia:** Los clientes se conectan a nosotros, no nosotros a ellos.

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/inventory` | Consultar inventario con filtros |
| GET | `/api/inventory/kpis` | Obtener métricas en tiempo real |
| GET | `/api/inventory/export` | Exportar inventario a CSV |
| GET | `/api/warehouses` | Listar bodegas activas |
| POST | `/api/zoho/sync` | Sincronizar datos desde Zoho |
| POST | `/api/ai/chat` | Consultar agentes IA |

### Documentación Completa

- 📄 **API_DOCUMENTATION.md** - Documentación técnica completa con ejemplos
- 📘 **INTEGRATION_GUIDE.md** - Guía de integración con 10 casos de uso reales

### Casos de Uso Documentados

1. ✅ Página Web Corporativa (iFrame + Widget JS)
2. ✅ Aplicación Móvil (Android/iOS)
3. ✅ Chatbot Facebook Messenger
4. ✅ WhatsApp Business API
5. ✅ Sistema POS (Punto de Venta)
6. ✅ Dashboard Power BI / Tableau
7. ✅ Integración con ERP Externo
8. ✅ Notificaciones por Email (SendGrid)
9. ✅ Google Sheets (Apps Script)
10. ✅ Smart TV / Pantallas Digitales

### Ventajas de Nuestra API

✅ **Control Total** - Nosotros controlamos los datos y la seguridad  
✅ **Sin Mantenimiento Futuro** - No dependemos de APIs de terceros  
✅ **Escalabilidad Ilimitada** - Sin límites de plataformas  
✅ **Monetización** - Planes de uso de API  
✅ **Independencia** - No afectados por cambios externos  

## 🚀 Características

- **Dashboard Dark UI** con diseño moderno y tipografía Poppins
- **Inventario Multi-Bodega** con filtros avanzados y exportación CSV
- **KPIs en Tiempo Real** (Total SKUs, Unidades, Bodegas activas)
- **Sincronización Zoho Creator** con endpoint API robusto
- **Supabase Backend** con RLS y auditoría completa
- **Preparado para IA** con integración Groq para agentes futuros
- **TypeScript + Zod** para validación y type-safety
- **Arquitectura Escalable** con componentes modulares

## 📦 Stack Tecnológico

- **Framework**: Next.js 14 (App Router)
- **UI**: React + TypeScript
- **Base de Datos**: Supabase (PostgreSQL + Realtime)
- **Validación**: Zod
- **IA**: Groq (preparado para agentes)
- **Integración**: Zoho Creator API

## 🛠️ Instalación y Configuración

### 1. Instalar Dependencias

```bash
cd "c:/Users/Probook 450 G7/Desktop/Solis Comercial"
npm install
```

### 2. Configurar Base de Datos Supabase

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Abrir proyecto: `https://pknkpvysiarfxvrhjqcx.supabase.co`
3. Ir a **SQL Editor**
4. Copiar y ejecutar el contenido de `src/lib/supabase/schema.sql`

### 3. Variables de Entorno (Ya configuradas)

El archivo `.env.local` ya contiene:

```env
NEXT_PUBLIC_SUPABASE_URL=https://pknkpvysiarfxvrhjqcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Cl0OcY_9jV5dPYOmkRh72g_sY1R50Og
GROQ_API_KEY=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
```

### 4. Ejecutar en Desarrollo

```bash
npm run dev

# Build para producción
npm run build
npm start
```

## � Archivos Importantes

### Documentación
- **README.md** - Este archivo
- **SETUP.md** - Guía detallada de instalación
- **API_DOCUMENTATION.md** - Documentación completa de API
- **INTEGRATION_GUIDE.md** - Guía de integración con ejemplos

### Configuración
- **.env.local** - Variables de entorno (Supabase, Groq)
- **package.json** - Dependencias del proyecto
- **tsconfig.json** - Configuración TypeScript
- **next.config.js** - Configuración Next.js
- `name` (text)
- `active` (boolean)
- `created_at` (timestamp)

**items**
- `id` (uuid, PK)
- `sku` (text, unique)
- `name` (text)
- `color` (text)
- `state` (text) - nuevo/usado
- `zoho_item_id` (text)
- `created_at` (timestamp)

**stock_snapshots**
- `id` (uuid, PK)
- `warehouse_id` (uuid, FK)
- `item_id` (uuid, FK)
- `qty` (integer)
- `source_ts` (timestamp) - timestamp de Zoho
- `synced_at` (timestamp)

**stock_movements** (opcional, fase 2)
- Entradas/salidas por documento

## 🔄 Flujo de Sincronización

1. **Zoho Creator** → Genera existencias por bodega
2. **Sync API** → Consulta endpoint con filtros
3. **Normalización** → Unifica ItemID/SKU + BodegaID
4. **Supabase** → Guarda snapshots + movimientos
5. **Panel Web** → Muestra data con filtros y export
6. **IA (Futuro)** → Consultas inteligentes contra Supabase

## 🎨 Design System

### Colores
- **Brand Primary**: #FF0000 (Rojo Solis)
- **Brand Accent**: #E11D48
- **Background**: #071826
- **Text**: #E5E7EB
- **Success**: #10B981
- **Error**: #EF4444
- **Warning**: #F59E0B

### Tipografía
- **Font**: Poppins
- **Títulos**: 20px, weight 400, uppercase
- **Subtítulos**: 18px, weight 500

## 🤖 Agentes IA (Fase Futura)

Preparado para integrar:
- Agente de Atención al Cliente
- Agente de Cobranza
- Agente de Cotizaciones
- Agente de Facturación
- Agente de Voz (Speech)
- Agente de Auditoría

## 📝 Documentos Requeridos para Pruebas

1. **Lista de Bodegas** (CSV): warehouse_code, warehouse_name, is_primary
2. **Maestro de Artículos** (CSV): item_id/sku, item_name, color, state
3. **Existencias Actuales** (CSV): warehouse_code, sku/item_id, qty

## 🔐 Seguridad

- Variables de entorno nunca expuestas al frontend
- Supabase RLS activado
- API keys solo en server-side
- Validación con Zod en todos los endpoints

## 📄 Licencia

Propiedad de Solis Comercial - Todos los derechos reservados
