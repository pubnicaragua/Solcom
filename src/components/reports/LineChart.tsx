'use client';

import { useState } from 'react';

interface LineChartProps {
  data: Array<{
    label: string;
    value: number;
  }>;
  height?: number;
  color?: string;
}

export default function LineChart({ data, height = 250, color = 'var(--brand-primary)' }: LineChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue;

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((item.value - minValue) / range) * 80;
    return { x, y, value: item.value, label: item.label };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div style={{ position: 'relative', height, padding: '20px 0' }}>
      {hoveredPoint !== null && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: color,
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {points[hoveredPoint].label}: {points[hoveredPoint].value.toLocaleString()}
        </div>
      )}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.2"
            strokeDasharray="1,1"
          />
        ))}

        {/* Area under line */}
        <path
          d={`${pathData} L 100 100 L 0 100 Z`}
          fill={`${color}15`}
        />

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((point, index) => (
          <g 
            key={index}
            onMouseEnter={() => setHoveredPoint(index)}
            onMouseLeave={() => setHoveredPoint(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredPoint === index ? "2" : "1"}
              fill={color}
              stroke="#fff"
              strokeWidth="0.5"
              style={{ transition: 'all 0.2s' }}
            />
            {hoveredPoint === index && (
              <>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="none"
                  stroke={color}
                  strokeWidth="0.3"
                  opacity="0.5"
                />
              </>
            )}
          </g>
        ))}
      </svg>

      {/* Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        {data.map((item, index) => (
          <div key={index} style={{ textAlign: 'center', flex: 1 }}>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
