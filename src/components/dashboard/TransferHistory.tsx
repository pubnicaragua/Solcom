'use client';

import { useEffect, useState } from 'react';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TransferRow {
  id: string;
  item_name: string;
  sku: string;
  from_code: string;
  from_name: string;
  to_code: string;
  to_name: string;
  quantity: number;
  reason: string | null;
  status: string | null;
  created_at: string;
}

export default function TransferHistory() {
  const [data, setData] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransfers();
  }, []);

  async function fetchTransfers() {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/transfers');
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching transfers:', error);
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    {
      key: 'created_at',
      header: 'Fecha',
      width: '12%',
      render: (row: TransferRow) => {
        try {
          return (
            <div>
              <div style={{ fontSize: 12 }}>
                {format(new Date(row.created_at), 'dd/MM/yyyy', { locale: es })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {format(new Date(row.created_at), 'HH:mm', { locale: es })}
              </div>
            </div>
          );
        } catch {
          return <div style={{ fontSize: 12 }}>{row.created_at}</div>;
        }
      },
    },
    {
      key: 'item',
      header: 'Producto',
      width: '26%',
      render: (row: TransferRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9' }}>{row.item_name}</div>
          <div style={{ fontSize: 11, color: '#CBD5E1', fontFamily: 'monospace' }}>{row.sku}</div>
        </div>
      ),
    },
    {
      key: 'from_to',
      header: 'Movimiento',
      width: '20%',
      render: (row: TransferRow) => (
        <div style={{ fontSize: 12 }}>
          <div><strong>{row.from_code}</strong> → <strong>{row.to_code}</strong></div>
          <div style={{ color: 'var(--muted)' }}>{row.from_name} → {row.to_name}</div>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      width: '10%',
      render: (row: TransferRow) => (
        <div style={{ fontWeight: 600 }}>{row.quantity}</div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '10%',
      render: (row: TransferRow) => (
        <Badge variant={row.status === 'completed' ? 'success' : 'warning'} size="sm">
          {row.status || 'pendiente'}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      width: '22%',
      render: (row: TransferRow) => (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {row.reason || '—'}
        </div>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={data}
      loading={loading}
      emptyMessage="No hay transferencias registradas"
    />
  );
}
