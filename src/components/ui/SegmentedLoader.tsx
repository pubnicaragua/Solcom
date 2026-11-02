'use client';

interface SegmentedLoaderProps {
  complete?: boolean;
  size?: number;
  label?: string;
  completeLabel?: string;
}

export default function SegmentedLoader({ complete = false, size = 76, label = 'Cargando inventario', completeLabel = 'Inventario listo' }: SegmentedLoaderProps) {
  return (
    <div className={`segmented-loader${complete ? ' is-complete' : ''}${size <= 48 ? ' is-compact' : ''}`} role="status" aria-live="polite" aria-label={complete ? completeLabel : label || 'Cargando'}>
      <svg className="loading-ring" style={{ width: size, height: size }} viewBox="0 0 80 80" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <line
            key={index}
            className="loading-segment"
            x1="40" y1="7" x2="40" y2="17"
            transform={`rotate(${index * 15} 40 40)`}
            stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
            style={{ animationDelay: `${index * 0.065}s` }}
          />
        ))}
        {complete && <path className="loading-check" d="m29 40 7 7 15-15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {(complete || label) && <span className="loading-label">{complete ? completeLabel : label}</span>}
      <style jsx>{`
        .segmented-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          color: var(--pivot-brand-accent, var(--brand-primary));
          transition: color 180ms ease;
        }
        .loading-ring { overflow: visible; }
        .is-compact { gap: 10px; }
        .is-compact .loading-label { font-size: 12px; }
        .loading-segment { opacity: 0.14; animation: segment-build 2s ease-in-out infinite; }
        .loading-label { color: var(--muted); font-size: 14px; font-weight: 500; }
        .is-complete { color: var(--success); }
        .is-complete .loading-segment { animation: none; opacity: 1; }
        .loading-check { animation: check-appear 180ms ease-out both; transform-origin: center; }
        @keyframes segment-build {
          0%, 12%, 100% { opacity: 0.14; }
          35%, 65% { opacity: 1; }
        }
        @keyframes check-appear {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .loading-segment { animation: none; opacity: 0.65; }
          .loading-check { animation: none; }
          .segmented-loader { transition: none; }
        }
      `}</style>
    </div>
  );
}
