# Carga de pivote y Realtime

Objetivo autorizado: probar una carga más rápida sin perder refrescos de existencias.
La implementación conserva la autenticación, RLS, selección de bodegas, respuesta de la API y suscripciones existentes.

Alternativas: una RPC agregada requeriría cambios en una base que no está disponible por el conector; paralelizar las 55 consultas conserva demasiados viajes de red. Se utilizará el join existente items → inventory_balance, comprobado por REST, en bloques de 250 productos con tres consultas simultáneas como máximo. Cada producto tiene como máximo una fila por bodega; el join evita paginar los saldos globalmente. El fallback a snapshots se conserva.

Realtime agrupará eventos durante 750 ms sin posponer indefinidamente el refresco. Si hay carga en curso, conserva una recarga pendiente; al terminar se usa la función y filtros actuales. Cambiar filtros puede cancelar una petición anterior; un evento Realtime no la cancela. Cada evento invalida el caché local. Los datos permanecen visibles durante actualizaciones.

Verificación: pruebas de más de 1.000 saldos, scope de bodegas, errores y cola de refrescos; comparación de todos los pares producto/bodega con la descarga anterior en Supabase sin escribir existencias; TypeScript y build. No se despliega automáticamente.
