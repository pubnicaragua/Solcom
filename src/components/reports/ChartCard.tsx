'use client';

import Card from '@/components/ui/Card';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function ChartCard({ title, children, actions }: ChartCardProps) {
  return (
    <Card>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
          {actions}
        </div>
        {children}
      </div>
    </Card>
  );
}
