import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: number;
}

export default function Card({ children, className = '', padding = 18, style, ...props }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--card-surface-gradient)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding,
        boxShadow: '0 4px 14px var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
