'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';

export default function RutasLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const tabs = [
        { id: '/rutas/bandeja', label: 'Bandeja de Pedidos' },
        { id: '/rutas/planificador', label: 'Planificador Inteligente' },
        { id: '/rutas/monitoreo', label: 'Monitoreo en Vivo' },
        { id: '/rutas/rendimiento', label: 'Rendimiento (KPIs)' }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#080f1d', // Force dark background here to override ERP gray
            minHeight: 'calc(100vh - 80px)', // Adjust based on Topbar height
            margin: '-24px', // Negate the padding from dashboard-main
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.05)'
        }}>
            {/* Header / Tabs Niveles */}
            <div style={{
                background: '#0f172a',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 60,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, height: '100%' }}>
                    <h1 style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#f8fafc',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10
                    }}>
                        <div style={{ padding: 6, background: 'rgba(56,189,248,0.1)', borderRadius: 8 }}>
                            <Truck size={18} color="#38bdf8" />
                        </div>
                        Operaciones
                    </h1>

                    <nav style={{ display: 'flex', height: '100%', gap: 8 }}>
                        {tabs.map(tab => {
                            const active = pathname.includes(tab.id);
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => router.push(tab.id)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: active ? '3px solid #38bdf8' : '3px solid transparent',
                                        color: active ? '#f8fafc' : '#64748b',
                                        fontWeight: active ? 700 : 600,
                                        fontSize: 13,
                                        padding: '0 16px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!active) e.currentTarget.style.color = '#cbd5e1';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!active) e.currentTarget.style.color = '#64748b';
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px rgba(34,197,94,0.6)' }} />
                    Sistema Activo
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                {children}
            </div>
        </div>
    );
}
