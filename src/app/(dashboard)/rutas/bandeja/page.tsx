'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Map, Truck, MoreHorizontal, RefreshCw, AlertCircle, Calendar, MapPin, Package, ArrowUpRight, ChevronDown, CheckSquare, Settings2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Select from '@/components/ui/Select';

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
            case 'pending': return { bg: 'var(--surface-hover)', color: 'var(--muted)', border: 'var(--border)', text: 'Pte. Despacho' };
            case 'batched': return { bg: 'var(--info-surface)', color: 'var(--info)', border: 'color-mix(in srgb, var(--info) 34%, var(--border))', text: 'Agrupado' };
            case 'routed': return { bg: 'var(--violet-surface)', color: 'var(--kpi-violet)', border: 'color-mix(in srgb, var(--kpi-violet) 34%, var(--border))', text: 'En Ruta' };
            default: return { bg: 'var(--surface-hover)', color: 'var(--muted)', border: 'var(--border)', text: status };
        }
    };

    const getPriorityStyle = (priority: string) => {
        switch (priority) {
            case 'urgent': return { color: 'var(--danger)' };
            case 'high': return { color: 'var(--warning)' };
            case 'normal': return { color: 'var(--info)' };
            default: return { color: 'var(--muted)' };
        }
    };

    return (
        <div style={{ overflow: 'hidden', maxWidth: '100%', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 10px 30px var(--shadow)' }}>

            {/* Toolbar Premium (Estilo Inventario Pivot) */}
            <div style={{
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                borderBottom: '1px solid var(--border)',
                background: 'var(--card-surface-gradient)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--info)',
                        boxShadow: '0 0 10px color-mix(in srgb, var(--info) 55%, transparent)',
                    }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        Bandeja de Pedidos
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        padding: '2px 8px',
                        background: 'var(--surface-hover)',
                        borderRadius: 6,
                        fontWeight: 600
                    }}>
                        {filteredJobs.length} órdenes pendientes
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar orden o destino..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '6px 12px 6px 30px',
                                background: 'var(--panel-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                color: 'var(--text)',
                                fontSize: 12,
                                width: 220,
                                outline: 'none'
                            }}
                        />
                    </div>

                    <Select
                        aria-label="Filtrar pedidos por estado"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ width: 190, fontSize: 12 }}
                        options={[
                            { value: '', label: 'Cualquier Estado' },
                            { value: 'pending', label: 'Pte. Despacho' },
                            { value: 'batched', label: 'Agrupadas' },
                            { value: 'routed', label: 'En Ruta' },
                        ]}
                    />

                    <button
                        onClick={fetchJobs}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 14px',
                            background: 'var(--surface-hover)',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
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
                            background: 'var(--info-surface)',
                            color: 'var(--info)',
                            border: '1px solid color-mix(in srgb, var(--info) 34%, var(--border))',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            transition: 'all 0.2s',
                            boxShadow: '0 3px 10px var(--shadow)',
                        }}
                    >
                        <Map size={14} />
                        Planificador
                    </button>
                </div>
            </div>

            {/* Data Table Area (Fondo estilo pivot) */}
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--background)' }}>
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
                                    background: 'var(--background)',
                                    padding: '12px 16px',
                                    color: 'var(--muted)',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    borderBottom: '1px solid var(--border)',
                                    borderRight: '1px solid var(--border)',
                                    width: col.width
                                }}>
                                    {col.id === 'chk' ? <div style={{ width: 14, height: 14, border: '1px solid var(--border)', borderRadius: 4 }}></div> : col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && jobs.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
                                    <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-blue-500" />
                                    <div style={{ fontSize: 13 }}>Cargando datos de ruteo...</div>
                                </td>
                            </tr>
                        ) : filteredJobs.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 80, textAlign: 'center' }}>
                                    <Package size={32} style={{ opacity: 0.2, color: 'var(--text)', margin: '0 auto 12px' }} />
                                    <div style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 500 }}>No hay entregas pendientes</div>
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
                                            background: 'var(--surface-hover)',
                                            color: 'var(--text)',
                                            border: '1px solid var(--border)',
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
                                        background: 'var(--background)',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'var(--background)'}>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ width: 14, height: 14, border: '1px solid var(--border)', borderRadius: 4 }}></div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {job.sales_order_id?.substring(0, 10) || 'SO-N/A'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{new Date(job.created_at).toLocaleDateString()}</div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                                                {job.customer_name || 'Cliente sin nombre'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MapPin size={10} /> {job.address_text || 'Dirección pendiente'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, color: 'var(--muted)',
                                                padding: '4px 8px', background: 'var(--surface-hover)',
                                                borderRadius: 6, border: '1px solid var(--border)'
                                            }}>
                                                {job.zone_id || 'SIN ZONA'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: prio.color }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: prio.color }}></div>
                                                {(job.priority || 'normal').toUpperCase()}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {job.weight ? `${job.weight} KG` : '--'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, color: st.color,
                                                background: st.bg, border: `1px solid ${st.border}`,
                                                padding: '4px 8px', borderRadius: 6
                                            }}>
                                                {st.text}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                                            <button style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
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
                background: 'var(--background)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                color: 'var(--muted)'
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
