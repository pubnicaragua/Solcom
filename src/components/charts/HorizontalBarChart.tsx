interface HorizontalBarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  showValues?: boolean;
}

export default function HorizontalBarChart({ data, height = 300, showValues = true }: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
      {data.map((item, idx) => {
        const percentage = (item.value / maxValue) * 100;
        const color = item.color || `hsl(${(idx * 360) / data.length}, 70%, 60%)`;
        
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              minWidth: 120, 
              fontSize: 13, 
              color: 'var(--text)',
              textAlign: 'right',
              fontWeight: 500
            }}>
              {item.label}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 28 }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${percentage}%`,
                background: color,
                borderRadius: 4,
                transition: 'width 0.3s ease'
              }} />
              {showValues && (
                <div style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: percentage > 50 ? 'white' : 'var(--text)',
                  zIndex: 1
                }}>
                  {item.value.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
