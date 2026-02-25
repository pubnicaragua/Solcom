'use client';

import { useState } from 'react';
import { X, User, Mail, Phone, FileText, MapPin } from 'lucide-react';

interface CustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (customer: any) => void;
}

export default function CustomerModal({ isOpen, onClose, onSave }: CustomerModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [ruc, setRuc] = useState('');
    const [address, setAddress] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) {
            setError('El nombre es requerido');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/ventas/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, ruc, address }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSave(data.customer);
            // Reset
            setName(''); setEmail(''); setPhone(''); setRuc(''); setAddress('');
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 12px 10px 38px',
        background: 'var(--background)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '14px',
        transition: 'border-color 0.2s',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--muted)',
        marginBottom: '6px',
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 3000, padding: '20px',
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: 'var(--card)', borderRadius: '16px', maxWidth: '520px',
                width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                border: '1px solid var(--border)', animation: 'fadeInUp 0.2s ease',
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <User size={20} style={{ color: 'var(--brand-primary)' }} />
                        Nuevo Cliente
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {error && (
                        <div style={{
                            padding: '10px 14px', background: 'rgba(239,68,68,0.1)', color: '#EF4444',
                            borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(239,68,68,0.2)',
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Nombre */}
                    <div>
                        <label style={labelStyle}>Nombre *</label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                            <input
                                type="text" value={name} onChange={(e) => setName(e.target.value)}
                                placeholder="Nombre completo" style={inputStyle}
                                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            />
                        </div>
                    </div>

                    {/* Email & Teléfono */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                                <input
                                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    placeholder="email@ejemplo.com" style={inputStyle}
                                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Teléfono</label>
                            <div style={{ position: 'relative' }}>
                                <Phone size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                                <input
                                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+505 8888-8888" style={inputStyle}
                                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* RUC */}
                    <div>
                        <label style={labelStyle}>RUC / Cédula</label>
                        <div style={{ position: 'relative' }}>
                            <FileText size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                            <input
                                type="text" value={ruc} onChange={(e) => setRuc(e.target.value)}
                                placeholder="J0310000000001" style={inputStyle}
                                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            />
                        </div>
                    </div>

                    {/* Dirección */}
                    <div>
                        <label style={labelStyle}>Dirección</label>
                        <div style={{ position: 'relative' }}>
                            <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                            <input
                                type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                                placeholder="Dirección del cliente" style={inputStyle}
                                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px', background: 'transparent', color: 'var(--muted)',
                            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px',
                            fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '10px 24px', background: saving ? '#6B7280' : 'var(--brand-primary)',
                            color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px',
                            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        {saving ? 'Guardando...' : 'Guardar Cliente'}
                    </button>
                </div>
            </div>
        </div>
    );
}
