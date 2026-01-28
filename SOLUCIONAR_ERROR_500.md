# 🔴 ERROR 500: "Database error querying schema"

## 🎯 Causa del Error

El error **500 Internal Server Error** en `/auth/v1/token` ocurre porque **la tabla `user_profiles` no existe** en tu base de datos de Supabase.

Esto significa que **NO has ejecutado el schema de autenticación** todavía.

---

## ✅ SOLUCIÓN RÁPIDA (3 minutos)

### Paso 1: Ir a Supabase Dashboard

1. Abre: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Click en **SQL Editor** (icono de base de datos en el menú izquierdo)

### Paso 2: Ejecutar Schema de Autenticación

1. Click en **New Query**
2. Abre el archivo: `src/lib/supabase/auth-schema.sql`
3. Copia **TODO** el contenido (Ctrl+A, Ctrl+C)
4. Pega en el SQL Editor de Supabase
5. Click en **Run** (o Ctrl+Enter)

**Deberías ver:**
```
Success. No rows returned
```

### Paso 3: Crear Usuarios con Contraseñas

1. Click en **New Query** de nuevo
2. Abre el archivo: `src/lib/supabase/create-users.sql`
3. Copia **TODO** el contenido
4. Pega en el SQL Editor
5. Click en **Run**

**Deberías ver:**
```
NOTICE: Usuario Admin creado con ID: [uuid]
NOTICE: Usuario Manager creado con ID: [uuid]
NOTICE: Usuario Operator creado con ID: [uuid]
NOTICE: Usuario Auditor creado con ID: [uuid]
```

### Paso 4: Verificar que Funcionó

Ejecuta esta query en SQL Editor:

```sql
SELECT 
  u.email,
  up.full_name,
  up.role
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com';
```

**Deberías ver 4 usuarios:**
- admin@soliscomercialni.com (admin)
- manager@soliscomercialni.com (manager)
- operator@soliscomercialni.com (operator)
- auditor@soliscomercialni.com (auditor)

### Paso 5: Probar Login

1. Refresca la página del login (F5)
2. Ingresa:
   - **Email:** admin@soliscomercialni.com
   - **Password:** admin123
3. Click en **Iniciar Sesión**

**¡Debería funcionar!** ✅

---

## 🔍 ¿Por Qué Ocurre Este Error?

El middleware de autenticación (`src/middleware.ts`) intenta consultar la tabla `user_profiles` para verificar el rol del usuario:

```typescript
const { data: profile } = await supabase
  .from('user_profiles')
  .select('role')
  .eq('id', user.id)
  .single();
```

Si la tabla **no existe**, Supabase retorna un error 500.

---

## 📊 Orden Correcto de Ejecución

**SIEMPRE ejecutar en este orden:**

1. ✅ `schema.sql` - Tablas de inventario (warehouses, items, etc.)
2. ✅ `auth-schema.sql` - Tabla user_profiles + triggers
3. ✅ `create-users.sql` - Usuarios con contraseñas

---

## 🎨 Mejoras Implementadas en el Login

Ahora el login muestra mensajes amigables:

| Error Técnico | Mensaje al Usuario |
|---------------|-------------------|
| `Invalid login credentials` | "Correo o contraseña incorrectos. Verifica tus datos." |
| `Database error querying schema` | "El sistema está configurándose. Por favor, contacta al administrador." |
| `Email not confirmed` | "Por favor, confirma tu correo electrónico antes de iniciar sesión." |
| `network error` | "Sin conexión a internet. Verifica tu conexión." |
| `rate limit` | "Demasiados intentos. Espera unos minutos." |

**Los errores técnicos se loggean en consola para desarrollo:**
```javascript
console.error('🔴 Error de autenticación:', {
  code: error.status,
  message: error.message,
  name: error.name,
});
```

---

## 🚀 Después de Ejecutar los Schemas

Una vez ejecutados los 3 scripts SQL, el sistema funcionará completamente:

- ✅ Login con roles
- ✅ Middleware de autenticación
- ✅ Acceso controlado por rol
- ✅ Restablecer contraseña
- ✅ Inventario con sincronización
- ✅ Agentes IA funcionales
- ✅ Reportes y KPIs

---

**¡Ejecuta los schemas y todo funcionará!** 🎉
