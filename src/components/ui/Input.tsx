import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  style?: React.CSSProperties;
}

export default function Input({ label, error, className = '', style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
          {label}
        </label>
      )}
      <input
        className={className}
        style={{
          background: 'var(--control-bg)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 14,
          color: 'var(--text)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          boxShadow: '0 1px 2px var(--shadow)',
          ...style,
          fontWeight: 500,
        }}
        {...props}
      />
      {error && (
        <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  );
}
