import { AlertCircle } from 'lucide-react';
import Card from '@/components/ui/Card';

interface ReportPlaceholderProps {
  title: string;
  reason?: string;
  height?: number;
}

export default function ReportPlaceholder({ title, reason, height = 300 }: ReportPlaceholderProps) {
  return (
    <Card>
      <div style={{
        height: height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center'
      }}>
        <AlertCircle size={48} color="var(--muted)" style={{ marginBottom: 16, opacity: 0.5 }} />
        <h3 style={{ 
          fontSize: 16, 
          fontWeight: 600, 
          color: 'var(--text)', 
          marginBottom: 8 
        }}>
          {title}
        </h3>
        <p style={{ 
          fontSize: 14, 
          color: 'var(--muted)', 
          marginBottom: 4,
          fontWeight: 500
        }}>
          Reporte en Desarrollo
        </p>
        {reason && (
          <p style={{ 
            fontSize: 13, 
            color: 'var(--muted)', 
            marginTop: 8,
            opacity: 0.7
          }}>
            {reason}
          </p>
        )}
      </div>
    </Card>
  );
}
