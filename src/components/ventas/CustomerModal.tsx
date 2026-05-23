'use client';

import { useEffect, useRef, useState } from 'react';
import { X, User, Mail, Phone, FileText, MapPin, Link, Map, Trash2 } from 'lucide-react';

interface CustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (customer: any) => void;
    editingCustomer?: any | null;
}


let googleMapsLoaderPromise: Promise<void> | null = null;

function ensureGoogleMapsLoaded(apiKey: string): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) {
    return Promise.resolve();
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const callbackName = 'initGoogleMapsCallback_' + Math.random().toString(36).substring(7);
    (window as any)[callbackName] = () => {
      resolve();
      delete (window as any)[callbackName];
    };

    const existingScript = document.querySelector('script[data-google-maps-loader="true"]') as HTMLScriptElement | null;

    if (existingScript) {
      const checkInterval = setInterval(() => {
        if ((window as any).google?.maps?.Map) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';
    script.onerror = () => reject(new Error('Error de red cargando Google Maps'));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

export default function CustomerModal({ isOpen, onClose, onSave, editingCustomer }: CustomerModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [ruc, setRuc] = useState('');
    const [address, setAddress] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Estados para la geolocalización
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<any>(null);
    const [marker, setMarker] = useState<any>(null);
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);
    const [mapUrlInput, setMapUrlInput] = useState('');
    const [isResolvingUrl, setIsResolvingUrl] = useState(false);

    // Sincronizar campos de edición
    useEffect(() => {
        if (isOpen) {
            if (editingCustomer) {
                setName(editingCustomer.name || '');
                setEmail(editingCustomer.email || '');
                setPhone(editingCustomer.phone || '');
                setRuc(editingCustomer.ruc || '');
                setAddress(editingCustomer.address || '');
                
                const initialLat = editingCustomer.lat ? parseFloat(editingCustomer.lat) : null;
                const initialLng = editingCustomer.lng ? parseFloat(editingCustomer.lng) : null;
                setLat(initialLat);
                setLng(initialLng);
                
                if (initialLat && initialLng) {
                    setMapUrlInput(`${initialLat}, ${initialLng}`);
                } else {
                    setMapUrlInput('');
                }
            } else {
                setName('');
                setEmail('');
                setPhone('');
                setRuc('');
                setAddress('');
                setLat(null);
                setLng(null);
                setMapUrlInput('');
            }
            setError('');
        }
    }, [isOpen, editingCustomer]);

    const handleClose = () => {
        setName('');
        setEmail('');
        setPhone('');
        setRuc('');
        setAddress('');
        setLat(null);
        setLng(null);
        setMapUrlInput('');
        setError('');
        onClose();
    };


    // Cargar e inicializar mapa interactivo
    useEffect(() => {
        if (!isOpen) {
            setMap(null);
            setMarker(null);
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            console.error('Google Maps API key no configurada.');
            return;
        }

        let active = true;

        ensureGoogleMapsLoaded(apiKey)
            .then(() => {
                if (!active) return;

                setTimeout(() => {
                    if (!active || !mapRef.current) return;
                    const maps = (window as any).google?.maps;
                    if (!maps || !maps.Map) return;

                    const initialLat = lat || (editingCustomer?.lat ? parseFloat(editingCustomer.lat) : null) || 12.136389;
                    const initialLng = lng || (editingCustomer?.lng ? parseFloat(editingCustomer.lng) : null) || -86.251389;
                    const initialPos = { lat: initialLat, lng: initialLng };

                    const mapInstance = new maps.Map(mapRef.current, {
                        center: initialPos,
                        zoom: (lat || editingCustomer?.lat) && (lng || editingCustomer?.lng) ? 17 : 13,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false,
                        zoomControl: true,
                        styles: [
                            {
                                featureType: 'administrative',
                                elementType: 'labels.text.fill',
                                stylers: [{ color: '#5c5c5c' }]
                            },
                            {
                                featureType: 'landscape',
                                elementType: 'geometry.fill',
                                stylers: [{ color: '#edeae2' }]
                            },
                            {
                                featureType: 'poi.park',
                                elementType: 'geometry.fill',
                                stylers: [{ color: '#c4e2af' }]
                            },
                            {
                                featureType: 'road',
                                elementType: 'geometry.fill',
                                stylers: [{ color: '#ffffff' }]
                            },
                            {
                                featureType: 'road',
                                elementType: 'geometry.stroke',
                                stylers: [{ color: '#dcdbd9' }, { weight: 1.5 }]
                            },
                            {
                                featureType: 'water',
                                elementType: 'geometry.fill',
                                stylers: [{ color: '#aadaff' }]
                            }
                        ]
                    });

                    // Creamos el pin marcador en el mapa
                    const markerInstance = new maps.Marker({
                        position: initialPos,
                        map: mapInstance,
                        draggable: true,
                        title: 'Ubicación del cliente',
                        animation: maps.Animation?.DROP
                    });

                    // Evento al arrastrar el pin manualmente
                    markerInstance.addListener('dragend', () => {
                        const pos = markerInstance.getPosition();
                        if (pos) {
                            setLat(pos.lat());
                            setLng(pos.lng());
                        }
                    });

                    setMap(mapInstance);
                    setMarker(markerInstance);
                }, 100);
            })
            .catch((err) => {
                console.error('Error al cargar Google Maps en modal:', err);
            });

        return () => {
            active = false;
        };
    }, [isOpen, editingCustomer]);


    // Función auxiliar para actualizar la posición del mapa y pin
    const updateMapPosition = (latitude: number, longitude: number) => {
        setLat(latitude);
        setLng(longitude);

        if (map) {
            const pos = { lat: latitude, lng: longitude };
            map.setCenter(pos);
            map.setZoom(17);

            const maps = (window as any).google?.maps;
            if (maps) {
                if (marker) {
                    marker.setPosition(pos);
                    marker.setMap(map);
                } else {
                    const markerInstance = new maps.Marker({
                        position: pos,
                        map: map,
                        draggable: true,
                        title: 'Ubicación del cliente',
                        animation: maps.Animation?.DROP
                    });

                    markerInstance.addListener('dragend', () => {
                        const pos = markerInstance.getPosition();
                        if (pos) {
                            setLat(pos.lat());
                            setLng(pos.lng());
                        }
                    });
                    setMarker(markerInstance);
                }
            }
        }
    };

    // Procesar la entrada de texto (pegar link o coordenadas)
    const handleUrlPaste = async (val: string) => {
        setMapUrlInput(val);
        if (!val.trim()) return;

        // 1. Intentar extracción local (regex rápido)
        const match = val.match(/([+-]?\d+\.\d+)\s*,\s*([+-]?\d+\.\d+)/);
        if (match) {
            const latitude = parseFloat(match[1]);
            const longitude = parseFloat(match[2]);
            if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                updateMapPosition(latitude, longitude);
                setError('');
                return;
            }
        }

        // 2. Si tiene pinta de ser un link, lo resolvemos en el backend
        if (val.includes('http://') || val.includes('https://')) {
            setIsResolvingUrl(true);
            setError('');
            try {
                const res = await fetch(`/api/ventas/customers/resolve-url?url=${encodeURIComponent(val.trim())}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'No se pudieron extraer coordenadas');

                if (data.lat && data.lng) {
                    updateMapPosition(data.lat, data.lng);
                }
            } catch (err: any) {
                console.error('Error resolviendo enlace:', err);
                setError('No pudimos extraer coordenadas de este enlace. Por favor, arrastrá el pin en el mapa manualmente.');
            } finally {
                setIsResolvingUrl(false);
            }
        }
    };

    // Limpiar geolocalización de vuelta a estado neutro
    const clearLocation = () => {
        setLat(null);
        setLng(null);
        setMapUrlInput('');
        setError('');
        
        if (marker) {
            marker.setMap(null);
            setMarker(null);
        }

        if (map) {
            const DEFAULT_CENTER = { lat: 12.136389, lng: -86.251389 };
            map.setCenter(DEFAULT_CENTER);
            map.setZoom(13);

            const maps = (window as any).google?.maps;
            if (maps) {
                const markerInstance = new maps.Marker({
                    position: DEFAULT_CENTER,
                    map: map,
                    draggable: true,
                    title: 'Ubicación del cliente',
                    animation: maps.Animation?.DROP
                });

                markerInstance.addListener('dragend', () => {
                    const pos = markerInstance.getPosition();
                    if (pos) {
                        setLat(pos.lat());
                        setLng(pos.lng());
                    }
                });
                setMarker(markerInstance);
            }
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('El nombre es requerido');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const method = editingCustomer ? 'PATCH' : 'POST';
            const bodyPayload = editingCustomer 
                ? { id: editingCustomer.id, name, email, phone, ruc, address, lat, lng }
                : { name, email, phone, ruc, address, lat, lng };

            const res = await fetch('/api/ventas/customers', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSave(data.customer);
            
            // Reset
            setName('');
            setEmail('');
            setPhone('');
            setRuc('');
            setAddress('');
            setLat(null);
            setLng(null);
            setMapUrlInput('');
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

    const locationBadgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 600,
    };

    if (!isOpen) return null;

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
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <User size={20} style={{ color: 'var(--brand-primary)' }} />
                        {editingCustomer ? 'Editar Ubicación de Cliente' : 'Nuevo Cliente'}
                    </h3>
                    <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div style={{
                    padding: '24px', display: 'flex', flexDirection: 'column',
                    gap: '16px', overflowY: 'auto', flex: 1
                }}>
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

                    {/* Geolocalización */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>Ubicación Geográfica (Despacho)</label>
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Arrastrá el pin para precisión</span>
                        </div>

                        {/* Pegar enlace de Maps */}
                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <Link size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
                            <input
                                type="text"
                                value={mapUrlInput}
                                onChange={(e) => handleUrlPaste(e.target.value)}
                                placeholder="Pegá enlace de Maps / WhatsApp o coordenadas"
                                style={inputStyle}
                                disabled={isResolvingUrl}
                                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            />
                            {isResolvingUrl && (
                                <span style={{
                                    position: 'absolute', right: '12px', top: '12px',
                                    fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 600,
                                }}>
                                    Cargando...
                                </span>
                            )}
                        </div>

                        {/* Coordenadas actuales badges */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            {lat && lng ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{
                                        ...locationBadgeStyle,
                                        background: 'rgba(16,185,129,0.1)',
                                        color: '#10B981',
                                        border: '1px solid rgba(16,185,129,0.2)'
                                    }}>
                                        <MapPin size={12} />
                                        Fijado: {lat.toFixed(6)}, {lng.toFixed(6)}
                                    </div>
                                    <button
                                        onClick={clearLocation}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#EF4444', display: 'flex', alignItems: 'center',
                                            padding: '4px', borderRadius: '4px', transition: 'background 0.2s'
                                        }}
                                        title="Eliminar geolocalización"
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div style={{
                                    ...locationBadgeStyle,
                                    background: 'rgba(156,163,175,0.1)',
                                    color: 'var(--muted)',
                                    border: '1px solid var(--border)'
                                }}>
                                    Sin geolocalización (se usará dirección de texto)
                                </div>
                            )}
                        </div>

                        {/* Contenedor del Mapa */}
                        <div style={{ position: 'relative', width: '100%', height: '160px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <div
                                ref={mapRef}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    background: '#1a1a1a',
                                }}
                            />
                            {typeof window !== 'undefined' && !(window as any).google?.maps && (
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', color: 'var(--muted)', fontSize: '13px',
                                    zIndex: 1, gap: '8px'
                                }}>
                                    <Map size={16} />
                                    Cargando mapa interactivo...
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px',
                    background: 'var(--card)'
                }}>
                    <button
                        onClick={handleClose}
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
