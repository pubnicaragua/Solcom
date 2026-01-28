# 🔍 Verificar Configuración de Supabase Auth

## El Problema

Todo está bien en la base de datos:
- ✅ Usuarios creados correctamente
- ✅ Identities existen
- ✅ Perfiles creados
- ✅ Trigger funcionando
- ❌ **Pero login da error 500**

Esto significa que el problema está en la **configuración de Auth**, no en la base de datos.

---

## 🔧 Verificaciones en Supabase Dashboard

### 1. Verificar Email Confirmations

**Ir a:** Authentication → Providers → Email

**Verificar:**
- [ ] **"Enable email confirmations"** debe estar **DESACTIVADO** (para desarrollo)
- [ ] O si está activado, **"Enable custom SMTP"** debe estar configurado

**Si está activado sin SMTP configurado:**
- Los usuarios no pueden hacer login porque esperan confirmación de email
- **Solución:** Desactivar "Enable email confirmations"

### 2. Verificar que los usuarios están confirmados

**Ejecutar en SQL Editor:**

```sql
SELECT 
  email,
  email_confirmed_at,
  CASE 
    WHEN email_confirmed_at IS NULL THEN '❌ NO CONFIRMADO'
    ELSE '✅ CONFIRMADO'
  END as status
FROM auth.users
WHERE email LIKE '%@soliscomercialni.com';
```

**Si alguno muestra "NO CONFIRMADO":**

```sql
-- Confirmar todos los usuarios manualmente
UPDATE auth.users
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email LIKE '%@soliscomercialni.com'
  AND email_confirmed_at IS NULL;
```

### 3. Verificar Rate Limiting

**Ir a:** Authentication → Rate Limits

**Verificar:**
- [ ] No estás bloqueado por intentos fallidos
- [ ] Rate limits no son muy restrictivos

**Si estás bloqueado:**
- Esperar 15 minutos
- O aumentar temporalmente los límites

### 4. Verificar JWT Secret

**Ir a:** Settings → API

**Verificar:**
- [ ] JWT Secret existe y es válido
- [ ] Anon key es correcta

**Copiar y verificar en `.env.local`:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://pknkpvysiarfxvrhjqcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[tu-anon-key]
```

### 5. Verificar Logs de Auth

**Ir a:** Logs → Auth Logs

**Buscar:**
- Errores recientes en intentos de login
- Stack traces que indiquen el problema real

---

## 🚀 Solución Rápida: Recrear Usuario Admin

Si nada de lo anterior funciona, vamos a recrear solo el usuario admin desde cero:

### Paso 1: Eliminar Admin Actual

```sql
DELETE FROM public.user_profiles WHERE email = 'admin@soliscomercialni.com';
DELETE FROM auth.identities WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'admin@soliscomercialni.com'
);
DELETE FROM auth.users WHERE email = 'admin@soliscomercialni.com';
```

### Paso 2: Crear Admin desde Auth UI

1. **Ir a:** Authentication → Users
2. **Click:** "Add User" → "Create new user"
3. **Llenar:**
   - Email: `admin@soliscomercialni.com`
   - Password: `admin123`
   - ✅ **Auto Confirm User** (IMPORTANTE)
   - User Metadata:
   ```json
   {"full_name": "Administrador", "role": "admin"}
   ```
4. **Click:** "Create user"

### Paso 3: Verificar que se creó el perfil

```sql
SELECT 
  u.email,
  u.email_confirmed_at,
  up.role
FROM auth.users u
LEFT JOIN public.user_profiles up ON up.id = u.id
WHERE u.email = 'admin@soliscomercialni.com';
```

Deberías ver:
- email_confirmed_at: [fecha]
- role: admin

### Paso 4: Probar Login

1. **Limpiar caché del navegador** (Ctrl+Shift+Delete)
2. **Recargar página** (F5)
3. **Login:**
   - Email: admin@soliscomercialni.com
   - Password: admin123

---

## 🔍 Si Aún No Funciona

### Opción A: Verificar que el middleware no está bloqueando

**Deshabilitar temporalmente el middleware:**

Editar `src/middleware.ts` y comentar todo el contenido:

```typescript
export async function middleware(request: NextRequest) {
  // TODO: Deshabilitado temporalmente para debug
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
```

**Reiniciar servidor y probar login.**

Si funciona → El problema es el middleware
Si no funciona → El problema es Auth de Supabase

### Opción B: Verificar variables de entorno

**Verificar que `.env.local` tiene las credenciales correctas:**

```bash
# Ver variables
cat .env.local
```

**Comparar con Supabase Dashboard:**
- Settings → API → Project URL
- Settings → API → Project API keys → anon public

### Opción C: Probar con signUp en lugar de signIn

**Modificar temporalmente el login para probar signUp:**

```typescript
// En lugar de signInWithPassword
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: 'Test User',
      role: 'admin'
    }
  }
});
```

Si signUp funciona pero signIn no → Problema con credenciales o confirmación

---

## 📊 Checklist Final

Antes de contactar soporte de Supabase, verifica:

- [ ] Email confirmations desactivado o usuarios confirmados
- [ ] No estás bloqueado por rate limiting
- [ ] Variables de entorno correctas
- [ ] JWT Secret válido
- [ ] Middleware no está bloqueando
- [ ] Usuario creado desde Auth UI (no SQL)
- [ ] Caché del navegador limpio

---

**Ejecuta las verificaciones en orden y comparte los resultados.** 🔍
