'use client';

import React, { useState } from 'react';

interface PieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  showLegend?: boolean;
  innerRadius?: number; // Added innerRadius prop
  unit?: string;
  valueFormatter?: (value: number) => string;
}

export default function PieChart({
  data,
  size = 200,
  showLegend = true,
  innerRadius = 0,
  unit = 'unids',
  valueFormatter
}: PieChartProps) {
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

  function describeArc(x: number, y: number, radius: number, innerR: number, startAngle: number, endAngle: number) {
    const startOuter = polarToCartesian(x, y, radius, endAngle);
    const endOuter = polarToCartesian(x, y, radius, startAngle);
    const startInner = polarToCartesian(x, y, innerR, endAngle);
    const endInner = polarToCartesian(x, y, innerR, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    if (innerR === 0) {
      return [
        'M', startOuter.x, startOuter.y,
        'A', radius, radius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
        'L', x, y,
        'Z'
      ].join(' ');
    }

    return [
      'M', startOuter.x, startOuter.y,
      'A', radius, radius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
      'L', endInner.x, endInner.y,
      'A', innerR, innerR, 0, largeArcFlag, 1, startInner.x, startInner.y,
      'Z'
    ].join(' ');
  }

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 10;
  const actualInnerRadius = innerRadius > 0 ? (size / 2) * (innerRadius / 100) : 0;

  const formatValue = (value: number) => {
    if (valueFormatter) return valueFormatter(value);
    return value.toLocaleString('es-NI');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      >
        {slices.map((slice) => {
          // Calcular posición del texto en el centro del slice (entre innerRadius y radius)
          const midAngle = (slice.startAngle + slice.endAngle) / 2;
          const labelRadius = actualInnerRadius > 0 ? (radius + actualInnerRadius) / 2 : radius * 0.7; // Centro del aro o 70% del radio
          const labelPos = polarToCartesian(centerX, centerY, labelRadius, midAngle);

          return (
            <g
              key={slice.index}
              onMouseEnter={() => setHoveredIndex(slice.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={describeArc(centerX, centerY, radius, actualInnerRadius, slice.startAngle, slice.endAngle)}
                fill={slice.color}
                stroke="var(--card)"
                strokeWidth="2"
                opacity={hoveredIndex === null || hoveredIndex === slice.index ? 1 : 0.6}
                style={{
                  transition: 'opacity 0.2s ease, filter 0.2s ease',
                  filter: hoveredIndex === slice.index ? 'brightness(1.15)' : 'brightness(1)'
                }}
              />
              {/* Mostrar porcentaje solo si es mayor a 5% para evitar sobreposición */}
              {slice.percentage > 5 && (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: slice.percentage > 15 ? '13px' : '11px',
                    fontWeight: 700,
                    fill: 'white',
                    pointerEvents: 'none',
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))'
                  }}
                >
                  {slice.percentage.toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}
        {actualInnerRadius > 0 && (
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: '16px',
              fontWeight: 800,
              fill: 'var(--text)',
              pointerEvents: 'none'
            }}
          >
            {formatValue(total)}
          </text>
        )}
      </svg>

      <div
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: size,
          textAlign: 'center',
          minHeight: 50,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          opacity: hoveredIndex !== null && slices[hoveredIndex] ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
        aria-hidden={hoveredIndex === null}
      >
        {hoveredIndex !== null && slices[hoveredIndex] && (
          <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {slices[hoveredIndex].label} · {formatValue(slices[hoveredIndex].value)}{!valueFormatter ? ` ${unit}` : ''} ({slices[hoveredIndex].percentage.toFixed(1)}%)
          </div>
        )}
      </div>

      {showLegend && slices.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8,
            width: '100%',
            maxHeight: 300,
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
                  {formatValue(slice.value)}{!valueFormatter ? ` ${unit}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
