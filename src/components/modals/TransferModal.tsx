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

  const [availableSerials, setAvailableSerials] = useState<any[]>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
      if (itemId && currentWarehouse) {
        fetchSerials();
      }
    } else {
      // Reset state on close
      setSerials('');
      setAvailableSerials([]);
    }
  }, [isOpen, itemId, currentWarehouse]);

  async function fetchSerials() {
    setLoadingSerials(true);
    try {
      const res = await fetch(`/api/zoho/item-serials?item_id=${itemId}&warehouse_id=${currentWarehouse}`);
      const data = await res.json();
      if (data.success && data.serials) {
        setAvailableSerials(data.serials);
      }
    } catch (e) {
      console.error('Error fetching serials:', e);
    } finally {
      setLoadingSerials(false);
    }
  }

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

    // Convert comma string to array for counting
    const selectedCount = serials ? serials.split(',').map(s => s.trim()).filter(Boolean).length : 0;

    // If the item has available serials tracked in Zoho, force them to select the exact amount
    if (availableSerials.length > 0 && selectedCount !== quantity) {
      setError(`Debes seleccionar exactamente ${quantity} serial(es). Has seleccionado ${selectedCount}.`);
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

  const selectedSerialsArray = serials ? serials.split(',').filter(Boolean) : [];

  function toggleSerial(serialCode: string) {
    let newSelected = [...selectedSerialsArray];
    if (newSelected.includes(serialCode)) {
      newSelected = newSelected.filter(s => s !== serialCode);
    } else {
      if (newSelected.length < quantity) {
        newSelected.push(serialCode);
      } else {
        // Optional user feedback or just ignore:
        // alert(`Ya seleccionaste ${quantity} seriales (la cantidad a transferir).`);
      }
    }
    setSerials(newSelected.join(','));
  }

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
              {availableSerials.length > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>
                      Seleccionar Seriales <span style={{ color: 'var(--brand-primary)', marginLeft: 4 }}>({selectedSerialsArray.length} / {quantity})</span>
                    </label>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 8,
                    maxHeight: '150px',
                    overflowY: 'auto',
                    padding: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--panel)'
                  }}>
                    {availableSerials.map((s) => {
                      const isSelected = selectedSerialsArray.includes(s.serial_code);
                      return (
                        <div
                          key={s.serial_code}
                          onClick={() => toggleSerial(s.serial_code)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            textAlign: 'center',
                            border: `1px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border)'}`,
                            background: isSelected ? 'var(--brand-primary)20' : 'var(--card)',
                            color: isSelected ? 'var(--brand-primary)' : 'var(--text)',
                            transition: 'all 0.2s'
                          }}
                        >
                          {s.serial_code}
                        </div>
                      )
                    })}
                  </div>
                  {selectedSerialsArray.length === quantity && quantity > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={14} /> Seriales completos
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ display: 'flex', fontSize: 13, fontWeight: 500, marginBottom: 6, alignItems: 'center', gap: 8 }}>
                    Seriales (si aplica)
                    {loadingSerials && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(Buscando seriales...)</span>}
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
                  {loadingSerials === false && itemId && currentWarehouse && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      Zoho no reporta seriales para este producto.
                    </p>
                  )}
                </div>
              )}

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
