# Guía de Instalación - MVP de Rutas

## ✅ Estado Actual del Proyecto

### FASES COMPLETADAS (1, 2 y 3)

**FASE 1: Centro de Rutas ✅**
- Selección múltiple de pedidos
- Búsqueda y filtros funcionales
- Creación de rutas con datos del motorizado
- Validación de coordenadas
- Generación automática de tracking token

**FASE 2: Google Maps y Optimización ✅**
- Componente GoogleMapView integrado
- Visualización de pedidos en mapa real
- Endpoint de optimización con Google Routes API
- Botón "Optimizar Ruta" funcional
- Guardado de polyline y orden optimizado
- Cálculo de distancia y duración

**FASE 3: Tracking Público ✅**
- Pantalla pública sin login (`/tracking/ruta/[token]`)
- Solicitud de permiso de ubicación
- Envío de GPS cada 15 segundos
- Botones Iniciar/Detener seguimiento
- Soporte offline con IndexedDB
- Sincronización automática cuando vuelve internet
- Botón "Copiar link" y "Enviar por WhatsApp"
- Monitoreo de batería y conexión

**FASE 4: Pendiente ⏳**
- Actualizar página de Monitoreo con Google Maps
- Mostrar ubicación del motorizado en tiempo real
- Integrar Supabase Realtime
- Métricas tiempo estimado vs real

---

## 📋 Pasos de Instalación

### 1. Ejecutar Migración de Base de Datos

Abrí **Supabase SQL Editor** y ejecutá el siguiente script:

```bash
# Archivo a ejecutar:
supabase_rutas_mvp_migration.sql
```

Este script creará:
- Campos adicionales en tabla `routes` para tracking
- Campos adicionales en tabla `route_stops` para orden optimizado
- Tabla `route_tracking_locations` para ubicaciones GPS
- Función `generate_tracking_token()` para tokens únicos
- Políticas RLS para permitir INSERT público con token válido
- Índices para optimizar consultas

**Verificación:**
```sql
-- Verificar que la tabla existe
SELECT * FROM route_tracking_locations LIMIT 1;

-- Verificar que la función existe
SELECT generate_tracking_token();
```

---

### 2. Configurar Google Maps API

#### 2.1 Crear Proyecto en Google Cloud Console

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear nuevo proyecto o seleccionar existente
3. Habilitar las siguientes APIs:
   - **Maps JavaScript API** (para el mapa en frontend)
   - **Routes API** (para optimización de rutas)
   - **Geocoding API** (opcional, para geocodificar direcciones)

#### 2.2 Crear API Keys

**API Key para Frontend:**
1. Ir a "Credenciales" → "Crear credenciales" → "Clave de API"
2. Nombre: `Solcom Maps Frontend`
3. Restricciones:
   - **Restricciones de aplicación**: Sitios web
   - **Restricciones de sitio web**: Agregar dominios permitidos
     - `http://localhost:3000/*` (desarrollo)
     - `https://tudominio.com/*` (producción)
   - **Restricciones de API**: Seleccionar solo "Maps JavaScript API"

**API Key para Backend:**
1. Crear otra clave de API
2. Nombre: `Solcom Routes Backend`
3. Restricciones:
   - **Restricciones de aplicación**: Direcciones IP
   - **Direcciones IP**: Agregar IP del servidor (o dejar sin restricción en desarrollo)
   - **Restricciones de API**: Seleccionar solo "Routes API"

#### 2.3 Agregar Variables de Entorno

Crear o actualizar archivo `.env.local`:

```env
# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...tu_key_frontend
GOOGLE_MAPS_SERVER_API_KEY=AIza...tu_key_backend

# Supabase (ya deberían estar configuradas)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**⚠️ IMPORTANTE:**
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` es pública (se expone al navegador)
- `GOOGLE_MAPS_SERVER_API_KEY` es privada (solo backend)
- Nunca commitear `.env.local` a Git

---

### 3. Instalar Dependencias (si es necesario)

El proyecto ya debería tener todas las dependencias. Si no:

```bash
npm install @supabase/supabase-js
```

---

### 4. Ejecutar en Desarrollo

```bash
npm run dev
```

Abrir: `http://localhost:3000/rutas`

---

## 🧪 Pruebas Manuales

### Prueba 1: Crear Ruta

1. Ir a **Rutas > Centro de Rutas**
2. Verificar que se cargan pedidos pendientes
3. Seleccionar 2-3 pedidos con checkboxes
4. Hacer clic en **"Crear Ruta"**
5. Llenar formulario:
   - Nombre: `Ruta Prueba 1`
   - Motorizado: `Juan Pérez`
   - Teléfono: `8888-1234`
   - Vehículo: `M123-456`
6. Hacer clic en **"Crear Ruta"**
7. **Resultado esperado:**
   - Modal se cierra
   - Ruta aparece en columna derecha
   - Pedidos cambian a estado "routed"
   - Mapa muestra los pedidos seleccionados

### Prueba 2: Optimizar Ruta

1. Seleccionar la ruta creada en columna derecha
2. Verificar que aparece botón **"Optimizar Ruta"**
3. Hacer clic en **"Optimizar Ruta"**
4. Esperar 2-5 segundos
5. **Resultado esperado:**
   - Estado cambia a "Optimizada"
   - Aparecen métricas de distancia y duración
   - Mapa muestra polyline azul conectando paradas
   - Paradas se reordenan según optimización
   - Aparecen botones "Copiar Link" y "Enviar por WhatsApp"

### Prueba 3: Link de Tracking

1. Hacer clic en **"Copiar Link de Tracking"**
2. Abrir link en navegador móvil o incógnito
3. **Resultado esperado:**
   - Página carga sin pedir login
   - Muestra nombre de ruta y motorizado
   - Lista de paradas en orden
   - Botón "Iniciar Seguimiento"

### Prueba 4: Compartir Ubicación

1. En la página de tracking, hacer clic en **"Iniciar Seguimiento"**
2. Aceptar permiso de ubicación
3. **Resultado esperado:**
   - Estado cambia a "Tracking activo"
   - Muestra "En línea" y nivel de batería
   - Cada 15 segundos envía ubicación
   - Muestra última ubicación enviada

### Prueba 5: Modo Offline

1. Con tracking activo, desactivar WiFi/datos
2. Esperar 30 segundos
3. **Resultado esperado:**
   - Estado cambia a "Sin conexión"
   - Muestra "X ubicaciones pendientes de sincronizar"
   - Ubicaciones se guardan localmente
4. Reactivar internet
5. **Resultado esperado:**
   - Sincroniza ubicaciones pendientes
   - Contador de pendientes vuelve a 0

---

## 🐛 Solución de Problemas

### Error: "Google Maps API key no está configurada"

**Causa:** Variable de entorno no está definida

**Solución:**
1. Verificar que `.env.local` existe
2. Verificar que contiene `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...`
3. Reiniciar servidor de desarrollo (`npm run dev`)

---

### Error: "Cannot find namespace 'google'"

**Causa:** Errores de TypeScript del IDE (no afecta ejecución)

**Solución:**
- Ignorar (el código funciona correctamente)
- O instalar tipos oficiales: `npm install -D @types/google.maps`

---

### Error al optimizar: "Error al optimizar ruta con Google Maps"

**Causa:** API key inválida o sin permisos

**Solución:**
1. Verificar que Routes API está habilitada en Google Cloud
2. Verificar que `GOOGLE_MAPS_SERVER_API_KEY` es correcta
3. Verificar restricciones de la API key
4. Ver logs del servidor para detalles del error

---

### Tracking no envía ubicación

**Causa:** Permiso denegado o navegador no soporta geolocalización

**Solución:**
1. Verificar que el navegador soporta geolocalización
2. Verificar permisos del sitio en configuración del navegador
3. Usar HTTPS en producción (HTTP solo funciona en localhost)
4. Verificar que `SUPABASE_SERVICE_ROLE_KEY` está configurada

---

### Ubicaciones no se guardan en BD

**Causa:** Política RLS bloqueando INSERT público

**Solución:**
1. Verificar que ejecutaste `supabase_rutas_mvp_migration.sql`
2. Verificar política RLS en Supabase:
```sql
SELECT * FROM pg_policies WHERE tablename = 'route_tracking_locations';
```
3. Verificar que `tracking_enabled = true` en la ruta

---

## 📊 Verificación en Base de Datos

### Ver rutas creadas
```sql
SELECT id, name, driver_name, status, tracking_token, tracking_enabled
FROM routes
ORDER BY created_at DESC
LIMIT 10;
```

### Ver paradas de una ruta
```sql
SELECT 
  rs.optimized_sequence,
  rs.client_name,
  rs.address,
  rs.status
FROM route_stops rs
WHERE rs.route_id = 'ID_DE_TU_RUTA'
ORDER BY rs.optimized_sequence;
```

### Ver ubicaciones GPS recibidas
```sql
SELECT 
  lat,
  lng,
  accuracy,
  speed,
  battery_level,
  recorded_at,
  created_at
FROM route_tracking_locations
WHERE route_id = 'ID_DE_TU_RUTA'
ORDER BY recorded_at DESC
LIMIT 20;
```

### Ver última ubicación de una ruta
```sql
SELECT * FROM get_latest_location('ID_DE_TU_RUTA');
```

---

## 🚀 Despliegue a Producción

### 1. Variables de Entorno en Vercel/Netlify

Agregar las siguientes variables:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
GOOGLE_MAPS_SERVER_API_KEY=AIza...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 2. Actualizar Restricciones de API Keys

En Google Cloud Console:
- Agregar dominio de producción a restricciones de sitio web
- Agregar IP del servidor a restricciones de backend

### 3. Configurar HTTPS

El tracking de ubicación **requiere HTTPS** en producción. Localhost funciona con HTTP.

### 4. Probar Link de Tracking en Móvil

El link público debe ser accesible desde cualquier dispositivo sin login.

---

## 📱 Uso en Producción

### Flujo Operativo Diario

**Despachador (oficina):**
1. Entrar a Rutas cada mañana
2. Seleccionar pedidos del día
3. Crear rutas por zona/motorizado
4. Optimizar cada ruta
5. Copiar link y enviarlo por WhatsApp al motorizado

**Motorizado (campo):**
1. Recibir link por WhatsApp
2. Abrir link en navegador del celular
3. Hacer clic en "Iniciar Seguimiento"
4. Aceptar permiso de ubicación
5. Mantener pantalla abierta durante recorrido
6. Usar botón "Navegar en Google Maps" para cada parada
7. Detener seguimiento al finalizar

**Supervisor (oficina):**
1. Entrar a Rutas > Monitoreo (FASE 4, pendiente)
2. Ver ubicación de motorizados en mapa
3. Verificar progreso de entregas
4. Recibir alertas si hay problemas

---

## 🔐 Seguridad

### Tokens de Tracking

- Generados con 32 caracteres aleatorios
- Únicos por ruta
- Difíciles de adivinar
- Se pueden desactivar cambiando `tracking_enabled = false`

### Políticas RLS

- Usuarios autenticados: acceso completo a rutas
- Usuarios anónimos: solo pueden INSERT ubicaciones con token válido
- No pueden leer ubicaciones de otras rutas

### API Keys

- Frontend key: restringida por dominio
- Backend key: restringida por IP o sin restricción (solo en desarrollo)
- Nunca exponer service role key de Supabase al frontend

---

## 📈 Próximos Pasos (FASE 4)

Para completar el MVP, falta implementar:

1. **Actualizar Monitoreo en Vivo:**
   - Reemplazar mapa SVG con Google Maps real
   - Mostrar ubicación del motorizado en tiempo real
   - Integrar Supabase Realtime para updates automáticos

2. **Métricas Tiempo Real:**
   - Calcular tiempo transcurrido vs estimado
   - Mostrar ETA actualizado
   - Alertas si se retrasa >15 minutos

3. **Alertas Operativas:**
   - Sin señal GPS >2 minutos
   - Desviación de ruta
   - Batería baja del motorizado

4. **Historial de Rutas:**
   - Ver rutas completadas
   - Exportar reporte de entregas
   - KPIs básicos (OTD, tiempo promedio, etc.)

---

## 📞 Soporte

Para problemas técnicos:
1. Revisar esta guía
2. Verificar logs del servidor
3. Verificar logs de Supabase
4. Verificar consola del navegador (F12)

---

**Última actualización:** Mayo 2026  
**Versión:** MVP 1.0 (Fases 1-3 completadas)
