import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: number;
  style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export default function Card({ children, className = '', padding = 18, style, onMouseEnter, onMouseLeave }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding,
        ...style,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
