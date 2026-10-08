# Solcom: rediseño global y temas claro/oscuro

**Estado:** propuesta aprobada en conversación, pendiente de revisión de esta especificación.  
**Fecha:** 2026-10-08

## Objetivo

Actualizar la apariencia de Solis Comercial ERP siguiendo la referencia visual: una interfaz empresarial de alto contraste, con superficies navy, acentos rojos de Solis, paneles y tablas más definidos. El sistema debe ofrecer modo oscuro y claro desde el Topbar global. Los efectos e información emergente de KPIs se incorporan únicamente en Inventario.

## Alcance confirmado

- El modo oscuro será el inicial, acorde con la referencia y el tema actual.
- El usuario podrá cambiar entre modo oscuro y claro desde el Topbar compartido.
- La selección se guardará localmente en el navegador y se conservará al navegar y recargar.
- La paleta activa se aplicará al shell y a las superficies de los módulos del sistema, incluidos formularios, tablas, tarjetas, menús y modales que hoy fijan colores de tema.
- Sidebar y Topbar tendrán el tratamiento de la referencia. El Sidebar conservará navegación, permisos, colapso y comportamiento móvil existentes.
- En Inventario se rediseñarán las tarjetas KPI y la tabla pivote, conservando métricas, datos, filtros, virtualización, selección de colores por bodega y comportamiento existente.
- Las tarjetas KPI tendrán realce sutil al hover y foco de teclado. Algunas mostrarán una explicación breve en tooltip, usando solo el significado de la métrica existente. No aplicarán filtros ni introducirán cifras de tendencia.
- Se conservarán los colores semánticos de estados, alertas, roles y bodegas cuando identifiquen información. No se cambiará su significado para adaptarlos al tema.
- El cambio será local: sin push, despliegue, cambios de base de datos, migraciones ni dependencias nuevas.

## Fuera de alcance

- Rediseñar la lógica o el cálculo de KPIs.
- Agregar búsqueda global funcional u otras acciones nuevas al Topbar.
- Hacer interactivos los KPIs de módulos distintos a Inventario.
- Alterar autenticación, permisos, rutas, integraciones Zoho, exportaciones o datos de negocio.
- Cambiar los estilos cartográficos propios del proveedor de mapas o los colores de series de gráficos que codifican datos.

## Diseño y arquitectura

### Estado del tema

Se añadirá un proveedor de tema en el layout raíz para que el valor seleccionado esté disponible en toda la aplicación. El tema se representará en el elemento raíz mediante `data-theme="dark|light"` y se persistirá con la clave local `solcom-theme`. La selección se aplicará antes de mostrar la interfaz para evitar un destello del tema incorrecto; si no existe valor guardado, se usará oscuro. El tema no se sincronizará con Supabase ni se asociará al perfil de usuario.

El Topbar incluirá un control accesible con icono y nombre de acción para cambiar de modo. No se duplicará el control por módulo. Las páginas de autenticación, portal de cliente y seguimiento público leerán la misma preferencia cuando usen las superficies temáticas globales, aunque esas rutas no ganarán un Topbar.

### Tokens visuales

`src/styles/globals.css` definirá los valores semánticos para fondo de aplicación, panel, tarjeta, superficie elevada, superficie al pasar el mouse, borde, texto, texto secundario, controles, foco y overlay. Los temas oscuro y claro asignarán paletas distintas a esos mismos nombres. Se mantendrán los tokens de marca y los colores semánticos existentes; se crearán aliases adicionales solo si el barrido encuentra una superficie que no puede expresarse con los tokens presentes.

Los componentes compartidos (`Card`, `Table`, `Button`, `Input`, `Select`, dropdowns y modales) consumirán los tokens en vez de fijar fondos o texto neutrales. Las pantallas y componentes de módulo se migrarán de forma que el cambio de `data-theme` actualice todas las superficies pertinentes en las rutas existentes. Los colores funcionales —por ejemplo, error, éxito, avisos, badges y color de bodega— permanecerán explícitos y legibles en ambos temas.

### Shell global

El Sidebar tendrá fondo y separadores consistentes con el tema, navegación compacta, estado activo rojo Solis, estados hover/foco visibles y tratamiento coherente del logo. Mantendrá los permisos actuales, elementos desplegables, colapso y adaptación móvil.

El Topbar compartido usará las superficies y bordes del tema, conservará fecha, notificaciones y perfil, e incorporará el control claro/oscuro. No añadirá el buscador del ejemplo porque aún no existe un contrato de búsqueda global solicitado.

### Inventario

Las tarjetas KPI usarán acentos de color para los iconos y cifras, con elevación y halo discretos al hover/foco. `Total SKUs`, `Total Productos`, `Bodegas Activas` y `Total Stock` mostrarán un tooltip explicativo al pasar el mouse o enfocar con teclado: sus textos aclararán que los valores están limitados al alcance de bodegas del perfil y qué representa cada conteo o suma. `Última Sincronización` no necesita explicación adicional porque ya muestra el valor temporal. Los tooltips no simularán tendencias ni agregarán datos. Las tarjetas seguirán siendo de solo lectura.

La tabla pivote seguirá optimizada para volumen alto: no se alterará su virtualización, jerarquía, ordenamiento, filtros, scroll horizontal, datos ni personalización de colores. Se adaptarán a ambos temas el toolbar, encabezados, agrupaciones, celdas, separadores, hover, carga y estado vacío. Las áreas diferenciadas por bodega y los valores de stock conservarán sus códigos de color semánticos y contraste legible.

## Criterios de aceptación

1. En todas las rutas de la aplicación, oscuro y claro conservan contraste legible en fondos, textos, paneles, controles y tablas.
2. El cambio desde el Topbar se aplica sin recargar y persiste al recargar o navegar a otra ruta.
3. El tema no parpadea en oscuro al abrir una sesión sin preferencia guardada.
4. Sidebar y Topbar tienen el mismo estilo y el mismo control de tema en todos los módulos del dashboard, sin cambiar navegación ni permisos.
5. En Inventario, los KPIs tienen hover/foco accesible y tooltips informativos en los KPIs seleccionados; no hay cifras comparativas inventadas ni nuevas acciones de filtrado.
6. La tabla pivote mantiene los datos, filtros, orden, jerarquía, personalización, respuesta y scroll actuales mientras presenta superficies adaptables a los dos temas.
7. Estados, alertas, roles, colores de bodega y colores de datos conservan su función y se distinguen en los dos temas.
8. El movimiento de hover respeta `prefers-reduced-motion` y los controles funcionan con teclado.
9. No cambian contratos, cálculos, acceso a datos, permisos, integraciones, base de datos ni configuración de despliegue.
10. Los cambios quedan únicamente en el checkout local y los cambios preexistentes del usuario permanecen intactos.

## Contexto del código inspeccionado

- Next.js 14 App Router; el layout raíz está en `src/app/layout.tsx` y el shell compartido en `src/app/(dashboard)/layout.tsx`.
- Sidebar y Topbar viven en `src/components/dashboard/Sidebar.tsx` y `src/components/dashboard/Topbar.tsx`.
- Inventario monta `KPIGrid` y `PivotInventoryTable`; sus implementaciones están en `src/components/dashboard/KPIGrid.tsx` y `src/components/dashboard/PivotInventoryTable.tsx`.
- `src/styles/globals.css` ya declara tokens oscuros, pero no existe un selector de tema y múltiples componentes todavía usan colores neutrales directos.
- El checkout contiene modificaciones ajenas en archivos de informes y sincronización Zoho; la implementación debe preservarlas.

## Revisión de alcance

El cambio cruza un único contrato visual global: todos los módulos consumirán el mismo tema semántico, mientras el shell sigue siendo compartido y la interacción KPI permanece encapsulada en Inventario. No requiere dividirse por subsistemas ni altera interfaces de negocio.
