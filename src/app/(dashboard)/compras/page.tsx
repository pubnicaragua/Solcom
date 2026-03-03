'use client';

import { useState, useMemo, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import {
    ShoppingCart, Server, Link as LinkIcon, FileText, CheckCircle2,
    Calculator, Activity, Plus, Trash2, Layout, Lock, Sparkles,
    Settings2, ChevronDown, ChevronUp, Database
} from 'lucide-react';

const SECURE_HASH = '33fa1b511447a982a4e7827bc6ab6a8d41173da2c039b394836e9385c501a93d';

interface OperacionCRUD {
    id: string;
    nombre: string;
    activa: boolean;
    tipo: 'endpoint' | 'vista_extra' | 'export';
}

interface VistaUI {
    id: number;
    nombre: string;
    operaciones: OperacionCRUD[];
    expandida: boolean;
}

// Generador "IA" simulado basado en palabras clave
const generarOperacionesRecomendadas = (nombre: string): OperacionCRUD[] => {
    const txt = nombre.toLowerCase();
    const ops: OperacionCRUD[] = [];

    // Por defecto, toda vista tiene al menos un "Read" (GET)
    ops.push({ id: 'leer', nombre: 'Leer / Listar (GET)', activa: true, tipo: 'endpoint' });

    if (txt.includes('gestion') || txt.includes('gestión') || txt.includes('catalogo') || txt.includes('proveedor') || txt.includes('orden')) {
        ops.push({ id: 'crear', nombre: 'Crear Nuevo (POST)', activa: true, tipo: 'endpoint' });
        ops.push({ id: 'editar', nombre: 'Actualizar (PUT/PATCH)', activa: true, tipo: 'endpoint' });
        ops.push({ id: 'eliminar', nombre: 'Eliminar / Archivar (DELETE)', activa: true, tipo: 'endpoint' });
        ops.push({ id: 'exportar', nombre: 'Exportar a Excel/PDF', activa: false, tipo: 'export' });
        ops.push({ id: 'importar', nombre: 'Importar Masivo', activa: false, tipo: 'endpoint' });
    } else if (txt.includes('historial') || txt.includes('reporte') || txt.includes('dashboard') || txt.includes('kpi')) {
        ops.push({ id: 'exportar', nombre: 'Exportar a Excel/PDF', activa: true, tipo: 'export' });
        ops.push({ id: 'filtro_avanzado', nombre: 'Filtros Avanzados (Query)', activa: true, tipo: 'endpoint' });
    } else {
        // Genérico
        ops.push({ id: 'crear', nombre: 'Crear (POST)', activa: false, tipo: 'endpoint' });
        ops.push({ id: 'editar', nombre: 'Actualizar (PUT)', activa: false, tipo: 'endpoint' });
        ops.push({ id: 'eliminar', nombre: 'Eliminar (DELETE)', activa: false, tipo: 'endpoint' });
    }

    return ops;
};

export default function ComprasPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (hashHex === SECURE_HASH) {
                setIsAuthenticated(true);
                setAuthError('');
            } else {
                setAuthError('Credenciales incorrectas');
            }
        } catch (err) {
            console.error(err);
            setAuthError('Error de validación segura');
        }
    };

    if (!isAuthenticated) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <Card>
                    <div style={{ padding: '32px 40px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <Lock size={28} color="#3b82f6" />
                        </div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)' }}>
                            Acceso Maestro
                        </h1>
                        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px 0' }}>
                            Entorno de cotización algorítmica y arquitectura estructural.
                        </p>
                        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="********"
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: '#0a0a0a',
                                        color: '#fff',
                                        outline: 'none',
                                        fontSize: 16,
                                        letterSpacing: 4,
                                        textAlign: 'center',
                                        transition: 'border-color 0.2s'
                                    }}
                                    autoFocus
                                />
                                {authError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{authError}</div>}
                            </div>
                            <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>
                                Autorizar Acceso
                            </Button>
                        </form>
                    </div>
                </Card>
            </div>
        );
    }

    return <ComprasToolbox />;
}

// ---------------------------------------------------
// TOOLBOX CONTENT
// ---------------------------------------------------

function ComprasToolbox() {
    const precios = {
        planificacion: 400,
        qa: 700,
        endpoint: 250,
        vista: 250,
        exportacion: 150,
        conexionBloque: 300 // Por cada 5
    };

    const [vistas, setVistas] = useState<VistaUI[]>([
        {
            id: 1,
            nombre: 'Gestión de Proveedores',
            operaciones: generarOperacionesRecomendadas('Gestión de Proveedores'),
            expandida: true
        }
    ]);
    const [nuevaVista, setNuevaVista] = useState('');

    const [conexionesExtra, setConexionesExtra] = useState(10);
    const [iteraciones, setIteraciones] = useState(1);

    const calculos = useMemo(() => {
        let totalEndpoints = 0;
        let totalExportaciones = 0;

        vistas.forEach(v => {
            v.operaciones.forEach(op => {
                if (op.activa) {
                    if (op.tipo === 'endpoint') totalEndpoints++;
                    if (op.tipo === 'export') totalExportaciones++;
                }
            });
        });

        const costEndpoints = totalEndpoints * precios.endpoint;
        const costVistas = vistas.length * precios.vista;
        const costExportaciones = totalExportaciones * precios.exportacion;
        const bloquesConexiones = Math.ceil(conexionesExtra / 5);
        const costConexiones = bloquesConexiones * precios.conexionBloque;

        const baseCost = (precios.planificacion + precios.qa) * iteraciones;
        const devCost = (costEndpoints + costVistas + costExportaciones + costConexiones) * iteraciones;
        const subtotal = baseCost + devCost;

        // Bono de descuento 20%
        const descuentoOculto = subtotal * 0.20;
        const total = subtotal - descuentoOculto;

        return {
            endpoints: totalEndpoints,
            exportaciones: totalExportaciones,
            costEndpoints,
            costExportaciones,
            costVistas,
            costConexiones,
            subtotal,
            descuento: descuentoOculto,
            total
        };
    }, [vistas, conexionesExtra, iteraciones]);

    const handleAddVista = (e: React.FormEvent) => {
        e.preventDefault();
        if (!nuevaVista.trim()) return;

        const newVista: VistaUI = {
            id: Date.now(),
            nombre: nuevaVista.trim(),
            operaciones: generarOperacionesRecomendadas(nuevaVista.trim()),
            expandida: true
        };

        setVistas(prev => [newVista, ...prev]);
        setNuevaVista('');
    };

    const removeVista = (id: number) => {
        setVistas(prev => prev.filter(v => v.id !== id));
    };

    const toggleExpand = (id: number) => {
        setVistas(prev => prev.map(v => v.id === id ? { ...v, expandida: !v.expandida } : v));
    };

    const toggleOperacion = (vistaId: number, opId: string) => {
        setVistas(prev => prev.map(v => {
            if (v.id === vistaId) {
                return {
                    ...v,
                    operaciones: v.operaciones.map(op =>
                        op.id === opId ? { ...op, activa: !op.activa } : op
                    )
                };
            }
            return v;
        }));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Sparkles size={26} color="#8b5cf6" />
                        AI Architect: Módulo de Compras
                    </h1>
                    <p style={{ margin: '8px 0 0 0', color: 'var(--muted)', fontSize: 13, maxWidth: 650, lineHeight: 1.5 }}>
                        Agregue las vistas deseadas. El algoritmo analizará la sintaxis de su solicitud y preconfigurará los flujos de datos y Endpoints (CRUD) pertinentes que el cliente podría necesitar.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Badge variant="success" size="sm">Sistema Encriptado Activo</Badge>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>

                {/* Panel Izquierdo: Constructor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Card>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.15) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Layout size={20} color="#3b82f6" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700, color: 'var(--text)' }}>Vistas UI & Requerimientos</h2>
                                    <p style={{ fontSize: 12, margin: 0, color: 'var(--muted)' }}>Proyección algorítmica de funcionalidades</p>
                                </div>
                            </div>

                            <form onSubmit={handleAddVista} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                                <div style={{ flex: 1 }}>
                                    <Input
                                        placeholder="Ingrese una nueva vista... Ej. Ordenes de Ingreso"
                                        value={nuevaVista}
                                        onChange={(e) => setNuevaVista(e.target.value)}
                                        style={{ fontSize: 14 }}
                                    />
                                </div>
                                <Button variant="primary" type="submit" style={{ padding: '0 20px' }}>
                                    <Sparkles size={16} style={{ marginRight: 8 }} />
                                    Generar
                                </Button>
                            </form>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {vistas.map((vista) => {
                                    const endpointsActivos = vista.operaciones.filter(o => o.activa).length;

                                    return (
                                        <div key={vista.id} style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: 12,
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            {/* Cabecera de la Vista */}
                                            <div
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '14px 16px', background: 'rgba(0,0,0,0.2)', cursor: 'pointer'
                                                }}
                                                onClick={() => toggleExpand(vista.id)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    {vista.expandida ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{vista.nombre}</span>
                                                    <Badge variant="neutral" size="sm">{endpointsActivos} Funciones</Badge>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeVista(vista.id); }}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            {/* Opciones CRUD Generadas */}
                                            {vista.expandida && (
                                                <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Settings2 size={14} /> Recomendaciones Funcionales (CRUD)
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                                                        {vista.operaciones.map(op => (
                                                            <label key={op.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 10,
                                                                padding: '10px 12px', borderRadius: 8,
                                                                background: op.activa ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                                                                border: `1px solid ${op.activa ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                                                cursor: 'pointer', transition: 'all 0.2s', width: '100%'
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={op.activa}
                                                                    onChange={() => toggleOperacion(vista.id, op.id)}
                                                                    style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
                                                                />
                                                                <span style={{ fontSize: 13, color: op.activa ? '#e2e8f0' : '#94a3b8', userSelect: 'none' }}>
                                                                    {op.nombre}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {vistas.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontSize: 13, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
                                        <Layout size={32} opacity={0.5} style={{ margin: '0 auto 12px' }} />
                                        La arquitectura está vacía. Genera la primera vista.
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Activity size={20} color="#eab308" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700, color: 'var(--text)' }}>Parámetros de Fases</h2>
                                    <p style={{ fontSize: 12, margin: 0, color: 'var(--muted)' }}>Lógica de Sprints y Esfuerzo</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 16 }}>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                                        Conexiones Auxiliares
                                    </label>
                                    <Input
                                        type="number"
                                        value={conexionesExtra}
                                        onChange={e => setConexionesExtra(parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                                        Sprints (Iteraciones)
                                    </label>
                                    <Input
                                        type="number"
                                        value={iteraciones}
                                        min={1}
                                        onChange={e => setIteraciones(parseInt(e.target.value) || 1)}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Panel Derecho: Costos y Métricas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <Card>
                        <div style={{ padding: '24px', background: 'linear-gradient(145deg, rgba(8,15,29,0.95) 0%, rgba(15,23,42,0.95) 100%)', borderRadius: 'inherit' }}>
                            <h2 style={{ fontSize: 18, margin: '0 0 20px 0', fontWeight: 800, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Calculator size={20} color="#10b981" /> Presupuesto Estructural
                            </h2>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                    <span style={{ color: '#94a3b8' }}>Planificación Táctica & QA</span>
                                    <span style={{ fontWeight: 500 }}>C$ {(precios.planificacion + precios.qa) * iteraciones}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                    <span style={{ color: '#94a3b8' }}>Interfaces UI ({vistas.length} Vistas)</span>
                                    <span style={{ fontWeight: 500 }}>C$ {calculos.costVistas * iteraciones}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                                        <Database size={14} color="#a78bfa" /> APIs & CRUD ({calculos.endpoints} Endpoints)
                                    </span>
                                    <span style={{ fontWeight: 500 }}>C$ {calculos.costEndpoints * iteraciones}</span>
                                </div>
                                {calculos.exportaciones > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                        <span style={{ color: '#94a3b8' }}>Módulos de PDF/Excel ({calculos.exportaciones})</span>
                                        <span style={{ fontWeight: 500 }}>C$ {calculos.costExportaciones * iteraciones}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                                    <span style={{ color: '#94a3b8' }}>Micro-Conexiones Interfaz</span>
                                    <span style={{ fontWeight: 500 }}>C$ {calculos.costConexiones * iteraciones}</span>
                                </div>

                                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                                    <span>Subtotal Analítico</span>
                                    <span>C$ {calculos.subtotal.toLocaleString('es-NI')}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#10b981', padding: '12px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px dashed rgba(16,185,129,0.3)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Sparkles size={16} /> Subvención de Ecosistema ERP
                                    </span>
                                    <span>- C$ {calculos.descuento.toLocaleString('es-NI')}</span>
                                </div>

                                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
                                    <div>
                                        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Inversión Estimada</span>
                                    </div>
                                    <div style={{ fontSize: 32, fontWeight: 900, color: 'white', textShadow: '0 2px 10px rgba(16,185,129,0.3)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                        C$ {calculos.total.toLocaleString('es-NI')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: 15, margin: '0 0 16px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: '#e2e8f0' }}>
                                <FileText size={18} color="#3b82f6" /> Entregables del Paquete
                            </h3>

                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {[
                                    `Diseño e integración de ${vistas.length} vistas Responsivas`,
                                    `Desarrollo CRUD de ${calculos.endpoints} rutas Backend`,
                                    calculos.exportaciones > 0 ? `Generadores de Exportación (${calculos.exportaciones})` : null,
                                    `${iteraciones} Iteraciones / Sprints de Desarrollo`,
                                    'Sincronización segura de sesiones de cliente'
                                ].filter(Boolean).map((item, i) => (
                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                                        <CheckCircle2 size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
                                        {item}
                                    </li>
                                ))}
                            </ul>

                            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                                <Button variant="primary" style={{ flex: 1, justifyContent: 'center', padding: '12px 0', fontWeight: 600 }}>
                                    Imprimir Oficial
                                </Button>
                                <Button variant="secondary" style={{ flex: 1, justifyContent: 'center', padding: '12px 0', fontWeight: 600 }}>
                                    Exportar JSON
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
