'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Package, Truck, MapPin, Search, Filter, Plus, 
  CheckSquare, Square, AlertCircle, Navigation, Clock,
  RefreshCw, Send, Copy
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import CreateRouteModal from '@/components/rutas/CreateRouteModal';
import GoogleMapView from '@/components/rutas/GoogleMapView';
import RouteDetailPanel from '@/components/rutas/RouteDetailPanel';

interface DeliveryJob {
  id: string;
  sales_order_id: string;
  customer_name: string;
  customer_phone: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  zone_id: string;
  priority: string;
  status: string;
  weight: number;
  geocoded: boolean;
  geocoding_failed: boolean;
  created_at: string;
  metadata?: {
    pick_order_id?: string;
    sales_order_id?: string;
    pick_status?: string;
    pick_priority?: string;
    delivery_method?: string;
    sync_source?: string;
  } | null;
}

interface Route {
  id: string;
  name: string;
  status: string;
  driver_name: string;
  driver_phone: string;
  vehicle_label: string;
  tracking_enabled: boolean;
  tracking_token: string;
  total_distance_meters: number;
  total_duration_seconds: number;
  encoded_polyline: string;
  created_at: string;
  route_stops?: RouteStop[];
}

interface RouteStop {
  id: string;
  route_id: string;
  job_id: string;
  client_name: string;
  address: string;
  lat: number;
  lng: number;
  original_sequence: number;
  optimized_sequence: number;
  status: string;
}

export default function CentroRutasPage() {
  // Estado de pedidos
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  // Estado de rutas
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  
  // Estado de UI
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Estadísticas
  const [stats, setStats] = useState({
    pendingJobs: 0,
    activeRoutes: 0,
    trackingDrivers: 0,
    jobsWithoutCoords: 0
  });

  const fetchJobs = useCallback(async () => {
    try {
      let query = (supabase as any)
        .from('delivery_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('Error cargando pedidos:', error);
        return;
      }

      setJobs(data || []);
      
      // Calcular estadísticas
      const withoutCoords = (data || []).filter((j: DeliveryJob) => !j.lat || !j.lng).length;
      setStats(prev => ({
        ...prev,
        pendingJobs: (data || []).length,
        jobsWithoutCoords: withoutCoords
      }));
    } catch (err) {
      console.error('Error:', err);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('routes')
        .select('*, route_stops(*)')
        .in('status', ['draft', 'optimized', 'assigned', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando rutas:', error);
        return;
      }

      setRoutes(data || []);
      
      const activeCount = (data || []).filter((r: Route) => 
        r.status === 'in_progress' || r.status === 'assigned'
      ).length;
      
      const trackingCount = (data || []).filter((r: Route) => 
        r.tracking_enabled
      ).length;
      
      setStats(prev => ({
        ...prev,
        activeRoutes: activeCount,
        trackingDrivers: trackingCount
      }));
    } catch (err) {
      console.error('Error:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchRoutes()]);
      setLoading(false);
    };
    
    loadData();
  }, [fetchJobs, fetchRoutes]);

  const toggleJobSelection = (jobId: string) => {
    const newSelection = new Set(selectedJobs);
    if (newSelection.has(jobId)) {
      newSelection.delete(jobId);
    } else {
      newSelection.add(jobId);
    }
    setSelectedJobs(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === filteredJobs.length && filteredJobs.length > 0) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(filteredJobs.map(j => j.id)));
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = 
      job.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.sales_order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.address_text.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesZone = !zoneFilter || job.zone_id === zoneFilter;
    const matchesPriority = !priorityFilter || job.priority === priorityFilter;
    
    let matchesType = true;
    if (typeFilter === 'libre') {
      matchesType = job.metadata?.delivery_method === 'libre';
    } else if (typeFilter === 'ready_picking') {
      matchesType = job.metadata?.pick_status === 'ready' || job.metadata?.pick_status === 'completed_floor';
    }
    
    return matchesSearch && matchesZone && matchesPriority && matchesType;
  });

  const zones = Array.from(new Set(jobs.map(j => j.zone_id).filter(Boolean)));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'normal': return '#3b82f6';
      default: return '#94a3b8';
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 140px)',
      gap: 16 
    }}>
      {/* Header con estadísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              padding: 12, 
              background: 'rgba(59,130,246,0.1)', 
              borderRadius: 8 
            }}>
              <Package size={20} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>
                {stats.pendingJobs}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Pedidos Pendientes
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              padding: 12, 
              background: 'rgba(34,197,94,0.1)', 
              borderRadius: 8 
            }}>
              <Truck size={20} color="#22c55e" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>
                {stats.activeRoutes}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Rutas Activas
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              padding: 12, 
              background: 'rgba(168,85,247,0.1)', 
              borderRadius: 8 
            }}>
              <Navigation size={20} color="#a855f7" />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>
                {stats.trackingDrivers}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                En Seguimiento
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              padding: 12, 
              background: stats.jobsWithoutCoords > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)', 
              borderRadius: 8 
            }}>
              <AlertCircle size={20} color={stats.jobsWithoutCoords > 0 ? '#ef4444' : '#64748b'} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>
                {stats.jobsWithoutCoords}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Sin Coordenadas
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Contenedor principal de 3 columnas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '400px 1fr 350px', 
        gap: 16, 
        flex: 1,
        minHeight: 0
      }}>
        
        {/* COLUMNA IZQUIERDA: Pedidos Pendientes */}
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ 
            padding: 16, 
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(15,23,42,0.5)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12
            }}>
              <h3 style={{ 
                fontSize: 14, 
                fontWeight: 700, 
                color: '#f8fafc',
                margin: 0
              }}>
                Pedidos Pendientes
              </h3>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => fetchJobs()}
              >
                <RefreshCw size={14} />
              </Button>
            </div>

            {/* Buscador */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ 
                position: 'absolute', 
                left: 10, 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#64748b' 
              }} />
              <input
                type="text"
                placeholder="Buscar pedido, cliente o dirección..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 12,
                  outline: 'none'
                }}
              />
            </div>

            {/* Filtros */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                style={{
                  padding: '6px 8px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 11,
                  outline: 'none'
                }}
              >
                <option value="">Todas las zonas</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{
                  padding: '6px 8px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 11,
                  outline: 'none'
                }}
              >
                <option value="">Todas las prioridades</option>
                <option value="urgent">Urgente</option>
                <option value="high">Alta</option>
                <option value="normal">Normal</option>
                <option value="low">Baja</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 11,
                  outline: 'none'
                }}
              >
                <option value="">Todos los alistamientos</option>
                <option value="libre">Solo Tipo Libre</option>
                <option value="ready_picking">Solo Listos en Bodega</option>
              </select>
            </div>

            {/* Selección */}
            {selectedJobs.size > 0 && (
              <div style={{
                marginTop: 12,
                padding: 8,
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>
                  {selectedJobs.size} seleccionado{selectedJobs.size !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowCreateModal(true)}
                  style={{ gap: 6 }}
                >
                  <Plus size={14} />
                  Crear Ruta
                </Button>
              </div>
            )}
          </div>

          {/* Lista de pedidos */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {loading ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                height: '100%',
                color: '#64748b'
              }}>
                <RefreshCw size={20} className="animate-spin" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: 40,
                color: '#64748b'
              }}>
                <Package size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13 }}>No hay pedidos pendientes</div>
              </div>
            ) : (
              <>
                {/* Seleccionar todos */}
                <div 
                  onClick={toggleSelectAll}
                  style={{
                    padding: 10,
                    marginBottom: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  {selectedJobs.size === filteredJobs.length && filteredJobs.length > 0 ? (
                    <CheckSquare size={16} color="#3b82f6" />
                  ) : (
                    <Square size={16} color="#64748b" />
                  )}
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                    Seleccionar todos ({filteredJobs.length})
                  </span>
                </div>

                {/* Pedidos */}
                {filteredJobs.map(job => {
                  const isSelected = selectedJobs.has(job.id);
                  const hasCoords = job.lat && job.lng;
                  
                  return (
                    <div
                      key={job.id}
                      onClick={() => toggleJobSelection(job.id)}
                      style={{
                        padding: 12,
                        marginBottom: 8,
                        background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ paddingTop: 2 }}>
                          {isSelected ? (
                            <CheckSquare size={18} color="#3b82f6" />
                          ) : (
                            <Square size={18} color="#64748b" />
                          )}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: 6
                          }}>
                            <div style={{ 
                              fontSize: 12, 
                              fontWeight: 700, 
                              color: '#f8fafc',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1
                            }}>
                              {job.customer_name}
                            </div>
                            <div style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: getPriorityColor(job.priority),
                              marginLeft: 8,
                              flexShrink: 0
                            }} />
                          </div>

                          <div style={{ 
                            fontSize: 11, 
                            color: '#94a3b8',
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {job.sales_order_id || 'Sin orden'}
                          </div>

                          <div style={{ 
                            fontSize: 11, 
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 4,
                            marginBottom: 6
                          }}>
                            <MapPin size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span style={{ 
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {job.address_text}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {job.zone_id && (
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 4,
                                color: '#94a3b8'
                              }}>
                                {job.zone_id}
                              </span>
                            )}
                            
                            {job.metadata?.pick_status && (
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                background: job.metadata.pick_status === 'ready' || job.metadata.pick_status === 'completed_floor' || job.metadata.pick_status === 'completed_dispatch'
                                  ? 'rgba(34,197,94,0.15)'
                                  : job.metadata.pick_status === 'picking' || job.metadata.pick_status === 'claimed'
                                  ? 'rgba(245,158,11,0.15)'
                                  : 'rgba(148,163,184,0.15)',
                                border: `1px solid ${
                                  job.metadata.pick_status === 'ready' || job.metadata.pick_status === 'completed_floor' || job.metadata.pick_status === 'completed_dispatch'
                                    ? 'rgba(34,197,94,0.4)'
                                    : job.metadata.pick_status === 'picking' || job.metadata.pick_status === 'claimed'
                                    ? 'rgba(245,158,11,0.4)'
                                    : 'rgba(148,163,184,0.4)'
                                }`,
                                borderRadius: 4,
                                color: job.metadata.pick_status === 'ready' || job.metadata.pick_status === 'completed_floor' || job.metadata.pick_status === 'completed_dispatch'
                                  ? '#4ade80'
                                  : job.metadata.pick_status === 'picking' || job.metadata.pick_status === 'claimed'
                                  ? '#fbbf24'
                                  : '#94a3b8'
                              }}>
                                Alistamiento: {
                                  job.metadata.pick_status === 'queued' ? 'En Cola' :
                                  job.metadata.pick_status === 'claimed' ? 'Asignado' :
                                  job.metadata.pick_status === 'picking' ? 'Preparando' :
                                  job.metadata.pick_status === 'ready' ? 'Listo' :
                                  job.metadata.pick_status === 'completed_floor' ? 'Listo en Piso' :
                                  job.metadata.pick_status === 'completed_dispatch' ? 'Despachado' :
                                  job.metadata.pick_status === 'cancelled' ? 'Cancelado' : job.metadata.pick_status
                                }
                              </span>
                            )}

                            {job.metadata?.delivery_method === 'libre' && (
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                background: 'rgba(168,85,247,0.15)',
                                border: '1px solid rgba(168,85,247,0.4)',
                                borderRadius: 4,
                                color: '#c084fc',
                                fontWeight: 600
                              }}>
                                Libre
                              </span>
                            )}
                            
                            {!hasCoords && (
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: 4,
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <AlertCircle size={10} />
                                Sin coordenadas
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </Card>

        {/* COLUMNA CENTRO: Mapa de Google Maps */}
        <Card style={{ 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}>
          <GoogleMapView
            markers={[
              // Origen (bodega Solcom)
              {
                id: 'origin',
                lat: 12.136389,
                lng: -86.251389,
                label: 'Bodega Solcom',
                type: 'origin'
              },
              // Pedidos seleccionados
              ...jobs
                .filter(j => selectedJobs.has(j.id) && j.lat && j.lng)
                .map((job, index) => ({
                  id: job.id,
                  lat: job.lat!,
                  lng: job.lng!,
                  label: job.customer_name,
                  type: 'stop' as const,
                  sequence: index + 1
                })),
              // Paradas de la ruta seleccionada
              ...(selectedRoute?.route_stops || [])
                .filter(stop => stop.lat && stop.lng)
                .map(stop => ({
                  id: stop.id,
                  lat: stop.lat!,
                  lng: stop.lng!,
                  label: stop.client_name,
                  type: 'stop' as const,
                  sequence: stop.optimized_sequence || stop.original_sequence
                }))
            ]}
            polyline={selectedRoute?.encoded_polyline}
            height="100%"
          />
        </Card>

        {/* COLUMNA DERECHA: Ruta en construcción o activa */}
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedRoute ? (
            <RouteDetailPanel 
              route={selectedRoute} 
              onOptimized={() => {
                fetchRoutes();
                // Recargar la ruta seleccionada
                const updatedRoute = routes.find(r => r.id === selectedRoute.id);
                if (updatedRoute) setSelectedRoute(updatedRoute);
              }}
            />
          ) : (
            <>
              <div style={{ 
                padding: 16, 
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(15,23,42,0.5)'
              }}>
                <h3 style={{ 
                  fontSize: 14, 
                  fontWeight: 700, 
                  color: '#f8fafc',
                  margin: 0
                }}>
                  Rutas Recientes
                </h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {routes.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: 40,
                    color: '#64748b'
                  }}>
                    <Truck size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13 }}>No hay rutas creadas</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Seleccioná pedidos y creá tu primera ruta
                    </div>
                  </div>
                ) : (
                  routes.map(route => (
                    <div
                      key={route.id}
                      onClick={() => setSelectedRoute(route)}
                      style={{
                        padding: 12,
                        marginBottom: 8,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(168,85,247,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                      }}
                    >
                      <div style={{ 
                        fontSize: 13, 
                        fontWeight: 700, 
                        color: '#f8fafc',
                        marginBottom: 6
                      }}>
                        {route.name}
                      </div>
                      
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                        {route.driver_name || 'Sin motorizado'}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: 4,
                          color: '#94a3b8'
                        }}>
                          {route.route_stops?.length || 0} paradas
                        </span>
                        
                        {route.tracking_enabled && (
                          <span style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            background: 'rgba(34,197,94,0.1)',
                            border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: 4,
                            color: '#22c55e'
                          }}>
                            En seguimiento
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Modal de creación */}
      {showCreateModal && (
        <CreateRouteModal
          selectedJobs={jobs.filter(j => selectedJobs.has(j.id))}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setSelectedJobs(new Set());
            fetchJobs();
            fetchRoutes();
          }}
        />
      )}
    </div>
  );
}
