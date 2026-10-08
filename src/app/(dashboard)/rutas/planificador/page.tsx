'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Truck, RefreshCw, Package, Plus, MapPin, Clock, 
  Navigation, CheckCircle2, AlertTriangle, Zap, Route,
  User, Phone, Trash2, Play, Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import RouteKpiCard from '@/components/rutas/RouteKpiCard';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import RouteMapPreview from '@/components/rutas/RouteMapPreview';

interface Vehicle {
  id: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
  status: string;
}

interface DeliveryJob {
  id: string;
  customer_name: string;
  customer_phone: string;
  address_text: string;
  lat: number;
  lng: number;
  zone_id: string;
  status: string;
  priority: string;
  assigned_route_id: string | null;
}

interface RouteData {
  id: string;
  name: string;
  status: string;
  vehicle_id: string;
  vehicles?: Vehicle;
  total_distance_meters: number;
  total_duration_seconds: number;
  route_stops?: any[];
}

export default function PlanificadorPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<DeliveryJob[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: vData, error: vError } = await (supabase as any)
        .from('vehicles')
        .select('*')
        .eq('status', 'active');
      
      if (vError) {
        if (vError.message.includes('does not exist') || vError.message.includes('schema cache')) {
          throw new Error('Las tablas de rutas no existen. Ejecuta el script supabase_rutas_tables.sql en Supabase.');
        }
        throw new Error(`Error cargando vehículos: ${vError.message}`);
      }
      const vehiclesList = (vData || []) as unknown as Vehicle[];
      setVehicles(vehiclesList);

      const { data: jData, error: jError } = await (supabase as any)
        .from('delivery_jobs')
        .select('*')
        .in('status', ['pending', 'batched'])
        .is('assigned_route_id', null)
        .order('created_at', { ascending: false });
      
      if (jError) throw new Error(`Error cargando entregas: ${jError.message}`);
      setUnassignedJobs((jData || []) as unknown as DeliveryJob[]);

      const { data: rData, error: rError } = await (supabase as any)
        .from('routes')
        .select('*')
        .in('status', ['draft', 'optimizing', 'optimized', 'assigned'])
        .order('created_at', { ascending: false });
      
      if (rError) throw new Error(`Error cargando rutas: ${rError.message}`);

      const routesList = (rData || []) as unknown as RouteData[];
      const routeIds = routesList.map(route => route.id);

      let stopsByRoute: Record<string, any[]> = {};
      if (routeIds.length > 0) {
        const { data: stopsData, error: stopsError } = await (supabase as any)
          .from('route_stops')
          .select('*')
          .in('route_id', routeIds);

        if (stopsError) throw new Error(`Error cargando paradas: ${stopsError.message}`);

        const stopRows = stopsData || [];
        const stopJobIds = stopRows.map((stop: any) => stop.job_id).filter(Boolean);
        const { data: routeJobsData, error: routeJobsError } = stopJobIds.length > 0
          ? await (supabase as any).from('delivery_jobs').select('*').in('id', stopJobIds)
          : { data: [], error: null };

        if (routeJobsError) {
          throw new Error(`Error cargando entregas de rutas: ${routeJobsError.message}`);
        }

        const routeJobsMap = new Map(((routeJobsData || []) as any[]).map((job: any) => [job.id, job]));

        stopsByRoute = stopRows.reduce((acc: Record<string, any[]>, stop: any) => {
          if (!acc[stop.route_id]) acc[stop.route_id] = [];
          acc[stop.route_id].push({
            ...stop,
            delivery_jobs: stop.job_id ? routeJobsMap.get(stop.job_id) : undefined,
          });
          return acc;
        }, {});
      }

      const vehicleMap = new Map(vehiclesList.map(vehicle => [vehicle.id, vehicle]));

      setRoutes(routesList.map(route => ({
        ...route,
        vehicles: route.vehicle_id ? vehicleMap.get(route.vehicle_id) : undefined,
        route_stops: stopsByRoute[route.id] || []
      })));

    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs(prev => 
      prev.includes(jobId) 
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  };

  const createRoute = async () => {
    if (!selectedVehicle || selectedJobs.length === 0) {
      alert('Selecciona un vehículo y al menos una entrega');
      return;
    }

    try {
      // Crear la ruta
      const { data: route, error: routeError } = await (supabase as any)
        .from('routes')
        .insert({
          name: newRouteName || `Ruta ${new Date().toLocaleDateString('es-NI')}`,
          status: 'draft',
          vehicle_id: selectedVehicle
        })
        .select()
        .single();

      if (routeError) throw routeError;

      // Asignar las entregas a la ruta
      const { error: updateError } = await (supabase as any)
        .from('delivery_jobs')
        .update({ 
          assigned_route_id: route.id,
          status: 'batched'
        })
        .in('id', selectedJobs);

      if (updateError) throw updateError;

      // Crear las paradas
      const stops = selectedJobs.map((jobId, index) => ({
        route_id: route.id,
        job_id: jobId,
        sequence_order: index + 1,
        status: 'pending'
      }));

      const { error: stopsError } = await (supabase as any)
        .from('route_stops')
        .insert(stops);

      if (stopsError) throw stopsError;

      // Limpiar selección y recargar
      setSelectedJobs([]);
      setSelectedVehicle(null);
      setNewRouteName('');
      setShowCreateRoute(false);
      await fetchData();

    } catch (err: any) {
      console.error('Error creando ruta:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const optimizeRoute = async (routeId: string) => {
    setOptimizing(true);
    try {
      const { data: stops } = await (supabase as any)
        .from('route_stops')
        .select('*')
        .eq('route_id', routeId)
        .order('sequence_order');

      if (!stops || stops.length === 0) {
        alert('La ruta no tiene paradas');
        return;
      }

      const routeStops = stops as any[];
      const jobIds = routeStops.map((stop: any) => stop.job_id).filter(Boolean);
      const { data: jobsData, error: jobsError } = await (supabase as any)
        .from('delivery_jobs')
        .select('*')
        .in('id', jobIds);

      if (jobsError) {
        throw new Error(`Error cargando entregas de la ruta: ${jobsError.message}`);
      }

      const jobsMap = new Map<string, any>((jobsData || []).map((job: any) => [job.id, job]));

      const waypoints = routeStops
        .map((stop: any) => {
          const job = jobsMap.get(stop.job_id);
          return job
            ? {
                lat: job.lat,
                lng: job.lng,
                address: job.address_text
              }
            : null;
        })
        .filter(Boolean);

      if (waypoints.length === 0) {
        throw new Error('La ruta no tiene coordenadas válidas para optimizar');
      }

      const origin = { lat: 12.1364, lng: -86.2514 };
      const destination = origin;

      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          waypoints,
          vehicleType: 'truck'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error optimizando ruta');
      }

      const optimizedOrder = Array.isArray(result.route?.optimizedOrder)
        ? result.route.optimizedOrder
        : routeStops.map((_: any, index: number) => index);

      const reorderedStops = optimizedOrder
        .map((originalIndex: number) => routeStops[originalIndex])
        .filter(Boolean);

      if (reorderedStops.length === routeStops.length) {
        await Promise.all(
          reorderedStops.map((stop: any, index: number) =>
            (supabase as any)
              .from('route_stops')
              .update({ sequence_order: index + 1 })
              .eq('id', stop.id)
          )
        );
      }

      // Actualizar la ruta con los datos de optimización
      await (supabase as any)
        .from('routes')
        .update({
          status: 'optimized',
          total_distance_meters: result.route.distance,
          total_duration_seconds: parseInt(result.route.duration?.replace('s', '') || '0'),
          polyline: result.route.polyline,
          optimized_by: 'google_routes_api'
        })
        .eq('id', routeId);

      await fetchData();
      alert(`✅ Ruta optimizada: ${result.route.summary.totalDistance}, ${result.route.summary.totalDuration}`);

    } catch (err: any) {
      console.error('Error optimizando:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  const deleteRoute = async (routeId: string) => {
    if (!confirm('¿Eliminar esta ruta? Las entregas volverán a estar disponibles.')) return;

    try {
      // Liberar las entregas
      await (supabase as any)
        .from('delivery_jobs')
        .update({ assigned_route_id: null, status: 'pending' })
        .eq('assigned_route_id', routeId);

      // Eliminar paradas
      await (supabase as any).from('route_stops').delete().eq('route_id', routeId);

      // Eliminar ruta
      await (supabase as any).from('routes').delete().eq('id', routeId);

      await fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const startRoute = async (routeId: string) => {
    try {
      await (supabase as any)
        .from('routes')
        .update({ 
          status: 'in_progress',
          start_time_actual: new Date().toISOString()
        })
        .eq('id', routeId);

      await fetchData();
      alert('✅ Ruta iniciada. El conductor puede comenzar las entregas.');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const formatDistance = (meters: number) => {
    if (!meters) return '-';
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'normal': return '#3b82f6';
      default: return 'var(--muted)';
    }
  };

  const selectedJobsPreview = unassignedJobs.filter(job => selectedJobs.includes(job.id));
  const highlightedRoute = routes.find(route => route.status === 'optimized' || route.status === 'in_progress') || routes[0];
  const previewPoints = selectedJobsPreview.length > 0
    ? selectedJobsPreview
        .filter(job => Number.isFinite(job.lat) && Number.isFinite(job.lng))
        .map((job) => ({
          id: job.id,
          lat: job.lat,
          lng: job.lng,
          label: job.customer_name || 'Entrega',
          subtitle: job.address_text,
          type: 'stop' as const,
        }))
    : (highlightedRoute?.route_stops || [])
        .map((stop: any, index: number) => {
          const job = stop.delivery_jobs;
          if (!job || !Number.isFinite(job.lat) || !Number.isFinite(job.lng)) {
            return null;
          }

          return {
            id: stop.id || `${highlightedRoute?.id}-${index}`,
            lat: job.lat,
            lng: job.lng,
            label: job.customer_name || `Parada ${index + 1}`,
            subtitle: job.address_text,
            type: index === 0 ? 'start' as const : 'stop' as const,
            status: stop.status,
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          lat: number;
          lng: number;
          label: string;
          subtitle?: string;
          type?: 'vehicle' | 'start' | 'stop' | 'end';
          status?: string;
        }>;

  const previewTitle = selectedJobsPreview.length > 0
    ? `Vista previa de ${selectedJobsPreview.length} entregas seleccionadas`
    : highlightedRoute
      ? `Vista previa de ${highlightedRoute.name || 'ruta activa'}`
      : 'Todavía no hay una ruta para visualizar';

  const previewDescription = selectedJobsPreview.length > 0
    ? 'Los puntos marcados corresponden a las entregas que ya elegiste. Cuando crees la ruta y la optimices, este recorrido se convertirá en una ruta operativa.'
    : highlightedRoute
      ? 'Se muestra un esquema visual de las paradas registradas para ayudarte a entender el orden y la cobertura geográfica de la ruta.'
      : 'Empieza seleccionando entregas en la lista de la izquierda o creando una ruta nueva para ver la representación visual del recorrido.';

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <RefreshCw size={32} className="animate-spin" color="#dc2626" />
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ padding: 24, textAlign: 'center' }}>
        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Error de Base de Datos</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{error}</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          Ejecuta el script <code>supabase_rutas_tables.sql</code> en tu Supabase SQL Editor para crear las tablas necesarias.
        </p>
        <Button variant="primary" onClick={fetchData}>
          <RefreshCw size={16} style={{ marginRight: 8 }} />
          Reintentar
        </Button>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Planificador de Rutas
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Crea y optimiza rutas de entrega con Google Maps
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="primary" onClick={() => setShowCreateRoute(true)}>
            <Plus size={16} style={{ marginRight: 8 }} />
            Nueva Ruta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <RouteKpiCard icon={Package} label="Entregas Pendientes" value={unassignedJobs.length} tone="info" />
        <RouteKpiCard icon={Truck} label="Vehículos Activos" value={vehicles.length} tone="success" />
        <RouteKpiCard icon={Route} label="Rutas en Borrador" value={routes.filter(r => r.status === 'draft').length} tone="warning" />
        <RouteKpiCard icon={Navigation} label="Rutas Activas" value={routes.filter(r => r.status === 'in_progress').length} tone="violet" />
      </div>

      <Card style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(0, 1.35fr)', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Cómo armar y visualizar una ruta</h2>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                Este módulo ya puede mostrarte una representación visual del recorrido. No es un mapa satelital, pero sí una vista operativa de las paradas con su orden y cobertura.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <strong>1.</strong> Selecciona entregas desde la bandeja de la izquierda.
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <strong>2.</strong> Asigna un vehículo y crea la ruta.
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <strong>3.</strong> Usa el botón de optimización para calcular distancia, duración y secuencia recomendada.
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                <strong>4.</strong> Revisa a la derecha la vista previa del recorrido y luego inicia la ruta.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant="success">{selectedJobs.length} seleccionadas</Badge>
              <Badge variant="neutral">{routes.length} rutas creadas</Badge>
              <Badge variant="warning">{routes.filter(route => route.status === 'optimized').length} optimizadas</Badge>
            </div>
          </div>

          <RouteMapPreview
            points={previewPoints}
            emptyTitle={previewTitle}
            emptyDescription={previewDescription}
            height={320}
          />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Entregas sin asignar */}
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>
              Entregas Sin Asignar ({unassignedJobs.length})
            </h2>
            {selectedJobs.length > 0 && (
              <Badge variant="success">{selectedJobs.length} seleccionadas</Badge>
            )}
          </div>

          {unassignedJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <Package size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
              <p>No hay entregas pendientes</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
              {unassignedJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => toggleJobSelection(job.id)}
                  style={{
                    padding: 12,
                    background: selectedJobs.includes(job.id) 
                      ? 'rgba(220, 38, 38, 0.1)' 
                      : 'var(--surface-hover)',
                    border: selectedJobs.includes(job.id)
                      ? '1px solid rgba(220, 38, 38, 0.3)'
                      : '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{job.customer_name}</div>
                    <div style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: getPriorityColor(job.priority)
                    }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    <MapPin size={12} />
                    {job.address_text}
                  </div>
                  {job.zone_id && (
                    <Badge variant="neutral" style={{ marginTop: 8, fontSize: 10 }}>
                      {job.zone_id}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Rutas */}
        <Card style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Rutas ({routes.length})
          </h2>

          {routes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <Route size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
              <p>No hay rutas creadas</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Selecciona entregas y crea una ruta</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
              {routes.map(route => (
                <div
                  key={route.id}
                  style={{
                    padding: 16,
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                        {route.name || 'Ruta sin nombre'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge variant={
                          route.status === 'optimized' ? 'success' :
                          route.status === 'in_progress' ? 'warning' :
                          'neutral'
                        }>
                          {route.status === 'draft' ? 'Borrador' :
                           route.status === 'optimized' ? 'Optimizada' :
                           route.status === 'in_progress' ? 'En Progreso' :
                           route.status}
                        </Badge>
                        {route.vehicles && (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            🚛 {route.vehicles.plate_number}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {route.status === 'draft' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => optimizeRoute(route.id)}
                          disabled={optimizing}
                        >
                          <Zap size={14} color="#a855f7" />
                        </Button>
                      )}
                      {route.status === 'optimized' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => startRoute(route.id)}
                        >
                          <Play size={14} color="#10b981" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteRoute(route.id)}
                      >
                        <Trash2 size={14} color="#ef4444" />
                      </Button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
                    <div>
                      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Paradas</div>
                      <div style={{ fontWeight: 600 }}>{route.route_stops?.length || 0}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Distancia</div>
                      <div style={{ fontWeight: 600 }}>{formatDistance(route.total_distance_meters)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Duración</div>
                      <div style={{ fontWeight: 600 }}>{formatDuration(route.total_duration_seconds)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Vehículos */}
      <Card style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Flota de Vehículos ({vehicles.length})
        </h2>

        {vehicles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
            <Truck size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p>No hay vehículos registrados</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {vehicles.map(vehicle => (
              <div
                key={vehicle.id}
                style={{
                  padding: 16,
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Truck size={20} color="#10b981" />
                  <div style={{ fontWeight: 600 }}>{vehicle.plate_number}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                  <User size={14} />
                  {vehicle.driver_name || 'Sin conductor'}
                </div>
                {vehicle.driver_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    <Phone size={12} />
                    {vehicle.driver_phone}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal Crear Ruta */}
      {showCreateRoute && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--overlay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--panel-elevated)',
            padding: 32,
            borderRadius: 16,
            width: '100%',
            maxWidth: 500,
            border: '1px solid var(--border)'
          }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
              Crear Nueva Ruta
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                Nombre de la ruta (opcional)
              </label>
              <input
                type="text"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                placeholder="Ej: Ruta Managua Norte"
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                Vehículo asignado
              </label>
              <div style={{ display: 'grid', gap: 8 }}>
                {vehicles.map(v => (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVehicle(v.id)}
                    style={{
                      padding: 12,
                      background: selectedVehicle === v.id 
                        ? 'rgba(220, 38, 38, 0.1)' 
                        : 'var(--surface-hover)',
                      border: selectedVehicle === v.id
                        ? '1px solid rgba(220, 38, 38, 0.3)'
                        : '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12
                    }}
                  >
                    <Truck size={18} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{v.plate_number}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {v.driver_name || 'Sin conductor'}
                      </div>
                    </div>
                    {selectedVehicle === v.id && (
                      <CheckCircle2 size={18} color="#dc2626" style={{ marginLeft: 'auto' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                Entregas seleccionadas: <strong>{selectedJobs.length}</strong>
              </div>
              {selectedJobs.length === 0 && (
                <div style={{ 
                  padding: 12, 
                  background: 'rgba(249, 115, 22, 0.1)', 
                  borderRadius: 8,
                  border: '1px solid rgba(249, 115, 22, 0.2)',
                  fontSize: 13
                }}>
                  ⚠️ Selecciona entregas de la lista antes de crear la ruta
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setShowCreateRoute(false);
                  setNewRouteName('');
                  setSelectedVehicle(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                variant="primary"
                onClick={createRoute}
                disabled={!selectedVehicle || selectedJobs.length === 0}
              >
                Crear Ruta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
