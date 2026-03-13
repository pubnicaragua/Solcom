'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, RefreshCw, Save, Trash2, FileSpreadsheet } from 'lucide-react';

type PriceProfileSummary = {
    code: string;
    name: string;
    description: string | null;
    currency_code: string | null;
    active: boolean;
    item_count: number;
    updated_at: string | null;
};

function normalizeCode(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-NI', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function PriceProfilesPage() {
    const [profiles, setProfiles] = useState<PriceProfileSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [currencyCode, setCurrencyCode] = useState('USD');
    const [active, setActive] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);

    const [importFile, setImportFile] = useState<File | null>(null);
    const [targetProfile, setTargetProfile] = useState('');
    const [replaceExisting, setReplaceExisting] = useState(true);
    const [importing, setImporting] = useState(false);

    const sortedProfiles = useMemo(
        () => [...profiles].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
        [profiles]
    );

    const resetForm = () => {
        setCode('');
        setName('');
        setDescription('');
        setCurrencyCode('USD');
        setActive(true);
    };

    const fetchProfiles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/pricing/profiles?view=summary', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data?.error || 'No se pudieron cargar listas de precios.'));
            }
            setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
        } catch (err: any) {
            setProfiles([]);
            setError(String(err?.message || 'No se pudieron cargar listas de precios.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchProfiles();
    }, [fetchProfiles]);

    const saveProfile = async () => {
        setError('');
        setSuccess('');
        const normalizedCode = normalizeCode(code || name);
        if (!normalizedCode) {
            setError('Código o nombre requerido para la lista.');
            return;
        }
        if (!name.trim()) {
            setError('Nombre de lista requerido.');
            return;
        }

        setSavingProfile(true);
        try {
            const response = await fetch('/api/pricing/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: normalizedCode,
                    name: name.trim(),
                    description: description.trim() || null,
                    currency_code: currencyCode.trim() || 'USD',
                    active,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data?.error || 'No se pudo guardar la lista.'));
            }
            setSuccess(`Lista "${name.trim()}" guardada.`);
            resetForm();
            await fetchProfiles();
        } catch (err: any) {
            setError(String(err?.message || 'No se pudo guardar la lista.'));
        } finally {
            setSavingProfile(false);
        }
    };

    const editProfile = (profile: PriceProfileSummary) => {
        setCode(profile.code);
        setName(profile.name);
        setDescription(profile.description || '');
        setCurrencyCode(profile.currency_code || 'USD');
        setActive(profile.active);
        setSuccess('');
        setError('');
    };

    const deleteProfile = async (profileCode: string) => {
        if (!confirm(`¿Eliminar la lista "${profileCode}"? Esto no borra precios históricos.`)) {
            return;
        }
        setError('');
        setSuccess('');
        try {
            const response = await fetch(`/api/pricing/profiles?code=${encodeURIComponent(profileCode)}`, {
                method: 'DELETE',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data?.error || 'No se pudo eliminar la lista.'));
            }
            setSuccess(`Lista "${profileCode}" eliminada.`);
            if (normalizeCode(code) === normalizeCode(profileCode)) {
                resetForm();
            }
            await fetchProfiles();
        } catch (err: any) {
            setError(String(err?.message || 'No se pudo eliminar la lista.'));
        }
    };

    const importProfiles = async () => {
        if (!importFile) {
            setError('Selecciona un archivo .xls o .xlsx.');
            return;
        }

        setError('');
        setSuccess('');
        setImporting(true);
        try {
            const formData = new FormData();
            formData.set('file', importFile);
            formData.set('replace', replaceExisting ? '1' : '0');
            formData.set('currency_code', currencyCode || 'USD');
            if (targetProfile) formData.set('target_profile', targetProfile);

            const response = await fetch('/api/pricing/profiles/import', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data?.error || 'No se pudo importar el archivo.'));
            }
            const importedRows = Number(data?.imported_rows || 0);
            const unresolvedCount = Number(data?.unresolved_count || 0);
            setSuccess(`Importación completada: ${importedRows} precios cargados.${unresolvedCount > 0 ? ` Sin match: ${unresolvedCount}.` : ''}`);
            setImportFile(null);
            await fetchProfiles();
        } catch (err: any) {
            setError(String(err?.message || 'No se pudo importar el archivo.'));
        } finally {
            setImporting(false);
        }
    };

    return (
        <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                    <div className="h-title">Listas de precios</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Importa y administra tarifas para Facturas y Órdenes de Venta.
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void fetchProfiles()}
                    disabled={loading}
                    style={{
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refrescar
                </button>
            </div>

            {error ? (
                <div style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(127,29,29,0.25)', color: '#FCA5A5', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                    {error}
                </div>
            ) : null}
            {success ? (
                <div style={{ border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(6,78,59,0.25)', color: '#6EE7B7', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                    {success}
                </div>
            ) : null}

            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '340px 1fr' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', padding: 14, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Crear / Editar lista</div>
                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Código
                        <input
                            value={code}
                            onChange={(e) => setCode(normalizeCode(e.target.value))}
                            placeholder="ej: precio_r1"
                            style={{ width: '100%', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
                        />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Nombre
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="ej: Precio R1"
                            style={{ width: '100%', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
                        />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Moneda
                        <input
                            value={currencyCode}
                            onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                            placeholder="USD"
                            style={{ width: '100%', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
                        />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Descripción
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Opcional"
                            rows={2}
                            style={{ width: '100%', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--text)', padding: '8px 10px', fontSize: 13, resize: 'vertical' }}
                        />
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                        Lista activa
                    </label>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => void saveProfile()}
                            disabled={savingProfile}
                            style={{
                                flex: 1,
                                border: 'none',
                                borderRadius: 8,
                                padding: '9px 12px',
                                background: 'var(--brand-primary)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: savingProfile ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                opacity: savingProfile ? 0.75 : 1,
                            }}
                        >
                            <Save size={14} />
                            Guardar lista
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: '9px 10px',
                                background: 'transparent',
                                color: 'var(--muted)',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Limpiar
                        </button>
                    </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', padding: 14, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Importar archivo Excel</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Soporta dos formatos:
                        <br />1) `sku | profile_code | unit_price`
                        <br />2) `sku | Barato | Precio R1 | Precio R1+ | ...`
                        <br />3) Zoho export: `SKU | PriceList Rate` (seleccionando lista destino)
                    </div>

                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Archivo .xls / .xlsx
                        <input
                            type="file"
                            accept=".xls,.xlsx"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            style={{ width: '100%', marginTop: 6, color: 'var(--text)' }}
                        />
                    </label>

                    <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Aplicar a una lista específica (opcional)
                        <select
                            value={targetProfile}
                            onChange={(e) => setTargetProfile(e.target.value)}
                            style={{ width: '100%', marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
                        >
                            <option value="">Auto detectar por columnas</option>
                            {sortedProfiles.map((profile) => (
                                <option key={profile.code} value={profile.code}>
                                    {profile.name} ({profile.code})
                                </option>
                            ))}
                        </select>
                    </label>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                        <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
                        Reemplazar precios existentes de la(s) lista(s) importada(s)
                    </label>

                    <button
                        type="button"
                        onClick={() => void importProfiles()}
                        disabled={importing}
                        style={{
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 12px',
                            background: importing ? '#4B5563' : '#2563EB',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: importing ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                        {importing ? 'Importando...' : 'Importar precios'}
                    </button>
                </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 1fr 0.8fr', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
                    <span>Lista</span>
                    <span>Código</span>
                    <span>Moneda</span>
                    <span>SKUs</span>
                    <span>Actualizada</span>
                    <span>Acciones</span>
                </div>
                {loading ? (
                    <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>Cargando listas...</div>
                ) : sortedProfiles.length === 0 ? (
                    <div style={{ padding: 20, fontSize: 13, color: 'var(--muted)' }}>No hay listas de precios todavía.</div>
                ) : (
                    sortedProfiles.map((profile) => (
                        <div
                            key={profile.code}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr 1fr 0.8fr',
                                gap: 8,
                                padding: '11px 14px',
                                borderTop: '1px solid rgba(255,255,255,0.04)',
                                alignItems: 'center',
                                fontSize: 13,
                            }}
                        >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 600 }}>
                                <FileSpreadsheet size={14} style={{ color: profile.active ? '#60A5FA' : '#6B7280' }} />
                                {profile.name}
                            </div>
                            <code style={{ color: 'var(--muted)' }}>{profile.code}</code>
                            <span style={{ color: 'var(--muted)' }}>{profile.currency_code || 'USD'}</span>
                            <span style={{ color: '#34D399', fontWeight: 700 }}>{Number(profile.item_count || 0)}</span>
                            <span style={{ color: 'var(--muted)' }}>{formatDate(profile.updated_at)}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    onClick={() => editProfile(profile)}
                                    style={{
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--text)',
                                        borderRadius: 7,
                                        padding: '5px 8px',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void deleteProfile(profile.code)}
                                    style={{
                                        border: '1px solid rgba(239,68,68,0.35)',
                                        background: 'rgba(127,29,29,0.22)',
                                        color: '#FCA5A5',
                                        borderRadius: 7,
                                        padding: '5px 8px',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <Trash2 size={12} />
                                    Borrar
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
