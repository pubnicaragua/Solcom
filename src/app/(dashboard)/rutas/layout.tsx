'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';

export default function RutasLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const tabs = [
        { id: '/rutas/centro', label: 'Centro de Rutas' },
        { id: '/rutas/monitoreo', label: 'Monitoreo en Vivo' }
    ];

    return (
        <div className="routes-module-shell" style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--page-surface-gradient)',
            minHeight: 'calc(100vh - 80px)', // Adjust based on Topbar height
            margin: '-24px', // Negate the padding from dashboard-main
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--border)'
        }}>
            {/* Header / Tabs Niveles */}
            <div className="routes-module-header" style={{
                background: 'var(--card-surface-gradient)',
                borderBottom: '1px solid var(--border)',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: 60,
            }} data-tour="routes-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, height: '100%' }}>
                    <h1 style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--text)',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10
                    }}>
                        <div className="system-title-mark">
                            <Truck size={20} />
                        </div>
                        Rutas
                    </h1>

                    <nav style={{ display: 'flex', height: '100%', gap: 8 }} data-tour="routes-tabs">
                        {tabs.map(tab => {
                            const active = pathname.includes(tab.id);
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => router.push(tab.id)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: active ? '3px solid var(--brand-primary)' : '3px solid transparent',
                                        color: active ? 'var(--brand-primary)' : 'var(--muted)',
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
                                        if (!active) e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!active) e.currentTarget.style.color = 'var(--muted)';
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px color-mix(in srgb, var(--success) 55%, transparent)' }} />
                    Sistema Activo
                </div>
            </div>

            {/* Content Area */}
            <div className="routes-module-content" style={{ flex: 1, padding: 24, overflowY: 'auto' }} data-tour="routes-content">
                {children}
            </div>
        </div>
    );
}
