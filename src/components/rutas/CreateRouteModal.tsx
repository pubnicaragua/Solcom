'use client';

import { useState } from 'react';
import { X, AlertCircle, MapPin, User, Phone, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { supabase } from '@/lib/supabase/client';

interface DeliveryJob {
  id: string;
  sales_order_id: string;
  customer_name: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  zone_id: string;
  priority: string;
}

interface CreateRouteModalProps {
  selectedJobs: DeliveryJob[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateRouteModal({ selectedJobs, onClose, onSuccess }: CreateRouteModalProps) {
  const [formData, setFormData] = useState({
    name: `Ruta ${new Date().toLocaleDateString('es-NI')} - ${new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}`,
    driverName: '',
    driverPhone: '',
    vehicleLabel: '',
    originLat: 12.136389, // Bodega Solcom por defecto
    originLng: -86.251389,
    returnToOrigin: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const jobsWithoutCoords = selectedJobs.filter(j => !j.lat || !j.lng);
  const hasInvalidJobs = jobsWithoutCoords.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('El nombre de la ruta es requerido');
      return;
    }

    if (!formData.driverName.trim()) {
      setError('El nombre del motorizado es requerido');
      return;
    }

    if (!formData.driverPhone.trim()) {
      setError('El teléfono del motorizado es requerido');
      return;
    }

    if (hasInvalidJobs) {
      setError(`${jobsWithoutCoords.length} pedido${jobsWithoutCoords.length > 1 ? 's' : ''} no ${jobsWithoutCoords.length > 1 ? 'tienen' : 'tiene'} coordenadas. No se puede crear la ruta.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Generar tracking token único (32 caracteres)
      const generateToken = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
          token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
      };

      const trackingToken = generateToken();

      // Crear la ruta
      const { data: route, error: routeError } = await (supabase as any)
        .from('routes')
        .insert({
          name: formData.name,
          status: 'draft',
          driver_name: formData.driverName,
          driver_phone: formData.driverPhone,
          vehicle_label: formData.vehicleLabel || null,
          origin_lat: formData.originLat,
          origin_lng: formData.originLng,
          return_to_origin: formData.returnToOrigin,
          tracking_token: trackingToken,
          tracking_enabled: false
        })
        .select()
        .single();

      if (routeError) throw routeError;

      // Crear las paradas
      const stops = selectedJobs.map((job, index) => ({
        route_id: route.id,
        job_id: job.id,
        client_name: job.customer_name,
        address: job.address_text,
        lat: job.lat,
        lng: job.lng,
        original_sequence: index + 1,
        optimized_sequence: index + 1,
        sequence_order: index + 1,
        status: 'pending'
      }));

      const { error: stopsError } = await (supabase as any)
        .from('route_stops')
        .insert(stops);

      if (stopsError) throw stopsError;

      // Actualizar estado de los jobs
      const { error: updateError } = await (supabase as any)
        .from('delivery_jobs')
        .update({ 
          status: 'routed',
          assigned_route_id: route.id 
        })
        .in('id', selectedJobs.map(j => j.id));

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creando ruta:', err);
      setError(err instanceof Error ? err.message : 'Error al crear la ruta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
      <Card style={{ width: 600, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ 
            padding: 20, 
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 18, fontWeight: 700 }}>
              Crear Nueva Ruta
            </h3>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: 4
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: 20 }}>
            {/* Resumen de pedidos */}
            <div style={{
              padding: 12,
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8,
              marginBottom: 20
            }}>
              <div style={{ fontSize: 13, color: '#60a5fa', fontWeight: 600, marginBottom: 4 }}>
                {selectedJobs.length} pedido{selectedJobs.length !== 1 ? 's' : ''} seleccionado{selectedJobs.length !== 1 ? 's' : ''}
              </div>
              {hasInvalidJobs && (
                <div style={{
                  fontSize: 12,
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8
                }}>
                  <AlertCircle size={14} />
                  {jobsWithoutCoords.length} pedido{jobsWithoutCoords.length > 1 ? 's' : ''} sin coordenadas
                </div>
              )}
            </div>

            {/* Nombre de ruta */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                fontWeight: 600, 
                color: '#e2e8f0',
                marginBottom: 6
              }}>
                Nombre de la ruta *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Ruta Managua Norte - Mañana"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            {/* Motorizado */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                fontWeight: 600, 
                color: '#e2e8f0',
                marginBottom: 6
              }}>
                <User size={14} style={{ display: 'inline', marginRight: 4 }} />
                Nombre del motorizado *
              </label>
              <input
                type="text"
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                placeholder="Ej: Juan Pérez"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            {/* Teléfono */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                fontWeight: 600, 
                color: '#e2e8f0',
                marginBottom: 6
              }}>
                <Phone size={14} style={{ display: 'inline', marginRight: 4 }} />
                Teléfono del motorizado *
              </label>
              <input
                type="tel"
                value={formData.driverPhone}
                onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                placeholder="Ej: 8888-1234"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            {/* Vehículo (opcional) */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                fontWeight: 600, 
                color: '#e2e8f0',
                marginBottom: 6
              }}>
                <Truck size={14} style={{ display: 'inline', marginRight: 4 }} />
                Vehículo o placa (opcional)
              </label>
              <input
                type="text"
                value={formData.vehicleLabel}
                onChange={(e) => setFormData({ ...formData, vehicleLabel: e.target.value })}
                placeholder="Ej: M123-456 o Moto Roja"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.6)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            {/* Punto de salida */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                fontWeight: 600, 
                color: '#e2e8f0',
                marginBottom: 6
              }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} />
                Punto de salida
              </label>
              <div style={{
                padding: 10,
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                fontSize: 12,
                color: '#94a3b8'
              }}>
                Bodega Solcom (por defecto)
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {formData.originLat}, {formData.originLng}
                </div>
              </div>
            </div>

            {/* Regresa a bodega */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                color: '#e2e8f0'
              }}>
                <input
                  type="checkbox"
                  checked={formData.returnToOrigin}
                  onChange={(e) => setFormData({ ...formData, returnToOrigin: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                Regresar a bodega al finalizar
              </label>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: 12,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 12,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Botones */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button 
                type="button"
                variant="secondary" 
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                variant="primary"
                disabled={loading || hasInvalidJobs}
              >
                {loading ? 'Creando...' : 'Crear Ruta'}
              </Button>
            </div>

            {hasInvalidJobs && (
              <div style={{
                marginTop: 12,
                fontSize: 11,
                color: '#64748b',
                textAlign: 'center'
              }}>
                Completá las coordenadas de los pedidos antes de crear la ruta
              </div>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
