'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface InventoryItem {
  id: string;
  item_name: string;
  color: string | null;
  state: string | null;
  sku: string;
  warehouse_code: string;
  warehouse_name: string;
  qty: number;
  price?: number;
  category?: string;
  supplier?: string;
  barcode?: string;
  min_stock?: number;
  max_stock?: number;
  synced_at: string;
}

interface InventoryTableProps {
  filters?: any;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export default function InventoryTable({ filters, onSelectionChange }: InventoryTableProps) {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  function handleSelectAll() {
    if (selectAll) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      setSelectedIds(data.map(item => item.id));
      setSelectAll(true);
    }
  }

  function handleSelectItem(id: string) {
    setSelectedIds(prev => {
      const newSelection = prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id];
      
      if (onSelectionChange) {
        onSelectionChange(newSelection);
      }
      
      return newSelection;
    });
  }

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedIds);
    }
  }, [selectedIds]);

  useEffect(() => {
    fetchInventory();
  }, [filters, page]);

  async function fetchInventory() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...filters,
      });

      const res = await fetch(`/api/inventory?${params}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setTotalPages(result.totalPages || 1);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (row: InventoryItem) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => handleSelectItem(row.id)}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      key: 'item_name',
      header: 'Producto',
      width: '20%',
      render: (row: InventoryItem) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>{row.item_name}</div>
          {row.color && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.color}</div>
          )}
          {row.barcode && (
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
              {row.barcode}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      width: '10%',
      render: (row: InventoryItem) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.sku}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      width: '10%',
      render: (row: InventoryItem) => (
        <Badge variant="neutral" size="sm">
          {row.category || 'Sin categoría'}
        </Badge>
      ),
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      width: '12%',
      render: (row: InventoryItem) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{row.warehouse_code}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.warehouse_name}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Stock',
      width: '8%',
      render: (row: InventoryItem) => {
        const stockLevel = row.qty === 0 ? 'out' : 
                          row.qty <= 5 ? 'critical' : 
                          row.qty <= 20 ? 'low' : 
                          row.qty <= 50 ? 'medium' : 'high';
        
        const color = stockLevel === 'out' ? '#ef4444' :
                     stockLevel === 'critical' ? '#f59e0b' :
                     stockLevel === 'low' ? '#eab308' :
                     stockLevel === 'medium' ? '#22c55e' : '#3b82f6';

        return (
          <div>
            <div style={{ fontWeight: 600, color, fontSize: 14 }}>{row.qty}</div>
            {row.min_stock && row.qty < row.min_stock && (
              <div style={{ fontSize: 10, color: '#ef4444' }}>
                Min: {row.min_stock}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'price',
      header: 'Precio',
      width: '10%',
      render: (row: InventoryItem) => (
        <div style={{ fontWeight: 500 }}>
          ${row.price?.toLocaleString('es-NI', { minimumFractionDigits: 2 }) || '0.00'}
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Estado',
      width: '8%',
      render: (row: InventoryItem) =>
        row.state ? (
          <Badge variant={row.state === 'nuevo' ? 'success' : 'warning'} size="sm">
            {row.state}
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm">N/A</Badge>
        ),
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      width: '10%',
      render: (row: InventoryItem) => (
        <div style={{ fontSize: 12 }}>{row.supplier || '-'}</div>
      ),
    },
    {
      key: 'synced_at',
      header: 'Última Actualización',
      width: '12%',
      render: (row: InventoryItem) => {
        try {
          return (
            <div>
              <div style={{ fontSize: 12 }}>
                {format(new Date(row.synced_at), 'dd/MM/yyyy', { locale: es })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {format(new Date(row.synced_at), 'HH:mm', { locale: es })}
              </div>
            </div>
          );
        } catch {
          return <div style={{ fontSize: 12 }}>{row.synced_at}</div>;
        }
      },
    },
  ];

  return (
    <Card padding={0}>
      <Table columns={columns} data={data} loading={loading} emptyMessage="No hay inventario disponible" />

      {!loading && data.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Página {page} de {totalPages}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
