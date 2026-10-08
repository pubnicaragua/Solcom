'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { 
  MapPin, Navigation, Play, Square, AlertCircle, 
  CheckCircle, Wifi, WifiOff, Battery, ExternalLink,
  Loader
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface RouteStop {
  id: string;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  optimized_sequence: number;
  status: string;
}

interface Route {
  id: string;
  name: string;
  driver_name: string;
  tracking_enabled: boolean;
  route_stops: RouteStop[];
}

export default function DriverTrackingPage() {
  const params = useParams();
  const trackingToken = params.tracking_token as string;

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number; time: Date } | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [pendingLocations, setPendingLocations] = useState<any[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar ruta
  useEffect(() => {
    const loadRoute = async () => {
      try {
        const { data, error: routeError } = await (supabase as any)
          .from('routes')
          .select('id, name, driver_name, tracking_enabled, route_stops(*)')
          .eq('tracking_token', trackingToken)
          .single();

        if (routeError) throw new Error('Ruta no encontrada o link inválido');
        if (!data.tracking_enabled) throw new Error('El tracking no está habilitado para esta ruta');

        setRoute(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando ruta');
      } finally {
        setLoading(false);
      }
    };

    loadRoute();
  }, [trackingToken]);

  // Monitorear estado de conexión
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Obtener nivel de batería
  useEffect(() => {
    const getBattery = async () => {
      if ('getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery();
          setBatteryLevel(battery.level);
          
          battery.addEventListener('levelchange', () => {
            setBatteryLevel(battery.level);
          });
        } catch (err) {
          console.log('Battery API no disponible');
        }
      }
    };

    getBattery();
  }, []);

  // Sincronizar ubicaciones pendientes cuando vuelve internet
  useEffect(() => {
    if (online && pendingLocations.length > 0) {
      syncPendingLocations();
    }
  }, [online]);

  const syncPendingLocations = async () => {
    if (pendingLocations.length === 0) return;

    try {
      for (const location of pendingLocations) {
        await sendLocation(location);
      }
      setPendingLocations([]);
      localStorage.removeItem('pending_locations');
    } catch (err) {
      console.error('Error sincronizando ubicaciones:', err);
    }
  };

  const sendLocation = async (locationData: any) => {
    try {
      const response = await fetch('/api/routes/tracking/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingToken,
          ...locationData
        })
      });

      if (!response.ok) {
        throw new Error('Error enviando ubicación');
      }
    } catch (err) {
      console.error('Error:', err);
      throw err;
    }
  };

  const handleLocationUpdate = useCallback(async (position: GeolocationPosition) => {
    const locationData = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading || 0,
      speed: position.coords.speed || 0,
      batteryLevel: batteryLevel || 1,
      recordedAt: new Date().toISOString()
    };

    setLastLocation({
      lat: locationData.lat,
      lng: locationData.lng,
      time: new Date()
    });

    if (online) {
      try {
        await sendLocation(locationData);
      } catch (err) {
        // Si falla, guardar offline
        const pending = [...pendingLocations, locationData];
        setPendingLocations(pending);
        localStorage.setItem('pending_locations', JSON.stringify(pending));
      }
    } else {
      // Sin internet, guardar offline
      const pending = [...pendingLocations, locationData];
      setPendingLocations(pending);
      localStorage.setItem('pending_locations', JSON.stringify(pending));
    }
  }, [trackingToken, online, batteryLevel, pendingLocations]);

  const startTracking = async () => {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta geolocalización');
      return;
    }

    try {
      // Solicitar permiso primero
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      
      if (permission.state === 'denied') {
        setPermissionDenied(true);
        setError('Permiso de ubicación denegado. Activá la ubicación en la configuración de tu navegador.');
        return;
      }

      setTracking(true);
      setPermissionDenied(false);
      setError('');

      // Actualizar estado en BD
      await (supabase as any)
        .from('routes')
        .update({ tracking_started_at: new Date().toISOString() })
        .eq('tracking_token', trackingToken);

      // Iniciar seguimiento continuo
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleLocationUpdate,
        (err) => {
          console.error('Error de geolocalización:', err);
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionDenied(true);
            setError('Permiso de ubicación denegado');
            stopTracking();
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );

      // Enviar ubicación cada 15 segundos
      sendIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          handleLocationUpdate,
          (err) => console.error('Error obteniendo ubicación:', err),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 }
        );
      }, 15000);

    } catch (err) {
      setError('Error iniciando seguimiento');
      console.error(err);
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    setTracking(false);
  };

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--page-surface-gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <Loader size={32} color="#3b82f6" className="animate-spin" />
      </div>
    );
  }

  if (error && !route) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--page-surface-gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{
          maxWidth: 400,
          width: '100%',
          padding: 24,
          background: 'var(--panel-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          textAlign: 'center'
        }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Error
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  const sortedStops = route?.route_stops?.sort((a, b) => a.optimized_sequence - b.optimized_sequence) || [];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--page-surface-gradient)',
      padding: 16
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          padding: 20,
          background: 'var(--panel-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          marginBottom: 16
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            {route?.name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
            Motorizado: {route?.driver_name}
          </p>

          {/* Estado */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{
              flex: 1,
              padding: 8,
              background: tracking ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
              border: `1px solid ${tracking ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              {tracking ? (
                <>
                  <Navigation size={16} color="#22c55e" />
                  <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                    Tracking activo
                  </span>
                </>
              ) : (
                <>
                  <Square size={16} color="var(--muted)" />
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                    Tracking detenido
                  </span>
                </>
              )}
            </div>

            <div style={{
              flex: 1,
              padding: 8,
              background: online ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${online ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              {online ? (
                <>
                  <Wifi size={16} color="#22c55e" />
                  <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                    En línea
                  </span>
                </>
              ) : (
                <>
                  <WifiOff size={16} color="#ef4444" />
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                    Sin conexión
                  </span>
                </>
              )}
            </div>

            {batteryLevel !== null && (
              <div style={{
                padding: 8,
                background: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Battery size={16} color="var(--muted)" />
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  {Math.round(batteryLevel * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!tracking ? (
              <button
                onClick={startTracking}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Play size={16} />
                Iniciar Seguimiento
              </button>
            ) : (
              <button
                onClick={stopTracking}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  color: '#ef4444',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Square size={16} />
                Detener Seguimiento
              </button>
            )}
          </div>

          {/* Última ubicación */}
          {lastLocation && (
            <div style={{
              marginTop: 12,
              padding: 10,
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 6
            }}>
              <div style={{ fontSize: 11, color: '#60a5fa', marginBottom: 4 }}>
                Última ubicación enviada:
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {lastLocation.time.toLocaleTimeString('es-NI')}
              </div>
            </div>
          )}

          {/* Ubicaciones pendientes */}
          {pendingLocations.length > 0 && (
            <div style={{
              marginTop: 8,
              padding: 10,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 6,
              fontSize: 11,
              color: '#f59e0b'
            }}>
              {pendingLocations.length} ubicación{pendingLocations.length > 1 ? 'es' : ''} pendiente{pendingLocations.length > 1 ? 's' : ''} de sincronizar
            </div>
          )}

          {/* Errores */}
          {error && (
            <div style={{
              marginTop: 12,
              padding: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color: '#ef4444',
              fontSize: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Recomendación */}
          {tracking && (
            <div style={{
              marginTop: 12,
              padding: 10,
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--muted)'
            }}>
              💡 Mantené esta pantalla abierta durante el recorrido para continuar compartiendo ubicación.
            </div>
          )}
        </div>

        {/* Lista de paradas */}
        <div style={{
          padding: 20,
          background: 'var(--panel-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
            Paradas ({sortedStops.length})
          </h2>

          {sortedStops.map((stop, index) => (
            <div
              key={stop.id}
              style={{
                padding: 14,
                marginBottom: 12,
                background: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(59,130,246,0.2)',
                  border: '2px solid #3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#60a5fa',
                  flexShrink: 0
                }}>
                  {stop.optimized_sequence}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    {stop.client_name}
                  </div>

                  <div style={{ 
                    fontSize: 12, 
                    color: 'var(--muted)',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 4
                  }}>
                    <MapPin size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{stop.address}</span>
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 6,
                      color: '#3b82f6',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none'
                    }}
                  >
                    <Navigation size={14} />
                    Navegar en Google Maps
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
