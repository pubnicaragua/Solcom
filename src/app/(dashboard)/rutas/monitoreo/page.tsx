'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Activity, MapPin, Truck, AlertTriangle, RefreshCw,
  Clock, Navigation, CheckCircle2, XCircle, Phone,
  User, Package, Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import GoogleMapView from '@/components/rutas/GoogleMapView';

interface ActiveRoute {
  id: string;
  name: string;
  status: string;
  vehicle_id: string;
  vehicles?: {
    plate_number: string;
    driver_name: string;
    driver_phone: string;
    current_lat: number;
    current_lng: number;
    last_location_update: string;
  };
  route_stops?: RouteStop[];
  start_time_actual: string;
  total_distance_meters: number;
  total_duration_seconds: number;
  encoded_polyline?: string;
}

interface RouteStop {
  id: string;
  route_id?: string;
  job_id?: string;
  sequence_order: number;
  status: string;
  eta_planned: string;
  arrival_time: string;
  departure_time: string;
  lat?: number;
  lng?: number;
  delivery_jobs?: {
    customer_name: string;
    address_text: string;
    customer_phone: string;
    lat?: number;
    lng?: number;
  };
}

interface Alert {
  id: string;
  route_id: string;
  message: string;
  severity: string;
  status: string;
  created_at: string;
}

export default function MonitoreoPage() {
  const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const { data: routesData, error: routesError } = await (supabase as any)
        .from('routes')
        .select('*')
        .in('status', ['in_progress', 'assigned'])
        .order('start_time_actual', { ascending: false });

      if (routesError) {
        console.error('Error rutas:', routesError);
      } else {
        const routesList = (routesData || []) as unknown as ActiveRoute[];
        const routeIds = routesList.map((route) => route.id);
        const vehicleIds = routesList.map((route) => route.vehicle_id).filter(Boolean);

        const [{ data: vehiclesData, error: vehiclesError }, { data: stopsData, error: stopsError }] = await Promise.all([
          vehicleIds.length > 0
            ? (supabase as any).from('vehicles').select('*').in('id', vehicleIds)
            : Promise.resolve({ data: [], error: null }),
          routeIds.length > 0
            ? (supabase as any).from('route_stops').select('*').in('route_id', routeIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        if (vehiclesError) {
          console.error('Error vehículos:', vehiclesError);
        }

        if (stopsError) {
          console.error('Error paradas:', stopsError);
        }

        const stopRows = (stopsData || []) as RouteStop[];
        const jobIds = stopRows.map((stop: any) => stop.job_id).filter(Boolean);
        const { data: jobsData, error: jobsError } = jobIds.length > 0
          ? await (supabase as any).from('delivery_jobs').select('*').in('id', jobIds)
          : { data: [], error: null };

        if (jobsError) {
          console.error('Error entregas:', jobsError);
        }

        const vehicleMap = new Map(((vehiclesData || []) as any[]).map((vehicle) => [vehicle.id, vehicle]));
        const jobsMap = new Map(((jobsData || []) as any[]).map((job) => [job.id, job]));
        const stopsByRoute = stopRows.reduce((acc: Record<string, RouteStop[]>, stop: any) => {
          const routeId = stop.route_id;
          if (!acc[routeId]) acc[routeId] = [];
          acc[routeId].push({
            ...stop,
            delivery_jobs: stop.job_id ? jobsMap.get(stop.job_id) : undefined,
          } as RouteStop);
          return acc;
        }, {});

        setActiveRoutes(routesList.map((route) => ({
          ...route,
          vehicles: route.vehicle_id ? vehicleMap.get(route.vehicle_id) : undefined,
          route_stops: stopsByRoute[route.id] || [],
        })) as unknown as ActiveRoute[]);
      }

      const { data: alertsData, error: alertsError } = await (supabase as any)
        .from('route_alerts')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!alertsError) setAlerts((alertsData || []) as unknown as Alert[]);

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    
    // Auto-refresh cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Suscripción en tiempo real a cambios de GPS
  useEffect(() => {
    const channel = supabase
      .channel('gps_updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'route_tracking_locations'
      }, (payload) => {
        console.log('GPS Update (route_tracking_locations):', payload);
        const { route_id, lat, lng, recorded_at, driver_name } = payload.new;
        if (!route_id || !lat || !lng) return;

        setActiveRoutes(prev => prev.map(route => {
          if (route.id === route_id) {
            return {
              ...route,
              vehicles: route.vehicles ? {
                ...route.vehicles,
                current_lat: Number(lat),
                current_lng: Number(lng),
                last_location_update: recorded_at || new Date().toISOString()
              } : {
                plate_number: 'Unidad',
                driver_name: driver_name || 'Motorizado',
                driver_phone: '',
                current_lat: Number(lat),
                current_lng: Number(lng),
                last_location_update: recorded_at || new Date().toISOString()
              }
            };
          }
          return route;
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markStopCompleted = async (stopId: string) => {
    try {
      await (supabase as any)
        .from('route_stops')
        .update({ 
          status: 'completed',
          departure_time: new Date().toISOString()
        })
        .eq('id', stopId);

      await fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const markStopArrived = async (stopId: string) => {
    try {
      await (supabase as any)
        .from('route_stops')
        .update({ 
          status: 'arrived',
          arrival_time: new Date().toISOString()
        })
        .eq('id', stopId);

      await fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const completeRoute = async (routeId: string) => {
    if (!confirm('¿Marcar esta ruta como completada?')) return;
    
    try {
      await (supabase as any)
        .from('routes')
        .update({ 
          status: 'completed',
          end_time_actual: new Date().toISOString()
        })
        .eq('id', routeId);

      await fetchData();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await (supabase as any)
        .from('route_alerts')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getStopStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'arrived': return '#f97316';
      case 'pending': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('es-NI', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getTimeSince = (dateStr: string) => {
    if (!dateStr) return '-';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    return `hace ${hours}h ${mins % 60}m`;
  };

  const highlightedRoute = activeRoutes.find((route) => route.id === selectedRoute) || activeRoutes[0];
  
  const mapMarkers = highlightedRoute
    ? [
        // Origen (bodega Solcom)
        {
          id: 'origin',
          lat: 12.136389,
          lng: -86.251389,
          label: 'Bodega Solcom',
          type: 'origin' as const
        },
        // Motorizado / Conductor
        ...(highlightedRoute.vehicles && Number.isFinite(highlightedRoute.vehicles.current_lat) && Number.isFinite(highlightedRoute.vehicles.current_lng)
          ? [{
              id: `${highlightedRoute.id}-vehicle`,
              lat: highlightedRoute.vehicles.current_lat,
              lng: highlightedRoute.vehicles.current_lng,
              label: highlightedRoute.vehicles.driver_name || 'Vehículo en ruta',
              type: 'driver' as const
            }]
          : []),
        // Paradas de la ruta
        ...((highlightedRoute.route_stops || [])
          .sort((a, b) => a.sequence_order - b.sequence_order)
          .map((stop: any, index: number) => {
            const job = stop.delivery_jobs;
            const lat = stop.lat || job?.lat;
            const lng = stop.lng || job?.lng;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return null;
            }
            return {
              id: stop.id,
              lat: Number(lat),
              lng: Number(lng),
              label: job?.customer_name || `Parada ${index + 1}`,
              type: 'stop' as const,
              sequence: stop.sequence_order || (index + 1)
            };
          })
          .filter(Boolean) as Array<{
            id: string;
            lat: number;
            lng: number;
            label: string;
            type: 'origin' | 'stop' | 'driver';
            sequence?: number;
          }>)
      ]
    : [];

  const previewTitle = highlightedRoute
    ? `Mapa operativo de ${highlightedRoute.name || 'ruta activa'}`
    : 'No hay rutas activas para visualizar';

  const previewDescription = highlightedRoute
    ? 'Este mapa operativo muestra la posición actual del vehículo si existe GPS y el orden de paradas registradas para la ruta seleccionada.'
    : 'Cuando exista una ruta en progreso, aquí verás su recorrido y la secuencia de entregas.';

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <RefreshCw size={32} className="animate-spin" color="#dc2626" />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Monitoreo en Vivo
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            Última actualización: {lastUpdate.toLocaleTimeString('es-NI')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: 8,
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              background: '#10b981',
              animation: 'pulse 2s infinite'
            }} />
            <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
              En Vivo
            </span>
          </div>
          <Button variant="ghost" onClick={fetchData}>
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}>
              <Truck size={20} color="#10b981" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{activeRoutes.length}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Rutas Activas</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 10, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8 }}>
              <Package size={20} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {activeRoutes.reduce((sum, r) => sum + (r.route_stops?.filter(s => s.status === 'pending').length || 0), 0)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Entregas Pendientes</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8 }}>
              <CheckCircle2 size={20} color="#10b981" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {activeRoutes.reduce((sum, r) => sum + (r.route_stops?.filter(s => s.status === 'completed').length || 0), 0)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Completadas Hoy</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>
              <AlertTriangle size={20} color="#ef4444" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{alerts.length}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Alertas Activas</div>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(0, 1.35fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Cómo leer el mapa del monitoreo</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                Aquí puedes ver un mapa operativo simplificado: la ubicación actual del vehículo cuando hay GPS y el orden real de las paradas de la ruta.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong>1.</strong> Elige una ruta con el botón <strong>Ver Paradas</strong> para enfocarte en ella.
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong>2.</strong> Si el vehículo envía GPS, aparecerá como punto azul en el recorrido.
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <strong>3.</strong> Las paradas completadas se distinguen del resto por su estado dentro del recorrido.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant="success">{activeRoutes.length} rutas activas</Badge>
              <Badge variant="warning">{alerts.length} alertas abiertas</Badge>
              <Badge variant="neutral">{selectedRoute ? 'Ruta enfocada' : 'Vista general'}</Badge>
            </div>
          </div>

          {highlightedRoute ? (
            <div style={{ height: 320, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <GoogleMapView
                markers={mapMarkers}
                polyline={highlightedRoute.encoded_polyline}
                height="100%"
              />
            </div>
          ) : (
            <div style={{
              height: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15,23,42,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center'
            }}>
              <Truck size={40} color="#6b7280" style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
                {previewTitle}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 300 }}>
                {previewDescription}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card style={{ padding: 20, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#ef4444' }}>
            ⚠️ Alertas Activas
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {alerts.map(alert => (
              <div key={alert.id} style={{
                padding: 12,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>{alert.message}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {getTimeSince(alert.created_at)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dismissAlert(alert.id)}>
                  <XCircle size={16} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Rutas activas */}
      {activeRoutes.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <Activity size={48} color="#6b7280" style={{ marginBottom: 16, opacity: 0.3 }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No hay rutas activas</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            Las rutas en progreso aparecerán aquí para monitoreo en tiempo real
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {activeRoutes.map(route => (
            <Card key={route.id} style={{ padding: 20 }}>
              {/* Header de ruta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>{route.name || 'Ruta sin nombre'}</h3>
                    <Badge variant="success">En Progreso</Badge>
                  </div>
                  {route.vehicles && (
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Truck size={14} /> {route.vehicles.plate_number}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} /> {route.vehicles.driver_name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={14} /> {route.vehicles.driver_phone}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRoute(
                    selectedRoute === route.id ? null : route.id
                  )}>
                    {selectedRoute === route.id ? 'Ocultar' : 'Ver Paradas'}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => completeRoute(route.id)}>
                    <CheckCircle2 size={14} style={{ marginRight: 6 }} />
                    Completar
                  </Button>
                </div>
              </div>

              {/* Progreso */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Progreso de entregas</span>
                  <span style={{ fontWeight: 600 }}>
                    {route.route_stops?.filter(s => s.status === 'completed').length || 0} / {route.route_stops?.length || 0}
                  </span>
                </div>
                <div style={{ 
                  height: 8, 
                  background: 'rgba(255,255,255,0.1)', 
                  borderRadius: 4,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${((route.route_stops?.filter(s => s.status === 'completed').length || 0) / (route.route_stops?.length || 1)) * 100}%`,
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                    borderRadius: 4,
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>

              {/* Info de ruta */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Inicio</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{formatTime(route.start_time_actual)}</div>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Distancia Total</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {route.total_distance_meters ? `${(route.total_distance_meters / 1000).toFixed(1)} km` : '-'}
                  </div>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Tiempo en Ruta</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{getTimeSince(route.start_time_actual)}</div>
                </div>
              </div>

              {/* Paradas (expandible) */}
              {selectedRoute === route.id && route.route_stops && (
                <div style={{ 
                  borderTop: '1px solid rgba(255,255,255,0.1)', 
                  paddingTop: 16,
                  display: 'grid',
                  gap: 8
                }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Paradas de la Ruta</h4>
                  {route.route_stops
                    .sort((a, b) => a.sequence_order - b.sequence_order)
                    .map((stop, idx) => (
                    <div key={stop.id} style={{
                      padding: 12,
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${getStopStatusColor(stop.status)}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ 
                          width: 28, 
                          height: 28, 
                          borderRadius: '50%', 
                          background: getStopStatusColor(stop.status),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700
                        }}>
                          {idx + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {stop.delivery_jobs?.customer_name || 'Cliente'}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            {stop.delivery_jobs?.address_text || 'Dirección'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge variant={
                          stop.status === 'completed' ? 'success' :
                          stop.status === 'arrived' ? 'warning' :
                          'neutral'
                        }>
                          {stop.status === 'completed' ? 'Completada' :
                           stop.status === 'arrived' ? 'En sitio' :
                           'Pendiente'}
                        </Badge>
                        {stop.status === 'pending' && (
                          <Button variant="ghost" size="sm" onClick={() => markStopArrived(stop.id)}>
                            <MapPin size={14} />
                          </Button>
                        )}
                        {stop.status === 'arrived' && (
                          <Button variant="primary" size="sm" onClick={() => markStopCompleted(stop.id)}>
                            <CheckCircle2 size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Instrucciones */}
      <Card style={{ padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>¿Cómo funciona el monitoreo?</h3>
        <div style={{ display: 'grid', gap: 12, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
          <p>
            <strong>1. Rutas Activas:</strong> Aquí aparecen las rutas que están en progreso. 
            Puedes ver el progreso de cada conductor y las entregas pendientes.
          </p>
          <p>
            <strong>2. Actualización en Tiempo Real:</strong> Los datos se actualizan automáticamente 
            cada 30 segundos. También puedes actualizar manualmente con el botón de refrescar.
          </p>
          <p>
            <strong>3. Marcar Entregas:</strong> Cuando un conductor llega a un punto, marca "En sitio". 
            Al completar la entrega, marca "Completada".
          </p>
          <p>
            <strong>4. Tracking GPS:</strong> Para habilitar tracking GPS en tiempo real, los conductores 
            deben usar la app móvil que envía su ubicación periódicamente.
          </p>
        </div>
      </Card>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
