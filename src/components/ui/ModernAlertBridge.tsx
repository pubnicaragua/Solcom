'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

declare global {
  interface Window {
    __solcomAlertPatched?: boolean;
    __solcomOriginalAlert?: typeof window.alert;
  }
}

function inferKind(message: string): ToastKind {
  const text = message.toLowerCase();
  if (/error|fall[oó]|denied|unauthorized|invalid|no se pudo/.test(text)) {
    return 'error';
  }
  if (/exitos|correctamente|completad|guardad|actualizad|cread/.test(text)) {
    return 'success';
  }
  return 'info';
}

export default function ModernAlertBridge() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    function addToast(message: string) {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const kind = inferKind(message);
      setToasts((prev) => [...prev.slice(-4), { id, message, kind }]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timersRef.current.delete(id);
      }, 5200);

      timersRef.current.set(id, timer);
    }

    const eventHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = String(detail?.message ?? '').trim();
      if (!message) return;
      addToast(message);
    };

    window.addEventListener('solcom:alert', eventHandler as EventListener);

    if (!window.__solcomAlertPatched) {
      window.__solcomOriginalAlert = window.alert.bind(window);
      window.alert = (message?: unknown) => {
        window.dispatchEvent(
          new CustomEvent('solcom:alert', {
            detail: { message: String(message ?? '') },
          })
        );
      };
      window.__solcomAlertPatched = true;
    }

    return () => {
      window.removeEventListener('solcom:alert', eventHandler as EventListener);
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  function dismissToast(id: number) {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function getStyles(kind: ToastKind) {
    if (kind === 'success') {
      return {
        icon: <CheckCircle2 size={18} color="#34D399" />,
        border: '1px solid rgba(52, 211, 153, 0.45)',
        glow: '0 10px 30px rgba(16, 185, 129, 0.18)',
        accent: '#34D399',
      };
    }
    if (kind === 'error') {
      return {
        icon: <AlertCircle size={18} color="#F87171" />,
        border: '1px solid rgba(248, 113, 113, 0.45)',
        glow: '0 10px 30px rgba(239, 68, 68, 0.16)',
        accent: '#F87171',
      };
    }
    return {
      icon: <Info size={18} color="#60A5FA" />,
      border: '1px solid rgba(96, 165, 250, 0.45)',
      glow: '0 10px 30px rgba(59, 130, 246, 0.16)',
      accent: '#60A5FA',
    };
  }

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 99999,
        display: 'grid',
        gap: 10,
        width: 'min(420px, calc(100vw - 20px))',
      }}
    >
      {toasts.map((toast) => {
        const styles = getStyles(toast.kind);
        return (
          <div
            key={toast.id}
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              background:
                'linear-gradient(180deg, rgba(17,24,39,0.97) 0%, rgba(15,23,42,0.97) 100%)',
              border: styles.border,
              boxShadow: styles.glow,
              display: 'grid',
              gridTemplateColumns: '20px 1fr auto',
              alignItems: 'start',
              gap: 10,
              padding: '12px 12px 12px 10px',
              animation: 'solcom-toast-in 0.2s ease-out',
            }}
          >
            <div style={{ marginTop: 1 }}>{styles.icon}</div>
            <div
              style={{
                color: '#E5E7EB',
                fontSize: 14,
                lineHeight: 1.35,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {toast.message}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Cerrar notificación"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.04)',
                color: '#CBD5E1',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <X size={14} />
            </button>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 2,
                background: `${styles.accent}55`,
              }}
            />
          </div>
        );
      })}

      <style jsx>{`
        @keyframes solcom-toast-in {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
