# Optimización de inventario, Realtime y carga de permisos

Fecha: 2 de noviembre de 2026. Horas indicadas en Nicaragua (UTC−6).

Este documento resume los cambios implementados, las comprobaciones realizadas y sus límites. Las cantidades y tiempos corresponden a las mediciones de esa fecha; no representan un inventario permanente ni un tiempo garantizado de respuesta.

## Problemas investigados

- Antecedente de un error **504** en `/login-clientes`.
- Carga lenta de la tabla pivote y consultas repetidas al refrescar existencias.
- Falta de actualización visible al modificar un saldo durante una prueba.
- Contadores que permanecían en `...` al buscar antes de terminar la carga inicial.
- “Rutas” visible para el visitante pese a tener acceso únicamente a Inventario.
- Menú lateral vacío o con una espera prolongada mientras cargaba permisos.
- Valores de bodegas visibles a través de las columnas fijas al buscar y desplazarse horizontalmente.

## 1. Consulta de saldos de la pivote

La implementación anterior consultaba `inventory_balance` por bloques de 250 productos y páginas de 1.000 saldos, esperando cada página antes de solicitar la siguiente.

Se implementó `fetchPivotBalances()` utilizando la relación `items → inventory_balance`:

- Cada petición devuelve productos con su desglose de saldos por bodega.
- Se conservan bloques de 250 productos, con un máximo de tres peticiones simultáneas.
- Se mantienen el filtro explícito de bodegas autorizadas y el cliente de la sesión; la aplicación no utiliza una clave administrativa para servir la pivote.
- Se conserva el fallback existente a `stock_snapshots`.

La comparación reproducible, ejecutada con el **mismo cliente JavaScript**, dio:

| Medición de descarga de saldos | Implementación anterior | Implementación nueva |
|---|---:|---:|
| Peticiones | 55 | 10 |
| Tiempo | 16,502 s | 1,695 s |
| Reducción de tiempo | — | 89,7 % |

Se compararon los **47.859 saldos** de **2.290 productos deduplicados** en **21 bodegas**, incluidos ceros y negativos. Todos los pares producto/bodega coincidieron. También coincidió una consulta restringida a una sola bodega.

Estos tiempos no incluyen toda la autenticación, la respuesta completa del endpoint ni el renderizado del navegador. La primera medición exploratoria de 55,34 segundos utilizó otro transporte; no debe mezclarse con la comparación anterior para calcular la mejora.

Archivos:

- [Carga de saldos](../src/lib/inventory/pivot-balances.ts).
- [API de la pivote](../src/app/api/inventory/pivot/route.ts).
- [Benchmark de lectura](../scripts/benchmark-pivot.mjs).

## 2. Actualizaciones mediante Realtime

Se conservaron las suscripciones a `items`, `inventory_balance` y `stock_snapshots`.

La cola de refresco ahora agrupa avisos durante 750 ms. Si ya hay una petición en curso, un evento Realtime deja una recarga pendiente en lugar de cancelarla. Al terminar se ejecuta la actualización con los filtros vigentes. Los eventos invalidan el caché local, y una respuesta anterior no puede sobrescribir una búsqueda posterior.

### Causa encontrada en Supabase

Una prueba inicial modificó `TEST-01 / X1` y restauró su saldo, pero el observador no recibió eventos. Al consultar PostgreSQL se confirmó que **`inventory_balance` no pertenecía a la publicación `supabase_realtime`**, aunque `items` y `stock_snapshots` sí estaban incluidas.

Se agregó la tabla a la publicación mediante SQL y se guardó una migración idempotente:

[20261102214837_enable_inventory_balance_realtime.sql](../supabase/migrations/20261102214837_enable_inventory_balance_realtime.sql).

Esta corrección **sí se aplicó en la base real de Supabase**. No modificó los grants, las políticas RLS ni los otros miembros de la publicación. La comprobación de pertenencia puede repetirse con:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'inventory_balance';
```

### Prueba posterior a la corrección

Con autorización del usuario se utilizó el producto existente **`TEST-01`**, bodega **X1**, con la secuencia **1 → 20 → 1**:

1. El observador conectado con la clave pública recibió el evento con 20.
2. La cola ejecutó la consulta real de saldos y obtuvo 20.
3. El observador recibió la restauración con 1 y la consulta devolvió 1.
4. La lectura final confirmó la cantidad, `source` y `source_ts` originales.
5. El usuario confirmó que esta vez vio el cambio automático en su tabla.

Las restauraciones utilizaron condiciones para evitar sobrescribir cambios concurrentes. No se modificó Zoho. El campo `updated_at` avanzó por el trigger de actualización: la prueba restauró el saldo y su procedencia, no borró la huella temporal de las escrituras.

Archivos: [cola de refrescos](../src/lib/inventory/refresh-queue.ts), [tabla pivote](../src/components/dashboard/PivotInventoryTable.tsx).

## 3. Conciliación de movimientos y existencias

Se consultaron los movimientos de las últimas 24 horas, con corte inicial a las **15:23**:

- 88 registros de venta correspondientes a 68 productos y 98 unidades de salida.
- 1.428 pares producto/bodega comparados entre saldos y snapshots, sin diferencias.
- Los totales de esos 68 productos coincidieron con la suma de sus saldos por bodega.
- No se encontraron transferencias creadas dentro del período consultado.

Posteriormente se consultó **Zoho directamente**, con corte a las **15:35**. Los 68 productos y sus 1.428 pares producto/bodega coincidieron con Supabase; tampoco hubo diferencias en los totales ni ubicaciones sin mapear en esa muestra.

**Alcance:** esto no fue una conciliación de todo el catálogo. Los eventos de venta revisados no contenían `qty_before` y `qty_after`; por ello no se reconstruyó aritméticamente cada movimiento histórico. “Stock actual” en la tabla de movimientos comunicada al usuario se refería a la bodega indicada, no al total de todas las bodegas.

## 4. Contadores de inventario

Los KPIs dependían de recibir la primera pivote sin filtros. Una búsqueda podía cancelar esa carga y dejar los contadores esperando indefinidamente.

Ahora, cuando hay filtros o modo de familia y todavía no existe un resumen base, `KPIGrid` consulta el endpoint existente de KPIs por separado. La carga normal sigue reutilizando los datos de la pivote. Se incorporaron cancelación, manejo de errores y protección para que una respuesta tardía del resumen no sobrescriba datos más recientes.

Archivos: [KPIGrid](../src/components/dashboard/KPIGrid.tsx), [página de inventario](<../src/app/(dashboard)/inventory/page.tsx>).

## 5. Permisos de Rutas y carga del Sidebar

“Rutas” estaba exceptuada del control de acceso del Sidebar y no estaba registrada como módulo protegido. Se eliminó la excepción y se agregó al catálogo de módulos utilizado por los chequeos de rutas. Queda disponible para administradores o mediante una asignación explícita de módulo.

La consulta a Supabase confirmó que el visitante tenía el rol personalizado **`VISUAL DE EXISTENCIA`**, con overrides que habilitaban únicamente Inventario. No se modificó esa asignación.

Para cargar permisos:

- Se utiliza `INITIAL_SESSION`, evitando una validación remota adicional del usuario en cada consumidor del hook.
- Las consultas se ejecutan fuera del callback de autenticación.
- Los consumidores del mismo cliente y usuario comparten las consultas que están en curso. Esto no es un caché persistente de permisos.
- Después de obtener el perfil, los overrides y los permisos del rol se consultan en paralelo.
- Los permisos granulares reutilizan esa información y respetan el nombre del rol personalizado.
- El menú ya validado permanece visible al renovar la sesión del mismo usuario; se limpia al cambiar de identidad o cerrar sesión.
- Hay un límite de ocho segundos y recuperación mediante reintento, incluida una nueva suscripción si falta el evento inicial de sesión.
- El perfil del encabezado utiliza la sesión para mostrar la identidad. La autorización del middleware y las APIs se conserva.

Una medición de lectura del rol visitante tardó 0,632 s y devolvió únicamente Inventario. No incluye el arranque de sesión del navegador ni garantiza ese tiempo con otra conexión.

Archivos: [loader de permisos](../src/lib/auth/user-role-loader.ts), [useUserRole](../src/hooks/useUserRole.ts), [useRoleAccess](../src/hooks/useRoleAccess.ts), [Sidebar](../src/components/dashboard/Sidebar.tsx), [módulos](../src/lib/auth/module-permissions.ts).

## 6. Indicadores de carga y columnas fijas

Se creó [SegmentedLoader](../src/components/ui/SegmentedLoader.tsx): un círculo de 24 segmentos, de 76 px en la pivote y 40 px en el Sidebar. Es una animación de espera, sin porcentaje ficticio. En la carga inicial de la pivote se completa en verde al recibir los datos, con una transición de cierre de 220 ms. Respeta `prefers-reduced-motion` y tiene un estado accesible para lectores de pantalla.

También se corrigió la superposición de existencias al desplazar horizontalmente la tabla:

- La variante utilizaba `var(--surface-hover)`, que resuelve a un color semitransparente. La comprobación anterior solo reconocía textos que comenzaran literalmente por `rgba`, por lo que dejaba pasar esa transparencia.
- Las cinco columnas fijas ahora pintan el color de fila sobre una base opaca `var(--card)`.
- Un `colgroup` define los anchos de acuerdo con los desplazamientos `sticky`.
- Marca y Color limitan el texto a su propia celda.

El ajuste de tamaño del viewport se ejecuta también al finalizar la animación para mantener la medición y el scroll de la tabla.

## 7. Verificación y reproducción

Se ejecutaron y pasaron:

```bash
npm test             # 19 pruebas de permisos, KPIs, saldos y cola Realtime
npm run type-check
npm run build
```

Las 19 pruebas no sustituyen una prueba visual del scroll o del navegador. La superposición de columnas se comprobó mediante revisión del código y compilación; su última confirmación visual con búsqueda y desplazamiento horizontal queda pendiente.

Para repetir la comparación de lectura contra Supabase:

```bash
PIVOT_BENCHMARK_LIVE=1 node --import tsx scripts/benchmark-pivot.mjs
```

Este comando utiliza la configuración local y hace consultas reales, sin escribir existencias. Compara cada saldo y una restricción de bodega; si el inventario cambia durante la comparación puede requerir repetir la medición. No imprimir claves ni guardar sesiones en documentación o commits.

La última versión comprobada se compiló y sirvió localmente en `http://localhost:3000`. El estado de despliegue de los commits en Vercel no se verificó desde esta sesión. Esto es independiente de la publicación de Realtime, que sí se aplicó directamente en Supabase.

## 8. Límites y decisiones finales

- **504 histórico:** no se reprodujo ni se tuvo su log de Vercel. El middleware mantiene llamadas remotas de autenticación; sus cambios previos de timeout y paralelización no prueban la causa exacta de aquel incidente.
- **Latencia variable:** se observaron peticiones locales de decenas de segundos e incluso más de tres minutos. Durante la inspección PostgreSQL no mostró bloqueos y las consultas de permisos tenían tiempos de ejecución bajos; no se aisló definitivamente toda la espera de red/autenticación. Un timeout de permisos no demuestra que el usuario carezca de permisos.
- **Primera carga del login:** el usuario observó una primera visita lenta y una segunda rápida. Es compatible con una carga inicial en frío, pero no se estableció una causa única.
- **Búsqueda:** la investigación específica se canceló a petición del usuario, que confirmó una respuesta más rápida en producción. No se implementaron cambios adicionales de búsqueda, filtrado local ni índices para ella.
- **Credenciales de desarrollo:** las documentadas no permitieron las pruebas automáticas de login. La confirmación visual del flujo autenticado provino de la sesión del usuario.
- **Sin agregación SQL de la pivote:** se consideró una RPC, pero la optimización implementada utiliza el join de PostgREST; no debe documentarse como una RPC agregada.

## Referencias de implementación

Commits presentes al documentar el trabajo:

| Commit | Cambio |
|---|---|
| `e90e662` | Optimización de la pivote y permisos de Rutas |
| `dc5232f` | Carga de permisos del Sidebar y consultas concurrentes |
| `ea6f392` | Loader configurable y uso en el Sidebar |
| `5205396` | Anchos y fondos de columnas fijas |

Los planes bajo `docs/superpowers/` conservan el contexto de cada etapa. Este documento recoge el resultado consolidado, incluidas las pruebas posteriores que resolvieron pendientes de esos planes.
