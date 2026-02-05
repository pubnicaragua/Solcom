import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export default function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
          {label}
        </label>
      )}
      <select
        className={className}
        style={{
          background: '#FFFFFF',
          border: '1px solid #D1D5DB',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 14,
          color: '#111827',
          cursor: 'pointer',
          fontWeight: 500,
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
