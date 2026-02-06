'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { X, Save } from 'lucide-react';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    name: string;
    sku: string;
    category: string | null;
    color: string | null;
    state: string | null;
  } | null;
  onSave: (productId: string, updates: any) => Promise<void>;
}

export default function EditProductModal({ isOpen, onClose, product, onSave }: EditProductModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    color: '',
    state: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        category: product.category || '',
        color: product.color || '',
        state: product.state || '',
      });
    }
  }, [product]);

  if (!isOpen || !product) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!product) {
        setError('Producto no encontrado');
        return;
      }
      await onSave(product.id, formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar producto');
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
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Editar Producto</h2>
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

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    SKU
                  </label>
                  <Input value={product.sku} disabled />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Nombre del Producto
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Categoría
                  </label>
                  <Select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    options={[
                      { value: '', label: 'Sin categoría' },
                      { value: 'Celular', label: 'Celular' },
                      { value: 'Laptop', label: 'Laptop' },
                      { value: 'Tablet', label: 'Tablet' },
                      { value: 'Monitor', label: 'Monitor' },
                      { value: 'TV', label: 'TV' },
                      { value: 'Accesorio', label: 'Accesorio' },
                    ]}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Color
                  </label>
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="Ej: Negro, Blanco, Azul"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Estado
                  </label>
                  <Select
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    options={[
                      { value: '', label: 'Sin estado' },
                      { value: 'Nuevo', label: 'Nuevo' },
                      { value: 'Usado', label: 'Usado' },
                      { value: 'Reacondicionado', label: 'Reacondicionado' },
                    ]}
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
                    <Save size={16} style={{ marginRight: 6 }} />
                    {loading ? 'Guardando...' : 'Guardar'}
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
