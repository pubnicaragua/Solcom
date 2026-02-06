'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { X, Package } from 'lucide-react';

interface UpdateStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    name: string;
    sku: string;
    currentStock: number;
  } | null;
  warehouses: Array<{ id: string; code: string; name: string }>;
  onUpdate: (productId: string, warehouseId: string, newQty: number) => Promise<void>;
}

export default function UpdateStockModal({ isOpen, onClose, product, warehouses, onUpdate }: UpdateStockModalProps) {
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !product) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    
    setLoading(true);
    setError('');

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      setError('Cantidad inválida');
      setLoading(false);
      return;
    }

    if (!warehouseId) {
      setError('Selecciona una bodega');
      setLoading(false);
      return;
    }

    try {
      await onUpdate(product.id, warehouseId, qty);
      onClose();
      setQuantity('');
      setWarehouseId('');
    } catch (err: any) {
      setError(err.message || 'Error al actualizar stock');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: 500, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Actualizar Stock</h2>
              <button
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} color="var(--muted)" />
              </button>
            </div>

            <div style={{ marginBottom: 24, padding: 16, background: 'var(--panel)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Producto</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{product.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>SKU: {product.sku}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Stock actual: {product.currentStock}</div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Bodega
                  </label>
                  <Select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    options={[
                      { value: '', label: 'Selecciona una bodega' },
                      ...warehouses.map(w => ({ value: w.id, label: `${w.code} - ${w.name}` }))
                    ]}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Nueva Cantidad
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Ingresa la cantidad"
                    required
                  />
                </div>

                {error && (
                  <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 6, color: '#ef4444', fontSize: 13 }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    <Package size={16} style={{ marginRight: 6 }} />
                    {loading ? 'Actualizando...' : 'Actualizar'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
