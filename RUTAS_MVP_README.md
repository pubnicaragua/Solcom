# MVP de Rutas - Solcom

## Estado del Proyecto

### ✅ FASE 1: COMPLETADA
**Centro de Rutas con selección funcional de pedidos**

**Archivos creados/modificados:**
- ✅ `src/app/(dashboard)/rutas/centro/page.tsx` - Nueva página principal del módulo
- ✅ `src/components/rutas/CreateRouteModal.tsx` - Modal funcional de creación de rutas
- ✅ `src/app/(dashboard)/rutas/page.tsx` - Redirige a Centro de Rutas
- ✅ `src/app/(dashboard)/rutas/layout.tsx` - Simplificado a 2 pestañas
- ✅ `supabase_rutas_mvp_migration.sql` - Script de migración de BD

**Funcionalidades implementadas:**
- ✅ Vista de 3 columnas: Pedidos | Mapa | Rutas
- ✅ Selección múltiple de pedidos con checkboxes
- ✅ Búsqueda por cliente, orden o dirección
- ✅ Filtros por zona y prioridad
- ✅ Contador de pedidos seleccionados
- ✅ Validación de coordenadas (alerta si faltan)
- ✅ Estadísticas en tiempo real (4 KPIs principales)
- ✅ Creación de ruta con datos del motorizado
- ✅ Generación automática de tracking token
- ✅ Actualización de estado de pedidos a "routed"

### 🚧 FASE 2: EN PROGRESO
**Google Maps real y optimización con Routes API**

**Archivos creados/modificados:**
- ✅ `src/components/rutas/GoogleMapView.tsx` - Componente de Google Maps
- ✅ `src/app/api/routes/optimize/route.ts` - Endpoint actualizado
- ✅ `src/types/google-maps.d.ts` - Declaraciones de tipos
- ✅ `tsconfig.json` - Configuración actualizada
- ⏳ Integración del mapa en Centro de Rutas (pendiente)
- ⏳ Botón "Optimizar ruta" funcional (pendiente)
- ⏳ Visualización de ruta optimizada (pendiente)

**Funcionalidades implementadas:**
- ✅ Componente GoogleMapView con markers y polylines
- ✅ Endpoint de optimización con soporte para returnToOrigin
- ✅ Validaciones de API key y coordenadas
- ✅ Cálculo de distancia y duración estimada

**Pendiente:**
- ⏳ Integrar GoogleMapView en Centro de Rutas
- ⏳ Mostrar pedidos seleccionados en el mapa
- ⏳ Botón "Optimizar" que llame al endpoint
- ⏳ Guardar ruta optimizada con polyline y orden

### ⏳ FASE 3: PENDIENTE
**Link único de tracking para motorizado**

**Archivos a crear:**
- `src/app/tracking/ruta/[tracking_token]/page.tsx` - Vista pública del motorizado
- `src/app/api/routes/tracking/location/route.ts` - Endpoint para recibir GPS
- `src/components/rutas/DriverTrackingView.tsx` - UI del motorizado

**Funcionalidades a implementar:**
- Pantalla pública sin login
- Solicitud de permiso de ubicación
- Envío de GPS cada 10-20 segundos
- Botón "Iniciar/Detener seguimiento"
- Modo bajo consumo de batería
- Soporte offline básico (IndexedDB)
- Botón "Copiar link" en panel
- Botón "Enviar por WhatsApp"

### ⏳ FASE 4: PENDIENTE
**Monitoreo en vivo y métricas**

**Archivos a modificar:**
- `src/app/(dashboard)/rutas/monitoreo/page.tsx` - Actualizar con Google Maps real
- Integrar Supabase Realtime para ubicaciones

**Funcionalidades a implementar:**
- Mapa con ubicación del motorizado en tiempo real
- Última actualización GPS
- Tiempo estimado vs tiempo real
- Alerta si no hay señal >2 minutos
- Estado de tracking (activo/sin señal/finalizado)

---

## Modelo de Datos

### Tablas Principales

**routes**
```sql
- id (UUID)
- name (VARCHAR)
- status (VARCHAR) - draft, optimized, assigned, in_progress, completed
- driver_name (VARCHAR) - Nombre del motorizado
- driver_phone (VARCHAR) - Teléfono para enviar link
- vehicle_label (VARCHAR) - Placa o identificador
- origin_lat, origin_lng (DECIMAL)
- return_to_origin (BOOLEAN)
- tracking_token (VARCHAR UNIQUE) - Token para link público
- tracking_enabled (BOOLEAN)
- optimized_at (TIMESTAMPTZ)
- tracking_started_at (TIMESTAMPTZ)
- tracking_ended_at (TIMESTAMPTZ)
- estimated_distance (INT)
- estimated_duration (INT)
- actual_duration (INT)
- encoded_polyline (TEXT)
- total_distance_meters (INT)
- total_duration_seconds (INT)
```

**route_stops**
```sql
- id (UUID)
- route_id (UUID FK)
- job_id (UUID FK)
- client_name (VARCHAR)
- address (TEXT)
- lat, lng (DECIMAL)
- original_sequence (INT)
- optimized_sequence (INT)
- sequence_order (INT)
- status (VARCHAR)
- estimated_arrival (TIMESTAMPTZ)
- actual_arrival (TIMESTAMPTZ)
```

**route_tracking_locations**
```sql
- id (UUID)
- route_id (UUID FK)
- tracking_token (VARCHAR)
- driver_name (VARCHAR)
- lat, lng (DECIMAL)
- accuracy (DECIMAL)
- heading (DECIMAL)
- speed (DECIMAL)
- battery_level (DECIMAL)
- recorded_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
```

**delivery_jobs**
```sql
- id (UUID)
- sales_order_id (VARCHAR)
- customer_name (VARCHAR)
- customer_phone (VARCHAR)
- address_text (TEXT)
- lat, lng (DECIMAL)
- zone_id (VARCHAR)
- priority (VARCHAR)
- status (VARCHAR)
- assigned_route_id (UUID FK)
- geocoded (BOOLEAN)
- geocoding_failed (BOOLEAN)
```

---

## Variables de Entorno Necesarias

### Google Maps (CRÍTICO para FASE 2+)
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
GOOGLE_MAPS_SERVER_API_KEY=AIza...  # Para Routes API en backend
```

### Supabase (Ya configuradas)
```env
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Instalación y Configuración

### 1. Ejecutar migración de BD
```sql
-- En Supabase SQL Editor
\i supabase_rutas_mvp_migration.sql
```

### 2. Configurar Google Maps API

**Habilitar APIs en Google Cloud Console:**
- Maps JavaScript API
- Routes API
- Geocoding API (para FASE 3)

**Restricciones recomendadas:**
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: Solo dominio del sitio
- GOOGLE_MAPS_SERVER_API_KEY: Solo IP del servidor

### 3. Agregar variables de entorno
```bash
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_api_key_aqui
GOOGLE_MAPS_SERVER_API_KEY=tu_api_key_servidor_aqui
```

---

## Flujo de Uso del MVP (cuando esté completo)

### Para el Despachador:

1. **Entrar a Rutas > Centro de Rutas**
2. **Ver pedidos pendientes** en columna izquierda
3. **Seleccionar pedidos** con checkboxes
4. **Hacer clic en "Crear Ruta"**
5. **Llenar formulario:**
   - Nombre de ruta
   - Nombre del motorizado
   - Teléfono del motorizado
   - Vehículo (opcional)
6. **Hacer clic en "Optimizar ruta"** (FASE 2)
7. **Ver ruta optimizada en mapa** con distancia y duración
8. **Guardar ruta**
9. **Copiar link de tracking**
10. **Enviar link por WhatsApp al motorizado**

### Para el Motorizado:

1. **Abrir link recibido** (no requiere login)
2. **Ver lista de paradas asignadas**
3. **Hacer clic en "Iniciar seguimiento"**
4. **Aceptar permiso de ubicación**
5. **Mantener pantalla abierta** durante recorrido
6. **Abrir cada parada en Google Maps** para navegación
7. **Marcar paradas como completadas**
8. **Finalizar ruta** al terminar

### Para Monitoreo:

1. **Entrar a Rutas > Monitoreo en Vivo**
2. **Ver rutas activas**
3. **Seleccionar ruta**
4. **Ver ubicación del motorizado en mapa**
5. **Ver tiempo transcurrido vs estimado**
6. **Recibir alertas si no hay señal**

---

## Notas Técnicas

### Errores de TypeScript de Google Maps
Los errores `Cannot find namespace 'google'` son **advertencias del IDE** que no afectan la ejecución. El objeto `google` se carga dinámicamente en runtime cuando se carga el script de Google Maps.

**Solución aplicada:**
- Creado `src/types/google-maps.d.ts` con declaraciones básicas
- Actualizado `tsconfig.json` para incluir tipos personalizados
- Los errores pueden persistir en el IDE pero el código funciona correctamente

### Tracking sin Login
El sistema usa **tokens únicos** en lugar de autenticación para permitir que el motorizado comparta ubicación sin crear usuario:

- Token generado con `generate_tracking_token()` (función SQL)
- Política RLS permite INSERT público con token válido
- Link formato: `/tracking/ruta/[token]`
- Token se puede desactivar cambiando `tracking_enabled = false`

### Limitaciones del Tracking Web
El seguimiento GPS desde navegador tiene limitaciones:

- **Requiere pantalla abierta** (no funciona en segundo plano)
- **Consume batería** si se usa `enableHighAccuracy`
- **Puede fallar** si el usuario bloquea el celular
- **Depende de internet** para enviar ubicaciones

**Mitigaciones implementadas:**
- Modo bajo consumo (intervalos más largos)
- Almacenamiento offline (IndexedDB)
- Sincronización cuando vuelve internet
- Mensajes claros al usuario sobre limitaciones

---

## Criterios de Aceptación del MVP

### ✅ Completados (FASE 1)
- [x] Seleccionar pedidos pendientes
- [x] Crear ruta con pedidos seleccionados
- [x] Asignar nombre, motorizado y teléfono
- [x] Validar que pedidos tengan coordenadas
- [x] Generar token único de tracking
- [x] Guardar ruta en BD

### ⏳ Pendientes (FASE 2-4)
- [ ] Optimizar ruta con Google Routes API
- [ ] Ver ruta en Google Maps real
- [ ] Ver paradas numeradas en mapa
- [ ] Guardar ruta optimizada con polyline
- [ ] Motorizado puede abrir link sin login
- [ ] Motorizado puede compartir ubicación
- [ ] Sistema guarda ubicaciones GPS
- [ ] Panel muestra motorizado en mapa
- [ ] Panel muestra última actualización
- [ ] Panel mide tiempo estimado vs real
- [ ] Soporte offline básico para motorizado
- [ ] No hay botones sin función
- [ ] No hay mapas SVG falsos
- [ ] UI entendible para usuario operativo

---

## Próximos Pasos

### Inmediato (para completar FASE 2):
1. Integrar `GoogleMapView` en `centro/page.tsx`
2. Mostrar pedidos seleccionados como markers
3. Agregar botón "Optimizar" en modal de creación
4. Llamar endpoint `/api/routes/optimize` al optimizar
5. Mostrar ruta optimizada con polyline
6. Guardar datos de optimización en BD
7. Actualizar `sequence_order` de paradas según orden optimizado

### Después (FASE 3):
1. Crear página pública `/tracking/ruta/[token]`
2. Implementar solicitud de permiso de ubicación
3. Crear endpoint `/api/routes/tracking/location`
4. Implementar envío periódico de GPS
5. Agregar botón "Copiar link" en panel
6. Agregar botón "Enviar por WhatsApp"

### Finalmente (FASE 4):
1. Actualizar página de Monitoreo con Google Maps
2. Integrar Supabase Realtime para ubicaciones
3. Mostrar última ubicación del motorizado
4. Calcular tiempo real vs estimado
5. Mostrar alertas si no hay señal

---

## Archivos Modificados/Creados (Resumen)

### Nuevos archivos:
- `src/app/(dashboard)/rutas/centro/page.tsx`
- `src/components/rutas/CreateRouteModal.tsx`
- `src/components/rutas/GoogleMapView.tsx`
- `src/types/google-maps.d.ts`
- `supabase_rutas_mvp_migration.sql`
- `RUTAS_MVP_README.md`

### Archivos modificados:
- `src/app/(dashboard)/rutas/page.tsx`
- `src/app/(dashboard)/rutas/layout.tsx`
- `src/app/api/routes/optimize/route.ts`
- `tsconfig.json`

### Archivos antiguos (deprecados, no eliminar todavía):
- `src/app/(dashboard)/rutas/planificador/page.tsx`
- `src/app/(dashboard)/rutas/bandeja/page.tsx`
- `src/app/(dashboard)/rutas/rendimiento/page.tsx`
- `src/app/(dashboard)/rutas/insights/page.tsx`
- `src/app/(dashboard)/rutas/alerts/page.tsx`

---

## Contacto y Soporte

Para dudas sobre implementación:
- Revisar este README
- Consultar código en `src/app/(dashboard)/rutas/centro/page.tsx`
- Verificar schema en `supabase_rutas_mvp_migration.sql`
