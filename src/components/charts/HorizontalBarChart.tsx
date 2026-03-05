interface HorizontalBarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  showValues?: boolean;
  showPercentage?: boolean;
  totalValue?: number;
  valueFormatter?: (value: number) => string;
}

export default function HorizontalBarChart({ data, height = 300, showValues = true, showPercentage = false, totalValue, valueFormatter }: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const total = totalValue || data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0', overflow: 'auto' }}>
      {data.map((item, idx) => {
        const percentage = (item.value / maxValue) * 100;
        const percentageOfTotal = total > 0 ? (item.value / total) * 100 : 0;
        const color = item.color || `hsl(${(idx * 360) / data.length}, 70%, 60%)`;

        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
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
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>{valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString()}</span>
                  {showPercentage && (
                    <span style={{ fontSize: 11, opacity: 0.8 }}>
                      ({percentageOfTotal.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
            {showPercentage && !showValues && (
              <div style={{
                minWidth: 60,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                textAlign: 'right'
              }}>
                {percentageOfTotal.toFixed(1)}%
              </div>
            )}
          </div>
        );
      })}
      {showPercentage && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--muted)',
          textAlign: 'center'
        }}>
          Total: {valueFormatter ? valueFormatter(total) : total.toLocaleString() + ' unidades'}
        </div>
      )}
    </div>
  );
}
