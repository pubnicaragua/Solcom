# Cotización Técnica y Comercial – Fase 2 Solcom ERP

> **Preparado para:** Cliente  
> **Fecha:** 20 de abril de 2025  
> **Módulos:** Ventas, Cotizaciones, Alistamiento, Órdenes de Venta (Plantilla Minorista), Mercancías en Tránsito, Insights de Bodega

---

## 1️⃣ Estado Actual vs. Desarrollo Requerido

| Módulo | Estado Actual | Qué se debe construir |
|--------|---------------|-----------------------|
| **Ventas** | UI funcional (carrito, checkout, historial) pero persistencia en localStorage y API mínima. | Persistencia real en BD, integración con inventario, facturación, reportes. |
| **Cotizaciones** | No existe. | CRUD completo, plantillas, conversión a ordenes, PDF/Excel. |
| **Alistamiento** | No existe. | Generación de órdenes, impresión de tickets, estados, asignación. |
| **Órdenes de Venta** | No existe. | CRUD con plantilla minorista, impresión automática, notificaciones. |
| **Mercancías en Tránsito** | No existe. | CRUD, seguimiento, alertas, integración con transferencias. |
| **Insights de Bodega** | No existe. | Dashboard de métricas, KPIs, recomendaciones, colas. |

---

## 2️⃣ Desglose por Módulo – Interfaces, Botones y Endpoints

### 📦 Ventas
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces (pantallas)** | 4 | Listado productos, carrito, checkout, historial de ventas |
| **Botones/acciones** | ~22 | Agregar al carrito, +/- cantidades, eliminar, filtros, pagar, cancelar, ver historial |
| **Endpoints backend** | ~12 | GET productos, POST venta, GET ventas, GET KPIs, PUT/DELETE venta, GET clientes, POST cliente, GET facturas, GET reportes, PUT stock, GET/PUT cotizaciones, GET/PUT alistamientos |

---

### 🧾 Cotizaciones
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces** | 5 | Listado cotizaciones, nueva cotización, editor plantilla, vista previa, conversión a orden |
| **Botones/acciones** | ~25 | Crear, editar, eliminar, duplicar, enviar PDF, convertir, aprobar, rechazar |
| **Endpoints** | ~15 | CRUD cotizaciones, GET plantillas, POST plantilla, GET/PUT productos, GET clientes, POST cliente, GET/PUT conversiones, GET reportes, GET/PUT precios especiales |

---

### 📋 Alistamiento
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces** | 4 | Listado órdenes, nueva orden, vista detalle, impresión ticket |
| **Botones/acciones** | ~20 | Crear, asignar, cambiar estado, imprimir, reasignar, completar |
| **Endpoints** | ~13 | CRUD órdenes, GET/PUT estados, GET personal, GET productos, PUT stock, GET impresión, GET alertas |

---

### 🧾 Órdenes de Venta (Plantilla Minorista)
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces** | 4 | Listado órdenes, nueva orden, vista ticket, seguimiento |
| **Botones/acciones** | ~22 | Crear, confirmar, imprimir, notificar, cancelar, reabrir |
| **Endpoints** | ~14 | CRUD órdenes, GET/PUT estados, GET/PUT notificaciones, GET plantillas, GET/PUT clientes, GET/PUT stock, GET reportes |

---

### 🚚 Mercancías en Tránsito
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces** | 4 | Listado mercancías, nueva, vista mapa/ubicación, alertas |
| **Botones/acciones** | ~20 | Agregar, editar ubicación, actualizar ETA, generar alerta, cerrar |
| **Endpoints** | ~13 | CRUD mercancías, GET/PUT ubicaciones, GET/PUT ETA, GET alertas, POST alerta, GET mapas |

---

### 📊 Insights de Bodega
| Elemento | Cantidad | Detalle |
|----------|---------|---------|
| **Interfaces** | 3 | Dashboard KPIs, análisis de colas, configuración de alertas |
| **Botones/acciones** | ~18 | Exportar, filtrar, configurar, refrescar, ajustar métricas |
| **Endpoints** | ~16 | GET KPIs, GET colas, GET/PUT alertas, GET/PUT configuración, GET reportes, GET/PUT recomendaciones, GET/PUT personal |

---

## 3️⃣ Totales Agregados

| Concepto | Total |
|----------|-------|
| **Interfaces (pantallas)** | **24** |
| **Botones/acciones** | **~127** |
| **Endpoints backend** | **~83** |

---

## 4️⃣ Planificación y Complejidad

### 4.1 Planificación (Proyecto)
- **Análisis y diseño de arquitectura:** 1 semana
- **Diseño UI/UX (mockups y flujos):** 2 semanas
- **Definición de modelos de datos y esquemas BD:** 1 semana
- **Integración con inventario y usuarios existentes:** 1 semana

### 4.2 Backend
- **Configuración de tablas y migraciones:** 1 semana
- **Desarrollo de 83 endpoints:** 6–7 semanas
- **Integración con Supabase y autenticación:** 1 semana
- **Testing unitario y de integración:** 2 semanas
- **Documentación de API:** 1 semana

### 4.3 Frontend
- **Construcción de 24 interfaces:** 5–6 semanas
- **Integración con 83 endpoints:** 3 semanas
- **Responsive y accesibilidad:** 2 semanas
- **Testing E2E:** 2 semanas
- **Optimización y rendimiento:** 1 semana

### 4.4 Reuniones e Iteraciones
- **Reuniones de avance (semanales):** 12 reuniones (1 hora c/u)
- **Iteraciones de feedback (cada 2 semanas):** 6 sesiones
- **Buffer para cambios solicitados por cliente:** 2 semanas

---

## 5️⃣ Escalabilidad y Soporte

### 5.1 Escalabilidad
- **Carga esperada:** 50 usuarios concurrentes en primer año.
- **Crecimiento:** 20% anual.
- **Optimización de consultas (índices, vistas):** Incluido.
- **Cache y CDN:** Recomendado para segundo año.
- **Monitoreo y alertas:** Incluido.

### 5.2 Soporte y Documentación
- **Manual de usuario por módulo:** Incluido.
- **Documentación técnica de API:** Incluido.
- **Capacitación inicial (2 sesiones):** Incluido.
- **Soporte post-lanzamiento (3 meses):** Incluido.
- **SLA de respuesta:** 48 horas hábiles.

---

## 6️⃣ Infraestructura y Costos Operativos (Estimado)

| Concepto | Costo mensual estimado (USD) |
|----------|----------------------------|
| **Supabase Pro (BD, Auth, Storage)** | $25 |
| **Vercel Pro (hosting frontend)** | $20 |
| **Dominios y SSL** | $12 |
| **Monitoreo (Sentry/Uptime)** | $10 |
| **Backup automatizado** | $5 |
| **Total mensual** | **$72** |
| **Total anual** | **$864** |

> **Nota:** Estos costos son aproximados y pueden ajustarse según uso real.

---

## 7️⃣ Margen Bruto y Precio Final

### 7.1 Cálculo de esfuerzo (horas)
| Fase | Horas | Tasa (USD/hora) | Subtotal |
|------|-------|----------------|----------|
| Planificación y diseño | 160 | $50 | $8,000 |
| Backend | 320 | $55 | $17,600 |
| Frontend | 280 | $50 | $14,000 |
| Testing y documentación | 120 | $45 | $5,400 |
| Reuniones y buffer | 80 | $40 | $3,200 |
| **Subtotal desarrollo** | **960** | | **$48,200** |

### 7.2 Margen bruto
- **Costo directo desarrollo:** $48,200
- **Margen bruto objetivo:** 35%
- **Margen bruto (USD):** $26,030
- **Precio final (USD):** $74,230

### 7.3 Opción de pago
- **50% al inicio:** $37,115
- **50% al entrega y aceptación:** $37,115

---

## 8️⃣ Cronogramo Sugerido

| Semana | Actividad |
|--------|-----------|
| 1–2 | Planificación, diseño UI/UX, modelos de datos |
| 3–4 | Backend base (tablas, CRUDs básicos) |
| 5–7 | Desarrollo endpoints (Ventas, Cotizaciones) |
| 8–9 | Desarrollo endpoints (Alistamiento, Órdenes) |
| 10–11 | Desarrollo endpoints (Tránsito, Insights) |
| 12–14 | Frontend (Ventas, Cotizaciones) |
| 15–16 | Frontend (Alistamiento, Órdenes) |
| 17–18 | Frontend (Tránsito, Insights) |
| 19–20 | Integración, testing, documentación |
| 21–22 | Buffer para cambios y ajustes |
| 23 | Entrega y capacitación |

---

## 9️⃣ Riesgos y Consideraciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|----------|------------|
| Cambios de alcance por cliente | Alta | Medio | Buffer de 2 semanas, contrato por cambio |
| Retrasos en integración con Zoho | Media | Alto | Pruebas tempranas, alternativas locales |
| Escalabilidad no esperada | Baja | Alto | Arquitectura modular, cache y monitoreo |
| Pérdida de datos | Baja | Crítico | Backups automáticos, pruebas de rollback |

---

## 📌 Resumen Ejecutivo

- **Módulos a construir:** 6
- **Interfaces:** 24
- **Botones/acciones:** ~127
- **Endpoints backend:** ~83
- **Duración estimada:** 23 semanas (~6 meses)
- **Precio final:** **$74,230 USD**
- **Costo operativo anual:** **$864 USD**
- **Margen bruto:** **35%**

---

> **Próximos pasos:**  
> 1. Aprobación de alcance y presupuesto.  
> 2. Firma de contrato y kickoff.  
> 3. Inicio de planificación detallada (semana 1).
