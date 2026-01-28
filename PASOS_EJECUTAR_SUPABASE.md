# 🚀 PASOS PARA EJECUTAR EN SUPABASE (EN ORDEN)

## ⚠️ IMPORTANTE: Ejecutar en este orden exacto

---

## PASO 1: Schema Principal (Tablas de Inventario)

**Archivo:** `src/lib/supabase/schema.sql`

1. Ir a Supabase Dashboard: https://supabase.com/dashboard
2. Seleccionar tu proyecto
3. Ir a **SQL Editor** (icono de base de datos en el menú izquierdo)
4. Click en **New Query**
5. Copiar TODO el contenido de `src/lib/supabase/schema.sql`
6. Pegar en el editor
7. Click en **Run** (o presionar Ctrl+Enter)

**Resultado esperado:**
```
Success. No rows returned
```

**Esto crea:**
- Tabla `warehouses` (bodegas)
- Tabla `items` (productos)
- Tabla `stock_snapshots` (inventario)
- Tabla `stock_movements` (movimientos)
- Vista `current_stock` (stock actual)
- Políticas RLS

---

## PASO 2: Schema de Autenticación

**Archivo:** `src/lib/supabase/auth-schema.sql`

1. En SQL Editor, click en **New Query**
2. Copiar TODO el contenido de `src/lib/supabase/auth-schema.sql`
3. Pegar en el editor
4. Click en **Run**

**Resultado esperado:**
```
Success. No rows returned
(Puede mostrar la tabla user_profiles vacía al final)
```

**Esto crea:**
- Tabla `user_profiles` (perfiles de usuario con roles)
- Políticas RLS para user_profiles
- Trigger `on_auth_user_created` (crea perfil automáticamente)
- Función `handle_new_user()`

---

## PASO 3: Crear Usuarios con Contraseñas

**Archivo:** `src/lib/supabase/create-users.sql`

1. En SQL Editor, click en **New Query**
2. Copiar TODO el contenido de `src/lib/supabase/create-users.sql`
3. Pegar en el editor
4. Click en **Run**

**Resultado esperado:**
```
NOTICE: Usuario Admin creado con ID: [uuid]
NOTICE: Usuario Manager creado con ID: [uuid]
NOTICE: Usuario Operator creado con ID: [uuid]
NOTICE: Usuario Auditor creado con ID: [uuid]

Luego mostrará una tabla con los 4 usuarios creados
```

**Esto crea:**
- 4 usuarios en `auth.users` con contraseñas encriptadas
- 4 identidades en `auth.identities`
- 4 perfiles en `user_profiles` (automático por el trigger)

---

## PASO 4: Verificar que Todo Funcionó

Ejecuta estas queries para verificar:

### Verificar usuarios creados:
```sql
SELECT 
  u.id,
  u.email,
  up.full_name,
  up.role,
  u.email_confirmed_at
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
WHERE u.email LIKE '%@soliscomercialni.com'
ORDER BY u.created_at DESC;
```

**Deberías ver 4 usuarios:**
- admin@soliscomercialni.com (rol: admin)
- manager@soliscomercialni.com (rol: manager)
- operator@soliscomercialni.com (rol: operator)
- auditor@soliscomercialni.com (rol: auditor)

### Verificar políticas RLS:
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'user_profiles';
```

**Deberías ver 3 políticas:**
- Los usuarios pueden ver su propio perfil
- Solo admins pueden ver todos los perfiles
- Solo admins pueden actualizar perfiles

### Verificar triggers:
```sql
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'user_profiles';
```

**Deberías ver 2 triggers:**
- on_auth_user_created
- set_updated_at

---

## PASO 5: Probar Login

1. Ejecutar en terminal:
```bash
npm run dev
```

2. Abrir: http://localhost:3000

3. Debería redirigir a `/login`

4. Probar con:
   - **Email:** admin@soliscomercialni.com
   - **Password:** admin123

5. Debería iniciar sesión y redirigir a `/inventory`

---

## 🐛 Solución de Errores Comunes

### Error: "Database error querying schema"
**Causa:** No ejecutaste `auth-schema.sql`
**Solución:** Ejecutar PASO 2

### Error: "Invalid login credentials"
**Causa:** No ejecutaste `create-users.sql`
**Solución:** Ejecutar PASO 3

### Error: "User not found"
**Causa:** El trigger no creó el perfil
**Solución:** Ejecutar manualmente:
```sql
INSERT INTO user_profiles (id, email, full_name, role)
SELECT id, email, 'Admin', 'admin'
FROM auth.users
WHERE email = 'admin@soliscomercialni.com';
```

### Error: "null value in column provider_id"
**Causa:** Script SQL antiguo
**Solución:** Usar el archivo `create-users.sql` actualizado (ya está corregido)

### Error: "cannot insert into generated column email"
**Causa:** Script SQL antiguo
**Solución:** Usar el archivo `create-users.sql` actualizado (ya está corregido)

---

## 📊 Credenciales de Prueba

Una vez completados todos los pasos, puedes usar:

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@soliscomercialni.com | admin123 |
| Manager | manager@soliscomercialni.com | manager123 |
| Operator | operator@soliscomercialni.com | operator123 |
| Auditor | auditor@soliscomercialni.com | auditor123 |

---

## ✅ Checklist Final

- [ ] Ejecutado `schema.sql` (tablas de inventario)
- [ ] Ejecutado `auth-schema.sql` (tabla user_profiles + triggers)
- [ ] Ejecutado `create-users.sql` (4 usuarios con contraseñas)
- [ ] Verificado que los 4 usuarios existen
- [ ] Verificado que tienen roles asignados
- [ ] Probado login con admin@soliscomercialni.com
- [ ] Login funciona y redirige a /inventory

---

**¡Sigue estos pasos en orden y todo funcionará perfectamente!** 🎉
