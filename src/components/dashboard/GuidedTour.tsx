'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Sparkles,
  X,
} from 'lucide-react';

type TourStep = {
  target: string;
  title: string;
  description: string;
  tip?: string;
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
    description: 'Recorre el inventario por bodega, filtra productos y prepara documentos de venta desde una sola vista.',
    steps: [
      { target: '[data-tour="inventory-header"]', title: 'Resumen del módulo', description: 'Aquí identificas el inventario completo y las acciones principales disponibles para tu rol.' },
      { target: '[data-tour="inventory-actions"]', title: 'Acciones rápidas', description: 'Activa el modo de ventas, exporta a Excel o PDF e importa información cuando tengas permiso.', tip: 'El modo de ventas abre un flujo guiado para escoger bodega y documento.' },
      { target: '[data-tour="inventory-filters"]', title: 'Busca y filtra', description: 'Busca por nombre o SKU y combina bodega, categoría, estado y nivel de stock para encontrar exactamente lo que necesitas.' },
      { target: '[data-tour="inventory-table"]', title: 'Explora el inventario pivot', description: 'Abre los grupos para ver productos, variantes y existencias por bodega. En móvil cada producto se convierte en una tarjeta compacta.' },
      { target: '[data-tour="inventory-cart"]', title: 'Prepara una venta', description: 'Selecciona la bodega empresarial, el tipo de documento y agrega productos al carrito sin salir del inventario.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas/cotizaciones' || pathname.startsWith('/ventas/cotizaciones/'),
    eyebrow: 'Ventas',
    title: 'Cotizaciones listas para convertir',
    description: 'Consulta, filtra y administra cotizaciones con trazabilidad hasta la factura.',
    steps: [
      { target: '[data-tour="quote-header"]', title: 'Panel de cotizaciones', description: 'Esta vista concentra el seguimiento de tus cotizaciones y sus estados.' },
      { target: '[data-tour="quote-actions"]', title: 'Crea una cotización', description: 'Usa la acción principal para iniciar una cotización con cliente, productos, precios y condiciones.' },
      { target: '[data-tour="quote-filters"]', title: 'Encuentra documentos', description: 'Busca por cliente o número y utiliza fechas y estado para reducir la lista.' },
      { target: '[data-tour="quote-list"]', title: 'Revisa y convierte', description: 'Desde cada fila puedes ver, editar, convertir a factura o eliminar según el estado.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas/listas-precios' || pathname.startsWith('/ventas/listas-precios/'),
    eyebrow: 'Ventas',
    title: 'Administra tus listas de precios',
    description: 'Mantén tarifas consistentes para facturas y órdenes de venta.',
    steps: [
      { target: '[data-tour="price-header"]', title: 'Listas de precios', description: 'Consulta cuándo se actualizó cada tarifa y refresca la información cuando lo necesites.' },
      { target: '[data-tour="price-form"]', title: 'Crea o edita una lista', description: 'Define código, nombre, moneda, descripción y estado activo de la lista.' },
      { target: '[data-tour="price-import"]', title: 'Importa tarifas', description: 'Carga un archivo XLS/XLSX, elige la lista destino y decide si reemplazar precios existentes.' },
      { target: '[data-tour="price-list"]', title: 'Revisa las listas disponibles', description: 'Edita o elimina listas conservando el historial de precios.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/ventas' || pathname.startsWith('/ventas/'),
    eyebrow: 'Ventas',
    title: 'Gestiona el ciclo de venta',
    description: 'Facturas, órdenes y preparación de documentos viven en este flujo de trabajo.',
    steps: [
      { target: '[data-tour="sales-header"]', title: 'Centro de ventas', description: 'Identifica si estás trabajando con facturas u órdenes de venta.' },
      { target: '[data-tour="sales-tabs"]', title: 'Cambia de flujo', description: 'Usa las pestañas para pasar de facturas a órdenes sin perder contexto.' },
      { target: '[data-tour="sales-filter"]', title: 'Filtra documentos', description: 'Busca por número o cliente y acota por estado y fechas.' },
      { target: '[data-tour="sales-list"]', title: 'Opera sobre cada documento', description: 'Visualiza, edita, envía o consulta el estado de tus documentos desde la lista.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/alistamiento' || pathname.startsWith('/alistamiento/'),
    eyebrow: 'Operación',
    title: 'Lleva cada pedido hasta despacho',
    description: 'El alistamiento muestra qué está en cola, quién lo tomó y qué falta para completar la entrega.',
    steps: [
      { target: '[data-tour="picking-header"]', title: 'Visión operativa', description: 'Empieza por los indicadores de cola, proceso y pedidos listos.' },
      { target: '[data-tour="picking-filters"]', title: 'Enfoca el trabajo', description: 'Filtra por bodega, estado, prioridad o fecha para encontrar la orden correcta.' },
      { target: '[data-tour="picking-list"]', title: 'Ejecuta el alistamiento', description: 'Toma una orden, inicia el picking, valida seriales y márcala lista cuando el pedido esté preparado.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/rutas' || pathname.startsWith('/rutas/'),
    eyebrow: 'Logística',
    title: 'Organiza y monitorea tus rutas',
    description: 'Planifica entregas y sigue el avance operativo desde un solo espacio.',
    steps: [
      { target: '[data-tour="routes-header"]', title: 'Centro de rutas', description: 'Usa las pestañas para alternar entre planificación y monitoreo en vivo.' },
      { target: '[data-tour="routes-tabs"]', title: 'Cambia de vista', description: 'Centro de Rutas sirve para planificar; Monitoreo en Vivo sirve para dar seguimiento.' },
      { target: '[data-tour="routes-content"]', title: 'Trabaja la operación', description: 'Aquí aparecerán las rutas, pedidos y estados disponibles para tu usuario.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/reports' || pathname.startsWith('/reports/'),
    eyebrow: 'Análisis',
    title: 'Convierte datos en decisiones',
    description: 'Los reportes cargan primero el resumen útil y completan los análisis más pesados en segundo plano.',
    steps: [
      { target: '[data-tour="reports-header"]', title: 'Resumen ejecutivo', description: 'Comienza por los KPI de inventario y valor para entender el estado general.' },
      { target: '[data-tour="reports-filters"]', title: 'Define el alcance', description: 'Filtra por categoría, marca, estado o color antes de interpretar los resultados.' },
      { target: '[data-tour="reports-kpis"]', title: 'Lee los indicadores', description: 'Compara existencias, valor, productos agotados y bodegas activas.' },
      { target: '[data-tour="reports-charts"]', title: 'Explora el detalle', description: 'Revisa distribución por bodega, categorías, marcas y productos destacados.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/compras' || pathname.startsWith('/compras/'),
    eyebrow: 'Abastecimiento',
    title: 'Compra con mejor contexto',
    description: 'Usa cobertura, ventas recientes y stock actual para priorizar reposiciones.',
    steps: [
      { target: '[data-tour="purchases-header"]', title: 'Análisis de compras', description: 'Define el período y actualiza el análisis con datos recientes.' },
      { target: '[data-tour="purchases-kpis"]', title: 'Prioriza rápidamente', description: 'Los indicadores resumen presupuesto, críticos, sanos y unidades sugeridas.' },
      { target: '[data-tour="purchases-table"]', title: 'Revisa las recomendaciones', description: 'Ordena mentalmente por riesgo, cobertura e inversión para decidir qué comprar primero.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/fase2' || pathname.startsWith('/fase2/'),
    eyebrow: 'Operación',
    title: 'Explora los módulos operativos',
    description: 'Fase 2 concentra herramientas que se incorporan gradualmente al ERP.',
    steps: [
      { target: '[data-tour="phase-header"]', title: 'Qué es Fase 2', description: 'Aquí se agrupan módulos operativos que ya cuentan con flujos funcionales o están en expansión.' },
      { target: '[data-tour="phase-modules"]', title: 'Elige un módulo', description: 'Selecciona una tarjeta para entrar al flujo específico.' },
      { target: '[data-tour="phase-form"]', title: 'Crea registros', description: 'Completa el formulario y guarda información real cuando el módulo lo permita.' },
      { target: '[data-tour="phase-records"]', title: 'Consulta lo registrado', description: 'Busca, revisa y administra los registros existentes.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/reuniones' || pathname.startsWith('/reuniones/'),
    eyebrow: 'Seguimiento',
    title: 'Mantén acuerdos accionables',
    description: 'Consulta minutas, acuerdos y puntos de seguimiento sin perder el contexto del proyecto.',
    steps: [
      { target: '[data-tour="meetings-header"]', title: 'Historial de reuniones', description: 'El encabezado identifica el espacio de seguimiento del equipo.' },
      { target: '[data-tour="meeting-card"]', title: 'Lee el contexto', description: 'Cada reunión reúne fecha, participantes y objetivo en una tarjeta de lectura rápida.' },
      { target: '[data-tour="meeting-notes"]', title: 'Revisa los acuerdos', description: 'Los puntos de la reunión muestran avances, decisiones y pendientes.' },
    ],
  },
  {
    matches: (pathname) => pathname === '/transfers' || pathname.startsWith('/transfers/'),
    eyebrow: 'Inventario',
    title: 'Mueve existencias entre bodegas',
    description: 'Registra y consulta transferencias con trazabilidad de origen, destino y recepción.',
    steps: [
      { target: '[data-tour="transfers-header"]', title: 'Transferencias', description: 'Consulta el estado general de los movimientos entre bodegas.' },
      { target: '[data-tour="transfers-actions"]', title: 'Crea un movimiento', description: 'Inicia una transferencia seleccionando origen, destino y productos.' },
      { target: '[data-tour="transfers-list"]', title: 'Da seguimiento', description: 'Revisa qué movimientos están pendientes, en tránsito o recibidos.' },
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
  }, [pathname]);

  const updateTarget = useCallback(() => {
    if (!open || !step || typeof window === 'undefined') return;

    const target = document.querySelector(step.target) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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

    const width = Math.min(360, window.innerWidth - 32);
    const height = 76;
    const left = Math.max(16, (window.innerWidth - width) / 2);
    const top = Math.max(24, (window.innerHeight - height) / 2 - 80);
    setTargetRect({ top, left, width, height, bottom: top + height, right: left + width });
  }, [open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
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
  const cardHeightEstimate = 258;
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
        <span className="guided-tour-launcher-icon"><Sparkles size={17} /></span>
        <span className="guided-tour-launcher-label">Guía</span>
        <span className="guided-tour-launcher-dot" aria-hidden="true" />
      </button>

      {open && step && targetRect && (
        <>
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
          gap: 8px;
          min-height: 42px;
          padding: 7px 13px 7px 8px;
          border: 1px solid color-mix(in srgb, var(--brand-primary) 55%, var(--border));
          border-radius: 999px;
          background: linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 20%, var(--panel-elevated)), var(--panel-elevated));
          color: var(--text);
          box-shadow: 0 12px 28px var(--shadow), inset 0 1px 0 rgba(255,255,255,0.08);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.1px;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .guided-tour-launcher:hover,
        .guided-tour-launcher:focus-visible {
          transform: translateY(-2px);
          border-color: var(--brand-primary);
          box-shadow: 0 16px 34px var(--shadow), 0 0 0 3px var(--focus-ring);
          outline: none;
        }

        .guided-tour-launcher-icon {
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--brand-button-gradient);
          color: #fff;
        }

        .guided-tour-launcher-dot {
          width: 6px;
          height: 6px;
          margin-left: 1px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 0 3px var(--success-surface);
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
          font-size: 19px;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .guided-tour-card p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.55;
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
          font-size: 11px;
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
