import { X, Package } from 'lucide-react';
import Button from '@/components/ui/Button';

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: {
    item_name: string;
    sku: string;
    brand?: string;
    category?: string;
    color?: string | null;
    state?: string | null;
    price?: number;
    stock_total?: number;
    warehouse_code?: string;
    warehouse_name?: string;
    qty?: number;
    synced_at?: string;
  };
}

export default function ProductDetailsModal({ isOpen, onClose, product }: ProductDetailsModalProps) {
  if (!isOpen || !product) return null;

  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat('es-NI', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return value;
    }
  };

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
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={20} color="var(--brand-primary)" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{product.item_name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{product.sku}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Marca</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.brand || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Categoría</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.category || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Color</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.color || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Estado</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.state || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Precio</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              ${product.price?.toLocaleString('es-NI', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Stock Total</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.stock_total ?? 0}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Bodega</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {product.warehouse_code || '—'} {product.warehouse_name ? `- ${product.warehouse_name}` : ''}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Stock Bodega</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{product.qty ?? 0}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Última actualización</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDateTime(product.synced_at)}</div>
          </div>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
