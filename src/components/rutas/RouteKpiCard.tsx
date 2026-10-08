import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Card from '@/components/ui/Card';

export type RouteKpiTone = 'brand' | 'success' | 'info' | 'warning' | 'violet' | 'danger' | 'neutral';

const toneVariables: Record<RouteKpiTone, string> = {
  brand: 'var(--brand-primary)',
  success: 'var(--success)',
  info: 'var(--info)',
  warning: 'var(--warning)',
  violet: 'var(--kpi-violet)',
  danger: 'var(--danger)',
  neutral: 'var(--muted)',
};

interface RouteKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: RouteKpiTone;
  footer?: ReactNode;
  footerTone?: RouteKpiTone;
}

export default function RouteKpiCard({
  icon: Icon,
  label,
  value,
  tone = 'info',
  footer,
  footerTone = tone,
}: RouteKpiCardProps) {
  const accent = toneVariables[tone];

  return (
    <Card
      className="route-kpi-card"
      style={{
        position: 'relative',
        padding: 16,
        borderColor: `color-mix(in srgb, ${accent} 42%, var(--border))`,
        background: `radial-gradient(ellipse at 0% 100%, color-mix(in srgb, ${accent} 24%, transparent) 0%, transparent 62%), linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--card)) 0%, var(--card) 56%, color-mix(in srgb, ${accent} 6%, var(--panel)) 100%)`,
        boxShadow: `0 2px 8px var(--shadow), inset 0 1px 0 color-mix(in srgb, ${accent} 16%, transparent)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          className="route-kpi-icon"
          style={{
            color: accent,
            background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 24%, transparent), color-mix(in srgb, ${accent} 8%, transparent))`,
            borderColor: `color-mix(in srgb, ${accent} 78%, transparent)`,
          }}
        >
          <Icon size={22} aria-hidden="true" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </div>
          {footer && (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: toneVariables[footerTone] }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
