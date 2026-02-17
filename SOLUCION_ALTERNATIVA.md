# 🔴 ERROR 500 PERSISTENTE - Solución Alternativa

## Diagnóstico

El error "Database error querying schema" en `/auth/v1/token` indica que **Supabase Auth no puede consultar su propia base de datos** durante el login. Esto NO es un problema de tu código, sino de la configuración interna de Auth.

## ✅ Solución Alternativa: Usar Supabase Auth UI

En lugar de crear usuarios manualmente con SQL, vamos a usar el método oficial de Supabase.

---

## OPCIÓN 1: Crear Usuarios desde Supabase Dashboard (Recomendado)

### Paso 1: Eliminar Usuarios Actuales

Ejecuta en SQL Editor:

```sql
-- Eliminar usuarios actuales (están corruptos)
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@soliscomercialni.com'
);

DELETE FROM auth.users WHERE email LIKE '%@soliscomercialni.com';
```

### Paso 2: Crear Usuarios desde Auth UI

1. Ir a **Authentication** → **Users** en Supabase Dashboard
2. Click en **Add User** → **Create new user**
3. Crear cada usuario:

**Usuario 1 - Admin:**
- Email: `admin@soliscomercialni.com`
- Password: `admin123`
- Auto Confirm User: ✅ **ACTIVAR**
- User Metadata (JSON):
```json
{
  "full_name": "Administrador",
  "role": "admin"
}
```

**Usuario 2 - Manager:**
- Email: `manager@soliscomercialni.com`
- Password: `manager123`
- Auto Confirm User: ✅ **ACTIVAR**
- User Metadata:
```json
{
  "full_name": "Gerente",
  "role": "manager"
}
```

**Usuario 3 - Operator:**
- Email: `operator@soliscomercialni.com`
- Password: `operator123`
- Auto Confirm User: ✅ **ACTIVAR**
- User Metadata:
```json
{
  "full_name": "Operador",
  "role": "operator"
}
```

**Usuario 4 - Auditor:**
- Email: `auditor@soliscomercialni.com`
- Password: `auditor123`
- Auto Confirm User: ✅ **ACTIVAR**
- User Metadata:
```json
{
  "full_name": "Auditor",
  "role": "auditor"
}
```

### Paso 3: Verificar que se Crearon los Perfiles

```sql
SELECT 
  u.email,
  up.full_name,
  up.role
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com';
```

Deberías ver los 4 usuarios con sus perfiles.

---

## OPCIÓN 2: Deshabilitar Trigger Temporalmente

Si quieres seguir usando SQL para crear usuarios:

### Paso 1: Deshabilitar el Trigger

```sql
-- Deshabilitar trigger
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
```

### Paso 2: Eliminar y Recrear Usuarios

```sql
-- Eliminar usuarios actuales
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@soliscomercialni.com'
);
DELETE FROM auth.users WHERE email LIKE '%@soliscomercialni.com';

-- Recrear usuarios (ejecutar create-users.sql)
```

### Paso 3: Crear Perfiles Manualmente

```sql
-- Crear perfiles manualmente
INSERT INTO public.user_profiles (id, email, full_name, role)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', 'Usuario'),
  COALESCE(raw_user_meta_data->>'role', 'operator')
FROM auth.users
WHERE email LIKE '%@soliscomercialni.com'
ON CONFLICT (id) DO NOTHING;
```

### Paso 4: Reactivar el Trigger

```sql
-- Reactivar trigger
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
```

---

## OPCIÓN 3: Verificar Configuración de Auth en Supabase

### Verificar que Auto Confirm está activado:

1. Ir a **Authentication** → **Providers** → **Email**
2. Verificar que **Confirm email** está **DESACTIVADO** (para desarrollo)
3. O activar **Enable email confirmations** pero con **Auto Confirm** activado

### Verificar Rate Limiting:

1. Ir a **Authentication** → **Rate Limits**
2. Verificar que no estás bloqueado por intentos fallidos
3. Si es necesario, aumentar los límites temporalmente

---

## 🧪 Después de Aplicar Cualquier Solución

### 1. Limpiar Caché del Navegador

- Ctrl+Shift+Delete → Borrar cookies y caché
- O usar modo incógnito

### 2. Reiniciar Servidor

```bash
# Detener servidor
Ctrl+C

# Reiniciar
npm run dev
```

### 3. Probar Login

- Email: admin@soliscomercialni.com
- Password: admin123

---

## 📊 Por Qué Esto Debería Funcionar

**El problema actual:**
- Usuarios creados con SQL directo
- Auth.identities puede tener datos inconsistentes
- Trigger puede estar causando conflictos

**La solución:**
- Usar Auth UI de Supabase (método oficial)
- Supabase maneja toda la creación internamente
- No hay conflictos con identities ni triggers
- User metadata se pasa correctamente al trigger

---

## ⚠️ Recomendación Final

**Usa OPCIÓN 1** (crear desde Auth UI). Es el método oficial y más confiable.

Si después de esto sigue sin funcionar, el problema puede ser:
1. Configuración de Auth en Supabase (email confirmations)
2. Rate limiting activo
3. Problema con el proyecto de Supabase (requiere soporte)
**

--------**----****-*--*

**Ejecuta la OPCIÓN 1 y el login debería funcionar.** 🎉
