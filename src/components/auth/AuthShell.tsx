import type { ReactNode } from 'react';

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText?: string;
  badgeText?: string;
  maxWidth?: number;
};

export default function AuthShell({
  title,
  subtitle,
  children,
  footerText = 'Acceso restringido a personal autorizado',
  badgeText = 'Acceso seguro',
  maxWidth = 440,
}: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: `
          radial-gradient(1200px 500px at 10% -10%, rgba(220,38,38,0.15), transparent 55%),
          radial-gradient(1000px 450px at 110% 110%, rgba(14,165,233,0.10), transparent 50%),
          linear-gradient(160deg, #0b1324 0%, #0f172a 52%, #111b30 100%)
        `,
      }}
    >
      <div style={{ width: '100%', maxWidth }}>
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.26)',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(2, 6, 23, 0.45)',
            backdropFilter: 'blur(8px)',
            padding: '30px 28px',
          }}
        >
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                border: '1px solid rgba(148, 163, 184, 0.26)',
                borderRadius: 999,
                padding: '4px 10px',
                marginBottom: 12,
              }}
            >
              {badgeText}
            </span>
            <h1 style={{ fontSize: 27, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              {title}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{subtitle}</p>
          </div>

          {children}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'rgba(148, 163, 184, 0.78)' }}>
          {footerText}
        </div>
      </div>
    </div>
  );
}
