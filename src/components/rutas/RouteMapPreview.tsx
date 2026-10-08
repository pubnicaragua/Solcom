'use client';

export interface RouteMapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  type?: 'vehicle' | 'start' | 'stop' | 'end';
  status?: string;
}

interface RouteMapPreviewProps {
  points: RouteMapPoint[];
  emptyTitle: string;
  emptyDescription: string;
  height?: number;
}

const getPointColor = (point: RouteMapPoint, index: number, total: number) => {
  if (point.type === 'vehicle') return '#38bdf8';
  if (point.status === 'completed') return '#10b981';
  if (point.status === 'arrived') return '#f97316';
  if (point.type === 'start' || index === 0) return '#8b5cf6';
  if (point.type === 'end' || index === total - 1) return '#ef4444';
  return '#facc15';
};

export default function RouteMapPreview({
  points,
  emptyTitle,
  emptyDescription,
  height = 320,
}: RouteMapPreviewProps) {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  );

  if (validPoints.length === 0) {
    return (
      <div
        style={{
          minHeight: height,
          borderRadius: 16,
          border: '1px dashed var(--border)',
          background: 'linear-gradient(180deg, var(--panel-2) 0%, var(--panel) 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 24,
          gap: 8,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>{emptyTitle}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480, lineHeight: 1.6 }}>
          {emptyDescription}
        </div>
      </div>
    );
  }

  const lats = validPoints.map((point) => point.lat);
  const lngs = validPoints.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;
  const width = 640;
  const padding = 40;

  const projectedPoints = validPoints.map((point) => {
    const x = padding + ((point.lng - minLng) / lngRange) * (width - padding * 2);
    const y = padding + (1 - (point.lat - minLat) / latRange) * (height - padding * 2);
    return { ...point, x, y };
  });

  const polylinePoints = projectedPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.8fr)', gap: 16 }}>
      <div
        style={{
          minHeight: height,
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.98) 100%)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="routePreviewLine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={`h-${ratio}`}
              x1={0}
              y1={height * ratio}
              x2={width}
              y2={height * ratio}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="6 6"
            />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={`v-${ratio}`}
              x1={width * ratio}
              y1={0}
              x2={width * ratio}
              y2={height}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="6 6"
            />
          ))}
          {projectedPoints.length > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="url(#routePreviewLine)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
          )}
          {projectedPoints.map((point, index) => {
            const color = getPointColor(point, index, projectedPoints.length);
            return (
              <g key={point.id}>
                <circle cx={point.x} cy={point.y} r="11" fill={color} opacity="0.18" />
                <circle cx={point.x} cy={point.y} r="6" fill={color} />
                <text
                  x={point.x}
                  y={point.y - 14}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="11"
                  fontWeight="700"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ display: 'grid', gap: 8, alignContent: 'start', maxHeight: height, overflowY: 'auto' }}>
        {projectedPoints.map((point, index) => {
          const color = getPointColor(point, index, projectedPoints.length);
          return (
            <div
              key={point.id}
              style={{
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface-hover)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: color,
                  color: '#020617',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {point.label}
                </div>
                {point.subtitle && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    {point.subtitle}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
