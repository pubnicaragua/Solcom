# 🚨 EJECUTAR SQL EN SUPABASE - INSTRUCCIONES

## ⚠️ IMPORTANTE: Debes ejecutar estos SQL manualmente

La verificación muestra que:
- ❌ **Faltan columnas en tabla `routes`**
- ❌ **No existe tabla `conversation_history`**

---

## 📝 Paso a Paso

### **1. Ir a Supabase Dashboard**
```
https://supabase.com/dashboard/project/pknkpvysiarfxvrhjqcx
```

### **2. Abrir SQL Editor**
- En el menú izquierdo, clic en **SQL Editor**
- Clic en **New Query**

---

## 🔧 SQL #1: Arreglar Tabla Routes

**Copiar y pegar este SQL completo:**

```sql
-- Agregar columnas faltantes a routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_phone TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_label TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS return_to_origin BOOLEAN DEFAULT false;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_token TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT false;

-- Verificar
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'routes' 
AND column_name IN ('driver_name', 'tracking_token')
ORDER BY column_name;
```

**Clic en RUN** ✅

**Resultado esperado:**
```
column_name    | data_type
---------------|----------
driver_name    | text
tracking_token | text
```

---

## 💬 SQL #2: Crear Tabla Conversation History

**Copiar y pegar este SQL completo:**

```sql
-- Crear tabla conversation_history
CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  image_url TEXT,
  url_analyzed TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_conversation_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_session_id ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created_at ON conversation_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_user_created ON conversation_history(user_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;

-- Crear políticas (permisivas para desarrollo)
DO $$ BEGIN
  CREATE POLICY "Allow all for anon" ON conversation_history
    FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for authenticated" ON conversation_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verificar
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'conversation_history';
```

**Clic en RUN** ✅

**Resultado esperado:**
```
table_name
-------------------
conversation_history
```

---

## ✅ Verificación Final

Ejecuta este SQL para verificar que todo está correcto:

```sql
-- Verificar columnas en routes
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'routes' 
AND column_name IN ('driver_name', 'driver_phone', 'vehicle_label', 'tracking_token')
ORDER BY column_name;

-- Verificar tabla conversation_history
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'conversation_history'
ORDER BY ordinal_position;
```

**Deberías ver:**
- 4 columnas en routes: `driver_name`, `driver_phone`, `vehicle_label`, `tracking_token`
- 10 columnas en conversation_history: `id`, `user_id`, `session_id`, `role`, `content`, `image_url`, `url_analyzed`, `metadata`, `created_at`, `expires_at`

---

## 🔄 Después de Ejecutar

1. **Reiniciar el servidor:**
   ```bash
   npm run dev
   ```

2. **Probar los 3 módulos:**
   - ✅ **Rutas:** Crear ruta (no debería dar error de `driver_name`)
   - ✅ **Compras AI:** Generar análisis de restock
   - ✅ **Mía:** Enviar mensajes (se guardarán en BD)

---

## 🆘 Si Hay Errores

### Error: "relation already exists"
✅ **Normal** - significa que ya existe, continúa con el siguiente SQL

### Error: "permission denied"
❌ Verifica que estás usando el proyecto correcto en Supabase Dashboard

### Error: "syntax error"
❌ Asegúrate de copiar TODO el SQL, incluyendo los `$$` en las políticas

---

**Una vez ejecutados los 2 SQL, avísame para verificar que todo funciona al 100%**
