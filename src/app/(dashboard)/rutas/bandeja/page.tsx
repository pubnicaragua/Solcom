'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Map, Truck, MoreHorizontal, RefreshCw, AlertCircle, Calendar, MapPin, Package, ArrowUpRight, ChevronDown, CheckSquare, Settings2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function RutasInboxPage() {
    const router = useRouter();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [zoneFilter, setZoneFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending');

    useEffect(() => {
        fetchJobs();
    }, [statusFilter, zoneFilter]);

    async function fetchJobs() {
        setLoading(true);
        try {
            let query = (supabase as any)
                .from('delivery_jobs')
                .select('*')
                .order('created_at', { ascending: false });

            if (statusFilter) {
                query = query.eq('status', statusFilter);
            }
            if (zoneFilter) {
                query = query.eq('zone_id', zoneFilter);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Error fetching jobs:", error);
                setJobs([]);
            } else {
                setJobs(data || []);
            }
        } catch (err) {
            console.error("Unexpected error:", err);
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }

    const filteredJobs = jobs.filter(job =>
        (job.address_text?.toLowerCase().includes(searchTerm.toLowerCase()) || '') ||
        (job.sales_order_id?.toLowerCase().includes(searchTerm.toLowerCase()) || '') ||
        (job.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || '')
    );

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'pending': return { bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)', text: 'Pte. Despacho' };
            case 'batched': return { bg: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: 'rgba(56,189,248,0.3)', text: 'Agrupado' };
            case 'routed': return { bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: 'rgba(168,85,247,0.3)', text: 'En Ruta' };
            default: return { bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)', text: status };
        }
    };

    const getPriorityStyle = (priority: string) => {
        switch (priority) {
            case 'urgent': return { color: '#ef4444' };
            case 'high': return { color: '#f59e0b' };
            case 'normal': return { color: '#3b82f6' };
            default: return { color: '#94a3b8' };
        }
    };

    return (
        <div style={{ overflow: 'hidden', maxWidth: '100%', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', background: '#080f1d', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>

            {/* Toolbar Premium (Estilo Inventario Pivot) */}
            <div style={{
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(135deg, rgba(15,27,45,0.8) 0%, rgba(17,31,54,0.6) 100%)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#38bdf8',
                        boxShadow: '0 0 10px rgba(56,189,248,0.5)',
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        Bandeja de Pedidos
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: '#64748b',
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 6,
                        fontWeight: 600
                    }}>
                        {filteredJobs.length} órdenes pendientes
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="text"
                            placeholder="Buscar orden o destino..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '6px 12px 6px 30px',
                                background: 'rgba(15,23,42,0.6)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8,
                                color: '#e2e8f0',
                                fontSize: 12,
                                width: 220,
                                outline: 'none'
                            }}
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '6px 30px 6px 12px',
                            background: 'rgba(15,23,42,0.6)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            color: '#e2e8f0',
                            fontSize: 12,
                            outline: 'none',
                            appearance: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">Cualquier Estado</option>
                        <option value="pending">Pte. Despacho</option>
                        <option value="batched">Agrupadas</option>
                        <option value="routed">En Ruta</option>
                    </select>

                    <button
                        onClick={fetchJobs}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 14px',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#e2e8f0',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            transition: 'all 0.2s',
                        }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={() => router.push('/rutas/planificador')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 16px',
                            background: 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(14,165,233,0.15) 100%)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56,189,248,0.3)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            transition: 'all 0.2s',
                            boxShadow: '0 0 15px rgba(56,189,248,0.1)',
                        }}
                    >
                        <Map size={14} />
                        Planificador
                    </button>
                </div>
            </div>

            {/* Data Table Area (Fondo estilo pivot) */}
            <div style={{ flex: 1, overflow: 'auto', background: '#0a1122' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    textAlign: 'left'
                }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            {[
                                { id: 'chk', label: '', width: 40 },
                                { id: 'orden', label: 'REF. ORDEN', width: 140 },
                                { id: 'cliente', label: 'CLIENTE Y DESTINO', width: 300 },
                                { id: 'zona', label: 'ZONA LÓG.', width: 150 },
                                { id: 'prio', label: 'PRIORIDAD', width: 120 },
                                { id: 'peso', label: 'VOLUMEN', width: 120 },
                                { id: 'estado', label: 'ESTADO', width: 140 },
                                { id: 'acc', label: '', width: 60 }
                            ].map(col => (
                                <th key={col.id} style={{
                                    background: '#0c162c',
                                    padding: '12px 16px',
                                    color: '#64748b',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    borderRight: '1px solid rgba(255,255,255,0.03)',
                                    width: col.width
                                }}>
                                    {col.id === 'chk' ? <div style={{ width: 14, height: 14, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4 }}></div> : col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && jobs.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
                                    <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-blue-500" />
                                    <div style={{ fontSize: 13 }}>Cargando datos de ruteo...</div>
                                </td>
                            </tr>
                        ) : filteredJobs.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 80, textAlign: 'center' }}>
                                    <Package size={32} style={{ opacity: 0.2, color: '#e2e8f0', margin: '0 auto 12px' }} />
                                    <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500 }}>No hay entregas pendientes</div>
                                    <button
                                        onClick={async () => {
                                            setLoading(true);
                                            const clientes = [
                                                { nombre: 'Ferretería Bendaña', telefono: '2222-1001' },
                                                { nombre: 'Claro Oficinas Centrales', telefono: '2222-1002' },
                                                { nombre: 'Supermercado La Colonia', telefono: '2222-1003' }
                                            ];
                                            const direcciones = [
                                                'Ferretería Bendaña - Mercado Oriental',
                                                'Oficinas Centrales Claro, Carretera Masaya',
                                                'Supermercado La Colonia, Linda Vista'
                                            ];
                                            const zonas = ['Managua Sur', 'Managua Norte', 'Masaya', 'León'];
                                            const prioridades = ['normal', 'high', 'urgent', 'low'];
                                            const cliente = clientes[Math.floor(Math.random() * clientes.length)];
                                            const { error } = await (supabase as any).from('delivery_jobs').insert({
                                                sales_order_id: `SO-${Date.now()}`,
                                                customer_name: cliente.nombre,
                                                customer_phone: cliente.telefono,
                                                address_text: direcciones[Math.floor(Math.random() * direcciones.length)],
                                                lat: 12.1364, lng: -86.2515,
                                                zone_id: zonas[Math.floor(Math.random() * zonas.length)],
                                                priority: prioridades[Math.floor(Math.random() * prioridades.length)],
                                                status: 'pending',
                                                weight: Math.floor(Math.random() * 500) + 10
                                            } as any);

                                            if (error) {
                                                console.error(error);
                                                alert("Error de BD: " + error.message);
                                            }

                                            fetchJobs();
                                        }}
                                        style={{
                                            marginTop: 16,
                                            padding: '8px 16px',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#e2e8f0',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            fontSize: 12,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Generar Orden de Prueba
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            filteredJobs.map((job) => {
                                const st = getStatusStyle(job.status || 'pending');
                                const prio = getPriorityStyle(job.priority || 'normal');

                                return (
                                    <tr key={job.id} style={{
                                        background: '#0f172a',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }} onMouseEnter={(e) => e.currentTarget.style.background = '#1e293b'} onMouseLeave={(e) => e.currentTarget.style.background = '#0f172a'}>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ width: 14, height: 14, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4 }}></div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {job.sales_order_id?.substring(0, 10) || 'SO-N/A'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{new Date(job.created_at).toLocaleDateString()}</div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                                                {job.customer_name || 'Cliente sin nombre'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={10} /> {job.address_text || 'Dirección pendiente'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, color: '#94a3b8',
                                                padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                {job.zone_id || 'SIN ZONA'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: prio.color }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: prio.color }}></div>
                                                {(job.priority || 'normal').toUpperCase()}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                                                {job.weight ? `${job.weight} KG` : '--'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, color: st.color,
                                                background: st.bg, border: `1px solid ${st.border}`,
                                                padding: '4px 8px', borderRadius: 6
                                            }}>
                                                {st.text}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <button style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                                                <MoreHorizontal size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div style={{
                padding: '10px 16px',
                background: '#080f1d',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                color: '#64748b'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
                    Conexión a Base de Datos en Tiempo Real
                </div>
                <div>Algoritmo de Ruteo y Despacho</div>
            </div>
        </div>
    );
}
