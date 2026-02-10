'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Warehouse, Package, ArrowLeftRight, Info, X, ChevronDown } from 'lucide-react';

interface WarehouseQty {
  id: string;
  code: string;
  name: string;
  qty: number;
  active?: boolean;
}

interface InventoryItem {
  id: string;
  warehouse_id?: string | null;
  item_id: string;
  item_name: string;
  color: string | null;
  state: string | null;
  sku: string;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  qty?: number | null;
  brand?: string;
  stock_total?: number;
  price?: number;
  category?: string;
  supplier?: string;
  barcode?: string;
  min_stock?: number;
  max_stock?: number;
  synced_at?: string | null;
  grouped?: boolean;
  warehouse_count?: number;
}

interface InventoryTableProps {
  filters?: any;
  onSelectionChange?: (selectedIds: string[]) => void;
  onTransfer?: (row: InventoryItem) => void;
  /** Abre el modal de transferencia desde una bodega (al elegir "Transferir" desde el popover de bodegas) */
  onTransferFromWarehouse?: (itemId: string, itemName: string, warehouseId: string, warehouseLabel: string) => void;
  onViewDetails?: (row: InventoryItem) => void;
}

export default function InventoryTable({ filters, onSelectionChange, onTransfer, onTransferFromWarehouse, onViewDetails }: InventoryTableProps) {
  const [data, setData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [warehousePopover, setWarehousePopover] = useState<{
    itemId: string;
    itemName: string;
    warehouses: WarehouseQty[];
    loading: boolean;
  } | null>(null);

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

  // Suscripción a cambios en tiempo real de Supabase
  useEffect(() => {
    // Importar cliente de Supabase dinámicamente
    const setupRealtime = async () => {
      try {
        const { createClientComponentClient } = await import('@supabase/auth-helpers-nextjs');
        const supabase = createClientComponentClient();

        const channel = supabase
          .channel('items-changes')
          .on(
            'postgres_changes',
            {
              event: '*', // Escuchar INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'items',
            },
            (payload) => {
              console.log('Realtime update received:', payload);
              // Refrescar la lista cuando hay cambios
              fetchInventory();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (error) {
        console.error('Error setting up realtime:', error);
      }
    };

    const cleanup = setupRealtime();

    return () => {
      cleanup.then((unsubscribe) => unsubscribe?.());
    };
  }, []);

  async function openWarehousePopover(row: InventoryItem) {
    setWarehousePopover({ itemId: row.item_id, itemName: row.item_name, warehouses: [], loading: true });
    try {
      const res = await fetch(`/api/inventory/item/${row.item_id}/warehouses`);
      const json = res.ok ? await res.json() : {};
      setWarehousePopover((prev) =>
        prev ? { ...prev, warehouses: json.warehouses || [], loading: false } : null
      );
    } catch {
      setWarehousePopover((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }

  async function fetchInventory() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '50');
      params.set('group_by', 'item');
      if (filters && typeof filters === 'object') {
        Object.entries(filters).forEach(([key, value]) => {
          if (value != null && value !== '') {
            params.set(key, String(value));
          }
        });
      }

      const res = await fetch(`/api/inventory?${params.toString()}`);
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
        <div
          style={{ cursor: onViewDetails ? 'pointer' : 'default' }}
          onClick={() => onViewDetails?.(row)}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14, color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: 6 }}>
            {row.item_name}
            {onViewDetails && <Info size={14} color="#94A3B8" />}
          </div>
          {row.color && (
            <div style={{ fontSize: 11, color: '#F1F5F9', marginBottom: 2 }}>
              Color: {row.color}
            </div>
          )}
          {row.barcode && (
            <div style={{ fontSize: 10, color: '#CBD5E1', fontFamily: 'monospace', marginTop: 2 }}>
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
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{row.sku}</span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      width: '11%',
      render: (row: InventoryItem) => {
        const category = row.category || 'Sin categoría';

        return (
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#F1F5F9'
          }}>
            {category}
          </div>
        );
      },
    },
    {
      key: 'brand',
      header: 'Marca',
      width: '10%',
      render: (row: InventoryItem) => (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>
          {row.brand || '—'}
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      width: '10%',
      render: (row: InventoryItem) => {
        const isGrouped = row.grouped || row.warehouse_id == null;
        return (
          <button
            type="button"
            onClick={() => openWarehousePopover(row)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: '100%',
              display: 'block',
              padding: '4px 0',
            }}
            title="Ver stock en todas las bodegas"
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Warehouse size={14} />
              {isGrouped ? 'Ver bodegas' : row.warehouse_code}
              <ChevronDown size={12} style={{ opacity: 0.7 }} />
            </div>
            {!isGrouped && row.warehouse_name && (
              <div style={{ fontSize: 11, color: '#CBD5E1' }}>{row.warehouse_name}</div>
            )}
          </button>
        );
      },
    },
    {
      key: 'qty',
      header: 'Stock (Bodega)',
      width: '10%',
      render: (row: InventoryItem) => {
        if (row.grouped || row.qty == null) {
          const n = row.warehouse_count ?? 0;
          return (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {n === 0 ? '—' : `En ${n} bodega${n === 1 ? '' : 's'}`}
            </div>
          );
        }
        const qty = row.qty;
        const stockLevel = qty === 0 ? 'out' :
          qty <= 5 ? 'critical' :
            qty <= 20 ? 'low' :
              qty <= 50 ? 'medium' : 'high';

        const color = stockLevel === 'out' ? '#DC2626' :
          stockLevel === 'critical' ? '#EA580C' :
            stockLevel === 'low' ? '#D97706' :
              stockLevel === 'medium' ? '#059669' : '#2563EB';

        return (
          <div>
            <div style={{
              fontWeight: 600,
              color,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Package size={14} />
              {qty}
            </div>
          </div>
        );
      },
    },
    {
      key: 'stock_total',
      header: 'Stock Total',
      width: '10%',
      render: (row: InventoryItem) => (
        <div style={{
          fontWeight: 600,
          color: (row.stock_total || 0) > 0 ? '#F1F5F9' : '#DC2626',
          fontSize: 14
        }}>
          {row.stock_total || 0}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Precio Ref',
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
      key: 'state',
      header: 'Condición',
      width: '9%',
      render: (row: InventoryItem) => {
        const state = row.state?.toLowerCase() || 'n/a';
        const isNew = state === 'nuevo';
        return (
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: isNew ? '#059669' : '#D97706'
          }}>
            {isNew ? 'Nuevo' : state === 'usado' ? 'Usado' : 'N/A'}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      width: '10%',
      render: (row: InventoryItem) => {
        const isGrouped = row.grouped || row.warehouse_id == null;
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (isGrouped) {
                openWarehousePopover(row);
              } else {
                onTransfer?.(row);
              }
            }}
            disabled={isGrouped ? false : !onTransfer}
          >
            <ArrowLeftRight size={14} />
            Transferir
          </Button>
        );
      },
    },
  ];

  return (
    <>
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

      {/* Popover: stock del producto por bodega */}
      {warehousePopover && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setWarehousePopover(null)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: 12,
              padding: 20,
              maxWidth: 400,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Stock por bodega</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                  {warehousePopover.itemName?.slice(0, 50)}{warehousePopover.itemName && warehousePopover.itemName.length > 50 ? '…' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWarehousePopover(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)' }}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            {warehousePopover.loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>
            ) : warehousePopover.warehouses.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Sin datos por bodega</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {warehousePopover.warehouses.map((w) => (
                  <li
                    key={w.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid white',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Warehouse size={16} color="var(--muted)" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {w.name || w.code}
                          {!w.active && w.active !== undefined && (
                            <span style={{
                              fontSize: 10,
                              background: '#FCA5A5',
                              color: '#7F1D1D',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 700
                            }}>
                              INACTIVA
                            </span>
                          )}
                        </div>
                        {w.name && w.code !== w.name && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{w.code}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: w.qty < 0 ? '#DC2626' : 'var(--text)'
                      }}>
                        {w.qty} un.
                      </span>
                      {onTransferFromWarehouse && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onTransferFromWarehouse(
                              warehousePopover.itemId,
                              warehousePopover.itemName,
                              w.id,
                              w.name || w.code
                            );
                            setWarehousePopover(null);
                          }}
                        >
                          <ArrowLeftRight size={12} />
                          Transferir
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
