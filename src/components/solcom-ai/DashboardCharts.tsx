'use client';

import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface UsageLogRow {
  tokens: number | null;
  cost: number | null;
  created_at: string;
  request_type: string;
}

interface DashboardChartsProps {
  usageLogs: UsageLogRow[];
}

const COLORS = ['#dc2626', '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];

export default function DashboardCharts({ usageLogs }: DashboardChartsProps) {
  // Preparar datos para gráfico de uso por día
  const usageByDay = usageLogs.reduce((acc, log) => {
    const date = new Date(log.created_at).toLocaleDateString('es-NI');
    if (!acc[date]) {
      acc[date] = { date, requests: 0, tokens: 0, cost: 0 };
    }
    acc[date].requests += 1;
    acc[date].tokens += log.tokens || 0;
    acc[date].cost += log.cost || 0;
    return acc;
  }, {} as Record<string, any>);

  const dailyData = Object.values(usageByDay).slice(-7); // Últimos 7 días

  // Preparar datos para gráfico de uso por tipo
  const usageByType = usageLogs.reduce((acc, log) => {
    const type = log.request_type || 'unknown';
    if (!acc[type]) {
      acc[type] = { name: type, value: 0, cost: 0 };
    }
    acc[type].value += 1;
    acc[type].cost += log.cost || 0;
    return acc;
  }, {} as Record<string, any>);

  const typeData = Object.values(usageByType);

  // Preparar datos para gráfico de tokens por hora
  const usageByHour = usageLogs.reduce((acc, log) => {
    const hour = new Date(log.created_at).getHours();
    if (!acc[hour]) {
      acc[hour] = { hour: `${hour}:00`, tokens: 0, requests: 0 };
    }
    acc[hour].tokens += log.tokens || 0;
    acc[hour].requests += 1;
    return acc;
  }, {} as Record<number, any>);

  const hourlyData = Array.from({ length: 24 }, (_, i) => 
    usageByHour[i] || { hour: `${i}:00`, tokens: 0, requests: 0 }
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
      {/* Gráfico de uso diario */}
      <div style={{
        padding: 20,
        background: 'rgba(15,23,42,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>
          Uso Diario (Últimos 7 días)
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: 11 }} />
            <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} />
            <Tooltip 
              contentStyle={{ 
                background: '#1e293b', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f8fafc'
              }} 
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} name="Requests" />
            <Line type="monotone" dataKey="tokens" stroke="#22c55e" strokeWidth={2} name="Tokens" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de uso por tipo */}
      <div style={{
        padding: 20,
        background: 'rgba(15,23,42,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>
          Uso por Tipo de Request
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={typeData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => `${entry.name}: ${entry.value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {typeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                background: '#1e293b', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f8fafc'
              }} 
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de uso por hora */}
      <div style={{
        padding: 20,
        background: 'rgba(15,23,42,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        gridColumn: 'span 2'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>
          Distribución por Hora del Día
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="hour" stroke="#94a3b8" style={{ fontSize: 11 }} />
            <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} />
            <Tooltip 
              contentStyle={{ 
                background: '#1e293b', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#f8fafc'
              }} 
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Bar dataKey="requests" fill="#dc2626" name="Requests" />
            <Bar dataKey="tokens" fill="#f59e0b" name="Tokens" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Métricas adicionales */}
      <div style={{
        padding: 20,
        background: 'rgba(15,23,42,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        gridColumn: 'span 2'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 16 }}>
          Top 5 Tipos de Request por Costo
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {typeData
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 5)
            .map((type, index) => (
              <div
                key={type.name}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 8,
                  textAlign: 'center'
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: COLORS[index],
                  margin: '0 auto 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#fff'
                }}>
                  {index + 1}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                  {type.name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>
                  {type.value} requests
                </div>
                <div style={{ fontSize: 12, color: '#22c55e' }}>
                  ${type.cost.toFixed(4)}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
