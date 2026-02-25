'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Truck, X, User, Phone, ChevronDown } from 'lucide-react';

interface Delivery {
    id: string;
    name: string;
    phone: string | null;
    active: boolean;
}

interface DeliverySelectorProps {
    value: string | null;
    onChange: (deliveryId: string | null, delivery: Delivery | null) => void;
}

export default function DeliverySelector({ value, onChange }: DeliverySelectorProps) {
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchDeliveries();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setShowCreate(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sync selected delivery when value changes
    useEffect(() => {
        if (value && deliveries.length > 0) {
            const found = deliveries.find(d => d.id === value);
            if (found) setSelectedDelivery(found);
        } else if (!value) {
            setSelectedDelivery(null);
        }
    }, [value, deliveries]);

    const fetchDeliveries = async () => {
        try {
            const res = await fetch('/api/ventas/deliveries');
            const data = await res.json();
            setDeliveries(data.deliveries || []);
        } catch (err) {
            console.error('Error fetching deliveries:', err);
        }
    };

    const filtered = deliveries.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.phone && d.phone.includes(search))
    );

    const handleSelect = (delivery: Delivery | null) => {
        setSelectedDelivery(delivery);
        onChange(delivery?.id || null, delivery);
        setIsOpen(false);
        setSearch('');
        setHighlightIndex(-1);
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch('/api/ventas/deliveries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || null }),
            });
            const data = await res.json();
            if (data.delivery) {
                await fetchDeliveries();
                handleSelect(data.delivery);
                setNewName('');
                setNewPhone('');
                setShowCreate(false);
            }
        } catch (err) {
            console.error('Error creating delivery:', err);
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            setHighlightIndex(prev => Math.min(prev + 1, filtered.length));
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            setHighlightIndex(prev => Math.max(prev - 1, -1));
            e.preventDefault();
        } else if (e.key === 'Enter') {
            if (highlightIndex === -1) {
                handleSelect(null);
            } else if (highlightIndex < filtered.length) {
                handleSelect(filtered[highlightIndex]);
            }
            e.preventDefault();
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setHighlightIndex(-1);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', background: 'var(--background)',
        color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px',
        fontSize: '13px', transition: 'border-color 0.2s',
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
                Asignación Delivery
            </label>

            {/* Selected badge / trigger */}
            <div
                onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                    minHeight: '38px',
                }}
            >
                {selectedDelivery ? (
                    <>
                        <div style={{
                            width: '26px', height: '26px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <Truck size={13} color="white" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
                                {selectedDelivery.name}
                            </div>
                            {selectedDelivery.phone && (
                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{selectedDelivery.phone}</div>
                            )}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}
                        >
                            <X size={14} />
                        </button>
                    </>
                ) : (
                    <>
                        <Truck size={14} style={{ color: 'var(--muted)' }} />
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>No Asignado</span>
                        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
                    </>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: '10px', marginTop: '4px', zIndex: 200,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                    overflow: 'hidden',
                }}>
                    {/* Search */}
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--muted)' }} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setHighlightIndex(-1); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Buscar delivery..."
                                style={{ ...inputStyle, paddingLeft: '32px' }}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Options */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {/* No asignado option */}
                        <div
                            onClick={() => handleSelect(null)}
                            style={{
                                padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                color: 'var(--muted)', borderBottom: '1px solid var(--border)',
                                background: highlightIndex === -1 ? 'rgba(255,255,255,0.05)' : 'transparent',
                                transition: 'background 0.1s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; setHighlightIndex(-1); }}
                            onMouseLeave={(e) => { if (highlightIndex !== -1) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div style={{
                                width: '26px', height: '26px', borderRadius: '50%',
                                background: 'rgba(107,114,128,0.2)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <X size={12} style={{ color: 'var(--muted)' }} />
                            </div>
                            <span style={{ fontStyle: 'italic' }}>No Asignado</span>
                        </div>

                        {filtered.map((d, idx) => (
                            <div
                                key={d.id}
                                onClick={() => handleSelect(d)}
                                style={{
                                    padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    color: 'var(--text)', borderBottom: '1px solid var(--border)',
                                    background: highlightIndex === idx ? 'rgba(255,255,255,0.05)' : 'transparent',
                                    transition: 'background 0.1s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; setHighlightIndex(idx); }}
                                onMouseLeave={(e) => { if (highlightIndex !== idx) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{
                                    width: '26px', height: '26px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <span style={{ color: 'white', fontSize: '11px', fontWeight: 700 }}>
                                        {d.name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                                    {d.phone && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.phone}</div>}
                                </div>
                                <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#10B981',
                                }} />
                            </div>
                        ))}

                        {filtered.length === 0 && search && (
                            <div style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>
                                No se encontró "{search}"
                            </div>
                        )}
                    </div>

                    {/* Create new */}
                    {!showCreate ? (
                        <div
                            onClick={() => { setShowCreate(true); setNewName(search); }}
                            style={{
                                padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                color: 'var(--brand-primary)', borderTop: '1px solid var(--border)',
                                fontWeight: 600, transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220,38,38,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <Plus size={16} />
                            Agregar Delivery
                        </div>
                    ) : (
                        <div style={{ padding: '14px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase' }}>
                                Nuevo Delivery
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <User size={12} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
                                    <input
                                        type="text" value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="Nombre *"
                                        style={{ ...inputStyle, paddingLeft: '28px', fontSize: '12px' }}
                                        autoFocus
                                    />
                                </div>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Phone size={12} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
                                    <input
                                        type="text" value={newPhone}
                                        onChange={(e) => setNewPhone(e.target.value)}
                                        placeholder="Teléfono"
                                        style={{ ...inputStyle, paddingLeft: '28px', fontSize: '12px' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setShowCreate(false); setNewName(''); setNewPhone(''); }}
                                    style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newName.trim()}
                                    style={{
                                        padding: '6px 14px', background: 'var(--brand-primary)', border: 'none',
                                        borderRadius: '6px', fontSize: '12px', color: 'white', fontWeight: 600,
                                        cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                                        opacity: creating || !newName.trim() ? 0.5 : 1,
                                    }}
                                >
                                    {creating ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
