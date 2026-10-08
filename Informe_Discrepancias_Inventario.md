# Análisis de Discrepancias de Inventario: Zoho vs Solcom ERP

## 1. El Problema: Diferencia en "Capital Invertido"

Actualmente existe una diferencia entre el "Balance General" reportado en Zoho y el "Capital Invertido" reportado en la pantalla de inicio del ERP Solcom.

* **Zoho (Inventario de Artículos):** $1,412,529.61
* **ERP Solcom (Capital Invertido):** $1,340,390.51

Esto se debe a dos motivos fundamentales: uno metodológico (la forma en que cada sistema define el "valor") y otro técnico (una regla en el script de sincronización del ERP).

## 2. Validación de Causa: Métodos de Valoración

Al ejecutar una auditoría profunda a los 1,953 artículos del sistema, encontramos lo siguiente:

### Zoho utiliza Costo Promedio Ponderado (MAC)
El valor oficial de Zoho **($1,412,529.61)** se calcula de forma contable. Esto significa que Zoho revisa históricamente todas las **Facturas de Compra Reales** y los costos en destino (fletes, etc.) para calcular cuánto dinero real se ha gastado en los artículos que actualmente están en bodega.

### El ERP utiliza Precios de Perfil (Fijos)
El ERP, para ser rápido operativamente, toma el campo `purchase_rate` (Precio de Compra) de la ficha de cada producto y lo multiplica por el stock actual.
La auditoría reveló que si multiplicamos el `purchase_rate` actual de los productos por el stock, el valor total del inventario es de **$1,391,566.08**.

Esta diferencia ($1.41M vs $1.39M) es perfectamente normal en las empresas. Ocurre porque los precios fijos del catálogo casi nunca contemplan las fluctuaciones de precios, fletes y descuentos de las facturas de compra a lo largo del tiempo.

## 3. Validación de Causa Técnica: El Fallback a Precio de Venta

Aunque el valor según perfiles es de $1.39M, el ERP reporta **$1.34M**. 
Al analizar el script `full-sync.js`, encontramos una regla de respaldo (fallback):

```javascript
const price = Number.isFinite(purchaseRate) && purchaseRate > 0
    ? purchaseRate
    : (Number.isFinite(salesRate) ? salesRate : null);
```

Esta regla dicta que si un artículo no tiene un `purchase_rate` configurado (es $0), el ERP usará su **precio de venta (`rate`)** para valorarlo. Esto **mezcla costos con ganancias**, distorsionando severamente el reporte.

### Ejemplos en tiempo real:
La auditoría detectó que **3 productos con stock físico** están sufriendo de este problema y siendo sumados como $1 cada uno (precio de venta referencial en su sistema) en lugar de un costo contable:

| SKU | Nombre | Stock | Costo Configurado (Zoho) | Precio de Venta Usado (ERP) |
|---|---|---|---|---|
| `AUD-INF-CAB` | AUDIFONOS INFINIX CABLE | 87 | $0.00 | $1.00 |
| `PAR-XIA` | XIAOMI SOUND OUTDOOR 30W | 11 | $0.00 | $1.00 |
| `6174000161918` | BARRA DE SONIDO ACR | 6 | $0.00 | $1.00 |

Además, hay **27 productos con stock** que no tienen ni precio de compra ni precio de venta, por lo que el ERP los contabiliza en $0, ignorando su verdadero impacto contable.

## 4. Solución Arquitectónica Propuesta

Para lograr que el sistema sea confiable tanto operativa como financieramente, se recomienda implementar una estrategia de dos frentes:

### Paso A: Sincronización Estricta de Costos (Backend)
Se deben modificar los scripts `full-sync.js` y `smart-sync.js` para **eliminar el uso del precio de venta**. Si el `purchase_rate` es $0, el ERP debe guardarlo obligatoriamente como $0. Esto garantizará que las gráficas del ERP que distribuyen porcentajes por bodega o marca usen una proporción de costos pura.

### Paso B: Extraer el MAC Oficial para el Dashboard (Frontend)
El número global de "Capital Invertido" que se muestra en la parte superior del ERP **no debe calcularse sumando productos locales**. En su lugar, el backend del ERP (en la ruta `/api/reports/data`) debe conectarse a la API de Reportes de Zoho (`/books/v3/reports/inventoryvaluation`) para traer en tiempo real el valor de **$1,412,529.61** (Costo Promedio Ponderado).

El ERP seguirá usando los precios locales únicamente para dividir ese número grande en porcentajes (Ej: "40% en Managua, 60% en León").

De esta manera, finanzas, contabilidad y operaciones verán la misma métrica confiable.
