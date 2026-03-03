'use client';

import { useState, useEffect, useMemo } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Package, Search, Filter, Download, Upload, FileSpreadsheet, ShoppingCart, X, Trash2, Plus, Minus, Check, Edit, RefreshCw, FileText, BarChart3 } from 'lucide-react';
import PivotInventoryTable from '@/components/dashboard/PivotInventoryTable';
import InventoryCart from '@/components/dashboard/InventoryCart';
import * as XLSX from 'xlsx';
import TransferHistory from '@/components/dashboard/TransferHistory';
import EditProductModal from '@/components/modals/EditProductModal';
import UpdateStockModal from '@/components/modals/UpdateStockModal';
import TransferModal from '@/components/modals/TransferModal';
import ProductDetailsModal from '@/components/modals/ProductDetailsModal';
import KPIGrid from '@/components/dashboard/KPIGrid';
import type { PivotItem } from '@/components/dashboard/PivotInventoryTable';
import type { CartItem } from '@/components/dashboard/InventoryCart';

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
  const [importModalOpen, setImportModalOpen] = useState(false);

  // ─── Cart State (desktop only) ───
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMode, setCartMode] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [cartToast, setCartToast] = useState<{ name: string; qty: number } | null>(null);
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  function addToCart(item: PivotItem) {
    let newQty = 1;
    setCartItems((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        newQty = existing.quantity + 1;
        return prev.map((c) =>
          c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          color: item.color,
          brand: item.brand,
          quantity: 1,
        },
      ];
    });
    // Auto-open cart on first add
    if (cartItems.length === 0) setCartOpen(true);

    // Toast notification
    const label = item.name + (item.color ? ` — ${item.color}` : '');
    setCartToast({ name: label, qty: newQty });
    setTimeout(() => setCartToast(null), 2200);

    // Pulse cart button
    setCartPulse(true);
    setTimeout(() => setCartPulse(false), 700);
  }

  function removeFromCart(itemId: string) {
    setCartItems((prev) => prev.filter((c) => c.itemId !== itemId));
  }

  function updateCartQty(itemId: string, qty: number) {
    setCartItems((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, quantity: Math.max(1, qty) } : c))
    );
  }

  function clearCart() {
    setCartItems([]);
  }

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

  function downloadTemplate() {
    // Crear datos de ejemplo para la plantilla XLSX
    const headers = ['SKU', 'Nombre', 'Categoría', 'Marca', 'Color', 'Precio', 'Stock Mínimo', 'Estado'];
    const example = ['PROD-001', 'Laptop Dell Inspiron 15', 'Computadoras', 'Dell', 'Negro', 450.00, 5, 'Activo'];

    // Crear worksheet data
    const wsData = [headers, example];

    // Crear worksheet usando XLSX
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajustar ancho de columnas
    ws['!cols'] = [
      { wch: 15 },  // SKU
      { wch: 30 },  // Nombre
      { wch: 15 },  // Categoría
      { wch: 15 },  // Marca
      { wch: 12 },  // Color
      { wch: 10 },  // Precio
      { wch: 15 },  // Stock Mínimo
      { wch: 10 },  // Estado
    ];

    // Crear workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    // Generar archivo XLSX y descargarlo
    XLSX.writeFile(wb, 'plantilla_importacion_inventario.xlsx');
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
          {/* Cart toggle button (now visible on mobile too) */}
          {(

            <button
              onClick={() => {
                if (!cartMode) {
                  setCartMode(true);
                  setCartOpen(true);
                } else {
                  setCartMode(false);
                }
              }}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                borderRadius: 10,
                border: cartMode
                  ? '1.5px solid rgba(16,185,129,0.6)'
                  : '1.5px solid rgba(255,255,255,0.12)',
                background: cartMode
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)'
                  : 'rgba(255,255,255,0.04)',
                color: cartMode ? '#34d399' : 'var(--muted)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.25s',
                boxShadow: cartMode ? '0 0 20px rgba(16,185,129,0.15)' : 'none',
                animation: cartPulse ? 'cartBtnPulse 0.5s ease-out' : 'none',
              }}
            >
              <ShoppingCart size={17} />
              <span className="btn-label">{cartMode ? 'Modo Carrito Activo' : 'Cotizar'}</span>
              {cartItems.length > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
                    animation: 'cartBadgePop 0.3s ease-out',
                  }}
                >
                  {cartItems.length}
                </span>
              )}
            </button>
          )}

          {/* Open cart drawer if has items (toolbar button) */}
          {!isMobileView && cartItems.length > 0 && !cartOpen && (
            <button
              onClick={() => setCartOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(16,185,129,0.3)',
                background: 'rgba(16,185,129,0.08)',
                color: '#34d399',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Ver carrito ({cartItems.length})
            </button>
          )}

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
            onClick={() => setImportModalOpen(true)}
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
                { value: 'positive', label: 'Con stock (> 0)' },
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

      <PivotInventoryTable
        filters={filters}
        cartMode={cartMode}
        onAddToCart={addToCart}
      />

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

      {/* ─── Cart Drawer (now works on mobile too) ─── */}
      {(
        <InventoryCart
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          items={cartItems}
          onUpdateQuantity={updateCartQty}
          onRemoveItem={removeFromCart}
          onClearCart={clearCart}
          onQuoteCreated={() => {
            setCartMode(false);
          }}
        />
      )}

      {/* ─── Cart Toast Notification ─── */}
      {cartToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2100,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(5,150,105,0.95) 100%)',
            color: 'white',
            fontSize: 13,
            fontWeight: 700,
            boxShadow: '0 8px 32px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.3)',
            animation: 'toastSlideUp 0.35s ease-out',
            whiteSpace: 'nowrap',
            maxWidth: '90vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 900,
            flexShrink: 0,
          }}>
            ✓
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cartToast.name}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.2)',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
          }}>
            ×{cartToast.qty}
          </span>
        </div>
      )}

      {/* ─── Mobile Floating Cart Button ─── */}
      {isMobileView && (cartItems.length > 0 || cartMode) && (
        <button
          onClick={() => setCartOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1990,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(16,185,129,0.4)',
            cursor: 'pointer',
            animation: cartPulse ? 'cartBtnPulse 0.5s ease-out' : 'none',
            transition: 'transform 0.2s',
          }}
          onPointerDown={(e: any) => e.currentTarget.style.transform = 'scale(0.95)'}
          onPointerUp={(e: any) => e.currentTarget.style.transform = 'scale(1)'}
          onPointerLeave={(e: any) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <ShoppingCart size={24} color="white" />

          {cartItems.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 24,
                height: 24,
                borderRadius: 12,
                background: '#ef4444',
                color: 'white',
                fontSize: 12,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
                border: '2px solid var(--background)',
                boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                animation: 'cartBadgePop 0.3s ease-out',
              }}
            >
              {cartItems.length}
            </span>
          )}
        </button>
      )}

      {/* ─── Modal de Instrucciones de Importación ─── */}
      {importModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setImportModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--panel)',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: 32,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-accent) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Upload size={24} color="white" />
                </div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 4 }}>Importar Inventario</h2>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Sube un archivo Excel con tus productos</p>
                </div>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: 4,
                  borderRadius: 6,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--muted)';
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: 24, padding: 20, background: 'var(--background)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FileSpreadsheet size={20} color="var(--brand-primary)" />
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text)' }}>Formato del Archivo</h3>
              </div>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                El archivo debe ser <strong style={{ color: 'var(--text)' }}>XLSX o XLS</strong> con las siguientes columnas en este orden:
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  { name: 'SKU', desc: 'Código único del producto', required: true },
                  { name: 'Nombre', desc: 'Nombre del producto', required: true },
                  { name: 'Categoría', desc: 'Categoría del producto', required: false },
                  { name: 'Marca', desc: 'Marca del producto', required: false },
                  { name: 'Color', desc: 'Color del producto', required: false },
                  { name: 'Precio', desc: 'Precio unitario (ej: 450.00)', required: false },
                  { name: 'Stock Mínimo', desc: 'Cantidad mínima en inventario', required: false },
                  { name: 'Estado', desc: 'Activo o Inactivo', required: false },
                ].map((col, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background: 'var(--panel)',
                    borderRadius: 8,
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{
                      minWidth: 24,
                      height: 24,
                      borderRadius: 6,
                      background: col.required ? 'var(--brand-primary)' : 'var(--border)',
                      color: col.required ? 'white' : 'var(--muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {col.name}
                        {col.required && <span style={{ color: 'var(--brand-accent)', marginLeft: 4 }}>*</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{col.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24, padding: 20, background: 'rgba(59, 130, 246, 0.08)', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Search size={18} color="#3b82f6" />
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#3b82f6' }}>Ejemplo de Fila</h3>
              </div>
              <div style={{
                fontSize: 12,
                fontFamily: 'monospace',
                background: 'var(--background)',
                padding: 14,
                borderRadius: 8,
                overflowX: 'auto',
                color: 'var(--text)',
                border: '1px solid var(--border)'
              }}>
                PROD-001 | Laptop Dell Inspiron 15 | Computadoras | Dell | Negro | 450.00 | 5 | Activo
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Button
                variant="secondary"
                onClick={downloadTemplate}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  borderRadius: 10,
                  border: '2px dashed var(--border)',
                  background: 'var(--background)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e: any) => {
                  e.currentTarget.style.borderColor = 'var(--brand-primary)';
                  e.currentTarget.style.background = 'var(--panel)';
                }}
                onMouseLeave={(e: any) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--background)';
                }}
              >
                <Download size={20} />
                <span>Descargar Plantilla XLSX</span>
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setImportModalOpen(false);
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.xlsx,.xls';
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
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  borderRadius: 10
                }}
              >
                <Upload size={20} />
                <span>Seleccionar Archivo para Importar</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes cartBadgePop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cartBtnPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129, 0.5); }
          50% { transform: scale(1.08); box-shadow: 0 0 0 8px rgba(16,185,129, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129, 0); }
        }
        @keyframes toastSlideUp {
          0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
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
