'use client';

import { useState } from 'react';

interface BarChartProps {
  data: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
  height?: number;
  showValues?: boolean;
}

export default function BarChart({ data, height = 300, showValues = true }: BarChartProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 12, padding: '20px 0' }}>
      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * (height - 60);
        const color = item.color || 'var(--brand-primary)';

        return (
          <div
            key={index}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              position: 'relative',
            }}
            onMouseEnter={() => setHoveredBar(index)}
            onMouseLeave={() => setHoveredBar(null)}
          >
            {hoveredBar === index && (
              <div
                style={{
                  position: 'absolute',
                  top: -50,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: color,
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}: {item.value.toLocaleString()}
              </div>
            )}
            {showValues && (
              <div style={{ fontSize: 13, fontWeight: 600, color, transition: 'all 0.2s', transform: hoveredBar === index ? 'scale(1.1)' : 'scale(1)' }}>
                {item.value.toLocaleString()}
              </div>
            )}
            <div
              style={{
                width: '100%',
                height: barHeight,
                background: hoveredBar === index ? `${color}40` : `${color}20`,
                border: `2px solid ${color}`,
                borderRadius: '6px 6px 0 0',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                transform: hoveredBar === index ? 'translateY(-4px)' : 'translateY(0)',
              }}
            />
            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
