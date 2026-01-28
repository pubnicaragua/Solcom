# 🔐 Configuración de Autenticación con Supabase

## Paso 1: Ejecutar Schema SQL

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Abrir tu proyecto: `https://pknkpvysiarfxvrhjqcx.supabase.co`
3. Ir a **SQL Editor**
4. Copiar y ejecutar el contenido de `src/lib/supabase/auth-schema.sql`

Esto creará:
- ✅ Tabla `user_profiles` con roles
- ✅ Políticas RLS (Row Level Security)
- ✅ Triggers automáticos para nuevos usuarios
- ✅ Función `handle_new_user()` para crear perfiles

---

## Paso 2: Crear Usuarios de Prueba

### Opción A: Desde Supabase Dashboard (Recomendado)

1. Ir a **Authentication** → **Users**
2. Click en **Add user** → **Create new user**
3. Crear los siguientes usuarios:

#### Usuario Admin
- **Email:** `admin@soliscomercialni.com`
- **Password:** `admin123`
- **Confirm password:** `admin123`
- **Auto Confirm User:** ✅ Activado

#### Usuario Manager
- **Email:** `manager@soliscomercialni.com`
- **Password:** `manager123`
- **Auto Confirm User:** ✅ Activado

#### Usuario Operator
- **Email:** `operator@soliscomercialni.com`
- **Password:** `operator123`
- **Auto Confirm User:** ✅ Activado

#### Usuario Auditor
- **Email:** `auditor@soliscomercialni.com`
- **Password:** `auditor123`
- **Auto Confirm User:** ✅ Activado

### Opción B: Desde SQL Editor

```sql
-- Después de crear usuarios en Auth UI, actualizar sus roles:

-- Obtener el UUID del usuario admin
SELECT id, email FROM auth.users WHERE email = 'admin@soliscomercialni.com';

-- Actualizar rol a admin (reemplazar 'uuid-aqui' con el UUID real)
UPDATE user_profiles 
SET role = 'admin', full_name = 'Administrador'
WHERE id = 'uuid-aqui';

-- Repetir para los demás usuarios con sus respectivos roles
```

---

## Paso 3: Configurar Email Templates (Opcional)

Si quieres personalizar los emails de autenticación:

1. Ir a **Authentication** → **Email Templates**
2. Personalizar:
   - Confirm signup
   - Invite user
   - Magic Link
   - Change Email Address
   - Reset Password

---

## Paso 4: Configurar Providers (Opcional)

Para login con redes sociales:

1. Ir a **Authentication** → **Providers**
2. Habilitar providers deseados:
   - Google
   - Facebook
   - GitHub
   - etc.

---

## Paso 5: Verificar Configuración

### Verificar tabla user_profiles

```sql
SELECT * FROM user_profiles;
```

Deberías ver los 4 usuarios con sus roles correspondientes.

### Verificar políticas RLS

```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'user_profiles';
```

Deberías ver 3 políticas:
1. Los usuarios pueden ver su propio perfil
2. Solo admins pueden ver todos los perfiles
3. Solo admins pueden actualizar perfiles

---

## Paso 6: Probar Login

1. Ejecutar `npm run dev`
2. Ir a `http://localhost:3000`
3. Serás redirigido a `/login`
4. Probar con las credenciales:

```
Email: admin@soliscomercialni.com
Password: admin123
```

---

## Permisos por Rol

### 👑 Admin
- ✅ Inventario (lectura/escritura)
- ✅ Reportes (lectura)
- ✅ Agentes IA
- ✅ Roles y Permisos
- ✅ Configuración
- ✅ Cómo Funciona

### 👔 Manager
- ✅ Inventario (lectura/escritura)
- ✅ Reportes (lectura)
- ✅ Agentes IA
- ❌ Roles y Permisos
- ❌ Configuración
- ✅ Cómo Funciona

### 👨‍💼 Operator
- ✅ Inventario (solo lectura)
- ✅ Reportes (solo lectura)
- ❌ Agentes IA
- ❌ Roles y Permisos
- ❌ Configuración
- ✅ Cómo Funciona

### 🔍 Auditor
- ❌ Inventario
- ✅ Reportes (solo lectura)
- ❌ Agentes IA
- ❌ Roles y Permisos
- ❌ Configuración
- ✅ Cómo Funciona

---

## Middleware de Autenticación

El archivo `src/middleware.ts` maneja:

1. **Redirección automática:**
   - Si no estás autenticado → `/login`
   - Si estás autenticado y vas a `/login` → `/inventory`

2. **Control de acceso por rol:**
   - Verifica permisos antes de acceder a cada módulo
   - Redirige a `/inventory` si no tienes permiso

3. **Rutas públicas:**
   - `/login`
   - `/signup`
   - `/reset-password`

---

## Troubleshooting

### Error: "User not found"
- Verifica que el usuario existe en **Authentication** → **Users**
- Verifica que el perfil existe en `user_profiles`

### Error: "Invalid login credentials"
- Verifica que la contraseña es correcta
- Verifica que el usuario está confirmado (Auto Confirm User activado)

### Error: "Access denied"
- Verifica el rol del usuario en `user_profiles`
- Verifica que las políticas RLS están activas

### No se crea el perfil automáticamente
- Verifica que el trigger `on_auth_user_created` existe
- Verifica que la función `handle_new_user()` existe
- Ejecuta manualmente:
  ```sql
  INSERT INTO user_profiles (id, email, role)
  VALUES ('uuid-del-usuario', 'email@example.com', 'operator');
  ```

---

## Seguridad

### ✅ Implementado:
- Row Level Security (RLS) en todas las tablas
- Middleware de autenticación
- Control de acceso por roles
- Políticas de solo lectura para operadores y auditores

### 🔒 Recomendaciones adicionales:
1. Cambiar contraseñas de prueba en producción
2. Habilitar 2FA para usuarios admin
3. Configurar rate limiting en Supabase
4. Revisar logs de autenticación regularmente
5. Implementar rotación de API keys

---

## Próximos Pasos

1. ✅ Ejecutar `auth-schema.sql` en Supabase
2. ✅ Crear usuarios de prueba
3. ✅ Probar login con cada rol
4. ✅ Verificar permisos por módulo
5. 🔄 Personalizar email templates (opcional)
6. 🔄 Configurar providers sociales (opcional)

---

**¡Autenticación lista para producción!** 🎉
