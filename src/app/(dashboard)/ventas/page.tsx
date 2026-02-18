'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Search, Filter, DollarSign, Package, TrendingUp, Users, X, Check, CreditCard, Banknote, Building2 } from 'lucide-react';

interface Product {
  id: string;
  item_id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  color: string;
  physical_state: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
}

interface CartItem extends Product {
  cartQuantity: number;
}

interface Sale {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_method: string;
  total: number;
  items: CartItem[];
  created_at: string;
  status: string;
}

export default function VentasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showSalesHistory, setShowSalesHistory] = useState(false);

  // Formulario de checkout
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchSales();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/cliente/inventario');
      const data = await response.json();
      if (data.items) {
        setProducts(data.items.filter((p: Product) => p.quantity > 0));
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSales = () => {
    try {
      const stored = localStorage.getItem('solis_comercial_sales');
      if (stored) {
        setSales(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.item_id === product.item_id && item.warehouse_id === product.warehouse_id);

    if (existingItem) {
      if (existingItem.cartQuantity < product.quantity) {
        setCart(cart.map(item =>
          item.item_id === product.item_id && item.warehouse_id === product.warehouse_id
            ? { ...item, cartQuantity: item.cartQuantity + 1 }
            : item
        ));
      }
    } else {
      setCart([...cart, { ...product, cartQuantity: 1 }]);
    }
  };

  const updateCartQuantity = (itemId: string, warehouseId: string, newQuantity: number) => {
    const product = products.find(p => p.item_id === itemId && p.warehouse_id === warehouseId);
    if (product && newQuantity <= product.quantity && newQuantity > 0) {
      setCart(cart.map(item =>
        item.item_id === itemId && item.warehouse_id === warehouseId
          ? { ...item, cartQuantity: newQuantity }
          : item
      ));
    }
  };

  const removeFromCart = (itemId: string, warehouseId: string) => {
    setCart(cart.filter(item => !(item.item_id === itemId && item.warehouse_id === warehouseId)));
  };

  const clearCart = () => {
    setCart([]);
    setShowCart(false);
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.cartQuantity), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.cartQuantity, 0);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const matchesWarehouse = !selectedWarehouse || product.warehouse_id === selectedWarehouse;
    return matchesSearch && matchesCategory && matchesWarehouse;
  });

  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);
  const warehouses = Array.from(new Set(products.map(p => ({ id: p.warehouse_id, name: p.warehouse_name }))
    .map(w => JSON.stringify(w))))
    .map(w => JSON.parse(w));

  const handleCheckout = async () => {
    if (!customerName || !customerEmail || cart.length === 0) {
      alert('Por favor complete todos los campos requeridos');
      return;
    }

    setProcessingPayment(true);
    try {
      const sale = {
        id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        payment_method: paymentMethod,
        total: cartTotal,
        items: cart.map(item => ({
          item_id: item.item_id,
          warehouse_id: item.warehouse_id,
          quantity: item.cartQuantity,
          unit_price: item.unit_price,
          name: item.name,
          sku: item.sku
        })),
        status: 'completada',
        created_at: new Date().toISOString()
      };

      const currentSales = JSON.parse(localStorage.getItem('solis_comercial_sales') || '[]');
      currentSales.push(sale);
      localStorage.setItem('solis_comercial_sales', JSON.stringify(currentSales));

      alert('✅ Venta registrada exitosamente!');
      clearCart();
      setShowCheckout(false);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setPaymentMethod('efectivo');
      fetchProducts();
      fetchSales();
    } catch (error) {
      console.error('Error processing sale:', error);
      alert(' Error al procesar la venta');
    } finally {
      setProcessingPayment(false);
    }
  };

  const todaySales = sales.filter(sale => {
    const saleDate = new Date(sale.created_at);
    const today = new Date();
    return saleDate.toDateString() === today.toDateString();
  });

  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div style={{ padding: '24px', background: 'var(--background)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* Header con KPIs */}
      <div style={{ marginBottom: '32px' }}>
        <h1 className="h-title" style={{ fontWeight: 700, marginBottom: '24px' }}>
           Punto de Venta
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div style={{ background: 'var(--card)', padding: '24px', borderRadius: '12px', color: 'var(--text)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <DollarSign size={24} />
              <span style={{ fontSize: '14px', opacity: 0.9 }}>Ventas Hoy</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>${todayRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>{todaySales.length} transacciones</div>
          </div>

          <div style={{ background: 'var(--card)', padding: '24px', borderRadius: '12px', color: 'var(--text)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <TrendingUp size={24} />
              <span style={{ fontSize: '14px', opacity: 0.9 }}>Total Ventas</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>{sales.length} ventas totales</div>
          </div>

          <div style={{ background: 'var(--card)', padding: '24px', borderRadius: '12px', color: 'var(--text)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Package size={24} />
              <span style={{ fontSize: '14px', opacity: 0.9 }}>Productos</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{products.length}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>En inventario</div>
          </div>

          <div style={{ background: 'var(--card)', padding: '24px', borderRadius: '12px', color: 'var(--text)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Users size={24} />
              <span style={{ fontSize: '14px', opacity: 0.9 }}>Clientes</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700 }}>{new Set(sales.map(s => s.customer_email)).size}</div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>Únicos</div>
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCart(!showCart)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <ShoppingCart size={20} />
            Carrito
            {cartItemsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: '#FBBF24',
                color: '#111827',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {cartItemsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSalesHistory(!showSalesHistory)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <TrendingUp size={20} />
            Historial de Ventas
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--card)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
              <Search size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Buscar Producto
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nombre o SKU..."
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--background)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
              <Filter size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Categoría
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--background)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
              <Building2 size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Bodega
            </label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--background)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">Todas las bodegas</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>{wh.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid de productos */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>
          Cargando productos...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {filteredProducts.map(product => {
            const inCart = cart.find(item => item.item_id === product.item_id && item.warehouse_id === product.warehouse_id);
            return (
              <div
                key={`${product.item_id}-${product.warehouse_id}`}
                style={{
                  background: 'var(--card)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: inCart ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                    {product.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--muted)' }}>SKU: {product.sku}</p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {product.category && (
                    <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: '4px', fontWeight: 500 }}>
                      {product.category}
                    </span>
                  )}
                  {product.brand && (
                    <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', borderRadius: '4px', fontWeight: 500 }}>
                      {product.brand}
                    </span>
                  )}
                  {product.color && (
                    <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', borderRadius: '4px', fontWeight: 500 }}>
                      {product.color}
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                    📦 Stock: <strong style={{ color: product.quantity < 10 ? 'var(--brand-primary)' : 'var(--success)' }}>{product.quantity}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    🏢 {product.warehouse_name}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                    ${product.unit_price.toFixed(2)}
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    disabled={inCart && inCart.cartQuantity >= product.quantity}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      background: inCart ? '#059669' : '#DC2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: inCart && inCart.cartQuantity >= product.quantity ? 'not-allowed' : 'pointer',
                      opacity: inCart && inCart.cartQuantity >= product.quantity ? 0.5 : 1
                    }}
                  >
                    {inCart ? <Check size={16} /> : <Plus size={16} />}
                    {inCart ? 'En carrito' : 'Agregar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel del Carrito */}
      {showCart && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '450px',
          background: 'var(--card)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShoppingCart size={24} />
              Carrito de Compras
            </h2>
            <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={24} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <ShoppingCart size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p>El carrito está vacío</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={`${item.item_id}-${item.warehouse_id}`} style={{
                  background: 'var(--background)',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{item.name}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--muted)' }}>SKU: {item.sku}</p>
                      <p style={{ fontSize: '12px', color: 'var(--muted)' }}>🏢 {item.warehouse_name}</p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.item_id, item.warehouse_id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary)' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => updateCartQuantity(item.item_id, item.warehouse_id, item.cartQuantity - 1)}
                        style={{
                          width: '32px',
                          height: '32px',
                          background: '#E5E7EB',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Minus size={16} />
                      </button>
                      <span style={{ fontSize: '16px', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>
                        {item.cartQuantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.item_id, item.warehouse_id, item.cartQuantity + 1)}
                        disabled={item.cartQuantity >= item.quantity}
                        style={{
                          width: '32px',
                          height: '32px',
                          background: item.cartQuantity >= item.quantity ? '#E5E7EB' : '#DC2626',
                          color: item.cartQuantity >= item.quantity ? '#6B7280' : 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: item.cartQuantity >= item.quantity ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#DC2626' }}>
                      ${(item.unit_price * item.cartQuantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div style={{ padding: '20px', borderTop: '2px solid var(--border)', background: 'var(--card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Total:</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  ${cartTotal.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowCart(false);
                  setShowCheckout(true);
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: '8px'
                }}
              >
                Proceder al Pago
              </button>
              <button
                onClick={clearCart}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  color: 'var(--brand-primary)',
                  border: '1px solid var(--brand-primary)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Vaciar Carrito
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de Checkout */}
      {showCheckout && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>💳 Finalizar Venta</h2>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Juan Pérez"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="juan@example.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+505 8888-8888"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                  Método de Pago
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { value: 'efectivo', label: 'Efectivo', icon: Banknote },
                    { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                    { value: 'transferencia', label: 'Transferencia', icon: Building2 }
                  ].map(method => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        onClick={() => setPaymentMethod(method.value)}
                        style={{
                          padding: '16px',
                          border: paymentMethod === method.value ? '2px solid var(--brand-primary)' : '1px solid var(--border)',
                          background: paymentMethod === method.value ? 'rgba(220, 38, 38, 0.1)' : 'var(--background)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s'
                        }}
                      >
                        <Icon size={24} color={paymentMethod === method.value ? 'var(--brand-primary)' : 'var(--muted)'} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: paymentMethod === method.value ? 'var(--brand-primary)' : 'var(--text)' }}>
                          {method.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: 'var(--background)', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>Resumen de Compra</h3>
                {cart.map(item => (
                  <div key={`${item.item_id}-${item.warehouse_id}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: 'var(--muted)' }}>{item.name} x{item.cartQuantity}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>${(item.unit_price * item.cartQuantity).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '2px solid var(--border)', marginTop: '12px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Total:</span>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-primary)' }}>${cartTotal.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={processingPayment}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: processingPayment ? '#9CA3AF' : '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: processingPayment ? 'not-allowed' : 'pointer'
                }}
              >
                {processingPayment ? 'Procesando...' : '✅ Confirmar Venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial de Ventas */}
      {showSalesHistory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            maxWidth: '1000px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>📊 Historial de Ventas</h2>
              <button onClick={() => setShowSalesHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {sales.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#6B7280' }}>
                  No hay ventas registradas
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sales.slice().reverse().map(sale => (
                    <div key={sale.id} style={{
                      background: 'var(--background)',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                            {sale.customer_name}
                          </h3>
                          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{sale.customer_email}</p>
                          {sale.customer_phone && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>📞 {sale.customer_phone}</p>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                            ${sale.total.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                            {new Date(sale.created_at).toLocaleString('es-NI')}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <span style={{
                          fontSize: '12px',
                          padding: '4px 12px',
                          background: sale.payment_method === 'efectivo' ? 'rgba(22, 163, 74, 0.1)' : sale.payment_method === 'tarjeta' ? 'rgba(30, 64, 175, 0.1)' : 'rgba(146, 64, 14, 0.1)',
                          color: sale.payment_method === 'efectivo' ? '#22c55e' : sale.payment_method === 'tarjeta' ? '#60a5fa' : '#fbbf24',
                          borderRadius: '6px',
                          fontWeight: 600
                        }}>
                          {sale.payment_method === 'efectivo' ? '💵 Efectivo' : sale.payment_method === 'tarjeta' ? '💳 Tarjeta' : '🏦 Transferencia'}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          padding: '4px 12px',
                          background: 'rgba(22, 163, 74, 0.1)',
                          color: '#22c55e',
                          borderRadius: '6px',
                          fontWeight: 600
                        }}>
                          ✅ {sale.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                        <strong>{sale.items.length}</strong> producto(s)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
