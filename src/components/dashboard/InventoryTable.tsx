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
      width: '18%',
      render: (row: InventoryItem) => (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{row.item_name}</div>
          {row.color && (
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
              🎨 {row.color}
            </div>
          )}
          {row.barcode && (
            <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace', background: '#F3F4F6', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
              {row.barcode}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      width: '9%',
      render: (row: InventoryItem) => (
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: '#374151' }}>{row.sku}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      width: '11%',
      render: (row: InventoryItem) => {
        const categoryColors: Record<string, string> = {
          'Celular': '#3B82F6',
          'Laptop': '#8B5CF6',
          'TV': '#EC4899',
          'Tablet': '#F59E0B',
          'Monitor': '#10B981',
          'Accesorio': '#6B7280'
        };
        const category = row.category || 'Sin categoría';
        const bgColor = categoryColors[category] || '#6B7280';
        
        return (
          <div style={{ 
            background: `${bgColor}15`, 
            color: bgColor,
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-block',
            border: `1px solid ${bgColor}30`
          }}>
            {category}
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      width: '13%',
      render: (row: InventoryItem) => (
        <div style={{ 
          background: '#F9FAFB',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid #E5E7EB'
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1F2937', marginBottom: 2 }}>
            📦 {row.warehouse_code}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280' }}>{row.warehouse_name}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Stock Disponible',
      width: '10%',
      render: (row: InventoryItem) => {
        const stockLevel = row.qty === 0 ? 'out' : 
                          row.qty <= 5 ? 'critical' : 
                          row.qty <= 20 ? 'low' : 
                          row.qty <= 50 ? 'medium' : 'high';
        
        const color = stockLevel === 'out' ? '#DC2626' :
                     stockLevel === 'critical' ? '#EA580C' :
                     stockLevel === 'low' ? '#EAB308' :
                     stockLevel === 'medium' ? '#16A34A' : '#2563EB';
        
        const bgColor = stockLevel === 'out' ? '#FEE2E2' :
                       stockLevel === 'critical' ? '#FFEDD5' :
                       stockLevel === 'low' ? '#FEF3C7' :
                       stockLevel === 'medium' ? '#DCFCE7' : '#DBEAFE';

        return (
          <div>
            <div style={{ 
              fontWeight: 700, 
              color, 
              fontSize: 16,
              background: bgColor,
              padding: '4px 8px',
              borderRadius: 6,
              display: 'inline-block',
              marginBottom: 4
            }}>
              {row.qty} unidades
            </div>
            {row.min_stock && row.qty < row.min_stock && (
              <div style={{ 
                fontSize: 10, 
                color: '#DC2626',
                background: '#FEE2E2',
                padding: '2px 6px',
                borderRadius: 4,
                display: 'inline-block',
                marginTop: 2
              }}>
                ⚠️ Bajo mínimo ({row.min_stock})
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'price',
      header: 'Precio Venta',
      width: '10%',
      render: (row: InventoryItem) => (
        <div style={{ 
          fontWeight: 600,
          fontSize: 14,
          color: '#059669'
        }}>
          ${row.price?.toLocaleString('es-NI', { minimumFractionDigits: 2 }) || '0.00'}
        </div>
      ),
    },
    {
      key: 'cost',
      header: 'Costo',
      width: '9%',
      render: (row: InventoryItem) => (
        <div style={{ 
          fontWeight: 600,
          fontSize: 13,
          color: '#DC2626',
          background: '#FEF2F2',
          padding: '4px 8px',
          borderRadius: 6,
          display: 'inline-block'
        }}>
          🔒 Restringido
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Condición',
      width: '9%',
      render: (row: InventoryItem) => {
        const state = row.state?.toLowerCase() || 'n/a';
        const isNew = state === 'nuevo';
        return (
          <div style={{
            background: isNew ? '#DCFCE7' : '#FEF3C7',
            color: isNew ? '#166534' : '#854D0E',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-block',
            border: `1px solid ${isNew ? '#BBF7D0' : '#FDE68A'}`
          }}>
            {isNew ? '✨ Nuevo' : state === 'usado' ? '♻️ Usado' : 'N/A'}
          </div>
        );
      },
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
