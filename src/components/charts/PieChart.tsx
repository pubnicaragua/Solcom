'use client';

import React, { useState } from 'react';

interface PieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  showLegend?: boolean;
}

export default function PieChart({ data, size = 200, showLegend = true }: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: size }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Sin datos</div>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: size }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Sin datos</div>
      </div>
    );
  }

  let currentAngle = -90;
  const slices = data.map((item, idx) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    return {
      ...item,
      percentage,
      startAngle,
      endAngle: currentAngle,
      index: idx
    };
  });

  function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  }

  function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      'L', x, y,
      'Z'
    ].join(' ');
  }

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      >
        {slices.map((slice) => (
          <g
            key={slice.index}
            onMouseEnter={() => setHoveredIndex(slice.index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: 'pointer' }}
          >
            <path
              d={describeArc(centerX, centerY, radius, slice.startAngle, slice.endAngle)}
              fill={slice.color}
              stroke="var(--card)"
              strokeWidth="2"
              opacity={hoveredIndex === null || hoveredIndex === slice.index ? 1 : 0.6}
              style={{
                transition: 'opacity 0.2s ease, filter 0.2s ease',
                filter: hoveredIndex === slice.index ? 'brightness(1.15)' : 'brightness(1)'
              }}
            />
            {hoveredIndex === slice.index && (
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fill: 'var(--text)',
                  pointerEvents: 'none'
                }}
              >
                {slice.percentage.toFixed(1)}%
              </text>
            )}
          </g>
        ))}
      </svg>

      {showLegend && slices.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: slices.length > 6 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
            gap: 8,
            width: '100%',
            maxHeight: 250,
            overflowY: 'auto'
          }}
        >
          {slices.map((slice) => (
            <div
              key={slice.index}
              onMouseEnter={() => setHoveredIndex(slice.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                minWidth: 0,
                padding: 4,
                borderRadius: 4,
                background: hoveredIndex === slice.index ? 'var(--panel)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.2s ease'
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: slice.color,
                  flexShrink: 0,
                  marginTop: 2,
                  opacity: hoveredIndex === null || hoveredIndex === slice.index ? 1 : 0.6,
                  transition: 'opacity 0.2s ease'
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text)', flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {slice.label}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 10 }}>
                  {slice.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
