'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  X,
} from 'lucide-react';

type TourStep = {
  target: string;
  title: string;
  description: string;
  tip?: string;
  instruction?: string;
  fallbackTargets?: string[];
};

type TourDefinition = {
  matches: (pathname: string) => boolean;
  eyebrow: string;
  title: string;
  description: string;
  steps: TourStep[];
};

type TourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
};

const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    matches: (pathname) => pathname === '/inventory' || pathname.startsWith('/inventory/'),
    eyebrow: 'Inventario',
    title: 'Controla existencias con claridad',
    description: 'Aprende qué hace cada control y completa el flujo desde la existencia hasta la cotización, factura u orden de venta.',
    steps: [
      { target: '[data-tour="inventory-header"]', title: '1. Lee el resumen', description: 'Aquí ves el alcance del inventario, el total de productos, las bodegas activas, el stock y la última sincronización.', instruction: 'el encabezado y las tarjetas de resumen' },
      { target: '[data-tour="inventory-sales-mode"]', title: '2. Abre el flujo de ventas', description: 'Haz clic en Modo Ventas para preparar un documento desde las existencias. No es el módulo Compras: es el carrito de venta que vive dentro de Inventario.', instruction: 'Modo Ventas', tip: 'Al abrirlo, el botón cambia a “Modo Ventas · Cotización” porque Cotización es el tipo inicial.' },
      { target: '[data-tour="inventory-cart-warehouse"]', fallbackTargets: ['[data-tour="inventory-sales-mode"]'], title: '3. Define la bodega', description: 'Selecciona una bodega empresarial. El sistema carga su familia de almacenes hijos y usa esa agrupación para validar el stock disponible.', instruction: 'Seleccionar bodega empresarial…', tip: 'Sin bodega no se habilita la selección de documentos ni la adición de productos.' },
      { target: '[data-tour="inventory-cart-document"]', fallbackTargets: ['[data-tour="inventory-cart-warehouse"]', '[data-tour="inventory-sales-mode"]'], title: '4. Elige el documento', description: 'Después de seleccionar la bodega puedes escoger Cotización, Factura u Orden de Venta. Cada opción cambia los datos que el sistema te pedirá.', instruction: 'Cotización, Factura u Orden de Venta', tip: 'Factura puede llevarte a Facturación para completar seriales y campos fiscales.' },
      { target: '[data-tour="inventory-products"]', title: '5. Agrega productos', description: 'Busca por nombre o SKU, expande la marca o el producto y usa la acción de agregar. El carrito respeta el stock de la familia de bodegas elegida.', instruction: 'el producto y su acción Agregar', tip: 'Si no seleccionaste bodega, la tabla no permite agregar para evitar una venta fuera de alcance.' },
      { target: '[data-tour="inventory-cart-customer"]', fallbackTargets: ['[data-tour="inventory-cart-drawer"]', '[data-tour="inventory-products"]'], title: '6. Completa el cliente', description: 'En el carrito busca y selecciona el cliente. Este dato es obligatorio para crear una cotización, factura u orden de venta.', instruction: 'Cliente *', tip: 'También puedes revisar cantidades, impuestos, garantía y otros datos del documento antes de guardar.' },
      { target: '[data-tour="inventory-cart-type-toggle"]', fallbackTargets: ['[data-tour="inventory-cart-drawer"]', '[data-tour="inventory-sales-mode"]'], title: '7. Cambia el tipo sin perder productos', description: 'El selector del carrito te permite cambiar entre Cotización, Factura y Orden de Venta mientras conservas la selección actual.', instruction: 'las pestañas de tipo de documento', tip: 'Si el botón superior dice “Modo Cotización”, significa que el carrito está activo en ese tipo; puedes cambiarlo aquí.' },
      { target: '[data-tour="inventory-cart-submit"]', fallbackTargets: ['[data-tour="inventory-cart-drawer"]', '[data-tour="inventory-sales-mode"]'], title: '8. Crea o continúa', description: 'Revisa el resumen y usa el botón final. Cotización y Orden de Venta se crean desde el carrito; Factura continúa en Facturación para completar la información final.', instruction: 'Crear Cotización, Crear Orden de Venta o Continuar a Factura' },
      { target: '[data-tour="inventory-filters"]', title: '9. Filtra el inventario', description: 'Cuando no estés preparando una venta, combina nombre o SKU con bodega, categoría, nivel de stock y filtros avanzados para encontrar exactamente lo que buscas.', instruction: 'el buscador y los filtros', tip: 'Los filtros no modifican existencias; solo cambian la vista.' },
      { target: '[data-tour="inventory-table"]', title: '10. Explora el detalle', description: 'Expande una marca o producto para revisar variantes y existencias por bodega. En móvil, toca la tarjeta para abrir el detalle.', instruction: 'la flecha junto a una marca o producto' },
    ],
  },
  {
    matches: (pathname) => pathname === '/zoho-sync' || pathname.startsWith('/zoho-sync/'),
    eyebrow: 'Integración',
    title: 'Entiende cada cambio que llega desde Zoho',
    description: 'Este módulo convierte la sincronización en una operación visible: webhooks recibidos, trabajos en cola, éxitos, errores y notificaciones reales.',
    steps: [
      { target: '[data-tour="zoho-sync-header"]', title: 'Estado general de la integración', description: 'Aquí confirmas si la sincronización está al día, procesando cambios o requiere atención.', instruction: 'el encabezado y el estado de la integración' },
      { target: '[data-tour="zoho-sync-summary"]', title: 'Lee la salud de la cola', description: 'Los indicadores muestran cuántos productos terminaron, cuántos siguen pendientes y cuántos fallaron.', instruction: 'las tarjetas Sincronizados, En cola y Errores pendientes' },
      { target: '[data-tour="zoho-sync-notifications"]', title: 'Conoce los avisos del ERP', description: 'Cada tipo indica si está configurado y si realmente existen eventos guardados en el historial.', instruction: 'la sección Notificaciones disparadas' },
      { target: '[data-tour="zoho-sync-activity"]', title: 'Investiga un evento', description: 'Usa la actividad reciente para distinguir un webhook de Zoho de un trabajo procesado por la cola y abrir el contexto del error.', instruction: 'la tabla Webhooks y cola de sincronización', tip: 'Si ves un fallo, comparte la fecha, referencia y mensaje exactos para rastrearlo con el desarrollador.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas/cotizaciones' || pathname.startsWith('/ventas/cotizaciones/'),
    eyebrow: 'Ventas',
    title: 'Cotizaciones listas para convertir',
    description: 'Consulta, filtra y administra cotizaciones con trazabilidad hasta la factura.',
    steps: [
      { target: '[data-tour="quote-header"]', title: 'Panel de cotizaciones', description: 'Esta vista concentra el seguimiento de tus cotizaciones y sus estados.', instruction: 'el encabezado “Cotizaciones”' },
      { target: '[data-tour="quote-actions"]', title: 'Crea una cotización', description: 'Usa la acción principal para iniciar una cotización con cliente, productos, precios y condiciones.', instruction: 'Nueva cotización' },
      { target: '[data-tour="quote-filters"]', title: 'Encuentra documentos', description: 'Busca por cliente o número y utiliza fechas y estado para reducir la lista.', instruction: 'el buscador, las fechas y el estado' },
      { target: '[data-tour="quote-list"]', title: 'Revisa y convierte', description: 'Desde cada fila puedes abrir el detalle, editar, convertir a factura o eliminar según el estado.', instruction: 'las acciones de la fila de la cotización' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas/listas-precios' || pathname.startsWith('/ventas/listas-precios/'),
    eyebrow: 'Ventas',
    title: 'Administra tus listas de precios',
    description: 'Mantén tarifas consistentes para facturas y órdenes de venta.',
    steps: [
      { target: '[data-tour="price-header"]', title: 'Listas de precios', description: 'Consulta cuándo se actualizó cada tarifa y refresca la información cuando lo necesites.', instruction: 'Actualizar listas' },
      { target: '[data-tour="price-form"]', title: 'Crea o edita una lista', description: 'Define código, nombre, moneda, descripción y estado activo de la lista.', instruction: 'Nueva lista o Editar' },
      { target: '[data-tour="price-import"]', title: 'Importa tarifas', description: 'Carga un archivo XLS/XLSX, elige la lista destino y decide si reemplazar precios existentes.', instruction: 'Importar tarifas' },
      { target: '[data-tour="price-list"]', title: 'Revisa las listas disponibles', description: 'Edita o elimina listas conservando el historial de precios.', instruction: 'las acciones de cada lista' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas' || pathname.startsWith('/ventas/'),
    eyebrow: 'Ventas',
    title: 'Gestiona el ciclo de venta',
    description: 'Facturas, órdenes y preparación de documentos viven en este flujo de trabajo.',
    steps: [
      { target: '[data-tour="sales-header"]', title: 'Centro de ventas', description: 'Identifica si estás trabajando con facturas u órdenes de venta y revisa la acción principal.', instruction: 'el encabezado y el botón de crear' },
      { target: '[data-tour="sales-tabs"]', title: 'Cambia de flujo', description: 'Usa las pestañas para pasar de Facturas a Órdenes de venta sin perder contexto.', instruction: 'las pestañas Facturas u Órdenes de venta' },
      { target: '[data-tour="sales-filter"]', title: 'Filtra documentos', description: 'Busca por número o cliente y acota por estado y fechas antes de operar.', instruction: 'el buscador, estado y rango de fechas' },
      { target: '[data-tour="sales-list"]', title: 'Opera sobre cada documento', description: 'Visualiza, edita, envía o consulta el estado desde las acciones de cada fila.', instruction: 'el menú de acciones de la factura' },
    ],
  },
  {
    matches: (pathname) => pathname === '/alistamiento' || pathname.startsWith('/alistamiento/'),
    eyebrow: 'Operación',
    title: 'Lleva cada pedido hasta despacho',
    description: 'El alistamiento muestra qué está en cola, quién lo tomó y qué falta para completar la entrega.',
    steps: [
      { target: '[data-tour="picking-header"]', title: 'Visión operativa', description: 'Empieza por los indicadores de cola, proceso y pedidos listos.', instruction: 'los indicadores y el encabezado del módulo' },
      { target: '[data-tour="picking-filters"]', title: 'Enfoca el trabajo', description: 'Filtra por bodega, estado, prioridad o fecha para encontrar la orden correcta.', instruction: 'los filtros de bodega, estado y prioridad' },
      { target: '[data-tour="picking-list"]', title: 'Ejecuta el alistamiento', description: 'Toma una orden, inicia el picking, valida seriales y márcala lista cuando el pedido esté preparado.', instruction: 'la orden y su botón de acción' },
    ],
  },
  {
    matches: (pathname) => pathname === '/rutas' || pathname.startsWith('/rutas/'),
    eyebrow: 'Logística',
    title: 'Organiza y monitorea tus rutas',
    description: 'Planifica entregas y sigue el avance operativo desde un solo espacio.',
    steps: [
      { target: '[data-tour="routes-header"]', title: 'Centro de rutas', description: 'Usa las pestañas para alternar entre planificación y monitoreo en vivo.', instruction: 'las pestañas del módulo' },
      { target: '[data-tour="routes-tabs"]', title: 'Cambia de vista', description: 'Centro de Rutas sirve para planificar; Monitoreo en Vivo sirve para dar seguimiento.', instruction: 'Centro de Rutas o Monitoreo en Vivo' },
      { target: '[data-tour="routes-content"]', title: 'Trabaja la operación', description: 'Aquí aparecerán las rutas, pedidos y estados disponibles para tu usuario.', instruction: 'las tarjetas y acciones de la vista' },
    ],
  },
  {
    matches: (pathname) => pathname === '/reports' || pathname.startsWith('/reports/'),
    eyebrow: 'Análisis',
    title: 'Convierte datos en decisiones',
    description: 'Los reportes cargan primero el resumen útil y completan los análisis más pesados en segundo plano.',
    steps: [
      { target: '[data-tour="reports-header"]', title: 'Resumen ejecutivo', description: 'Comienza por los KPI de inventario y valor para entender el estado general.', instruction: 'el período y Actualizar reporte' },
      { target: '[data-tour="reports-filters"]', title: 'Define el alcance', description: 'Filtra por categoría, marca, estado o color antes de interpretar los resultados.', instruction: 'los filtros del reporte' },
      { target: '[data-tour="reports-kpis"]', title: 'Lee los indicadores', description: 'Compara existencias, valor, productos agotados y bodegas activas.', instruction: 'las tarjetas KPI' },
      { target: '[data-tour="reports-charts"]', title: 'Explora el detalle', description: 'Revisa distribución por bodega, categorías, marcas y productos destacados.', instruction: 'los gráficos y sus pestañas de detalle' },
    ],
  },
  {
    matches: (pathname) => pathname === '/compras' || pathname.startsWith('/compras/'),
    eyebrow: 'Abastecimiento',
    title: 'Compra con mejor contexto',
    description: 'Lee la cobertura y las ventas recientes para decidir qué reponer primero, sin confundir este análisis con el carrito de ventas de Inventario.',
    steps: [
      { target: '[data-tour="purchases-header"]', title: '1. Define el período', description: 'Elige fecha inicial y final. Luego pulsa Actualizar Análisis para consultar ventas y existencias del período seleccionado.', instruction: 'Inicio, Final y Actualizar Análisis', tip: 'Este botón vuelve a consultar el análisis; no crea una orden de compra automáticamente.' },
      { target: '[data-tour="purchases-kpis"]', fallbackTargets: ['[data-tour="purchases-header"]'], title: '2. Lee las prioridades', description: 'Presupuesto sugerido, ítems críticos, ítems sanos y sobre-stock te indican dónde concentrar la revisión.', instruction: 'las tarjetas de indicadores' },
      { target: '[data-tour="purchases-view-switch"]', fallbackTargets: ['[data-tour="purchases-table"]', '[data-tour="purchases-header"]'], title: '3. Cambia la perspectiva', description: 'Compras muestra lo que requiere reposición. Más Vendidos cambia a los productos con mayor movimiento para comparar la demanda.', instruction: 'Compras o Más Vendidos' },
      { target: '[data-tour="purchases-search"]', fallbackTargets: ['[data-tour="purchases-table"]', '[data-tour="purchases-header"]'], title: '4. Encuentra un producto', description: 'Busca por nombre o SKU y combina marca, categoría y Mostrar solo requeridos para reducir la tabla.', instruction: 'Buscar producto o SKU… y los filtros' },
      { target: '[data-tour="purchases-table"]', title: '5. Decide cuánto reponer', description: 'Revisa estado, ventas de las últimas cuatro semanas, stock actual, sugerido e inversión estimada antes de tomar la decisión.', instruction: 'la fila del producto y sus columnas', tip: 'Crítico indica riesgo de quiebre; sano indica cobertura adecuada; sobre-stock indica más semanas de inventario de las esperadas.' },
      { target: '[data-tour="purchases-export"]', fallbackTargets: ['[data-tour="purchases-table"]'], title: '6. Comparte el resultado', description: 'Exporta el análisis a Excel para trabajar con el equipo. Compartir con IA abre una consulta basada en los datos cargados.', instruction: 'Exportar Excel o Compartir con IA' },
    ],
  },
  {
    matches: (pathname) => pathname === '/fase2' || pathname.startsWith('/fase2/'),
    eyebrow: 'Operación',
    title: 'Explora los módulos operativos',
    description: 'Fase 2 concentra herramientas que se incorporan gradualmente al ERP.',
    steps: [
      { target: '[data-tour="phase-header"]', title: 'Qué es Fase 2', description: 'Aquí se agrupan módulos operativos que ya cuentan con flujos funcionales o están en expansión.', instruction: 'el encabezado y el estado del módulo' },
      { target: '[data-tour="phase-modules"]', title: 'Elige un módulo', description: 'Selecciona una tarjeta para entrar al flujo específico.', instruction: 'la tarjeta del módulo que necesitas' },
      { target: '[data-tour="phase-form"]', title: 'Crea registros', description: 'Completa el formulario y guarda información real cuando el módulo lo permita.', instruction: 'los campos del formulario y Guardar' },
      { target: '[data-tour="phase-records"]', title: 'Consulta lo registrado', description: 'Busca, revisa y administra los registros existentes.', instruction: 'la tabla y sus acciones' },
    ],
  },
  {
    matches: (pathname) => pathname === '/reuniones' || pathname.startsWith('/reuniones/'),
    eyebrow: 'Seguimiento',
    title: 'Mantén acuerdos accionables',
    description: 'Consulta minutas, acuerdos y puntos de seguimiento sin perder el contexto del proyecto.',
    steps: [
      { target: '[data-tour="meetings-header"]', title: 'Historial de reuniones', description: 'El encabezado identifica el espacio de seguimiento del equipo.', instruction: 'el título y la descripción del módulo' },
      { target: '[data-tour="meeting-card"]', title: 'Lee el contexto', description: 'Cada reunión reúne fecha, participantes y objetivo en una tarjeta de lectura rápida.', instruction: 'la tarjeta de la reunión' },
      { target: '[data-tour="meeting-notes"]', title: 'Revisa los acuerdos', description: 'Los puntos de la reunión muestran avances, decisiones y pendientes.', instruction: 'los bloques de resumen y próximos pasos' },
    ],
  },
  {
    matches: (pathname) => pathname === '/transfers' || pathname.startsWith('/transfers/'),
    eyebrow: 'Inventario',
    title: 'Mueve existencias entre bodegas',
    description: 'Registra y consulta transferencias con trazabilidad de origen, destino y recepción.',
    steps: [
      { target: '[data-tour="transfers-header"]', title: 'Transferencias', description: 'Consulta el estado general de los movimientos entre bodegas.', instruction: 'el encabezado y el estado de la transferencia' },
      { target: '[data-tour="transfers-actions"]', title: 'Crea un movimiento', description: 'Inicia una transferencia seleccionando origen, destino y productos.', instruction: 'Nueva transferencia' },
      { target: '[data-tour="transfers-list"]', title: 'Da seguimiento', description: 'Revisa qué movimientos están pendientes, en tránsito o recibidos.', instruction: 'las pestañas y las acciones de la lista' },
    ],
  },
];

function getTour(pathname: string): TourDefinition | null {
  return TOUR_DEFINITIONS.find((tour) => tour.matches(pathname)) || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function GuidedTour() {
  const pathname = usePathname();
  const tour = useMemo(() => getTour(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);

  const step = tour?.steps[stepIndex] || null;

  useEffect(() => {
    setOpen(false);
    setStepIndex(0);
    setTargetRect(null);
  }, [pathname]);

  useEffect(() => {
    setTargetRect(null);
  }, [step]);

  const updateTarget = useCallback(() => {
    if (!open || !step || typeof window === 'undefined') return;

    const selectors = [
      step.target,
      ...(step.fallbackTargets || []),
      '[data-tour="module-header"]',
    ];
    const target = selectors
      .map((selector) => document.querySelector(selector) as HTMLElement | null)
      .find((element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.width >= 4 && rect.height >= 4;
      });

    if (target) {
      target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
      return;
    }

    setTargetRect(null);
  }, [open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, updateTarget]);

  if (!tour) return null;

  const start = () => {
    setStepIndex(0);
    setOpen(true);
  };

  const close = () => setOpen(false);
  const goBack = () => setStepIndex((current) => Math.max(0, current - 1));
  const goNext = () => {
    if (stepIndex >= tour.steps.length - 1) {
      close();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const cardWidth = Math.min(370, typeof window !== 'undefined' ? window.innerWidth - 32 : 370);
  const rawCardTop = targetRect ? targetRect.bottom + 16 : 120;
  const cardHeightEstimate = 360;
  const cardTop = typeof window === 'undefined'
    ? rawCardTop
    : rawCardTop + cardHeightEstimate > window.innerHeight - 16
      ? Math.max(16, (targetRect?.top || 160) - cardHeightEstimate - 16)
      : rawCardTop;
  const cardLeft = typeof window === 'undefined' || !targetRect
    ? 16
    : clamp(targetRect.left, 16, Math.max(16, window.innerWidth - cardWidth - 16));

  return (
    <>
      <button
        type="button"
        className="guided-tour-launcher"
        onClick={open ? close : start}
        aria-label={open ? 'Cerrar guía del módulo' : `Abrir guía de ${tour.eyebrow}`}
        title={open ? 'Cerrar guía' : 'Abrir guía del módulo'}
      >
        <span className="guided-tour-launcher-icon"><HelpCircle size={18} /></span>
        <span className="guided-tour-launcher-label">Guía</span>
      </button>

      {open && step && (
        <>
          {targetRect && (
            <div
              className="guided-tour-focus"
              aria-hidden="true"
              style={{
                top: Math.max(8, targetRect.top - 7),
                left: Math.max(8, targetRect.left - 7),
                width: Math.min(window.innerWidth - 16, targetRect.width + 14),
                height: Math.min(window.innerHeight - 16, targetRect.height + 14),
              }}
            />
          )}
          <section
            className="guided-tour-card"
            role="dialog"
            aria-modal="false"
            aria-labelledby="guided-tour-title"
            style={{ top: cardTop, left: cardLeft, width: cardWidth }}
          >
            <div className="guided-tour-card-topline">
              <span className="guided-tour-eyebrow"><BookOpen size={13} /> {tour.eyebrow}</span>
              <button type="button" className="guided-tour-close" onClick={close} aria-label="Cerrar guía">
                <X size={16} />
              </button>
            </div>
            <div className="guided-tour-progress" aria-label={`Paso ${stepIndex + 1} de ${tour.steps.length}`}>
              <span>Paso {stepIndex + 1} de {tour.steps.length}</span>
              <div className="guided-tour-progress-track">
                <span style={{ width: `${((stepIndex + 1) / tour.steps.length) * 100}%` }} />
              </div>
            </div>
            <h2 id="guided-tour-title">{step.title}</h2>
            <p>{step.description}</p>
            {step.instruction && (
              <div className="guided-tour-instruction">
                <span>Haz clic en</span>
                <strong>{step.instruction}</strong>
              </div>
            )}
            {step.tip && <div className="guided-tour-tip"><HelpCircle size={15} /> {step.tip}</div>}
            <div className="guided-tour-actions">
              <button type="button" className="guided-tour-skip" onClick={close}>Salir</button>
              <div className="guided-tour-nav">
                <button type="button" className="guided-tour-secondary" onClick={goBack} disabled={stepIndex === 0}>
                  <ChevronLeft size={16} /> Atrás
                </button>
                <button type="button" className="guided-tour-primary" onClick={goNext}>
                  {stepIndex === tour.steps.length - 1 ? 'Terminar' : 'Siguiente'}
                  {stepIndex < tour.steps.length - 1 && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <style jsx global>{`
        .guided-tour-launcher {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 1200;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 42px;
          padding: 7px 14px 7px 8px;
          border: 1px solid color-mix(in srgb, var(--info) 42%, var(--border));
          border-radius: 999px;
          background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 20%, var(--panel-elevated)), var(--panel-elevated));
          color: var(--text);
          box-shadow: 0 12px 28px var(--shadow), inset 0 1px 0 rgba(255,255,255,0.08);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1px;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .guided-tour-launcher:hover,
        .guided-tour-launcher:focus-visible {
          transform: translateY(-2px);
          border-color: var(--info);
          box-shadow: 0 16px 34px var(--shadow), 0 0 0 3px var(--focus-ring);
          outline: none;
        }

        .guided-tour-launcher-icon {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--info) 38%, var(--border));
          background: var(--info-surface);
          color: var(--info);
        }

        .guided-tour-focus {
          position: fixed;
          z-index: 1190;
          pointer-events: none;
          border: 1px solid color-mix(in srgb, var(--brand-primary) 75%, #fff);
          border-radius: 12px;
          box-shadow: 0 0 0 9999px rgba(4, 9, 18, 0.72), 0 0 0 5px color-mix(in srgb, var(--brand-primary) 22%, transparent), 0 0 26px color-mix(in srgb, var(--brand-primary) 45%, transparent);
          transition: top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease;
        }

        .guided-tour-card {
          position: fixed;
          z-index: 1210;
          padding: 18px;
          border: 1px solid color-mix(in srgb, var(--brand-primary) 32%, var(--border));
          border-radius: 16px;
          background: linear-gradient(145deg, color-mix(in srgb, var(--panel-elevated) 97%, var(--brand-primary)), var(--panel));
          color: var(--text);
          box-shadow: 0 24px 70px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08);
          animation: guided-tour-card-in 180ms ease-out;
        }

        .guided-tour-card-topline,
        .guided-tour-actions,
        .guided-tour-nav,
        .guided-tour-progress {
          display: flex;
          align-items: center;
        }

        .guided-tour-card-topline,
        .guided-tour-actions {
          justify-content: space-between;
        }

        .guided-tour-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--brand-accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.65px;
          text-transform: uppercase;
        }

        .guided-tour-close,
        .guided-tour-secondary,
        .guided-tour-skip,
        .guided-tour-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 9px;
          font: inherit;
          cursor: pointer;
        }

        .guided-tour-close {
          width: 30px;
          height: 30px;
          border: 1px solid var(--border);
          background: var(--surface-hover);
          color: var(--muted);
        }

        .guided-tour-progress {
          gap: 10px;
          margin-top: 15px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
        }

        .guided-tour-progress-track {
          flex: 1;
          height: 5px;
          overflow: hidden;
          border-radius: 99px;
          background: var(--border);
        }

        .guided-tour-progress-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: var(--brand-button-gradient);
          transition: width 180ms ease;
        }

        .guided-tour-card h2 {
          margin: 16px 0 7px;
          color: var(--text);
          font-size: 20px;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .guided-tour-card p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.55;
        }

        .guided-tour-instruction {
          display: grid;
          gap: 3px;
          margin-top: 13px;
          padding: 10px 11px;
          border: 1px solid color-mix(in srgb, var(--brand-primary) 24%, var(--border));
          border-radius: 9px;
          background: color-mix(in srgb, var(--brand-primary) 8%, var(--panel));
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.4;
        }

        .guided-tour-instruction span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .guided-tour-instruction strong {
          color: var(--text);
          font-size: 13px;
          font-weight: 700;
        }

        .guided-tour-tip {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          margin-top: 13px;
          padding: 9px 10px;
          border: 1px solid color-mix(in srgb, var(--info) 24%, var(--border));
          border-radius: 9px;
          background: var(--info-surface);
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .guided-tour-actions {
          gap: 12px;
          margin-top: 18px;
        }

        .guided-tour-skip,
        .guided-tour-secondary {
          min-height: 34px;
          border: 1px solid var(--border);
          background: var(--surface-hover);
          color: var(--text-secondary);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .guided-tour-primary {
          min-height: 34px;
          border: 1px solid transparent;
          background: var(--brand-button-gradient);
          color: #fff;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 800;
          box-shadow: 0 5px 14px var(--sidebar-active-glow);
        }

        .guided-tour-secondary:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }

        .guided-tour-skip:hover,
        .guided-tour-secondary:hover:not(:disabled),
        .guided-tour-close:hover {
          border-color: color-mix(in srgb, var(--brand-primary) 45%, var(--border));
          color: var(--text);
        }

        @keyframes guided-tour-card-in {
          from { opacity: 0; transform: translateY(6px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 640px) {
          .guided-tour-launcher {
            right: 14px;
            bottom: 14px;
            min-height: 40px;
          }

          .guided-tour-card {
            padding: 15px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .guided-tour-launcher,
          .guided-tour-focus,
          .guided-tour-card,
          .guided-tour-progress-track span {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
