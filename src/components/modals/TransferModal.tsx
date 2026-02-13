import { useState, useEffect } from 'react';
import { Package, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string;
  itemName?: string;
  currentWarehouse?: string;
  /** Nombre o código de la bodega de origen (para mostrar aunque la lista aún no cargue) */
  currentWarehouseLabel?: string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  stock?: number;
}

export default function TransferModal({
  isOpen,
  onClose,
  itemId,
  itemName,
  currentWarehouse,
  currentWarehouseLabel
}: TransferModalProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [serials, setSerials] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
    }
  }, [isOpen]);

  async function fetchWarehouses() {
    try {
      const response = await fetch('/api/warehouses');
      const data = await response.json();

      setWarehouses(data || []);
    } catch (err: any) {
      setError('Error al cargar bodegas');
    }
  }

  async function handleTransfer() {
    if (!itemId || !selectedWarehouse || quantity <= 0) {
      setError('Por favor complete todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/inventory/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          from_warehouse_id: currentWarehouse,
          to_warehouse_id: selectedWarehouse,
          quantity,
          serial_number_value: serials,
          reason: reason || 'Transferencia manual'
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          // Recargar página o actualizar datos
          window.location.reload();
        }, 2000);
      } else {
        const detailSuffix = result?.details ? ` (${result.details})` : '';
        setError(`${result.error || 'Error en transferencia'}${detailSuffix}`);
      }
    } catch (err: any) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const availableWarehouses = warehouses.filter((w: any) => w.id !== currentWarehouse && w.active);
  const originWarehouse = warehouses.find((w) => w.id === currentWarehouse);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--card)',
        borderRadius: 12,
        width: '90%',
        maxWidth: 500,
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Package size={24} color="var(--brand-primary)" />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                Transferir Producto
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
                {itemName}
              </p>
            </div>
          </div>

          {success ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '40px 20px',
              textAlign: 'center'
            }}>
              <CheckCircle size={48} color="var(--success)" style={{ marginBottom: 16 }} />
              <h3 style={{ margin: 0, color: 'var(--success)' }}>¡Transferencia Creada!</h3>
              <p style={{ margin: '8px 0 0 0', color: 'var(--muted)' }}>
                En tránsito hacia {warehouses.find(w => w.id === selectedWarehouse)?.name}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Bodega Origen */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Bodega Origen
                </label>
                <div style={{
                  padding: 12,
                  background: 'var(--panel)',
                  borderRadius: 6,
                  fontSize: 14,
                  color: 'var(--text)'
                }}>
                  {currentWarehouseLabel || originWarehouse?.name || originWarehouse?.code || 'Bodega actual'}
                </div>
              </div>

              {/* Flecha */}
              <div style={{ textAlign: 'center' }}>
                <ArrowRight size={20} color="var(--muted)" />
              </div>

              {/* Bodega Destino */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Bodega Destino
                </label>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'var(--card)',
                    color: 'var(--text)'
                  }}
                >
                  <option value="">Seleccionar bodega...</option>
                  {availableWarehouses.map(warehouse => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} {warehouse.stock ? `(Stock: ${warehouse.stock})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cantidad */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'var(--card)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              {/* Seriales */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Seriales (si aplica)
                </label>
                <input
                  type="text"
                  value={serials}
                  onChange={(e) => setSerials(e.target.value)}
                  placeholder="SN1,SN2,..."
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'var(--card)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              {/* Razón */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Razón (opcional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo de la transferencia..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    background: 'var(--card)',
                    color: 'var(--text)',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: 12,
                  background: 'var(--danger)15',
                  border: '1px solid var(--danger)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <AlertCircle size={16} color="var(--danger)" />
                  <span style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</span>
                </div>
              )}

              {/* Botones */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button
                  variant="secondary"
                  onClick={onClose}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={handleTransfer}
                  disabled={loading || !selectedWarehouse || quantity <= 0}
                  style={{ flex: 1 }}
                >
                  Transferir
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
