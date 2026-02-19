# Instrucciones para Implementar las Mejoras

## Resumen de Mejoras Implementadas

Se han implementado las siguientes 4 mejoras solicitadas:

### 1. ✅ Módulo de Reportes 100% Responsive para Móvil
- Scroll en cascada sin movimiento horizontal no deseado
- Todas las tablas y gráficos se adaptan automáticamente
- Botones con texto oculto en móvil para ahorrar espacio
- Grid responsive con `minmax(min(400px, 100%), 1fr)`

### 2. ✅ Sistema de Roles y Permisos Granular
- Gestión completa de usuarios con roles: Admin, Gerente de Bodega, Vendedor, Auditor
- Sistema de permisos por módulo y acción
- El admin puede crear usuarios y asignar permisos específicos
- Interfaz visual para gestionar permisos por rol

### 3. ✅ Colores Tipo Kanban para Columnas de Bodegas
- Sistema de colores personalizables para cada bodega
- Los colores se aplican a headers y celdas de la tabla de inventario
- Configuración centralizada que afecta a todos los usuarios
- Interfaz visual con selector de colores y presets

### 4. ✅ Almacenamiento en Supabase
- Todos los datos se guardan en Supabase
- Tablas creadas: `permissions`, `role_permissions`, `warehouse_colors`
- APIs REST implementadas para gestión completa

---

## Pasos para Activar las Mejoras

### Paso 1: Ejecutar Scripts SQL en Supabase

Debes ejecutar los siguientes scripts en el **SQL Editor** de Supabase en este orden:

#### 1.1 Script de Permisos
Archivo: `src/lib/supabase/permissions-schema.sql`

```sql
-- Copiar y pegar todo el contenido del archivo permissions-schema.sql
-- Este script crea:
-- - Tabla permissions
-- - Tabla role_permissions
-- - Políticas RLS
-- - Permisos base del sistema
-- - Asignación de permisos por defecto a cada rol
```

**Ir a:** Supabase Dashboard → SQL Editor → New Query → Pegar el contenido completo del archivo → Run

#### 1.2 Script de Colores de Bodegas
Archivo: `src/lib/supabase/warehouse-colors-schema.sql`

```sql
-- Copiar y pegar todo el contenido del archivo warehouse-colors-schema.sql
-- Este script crea:
-- - Tabla warehouse_colors
-- - Políticas RLS
-- - Colores por defecto para las bodegas existentes
```

**Ir a:** Supabase Dashboard → SQL Editor → New Query → Pegar el contenido completo del archivo → Run

### Paso 2: Verificar las Tablas Creadas

En Supabase, ve a **Table Editor** y verifica que existan estas tablas:

- ✅ `permissions` - Contiene todos los permisos del sistema
- ✅ `role_permissions` - Relación entre roles y permisos
- ✅ `warehouse_colors` - Configuración de colores de bodegas
- ✅ `user_profiles` - Ya existía, contiene los usuarios y sus roles

### Paso 3: Configurar Permisos de Roles

1. Inicia sesión como **admin**
2. Ve al módulo **Roles** en el menú lateral
3. Verás los 4 roles del sistema:
   - **Administrador**: Acceso completo
   - **Gerente de Bodega**: Inventario + Transferencias + Reportes
   - **Vendedor**: Solo lectura de inventario + Ventas
   - **Auditor**: Solo reportes

4. Haz clic en cada rol para ver y modificar sus permisos
5. Activa/desactiva permisos haciendo clic en cada uno

### Paso 4: Crear Usuarios

1. En el módulo **Roles**, haz clic en **"Nuevo Usuario"**
2. Completa los datos:
   - Nombre completo
   - Email
   - Contraseña (opcional - se genera automáticamente)
   - Rol (Vendedor, Gerente de Bodega, Auditor, Administrador)
3. Haz clic en **"Crear Usuario"**

### Paso 5: Configurar Colores de Bodegas

1. Ve al módulo **Inventario**
2. Haz clic en el botón **"Colores"** en la parte superior
3. Se abrirá el modal de configuración de colores
4. Para cada bodega:
   - Selecciona un color de fondo (usa el selector o los presets)
   - El color de texto se ajusta automáticamente
   - Puedes ajustarlo manualmente si lo deseas
5. Haz clic en **"Guardar Colores"**
6. Los colores se aplicarán inmediatamente a la tabla de inventario

---

## Funcionalidades por Rol

### 👑 Administrador
- ✅ Acceso completo a todos los módulos
- ✅ Gestionar usuarios y roles
- ✅ Asignar permisos
- ✅ Configurar colores de bodegas
- ✅ Modificar inventario
- ✅ Ver reportes
- ✅ Usar agentes IA

### 🏭 Gerente de Bodega (Manager)
- ✅ Ver y modificar inventario
- ✅ Crear y ver transferencias entre bodegas
- ✅ Ver reportes
- ✅ Exportar datos
- ❌ No puede gestionar usuarios
- ❌ No puede modificar configuración

### 🛒 Vendedor (Operator)
- ✅ Ver inventario (solo lectura)
- ✅ Ver detalles de productos
- ✅ Ver reportes básicos
- ✅ Crear ventas
- ❌ No puede modificar inventario
- ❌ No puede hacer transferencias
- ❌ No puede gestionar usuarios

### 📊 Auditor
- ✅ Ver reportes completos
- ✅ Exportar reportes
- ❌ No puede ver inventario
- ❌ No puede modificar nada
- ❌ Solo acceso de lectura a reportes

---

## Verificación de Funcionamiento

### Test 1: Responsive en Móvil
1. Abre el navegador en modo responsive (F12 → Toggle device toolbar)
2. Selecciona un dispositivo móvil (iPhone, Android)
3. Ve al módulo de **Reportes**
4. Verifica que:
   - No hay scroll horizontal no deseado
   - Los gráficos se apilan en una columna
   - Las tablas tienen scroll horizontal interno
   - Los botones se adaptan al espacio

### Test 2: Sistema de Roles
1. Como admin, crea un usuario con rol "Vendedor"
2. Cierra sesión e inicia sesión con ese usuario
3. Verifica que:
   - Solo puede ver Inventario (lectura) y Reportes
   - No puede editar productos
   - No aparece el módulo de Roles
   - No puede sincronizar inventario

### Test 3: Colores de Bodegas
1. Como admin, ve a Inventario → Colores
2. Cambia el color de la bodega X1 a rojo (#EF4444)
3. Guarda los cambios
4. Verifica que:
   - El header de la columna X1 es rojo
   - Las celdas de X1 tienen fondo rojo claro
   - El texto es legible (blanco sobre rojo)
5. Cierra sesión e inicia con otro usuario
6. Verifica que ve los mismos colores

---

## Archivos Modificados/Creados

### Nuevos Archivos SQL
- `src/lib/supabase/permissions-schema.sql`
- `src/lib/supabase/warehouse-colors-schema.sql`

### Nuevas APIs
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/permissions/route.ts`
- `src/app/api/role-permissions/route.ts`
- `src/app/api/warehouse-colors/route.ts`

### Componentes Modificados
- `src/app/(dashboard)/reports/page.tsx` - Responsive completo
- `src/app/(dashboard)/roles/page.tsx` - Sistema de roles funcional
- `src/app/(dashboard)/inventory/page.tsx` - Botón de colores
- `src/components/dashboard/PivotInventoryTable.tsx` - Colores en bodegas

### Nuevos Componentes
- `src/components/modals/WarehouseColorModal.tsx` - Configuración de colores

---

## Soporte y Troubleshooting

### Problema: "Error al cargar permisos"
**Solución:** Verifica que ejecutaste el script `permissions-schema.sql` en Supabase

### Problema: "No aparecen los colores de bodegas"
**Solución:** 
1. Ejecuta el script `warehouse-colors-schema.sql`
2. Ve a Inventario → Colores y guarda la configuración

### Problema: "Usuario no puede acceder a módulos"
**Solución:**
1. Verifica que el usuario tenga un rol asignado en `user_profiles`
2. Verifica que el rol tenga permisos en la tabla `role_permissions`

### Problema: "Tabla no responsive en móvil"
**Solución:** El navegador debe tener ancho menor a 640px para ver los cambios responsive

---

## Próximos Pasos Recomendados

1. **Personalizar Permisos**: Ajusta los permisos de cada rol según tus necesidades
2. **Crear Usuarios**: Crea usuarios para tu equipo con los roles apropiados
3. **Configurar Colores**: Personaliza los colores de las bodegas según tu preferencia
4. **Probar en Móvil**: Verifica el funcionamiento en dispositivos móviles reales

---

## Notas Importantes

- ⚠️ Los scripts SQL deben ejecutarse **solo una vez**
- ⚠️ Si ya existen las tablas, los scripts usarán `IF NOT EXISTS` y `ON CONFLICT` para evitar errores
- ⚠️ Los colores de bodegas son **globales** - afectan a todos los usuarios
- ⚠️ Solo los **administradores** pueden modificar roles, permisos y colores
- ⚠️ Los cambios en permisos requieren que el usuario cierre sesión y vuelva a iniciar

---

¡Todas las mejoras están implementadas y listas para usar! 🎉
