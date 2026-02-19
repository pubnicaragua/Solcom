'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import KPIGrid from '@/components/dashboard/KPIGrid';
import PivotInventoryTable from '@/components/dashboard/PivotInventoryTable';
import TransferHistory from '@/components/dashboard/TransferHistory';
import EditProductModal from '@/components/modals/EditProductModal';
import UpdateStockModal from '@/components/modals/UpdateStockModal';
import TransferModal from '@/components/modals/TransferModal';
import ProductDetailsModal from '@/components/modals/ProductDetailsModal';
import { Search, Filter, Download, Upload, Trash2, Edit, RefreshCw, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';

export default function InventoryPage() {
  const [filters, setFilters] = useState({
    search: '',
    warehouse: '',
    category: '',
    state: '',
    stockLevel: '',
    priceRange: '',
    marca: '',
    color: '',
    sortBy: 'name',
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce search filter
  useEffect(() => {
    const normalizedSearch = searchTerm.trim();

    // Clear search immediately to restore pivot view faster.
    if (normalizedSearch === '') {
      setFilters(prev => (prev.search === '' ? prev : { ...prev, search: '' }));
      return;
    }

    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: normalizedSearch }));
    }, 220);

    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [transferProduct, setTransferProduct] = useState<any>(null);
  const [detailsProduct, setDetailsProduct] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  async function fetchWarehouses() {
    try {
      const response = await fetch('/api/warehouses');
      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
      }
    } catch (error) {
      // Error silencioso
    }
  }

  async function handleEditProduct(productId: string, updates: any) {
    try {
      const response = await fetch('/api/inventory/update-product', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, updates }),
      });

      if (response.ok) {
        alert('Producto actualizado correctamente');
        window.location.reload();
      } else {
        throw new Error('Error al actualizar producto');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Error al actualizar producto');
    }
  }

  async function handleUpdateStock(productId: string, warehouseId: string, newQty: number) {
    try {
      const response = await fetch('/api/inventory/update-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: newQty }),
      });

      if (response.ok) {
        alert('Stock actualizado correctamente');
        window.location.reload();
      } else {
        throw new Error('Error al actualizar stock');
      }
    } catch (error: any) {
      throw new Error(error.message || 'Error al actualizar stock');
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      search: '',
      warehouse: '',
      category: '',
      state: '',
      stockLevel: '',
      priceRange: '',
      marca: '',
      color: '',
      sortBy: 'name',
    });
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const params = new URLSearchParams(filters);
    params.append('format', format);
    window.open(`/api/inventory/export?${params}`, '_blank');
  }

  function handleBulkAction(action: string) {
    if (selectedItems.length === 0) {
      alert('Selecciona al menos un producto');
      return;
    }
    alert(`Acción "${action}" aplicada a ${selectedItems.length} productos`);
  }

  const activeFiltersCount = Object.values(filters).filter(v => v !== '' && v !== 'name').length;
  const warehouseOptions = [
    { value: '', label: 'Todas las bodegas' },
    ...warehouses.map((w) => ({
      value: w.id,
      label: `${w.code} - ${w.name}`,
    })),
  ];

  return (
    <div className="inv-page" style={{ display: 'grid', gap: 14 }}>
      <div className="inv-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="h-title">Inventario Completo</div>
          <div className="inv-subtitle" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Gestión avanzada de existencias por bodega
          </div>
        </div>
        <div className="inv-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => handleExport('excel')}>
            <FileSpreadsheet size={16} />
            <span className="btn-label">Excel</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('pdf')}>
            <FileText size={16} />
            <span className="btn-label">PDF</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx,.xls';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const formData = new FormData();
                  formData.append('file', file);
                  try {
                    const response = await fetch('/api/inventory/import', {
                      method: 'POST',
                      body: formData,
                    });
                    if (response.ok) {
                      alert('Archivo importado correctamente');
                      window.location.reload();
                    } else {
                      alert('Error al importar archivo. Verifica el formato.');
                    }
                  } catch (error) {
                    alert('Error de conexión. Intenta nuevamente.');
                  }
                }
              };
              input.click();
            }}
          >
            <Upload size={16} />
            <span className="btn-label">Importar</span>
          </Button>
        </div>
      </div>

      <KPIGrid />

      {/* Filtros Principales */}
      <Card>
        <div className="inv-filter-card" style={{ padding: 16 }}>
          <div className="inv-filter-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={18} color="var(--brand-primary)" />
              <h3 className="inv-filter-title" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Filtros</h3>
              {activeFiltersCount > 0 && (
                <Badge variant="success" size="sm">
                  {activeFiltersCount} filtros
                </Badge>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                {showAdvancedFilters ? 'Ocultar' : 'Mostrar'} filtros avanzados
              </Button>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpiar todo
                </Button>
              )}
            </div>
          </div>

          {/* Fila 1: Filtros Básicos */}
          <div className="inv-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: showAdvancedFilters ? 12 : 0 }}>
            <div className="inv-search-wrapper" style={{ position: 'relative', gridColumn: 'span 2' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: 10,
                  color: '#6B7280'
                }}
              />
              <Input
                placeholder="Buscar por nombre, SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>

            <Select
              options={warehouseOptions}
              value={filters.warehouse}
              onChange={(e) => handleFilterChange('warehouse', e.target.value)}
            />

            <Select
              options={[
                { value: '', label: 'Todas las categorías' },
                { value: 'computadora', label: 'Computadora' },
                { value: 'linea blanca', label: 'Linea Blanca' },
                { value: 'equipo celular', label: 'Equipo celular' },
                { value: 'audifonos', label: 'Audifonos' },
                { value: 'Reloj inteligente', label: 'Reloj inteligente' },
                { value: 'tablet', label: 'Tablet' },
                { value: 'control', label: 'Control' },
                { value: 'radio', label: 'Radio' },
                { value: 'consola', label: 'Consola' },
                { value: 'bocina', label: 'Bocina' },
                { value: 'accesorios', label: 'Accesorios' },
              ]}
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            />

            <Select
              options={[
                { value: '', label: 'Nivel de stock' },
                { value: 'out', label: 'Sin stock (0)' },
                { value: 'critical', label: 'Crítico (1-5)' },
                { value: 'low', label: 'Bajo (6-20)' },
                { value: 'medium', label: 'Medio (21-50)' },
                { value: 'high', label: 'Alto (50+)' },
              ]}
              value={filters.stockLevel}
              onChange={(e) => handleFilterChange('stockLevel', e.target.value)}
            />
          </div>

          {/* Fila 2: Filtros Avanzados */}
          {showAdvancedFilters && (
            <div className="inv-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <Select
                options={[
                  { value: '', label: 'Estado Físico' },
                  { value: 'NUEVO', label: 'Nuevo' },
                  { value: 'USADO', label: 'Usado' },
                ]}
                value={filters.state}
                onChange={(e) => handleFilterChange('state', e.target.value)}
              />

              <Select
                options={[
                  { value: '', label: 'Rango de precio' },
                  { value: '0-100', label: '$0 - $100' },
                  { value: '100-500', label: '$100 - $500' },
                  { value: '500-1000', label: '$500 - $1,000' },
                  { value: '1000-5000', label: '$1,000 - $5,000' },
                  { value: '5000+', label: '$5,000+' },
                ]}
                value={filters.priceRange}
                onChange={(e) => handleFilterChange('priceRange', e.target.value)}
              />

              <Select
                options={[
                  { value: '', label: 'Marca' },
                  { value: 'APPLE', label: 'Apple' },
                  { value: 'SAMSUNG', label: 'Samsung' },
                  { value: 'XIAOMI', label: 'Xiaomi' },
                  { value: 'HONOR', label: 'Honor' },
                  { value: 'REALME', label: 'Realme' },
                  { value: 'MOTOROLA', label: 'Motorola' },
                  { value: 'TECNO', label: 'Tecno' },
                  { value: 'INFINIX', label: 'Infinix' },
                ]}
                value={filters.marca}
                onChange={(e) => handleFilterChange('marca', e.target.value)}
              />

              <Select
                options={[
                  { value: '', label: 'Color' },
                  { value: 'negro', label: 'Negro' },
                  { value: 'blanco', label: 'Blanco' },
                  { value: 'gris', label: 'Gris' },
                  { value: 'azul', label: 'Azul' },
                  { value: 'rojo', label: 'Rojo' },
                  { value: 'verde', label: 'Verde' },
                ]}
                value={filters.color}
                onChange={(e) => handleFilterChange('color', e.target.value)}
              />

              <Select
                options={[
                  { value: 'name', label: 'Ordenar: Nombre A-Z' },
                  { value: 'name_desc', label: 'Ordenar: Nombre Z-A' },
                  { value: 'stock_asc', label: 'Ordenar: Stock ↑' },
                  { value: 'stock_desc', label: 'Ordenar: Stock ↓' },
                  { value: 'price_asc', label: 'Ordenar: Precio ↑' },
                  { value: 'price_desc', label: 'Ordenar: Precio ↓' },
                  { value: 'updated', label: 'Ordenar: Recientes' },
                ]}
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Acciones Masivas */}
      {selectedItems.length > 0 && (
        <Card>
          <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--brand-primary)10', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge variant="success" size="sm">
                {selectedItems.length} seleccionados
              </Badge>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Acciones masivas:
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction('Editar')}>
                <Edit size={16} />
                Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction('Actualizar stock')}>
                <RefreshCw size={16} />
                Actualizar stock
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction('Exportar')}>
                <Download size={16} />
                Exportar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleBulkAction('Eliminar')}>
                <Trash2 size={16} color="#ef4444" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <PivotInventoryTable filters={filters} />

      <Card>
        <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="h-title">Historial de Transferencias</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Movimientos recientes entre bodegas
            </div>
          </div>
          <BarChart3 size={18} color="var(--brand-primary)" />
        </div>
        <TransferHistory />
      </Card>

      <EditProductModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        product={selectedProduct}
        onSave={handleEditProduct}
      />

      <UpdateStockModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        product={selectedProduct}
        warehouses={warehouses}
        onUpdate={handleUpdateStock}
      />

      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        itemId={transferProduct?.itemId}
        itemName={transferProduct?.itemName}
        currentWarehouse={transferProduct?.currentWarehouse}
        currentWarehouseLabel={transferProduct?.currentWarehouseLabel}
      />

      <ProductDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        product={detailsProduct}
      />

      <style jsx>{`
        @media (max-width: 640px) {
          .inv-header {
            flex-direction: column;
            align-items: flex-start !important;
          }
          .inv-actions {
            width: 100%;
            justify-content: flex-start;
          }
          .inv-subtitle {
            font-size: 12px !important;
          }
          .btn-label {
            display: none;
          }
          .inv-search-wrapper {
            grid-column: span 1 !important;
          }
          .inv-filters-grid {
            grid-template-columns: 1fr !important;
          }
          .inv-filter-card {
            padding: 10px !important;
          }
          .inv-filter-header {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 6px !important;
          }
          .inv-filter-title {
            font-size: 13px !important;
          }
        }
        @media (min-width: 641px) and (max-width: 768px) {
          .inv-filters-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
