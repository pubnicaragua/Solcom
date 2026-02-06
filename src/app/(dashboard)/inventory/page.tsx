'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import KPIGrid from '@/components/dashboard/KPIGrid';
import InventoryTable from '@/components/dashboard/InventoryTable';
import EditProductModal from '@/components/modals/EditProductModal';
import UpdateStockModal from '@/components/modals/UpdateStockModal';
import { Search, Filter, Download, Upload, Trash2, Edit, RefreshCw, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';

export default function InventoryPage() {
  const [filters, setFilters] = useState({
    search: '',
    warehouse: '',
    category: '',
    state: '',
    stockLevel: '',
    priceRange: '',
    supplier: '',
    sortBy: 'name',
  });
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
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
      supplier: '',
      sortBy: 'name',
    });
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    // Preparado para integración con Zoho Books API
    // Los datos se exportarán directamente desde Zoho Books cuando esté integrado
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

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="h-title">Inventario Completo</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Gestión avanzada de existencias por bodega
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => handleExport('excel')}>
            <FileSpreadsheet size={16} />
            Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('pdf')}>
            <FileText size={16} />
            PDF
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
            Importar
          </Button>

          <Button
            variant="primary"
            size="sm"
            style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
              color: 'white',
              border: 'none',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.3)';
            }}
            onClick={async () => {
              if (confirm('¿Deseas sincronizar el inventario desde Zoho Books?')) {
                try {
                  const response = await fetch('/api/zoho/books/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ force: true })
                  });
                  const data = await response.json();
                  if (response.ok) {
                    alert(`Sincronización exitosa: ${data.itemsProcessed} productos actualizados.`);
                    window.location.reload();
                  } else {
                    alert(`Error: ${data.error}`);
                  }
                } catch (error) {
                  alert('Error al conectar con el servidor.');
                }
              }
            }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            Sincronizar Books
          </Button>
        </div>
      </div>

      <KPIGrid />

      {/* Filtros Principales */}
      <Card>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={18} color="var(--brand-primary)" />
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Filtros de Búsqueda</h3>
              {activeFiltersCount > 0 && (
                <Badge variant="success" size="sm">
                  {activeFiltersCount} activos
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px 200px', gap: 12, marginBottom: showAdvancedFilters ? 12 : 0 }}>
            <div style={{ position: 'relative' }}>
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
                placeholder="Buscar por nombre, SKU, código de barras..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>

            <Select
              options={[
                { value: '', label: 'Todas las bodegas' },
                { value: 'X1', label: 'X1 - Principal' },
                { value: 'X4', label: 'X4 - Secundaria' },
                { value: 'X5', label: 'X5 - Norte' },
                { value: 'X7', label: 'X7 - Sur' },
                { value: 'X9', label: 'X9 - Temporal' },
              ]}
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
                { value:'consola', label:'Consola' },
                { value:'bocina', label:'Bocina' },
                { value:'accesorios', label:'Accesorios' },
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
            <div style={{ display: 'grid', gridTemplateColumns: '200px 200px 200px 200px 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <Select
                options={[
                  { value: '', label: 'Todos los estados' },
                  { value: 'nuevo', label: 'Nuevo' },
                  { value: 'usado', label: 'Usado' },
                  { value: 'reacondicionado', label: 'Reacondicionado' },
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
                  { value: '', label: 'Proveedor' },
                  { value: 'dell', label: 'Dell' },
                  { value: 'hp', label: 'HP' },
                  { value: 'lenovo', label: 'Lenovo' },
                  { value: 'logitech', label: 'Logitech' },
                  { value: 'samsung', label: 'Samsung' },
                  { value: 'lg', label: 'LG' },
                ]}
                value={filters.supplier}
                onChange={(e) => handleFilterChange('supplier', e.target.value)}
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
                <Button variant="secondary" size="sm">
                  <BarChart3 size={16} />
                  Análisis
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Acciones Masivas */}
      {selectedItems.length > 0 && (
        <Card>
          <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--brand-primary)10' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge variant="success" size="sm">
                {selectedItems.length} seleccionados
              </Badge>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Acciones masivas:
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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

      <InventoryTable filters={filters} onSelectionChange={setSelectedItems} />

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
    </div>
  );
}
