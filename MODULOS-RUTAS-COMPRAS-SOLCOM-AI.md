# Módulos Rutas, Compras AI y Solcom AI

## Propósito de este documento

Este documento explica, en español y de forma operativa, cómo funcionan los módulos `Rutas`, `Compras AI` y `Solcom AI` dentro del proyecto, qué tablas usan, qué endpoint consumen y qué revisar cuando algo falla.

## 1. Módulo Rutas

### Qué resuelve

El módulo `Rutas` organiza entregas pendientes, las agrupa en rutas, las asigna a vehículos y permite monitorear el avance de cada parada.

### Pantallas principales

- `src/app/(dashboard)/rutas/bandeja/page.tsx`
  - Muestra la bandeja de entregas pendientes.
  - Permite filtrar por estado y zona.
  - Permite generar una orden de prueba válida en `delivery_jobs`.

- `src/app/(dashboard)/rutas/planificador/page.tsx`
  - Carga vehículos activos, entregas sin asignar, rutas y paradas.
  - Permite crear una ruta nueva.
  - Permite optimizar la ruta usando el backend y guardar distancia, duración y polilínea.

- `src/app/(dashboard)/rutas/monitoreo/page.tsx`
  - Muestra rutas activas o asignadas.
  - Permite marcar llegada, salida y finalización.
  - Muestra alertas operativas abiertas.

### Tablas involucradas

- `delivery_jobs`
- `vehicles`
- `routes`
- `route_stops`
- `route_alerts`
- `gps_events`

### Cómo carga los datos

Para evitar errores por relaciones faltantes o por caché desactualizada de PostgREST, las pantallas principales de `Rutas` ya no dependen de `select` anidados con claves foráneas implícitas.

Ahora el flujo es este:

1. Se consulta cada tabla por separado.
2. Se crean mapas en memoria por `id`, `route_id` o `job_id`.
3. Se arma la estructura final dentro del frontend.

Esto hace al módulo más resistente cuando Supabase todavía no refleja una relación nueva o cuando el tipado generado no está al día.

### Flujo funcional

#### Bandeja

1. Lee entregas desde `delivery_jobs`.
2. Filtra por `status` y `zone_id`.
3. Permite búsqueda por `address_text`, `sales_order_id` y `customer_name`.

#### Planificador

1. Lee vehículos activos desde `vehicles`.
2. Lee entregas pendientes o agrupadas desde `delivery_jobs`.
3. Lee rutas abiertas desde `routes`.
4. Lee paradas desde `route_stops`.
5. Cuando se crea una ruta:
   - inserta una fila en `routes`
   - actualiza las entregas seleccionadas en `delivery_jobs`
   - crea sus paradas en `route_stops`
6. Cuando se optimiza una ruta:
   - consulta las paradas
   - busca las entregas relacionadas
   - llama al endpoint de optimización
   - guarda el resultado en `routes`

#### Monitoreo

1. Lee rutas con estado `in_progress` o `assigned`.
2. Busca sus vehículos y paradas por separado.
3. Busca entregas relacionadas por `job_id`.
4. Une todo en memoria para renderizar el tablero.
5. Permite actualizar estados de parada y de ruta.

### Problemas comunes y qué revisar

- **Error de columna inexistente**
  - Revisar que `delivery_jobs` tenga columnas como `customer_name`, `customer_phone`, `assigned_route_id`, `lat`, `lng`, `address_text`.

- **Error de relación o schema cache**
  - Ejecutar el script `scripts/setup-database.js`.
  - Confirmar que existen las claves foráneas necesarias.
  - Forzar recarga de caché de PostgREST si aplica.

- **La ruta no muestra entregas o paradas**
  - Verificar que `route_stops.job_id` apunte a una fila real de `delivery_jobs`.
  - Verificar que `route_stops.route_id` apunte a una fila real de `routes`.

## 2. Módulo Compras AI

### Qué resuelve

El módulo `Compras AI` responde preguntas operativas del área de compras usando contexto real del sistema y un endpoint backend unificado.

### Piezas principales

- `src/app/(dashboard)/compras/page.tsx`
  - Reúne el contexto del módulo de compras.
  - Entrega ese contexto al asistente.

- `src/components/compras/AIAssistant.tsx`
  - Renderiza el chat.
  - Gestiona mensajes, carga, audio y síntesis de voz.
  - Envía la pregunta al backend.

- `src/app/api/ai/chat/route.ts`
  - Endpoint principal del chat.
  - Recibe la pregunta y el contexto.
  - Genera la respuesta.
  - Registra consumo en `ai_usage_logs`.

### Endpoint oficial

El endpoint vigente del proyecto para consultas de IA es:

```text
/api/ai/chat
```

### Formato esperado

El frontend envía un cuerpo parecido a este:

```json
{
  "question": "¿Qué producto debería reponer primero?",
  "agentId": "compras",
  "context": "resumen del estado actual del módulo"
}
```

El backend responde así:

```json
{
  "answer": "Respuesta en español basada en el contexto recibido"
}
```

### Cómo funciona la respuesta

El endpoint sigue dos caminos:

1. **Con contexto textual suficiente**
   - Usa `generateContextAwareResponse(...)`.
   - Devuelve una respuesta directamente basada en el contexto del módulo.

2. **Sin contexto suficiente**
   - Busca información relevante en tablas del sistema.
   - Genera una respuesta inteligente según la pregunta y el agente.

### Registro de uso

Cada interacción relevante se guarda en `ai_usage_logs`, lo que luego alimenta estadísticas en `Solcom AI`.

### Problemas comunes y qué revisar

- **El chat no responde**
  - Confirmar que `AIAssistant.tsx` use `/api/ai/chat`.
  - Confirmar que el backend devuelve `answer`.

- **La respuesta no tiene contexto**
  - Revisar el texto `context` enviado desde `compras/page.tsx`.

- **No se actualizan estadísticas**
  - Verificar inserciones correctas en `ai_usage_logs`.

## 3. Módulo Solcom AI

### Qué resuelve

`Solcom AI` es el panel administrativo del ecosistema de IA del proyecto. Permite ver claves, asistentes y estadísticas de uso.

### Pantalla principal

- `src/app/(dashboard)/solcom-ai/page.tsx`

### Tablas involucradas

- `ai_api_keys`
- `ai_assistants`
- `ai_usage_logs`

### Qué muestra

#### Uso

- Total de solicitudes registradas.
- Total de tokens consumidos.
- Costo acumulado.
- Uso del mes actual.

#### Claves

- Lista de claves registradas.
- Estado de cada clave.
- Copia de la clave real cuando existe `full_key`.
- Confirmación visual de copiado.

#### Asistentes

- Lista de asistentes creados.
- Descripción y capacidades.
- Alta y eliminación desde la interfaz.

#### Ayuda

- Explicación del estado operativo.
- Significado del botón `Actualizar`.
- Explicación de qué representan las métricas.

### Cómo carga los datos

1. Lee `ai_api_keys`.
2. Lee `ai_assistants`.
3. Lee `ai_usage_logs`.
4. Calcula métricas agregadas en memoria.
5. Refresca la interfaz sin depender de joins complejos.

### Lógica importante

- Si una clave tiene `full_key`, esa es la que se copia al portapapeles.
- Si no existe `full_key`, se usa el valor visible de respaldo.
- El botón `Actualizar` vuelve a consultar Supabase para refrescar claves, asistentes y uso.

### Problemas comunes y qué revisar

- **No aparecen claves activas**
  - Verificar filas en `ai_api_keys`.
  - Confirmar que la consulta ordene por `created_at`.

- **No aparecen asistentes**
  - Verificar estructura y permisos de `ai_assistants`.

- **Las estadísticas salen en cero**
  - Revisar si `ai_usage_logs` está recibiendo inserciones desde `/api/ai/chat`.

## 4. Resumen técnico rápido

### Rutas

- Origen principal: Supabase.
- Estrategia de carga: consultas separadas y unión en memoria.
- Riesgo principal: desalineación entre esquema real y frontend.

### Compras AI

- Origen principal: endpoint `/api/ai/chat`.
- Estrategia: pregunta + contexto + registro de uso.
- Riesgo principal: enviar formato viejo o esperar una respuesta distinta de `answer`.

### Solcom AI

- Origen principal: tablas `ai_*`.
- Estrategia: panel administrativo y cálculo local de métricas.
- Riesgo principal: tablas nuevas no reflejadas en tipos generados o permisos insuficientes.

## 5. Recomendaciones operativas

- Regenerar tipos de Supabase cuando se agreguen tablas nuevas.
- Mantener el endpoint único de IA en `/api/ai/chat`.
- Evitar dependencias en relaciones anidadas cuando el esquema todavía está cambiando.
- Revisar `ai_usage_logs` cada vez que se modifique la lógica del chat.
