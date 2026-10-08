'use client';

import { Activity, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import RouteKpiCard from '@/components/rutas/RouteKpiCard';

export default function RendimientoPage() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header del tablero */}
            <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px 0' }}>
                    Histórico de Operaciones
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                    Métricas clave, eficiencia de flota y rendimiento de entregas en los últimos 30 días.
                </p>
            </div>

            {/* Fila 1: KPIs Principales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
                <RouteKpiCard icon={TrendingUp} label="Entregas a Tiempo (OTD)" value="94.2%" tone="success" footer="+2.1% vs mes pasado" footerTone="success" />
                <RouteKpiCard icon={TrendingDown} label="Entregas Fallidas" value="2.8%" tone="info" footer="-1.4% vs mes pasado" footerTone="success" />
                <RouteKpiCard icon={Clock} label="Tiempo Promedio Servicio" value="12m" tone="warning" footer="Ligeramente alto en Managua Norte" footerTone="warning" />
                <RouteKpiCard icon={Activity} label="Desviación de Ruta" value="4.1%" tone="violet" footer="Extra KM recorridos (Promedio)" footerTone="neutral" />
            </div>

            {/* Fila 2: Paneles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16 }}>

                {/* Panel Izquierdo: Gráfico de Barras */}
                <div style={{
                    background: 'var(--card-surface-gradient)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={16} color="#38bdf8" />
                            Entregas por Día
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Últimos 7 días ▾</span>
                    </div>

                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, paddingBottom: 10, position: 'relative' }}>
                        {/* Lineas guías de fondo */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, borderBottom: '1px dashed var(--border)', height: '25%' }} />
                        <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, borderBottom: '1px dashed var(--border)', height: '25%' }} />
                        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderBottom: '1px dashed var(--border)', height: '25%' }} />

                        {/* Barras */}
                        {[
                            { day: 'Lunes', value: 45 },
                            { day: 'Martes', value: 62 },
                            { day: 'Miércoles', value: 50 },
                            { day: 'Jueves', value: 85 },
                            { day: 'Viernes', value: 72 },
                            { day: 'Sábado', value: 35 },
                            { day: 'Domingo', value: 70 },
                        ].map((item, i) => (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 8, zIndex: 1 }}>
                                <div style={{
                                    width: '100%',
                                    maxWidth: 40,
                                    height: `${item.value}%`,
                                    background: 'linear-gradient(180deg, #ef4444 0%, rgba(239, 68, 68, 0.5) 100%)',
                                    borderRadius: '4px 4px 0 0',
                                    transition: 'height 0.3s ease'
                                }} />
                                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{item.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel Derecho: Top Conductores */}
                <div style={{
                    background: 'var(--card-surface-gradient)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 24
                }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                        <TrendingUp size={16} color="#38bdf8" />
                        Conductores Destacados (Eficiencia)
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Conductor 1 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-hover)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                    JP
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Juan Perez</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>M1234 • Zona Sur</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>98.5</div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Puntos</div>
                            </div>
                        </div>

                        {/* Conductor 2 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-hover)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                    CR
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Carlos Ruiz</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>M4321 • Zona Norte</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>92.1</div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Puntos</div>
                            </div>
                        </div>

                        {/* Conductor 3 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-hover)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                    PM
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pedro Martinez</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>M8877 • Masaya</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>84.0</div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>Puntos</div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
