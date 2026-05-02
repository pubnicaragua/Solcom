# 📝 Instrucciones para Ejecutar SQL en Supabase

## ⚠️ IMPORTANTE: Debes ejecutar estos SQL manualmente

Por seguridad, Supabase no permite ejecutar SQL arbitrario desde código. Debes hacerlo manualmente en el SQL Editor.

---

## 🔧 Paso 1: Arreglar Tabla Routes

### **Archivo:** `fix_routes_table.sql`

1. Ir a **Supabase Dashboard**
2. Seleccionar tu proyecto
3. Ir a **SQL Editor** (menú izquierdo)
4. Hacer clic en **New Query**
5. Copiar TODO el contenido de `fix_routes_table.sql`
6. Pegar en el editor
7. Hacer clic en **Run** (o presionar Ctrl+Enter)

### **Qué hace:**
- Agrega 8 columnas faltantes a la tabla `routes`:
  - `driver_name`
  - `driver_phone`
  - `vehicle_label`
  - `origin_lat`
  - `origin_lng`
  - `return_to_origin`
  - `tracking_token`
  - `tracking_enabled`

### **Resultado esperado:**
```
Query executed successfully
```

---

## 💬 Paso 2: Crear Tabla de Historial de Conversaciones

### **Archivo:** `supabase_conversation_history.sql`

1. Ir a **Supabase Dashboard**
2. Ir a **SQL Editor**
3. Hacer clic en **New Query**
4. Copiar TODO el contenido de `supabase_conversation_history.sql`
5. Pegar en el editor
6. Hacer clic en **Run**

### **Qué hace:**
- Crea tabla `conversation_history` para guardar mensajes de Mía
- Configura índices para búsqueda rápida
- Crea funciones para:
  - Guardar mensajes
  - Cargar historial
  - Limpiar conversaciones expiradas
- Configura RLS (Row Level Security)
- Expiración automática de 90 días

### **Resultado esperado:**
```
Query executed successfully
```

---

## ✅ Verificación

### **Verificar tabla routes:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'routes'
ORDER BY ordinal_position;
```

Deberías ver las 8 columnas nuevas.

### **Verificar tabla conversation_history:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversation_history'
ORDER BY ordinal_position;
```

Deberías ver:
- `id`
- `user_id`
- `session_id`
- `role`
- `content`
- `image_url`
- `url_analyzed`
- `metadata`
- `created_at`
- `expires_at`

---

## 🔐 Variables de Entorno Necesarias

Para que las nuevas funcionalidades funcionen, agrega en `.env.local`:

```env
# OpenAI para GPT-4 Vision y Whisper
OPENAI_API_KEY=sk-...

# URL de tu app (para llamadas internas)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚀 Funcionalidades Nuevas Activadas

Una vez ejecutados los SQL:

### **1. Persistencia de Conversaciones ✅**
- Historial de hasta 200 mensajes por usuario
- Guardado automático en cada mensaje
- Expiración de 90 días
- Sobrevive a recargas de página y cierre de sesión

### **2. Análisis de Imágenes con GPT-4 Vision ✅**
- Sube una imagen
- GPT-4 Vision la analiza
- Detecta productos, precios, cantidades
- Útil para facturas, inventarios, catálogos

### **3. Transcripción de Audio con Whisper ✅**
- Graba audio
- Whisper API lo transcribe
- Texto aparece en el input
- Precisión superior a Web Speech API

### **4. Memoria Extendida ✅**
- Contexto de últimos 50 mensajes en cada request
- Historial completo de 200 mensajes guardado
- Mía recuerda conversaciones anteriores

---

## 🧪 Cómo Probar

### **Probar Rutas:**
1. Ejecutar `fix_routes_table.sql`
2. Ir a Rutas > Planificador
3. Seleccionar pedidos
4. Crear ruta
5. No debería dar error de `driver_name`

### **Probar Persistencia:**
1. Ejecutar `supabase_conversation_history.sql`
2. Abrir Mía
3. Enviar varios mensajes
4. Recargar la página
5. Los mensajes deberían seguir ahí

### **Probar GPT-4 Vision:**
1. Agregar `OPENAI_API_KEY` en `.env.local`
2. Reiniciar servidor: `npm run dev`
3. Abrir Mía
4. Clic en botón de imagen 📷
5. Subir imagen de factura/producto
6. Enviar
7. GPT-4 Vision debería analizarla

### **Probar Whisper:**
1. Asegurar que `OPENAI_API_KEY` está configurada
2. Abrir Mía
3. Mantener presionado botón de micrófono 🎤
4. Hablar
5. Soltar botón
6. El texto debería aparecer en el input

---

## 📊 Monitoreo

### **Ver mensajes guardados:**
```sql
SELECT 
  user_id,
  role,
  content,
  created_at
FROM conversation_history
ORDER BY created_at DESC
LIMIT 50;
```

### **Contar mensajes por usuario:**
```sql
SELECT 
  user_id,
  COUNT(*) as total_messages
FROM conversation_history
GROUP BY user_id
ORDER BY total_messages DESC;
```

### **Limpiar mensajes expirados manualmente:**
```sql
SELECT cleanup_expired_conversations();
```

---

## ⚙️ Mantenimiento

### **Limpiar mensajes antiguos (ejecutar mensualmente):**
```sql
DELETE FROM conversation_history
WHERE expires_at < NOW();
```

### **Resetear historial de un usuario:**
```sql
DELETE FROM conversation_history
WHERE user_id = 'user_xxx';
```

---

## 🐛 Troubleshooting

### **Error: "relation conversation_history does not exist"**
- Ejecuta `supabase_conversation_history.sql` en SQL Editor

### **Error: "column driver_name does not exist"**
- Ejecuta `fix_routes_table.sql` en SQL Editor

### **Error: "OpenAI API Key not configured"**
- Agrega `OPENAI_API_KEY` en `.env.local`
- Reinicia el servidor

### **Imágenes no se analizan:**
- Verifica que `OPENAI_API_KEY` sea válida
- Verifica que la imagen sea base64 válida
- Revisa la consola del navegador (F12)

### **Audio no se transcribe:**
- Verifica permisos de micrófono en el navegador
- Verifica que `OPENAI_API_KEY` sea válida
- Whisper solo funciona con OpenAI, no con DeepSeek

---

## 💰 Costos de OpenAI

### **GPT-4 Vision:**
- ~$0.01 por imagen analizada
- Depende de la resolución y detalle

### **Whisper API:**
- $0.006 por minuto de audio
- Muy económico

### **Ejemplo:**
- 100 imágenes analizadas = ~$1.00
- 100 minutos de audio = ~$0.60

---

## ✅ Checklist Final

- [ ] Ejecutado `fix_routes_table.sql` en Supabase
- [ ] Ejecutado `supabase_conversation_history.sql` en Supabase
- [ ] Agregado `OPENAI_API_KEY` en `.env.local`
- [ ] Reiniciado servidor con `npm run dev`
- [ ] Probado crear ruta (sin error)
- [ ] Probado persistencia de mensajes
- [ ] Probado análisis de imagen
- [ ] Probado transcripción de audio

---

**Fecha:** Mayo 2026  
**Sistema:** Solcom / Software Nicaragua  
**Módulos:** Rutas, Compras AI, Solcom AI
