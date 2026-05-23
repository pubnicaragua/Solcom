'use client';

import { useState } from 'react';
import { 
  Navigation, Clock, MapPin, Zap, Copy, Send, 
  CheckCircle, AlertCircle, Loader, ExternalLink, Play 
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

interface RouteStop {
  id: string;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  original_sequence: number;
  optimized_sequence: number;
  status: string;
}

interface Route {
  id: string;
  name: string;
  status: string;
  driver_name: string;
  driver_phone: string;
  vehicle_label: string;
  tracking_token: string;
  tracking_enabled: boolean;
  total_distance_meters: number;
  total_duration_seconds: number;
  encoded_polyline: string;
  route_stops?: RouteStop[];
}

interface RouteDetailPanelProps {
  route: Route;
  onOptimized: () => void;
}

export default function RouteDetailPanel({ route, onOptimized }: RouteDetailPanelProps) {
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const canOptimize = route.status === 'draft' && 
                      route.route_stops && 
                      route.route_stops.length > 0 &&
                      route.route_stops.every(s => s.lat && s.lng);

  const handleOptimize = async () => {
    if (!canOptimize) return;

    setOptimizing(true);
    setError('');

    try {
      // Llamar al endpoint de optimización
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: route.id,
          origin: { lat: 12.136389, lng: -86.251389 }, // Bodega Solcom
          waypoints: route.route_stops!.map(stop => ({
            lat: stop.lat,
            lng: stop.lng,
            address: stop.address
          })),
          returnToOrigin: false,
          vehicleType: 'car'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al optimizar ruta');
      }

      if (!data.success || !data.route) {
        throw new Error('Respuesta inválida del servidor');
      }

      const optimizedRoute = data.route;

      // Actualizar la ruta en BD
      const { error: updateError } = await (supabase as any)
        .from('routes')
        .update({
          status: 'optimized',
          optimized_at: new Date().toISOString(),
          total_distance_meters: optimizedRoute.distance,
          total_duration_seconds: parseInt(optimizedRoute.duration.replace('s', '')),
          encoded_polyline: optimizedRoute.polyline
        })
        .eq('id', route.id);

      if (updateError) throw updateError;

      // Actualizar el orden de las paradas
      const optimizedOrder = optimizedRoute.optimizedOrder || [];
      
      for (let i = 0; i < optimizedOrder.length; i++) {
        const originalIndex = optimizedOrder[i];
        const stop = route.route_stops![originalIndex];
        
        const { error: stopError } = await (supabase as any)
          .from('route_stops')
          .update({
            optimized_sequence: i + 1
          })
          .eq('id', stop.id);

        if (stopError) throw stopError;
      }

      onOptimized();
    } catch (err) {
      console.error('Error optimizando ruta:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOptimizing(false);
    }
  };

  const handleStartRoute = async () => {
    if (!confirm('¿Deseas iniciar esta ruta ahora?')) return;
    try {
      const { error: updateError } = await (supabase as any)
        .from('routes')
        .update({ 
          status: 'in_progress',
          start_time_actual: new Date().toISOString()
        })
        .eq('id', route.id);
      if (updateError) throw updateError;
      onOptimized();
    } catch (err) {
      console.error('Error iniciando ruta:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al iniciar ruta');
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/tracking/ruta/${route.tracking_token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const link = `${window.location.origin}/tracking/ruta/${route.tracking_token}`;
    const message = encodeURIComponent(
      `Hola ${route.driver_name}, esta es tu ruta asignada para hoy. Abrí este link y permití compartir tu ubicación durante el recorrido: ${link}`
    );
    const phone = route.driver_phone.replace(/\D/g, '');
    window.open(`https://wa.me/505${phone}?text=${message}`, '_blank');
  };

  const formatDistance = (meters: number) => {
    if (!meters) return '-';
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const sortedStops = route.route_stops?.sort((a, b) => {
    const seqA = route.status === 'optimized' ? a.optimized_sequence : a.original_sequence;
    const seqB = route.status === 'optimized' ? b.optimized_sequence : b.original_sequence;
    return seqA - seqB;
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        padding: 16, 
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(15,23,42,0.5)'
      }}>
        <h3 style={{ 
          fontSize: 14, 
          fontWeight: 700, 
          color: '#f8fafc',
          margin: '0 0 8px 0'
        }}>
          {route.name}
        </h3>
        
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
          {route.driver_name} • {route.vehicle_label || 'Sin vehículo'}
        </div>

        {/* Estado */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            fontSize: 10,
            padding: '3px 8px',
            background: route.status === 'optimized' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${route.status === 'optimized' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            borderRadius: 4,
            color: route.status === 'optimized' ? '#22c55e' : '#94a3b8',
            fontWeight: 600
          }}>
            {route.status === 'draft' ? 'Borrador' : 
             route.status === 'optimized' ? 'Optimizada' : 
             route.status}
          </span>

          {route.tracking_enabled && (
            <span style={{
              fontSize: 10,
              padding: '3px 8px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 4,
              color: '#3b82f6',
              fontWeight: 600
            }}>
              Tracking activo
            </span>
          )}
        </div>

        {/* Métricas */}
        {route.total_distance_meters > 0 && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: 8,
            marginBottom: 12
          }}>
            <div style={{
              padding: 8,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                Distancia
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                {formatDistance(route.total_distance_meters)}
              </div>
            </div>

            <div style={{
              padding: 8,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                Duración
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                {formatDuration(route.total_duration_seconds)}
              </div>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {canOptimize && route.status === 'draft' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOptimize}
              disabled={optimizing}
              style={{ width: '100%', gap: 6 }}
            >
              {optimizing ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  Optimizando...
                </>
              ) : (
                <>
                  <Zap size={14} />
                  Optimizar Ruta
                </>
              )}
            </Button>
          )}

          {route.status === 'optimized' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartRoute}
                style={{ width: '100%', gap: 6, background: '#10b981', color: '#fff', borderColor: '#10b981' }}
              >
                <Play size={14} />
                Iniciar Ruta
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyLink}
                style={{ width: '100%', gap: 6 }}
              >
                {copied ? (
                  <>
                    <CheckCircle size={14} />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copiar Link de Tracking
                  </>
                )}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleSendWhatsApp}
                style={{ width: '100%', gap: 6 }}
              >
                <Send size={14} />
                Enviar por WhatsApp
              </Button>
            </>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: 8,
            padding: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            color: '#ef4444',
            fontSize: 11,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Lista de paradas */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <div style={{ 
          fontSize: 11, 
          fontWeight: 700, 
          color: '#94a3b8',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Paradas ({sortedStops.length})
        </div>

        {sortedStops.map((stop, index) => {
          const sequence = route.status === 'optimized' ? stop.optimized_sequence : stop.original_sequence;
          
          return (
            <div
              key={stop.id}
              style={{
                padding: 10,
                marginBottom: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'rgba(59,130,246,0.2)',
                  border: '2px solid #3b82f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#60a5fa',
                  flexShrink: 0
                }}>
                  {sequence}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: 12, 
                    fontWeight: 700, 
                    color: '#f8fafc',
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {stop.client_name}
                  </div>

                  <div style={{ 
                    fontSize: 11, 
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 4,
                    marginBottom: 6
                  }}>
                    <MapPin size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {stop.address}
                    </span>
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 10,
                      color: '#3b82f6',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3
                    }}
                  >
                    Abrir en Google Maps
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
