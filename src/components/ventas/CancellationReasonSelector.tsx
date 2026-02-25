'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, AlertTriangle, ChevronDown, X } from 'lucide-react';

interface CancellationReason {
    id: string;
    label: string;
    sort_order: number;
}

interface CancellationReasonSelectorProps {
    value: string | null;
    onChange: (reasonId: string | null, reason: CancellationReason | null) => void;
    disabled?: boolean;
}

export default function CancellationReasonSelector({ value, onChange, disabled }: CancellationReasonSelectorProps) {
    const [reasons, setReasons] = useState<CancellationReason[]>([]);
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [selectedReason, setSelectedReason] = useState<CancellationReason | null>(null);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchReasons();
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

    useEffect(() => {
        if (value && reasons.length > 0) {
            const found = reasons.find(r => r.id === value);
            if (found) setSelectedReason(found);
        } else if (!value) {
            setSelectedReason(null);
        }
    }, [value, reasons]);

    const fetchReasons = async () => {
        try {
            const res = await fetch('/api/ventas/cancellation-reasons');
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudieron cargar los motivos');
            }
            setReasons(data.reasons || []);
        } catch (err) {
            console.error('Error fetching cancellation reasons:', err);
        }
    };

    const filtered = reasons.filter(r =>
        r.label.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (reason: CancellationReason | null) => {
        setSelectedReason(reason);
        onChange(reason?.id || null, reason);
        setIsOpen(false);
        setSearch('');
        setHighlightIndex(-1);
    };

    const handleCreate = async () => {
        if (!newLabel.trim()) return;
        setCreating(true);
        setCreateError('');
        try {
            const res = await fetch('/api/ventas/cancellation-reasons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo crear el motivo');
            }
            if (data.reason) {
                await fetchReasons();
                handleSelect(data.reason);
                setNewLabel('');
                setShowCreate(false);
            }
        } catch (err) {
            console.error('Error creating reason:', err);
            setCreateError(err instanceof Error ? err.message : 'No se pudo crear el motivo');
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') { setIsOpen(true); e.preventDefault(); }
            return;
        }
        if (e.key === 'ArrowDown') { setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1)); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { setHighlightIndex(prev => Math.max(prev - 1, 0)); e.preventDefault(); }
        else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filtered.length) { handleSelect(filtered[highlightIndex]); e.preventDefault(); }
        else if (e.key === 'Escape') { setIsOpen(false); setHighlightIndex(-1); }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', background: 'var(--background)',
        color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px',
        fontSize: '13px', transition: 'border-color 0.2s',
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#FBBF24', marginBottom: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={13} />
                    Motivo de Anulación *
                </span>
            </label>

            {/* Trigger */}
            <div
                onClick={() => { if (!disabled) { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 50); } }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', background: disabled ? 'var(--card)' : 'var(--background)',
                    border: `1px solid ${selectedReason ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
                    borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1, transition: 'border-color 0.2s',
                    minHeight: '38px',
                }}
            >
                {selectedReason ? (
                    <>
                        <AlertTriangle size={14} style={{ color: '#FBBF24', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedReason.label}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}
                        >
                            <X size={14} />
                        </button>
                    </>
                ) : (
                    <>
                        <AlertTriangle size={14} style={{ color: 'var(--muted)' }} />
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Seleccionar motivo...</span>
                        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
                    </>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && !disabled && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: '10px', marginTop: '4px', zIndex: 200,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
                }}>
                    {/* Search */}
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--muted)' }} />
                            <input
                                ref={inputRef}
                                type="text" value={search}
                                onChange={(e) => { setSearch(e.target.value); setHighlightIndex(-1); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Buscar motivo..."
                                style={{ ...inputStyle, paddingLeft: '32px' }}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Options */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {filtered.map((r, idx) => (
                            <div
                                key={r.id}
                                onClick={() => handleSelect(r)}
                                style={{
                                    padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                                    color: 'var(--text)', borderBottom: '1px solid var(--border)',
                                    background: highlightIndex === idx ? 'rgba(255,255,255,0.05)' : 'transparent',
                                    transition: 'background 0.1s',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; setHighlightIndex(idx); }}
                                onMouseLeave={(e) => { if (highlightIndex !== idx) e.currentTarget.style.background = 'transparent'; }}
                            >
                                {r.label}
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
                            onClick={() => { setShowCreate(true); setNewLabel(search); }}
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
                            Agregar Motivo
                        </div>
                    ) : (
                        <div style={{ padding: '14px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                Nuevo Motivo
                            </div>
                            {createError && (
                                <div style={{
                                    marginBottom: '10px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    color: '#F87171',
                                    border: '1px solid rgba(248,113,113,0.35)',
                                    background: 'rgba(239,68,68,0.08)',
                                }}>
                                    {createError}
                                </div>
                            )}
                            <input
                                type="text" value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="Descripción del motivo..."
                                style={{ ...inputStyle, fontSize: '12px', marginBottom: '10px' }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { setShowCreate(false); setNewLabel(''); }}
                                    style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newLabel.trim()}
                                    style={{
                                        padding: '6px 14px', background: 'var(--brand-primary)', border: 'none',
                                        borderRadius: '6px', fontSize: '12px', color: 'white', fontWeight: 600,
                                        cursor: creating || !newLabel.trim() ? 'not-allowed' : 'pointer',
                                        opacity: creating || !newLabel.trim() ? 0.5 : 1,
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
