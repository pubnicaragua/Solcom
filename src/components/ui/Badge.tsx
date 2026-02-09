import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export default function Badge({ children, variant = 'neutral', size = 'md', style }: BadgeProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    success: {
      background: 'rgba(18, 191, 133, 0.15)',
      color: 'var(--success)',
      border: '1px solid rgba(21, 178, 126, 0.3)',
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.15)',
      color: 'var(--warning)',
      border: '1px solid rgba(245, 158, 11, 0.3)',
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.15)',
      color: 'var(--danger)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
    },
    neutral: {
      background: 'var(--panel)',
      color: 'var(--muted)',
      border: '1px solid var(--border)',
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '2px 8px', fontSize: 11 },
    md: { padding: '4px 10px', fontSize: 12 },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 4,
        fontWeight: 500,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
