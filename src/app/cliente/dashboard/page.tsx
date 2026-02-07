'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { LogOut, Package, Warehouse, Search, RefreshCw } from 'lucide-react';

export default function ClienteDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser) {
        router.push('/login-clientes');
        return;
      }

      setUser(authUser);
      await fetchData();
    } catch (err) {
      router.push('/login-clientes');
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Obtener datos desde el API endpoint
      const response = await fetch('/api/cliente/inventario');
      
      if (!response.ok) {
        throw new Error('Error al cargar inventario');
      }

      const data = await response.json();
      setWarehouses(data.warehouses || []);
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login-clientes');
  }

  // Filtrar y ordenar items
  const filteredItems = items
    .filter(item => {
      const matchesSearch = !searchTerm || 
        item.items?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.items?.sku?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWarehouse = !selectedWarehouse || item.warehouse_id === selectedWarehouse;
      
      return matchesSearch && matchesWarehouse;
    })
    .sort((a, b) => (b.qty || 0) - (a.qty || 0));

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <div style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 auto' }}>
          <img
            src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
            alt="Solis Comercial"
            style={{ 
              height: 40,
              background: 'white',
              padding: 8,
              borderRadius: 8
            }}
          />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Portal de Inventario
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} />
            Actualizar
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            <LogOut size={16} />
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {error && (
          <Card style={{ marginBottom: 24, background: '#fee2e2', border: '1px solid #fecaca' }}>
            <div style={{ padding: 16, color: '#dc2626' }}>
              <strong>Error:</strong> {error}
            </div>
          </Card>
        )}

        {/* Filtros */}
        <Card style={{ marginBottom: 24, background: '#1e293b', border: '1px solid #334155' }}>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', color: '#f1f5f9' }}>
              Filtros de Búsqueda
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: 16 
            }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: 12,
                    color: '#64748b'
                  }}
                />
                <Input
                  placeholder="Buscar por nombre o SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ 
                    paddingLeft: 40,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f1f5f9'
                  }}
                />
              </div>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: 14,
                  background: '#0f172a',
                  color: '#f1f5f9',
                  cursor: 'pointer'
                }}
              >
                <option value="">Todas las bodegas</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Resumen de Bodegas */}
        {warehouses.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24
          }}>
            {warehouses.map(warehouse => {
              const warehouseItems = items.filter(i => i.warehouse_id === warehouse.id);
              const totalStock = warehouseItems.reduce((sum, i) => sum + (i.qty || 0), 0);
              
              return (
                <Card key={warehouse.id} style={{ background: '#1e293b', border: '1px solid #334155' }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: '#3b82f620',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Warehouse size={20} color="#3b82f6" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>
                          {warehouse.code}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                          {warehouse.name}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#3b82f6',
                      marginBottom: 4
                    }}>
                      {totalStock.toLocaleString('es-NI')}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {warehouseItems.length} productos
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabla de Inventario */}
        <Card style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', color: '#f1f5f9' }}>
              Inventario Disponible ({filteredItems.length} productos)
            </h2>
            
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                <div>Cargando inventario...</div>
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Package size={48} color="#64748b" style={{ marginBottom: 16 }} />
                <div style={{ color: '#94a3b8', fontSize: 16, marginBottom: 8 }}>
                  No hay datos de inventario disponibles
                </div>
                <div style={{ color: '#64748b', fontSize: 14 }}>
                  Por favor, contacte al administrador para sincronizar el inventario
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <Search size={48} color="#64748b" style={{ marginBottom: 16 }} />
                <div>No hay productos que coincidan con los filtros seleccionados</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 14
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #334155', background: '#0f172a' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#f1f5f9' }}>
                        SKU
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#f1f5f9' }}>
                        Producto
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#f1f5f9' }}>
                        Categoría
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#f1f5f9' }}>
                        Bodega
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                        Stock
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#f1f5f9' }}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #334155',
                          background: idx % 2 === 0 ? '#1e293b' : '#0f172a',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                        onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#1e293b' : '#0f172a'}
                      >
                        <td style={{ padding: '12px 16px', color: '#3b82f6', fontWeight: 600, fontSize: 13 }}>
                          {item.items?.sku || 'N/A'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#f1f5f9' }}>
                          {item.items?.name || 'Sin nombre'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
                          {item.items?.category || 'Sin categoría'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
                          {item.warehouses?.code || 'N/A'}
                        </td>
                        <td style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: item.qty > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {item.qty.toLocaleString('es-NI')}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <Badge variant={item.qty > 0 ? 'success' : 'danger'} size="sm">
                            {item.qty > 0 ? 'Disponible' : 'Agotado'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Footer */}
        <div style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: 13
        }}>
          <p style={{ margin: 0 }}>
            Datos actualizados en tiempo real desde nuestro sistema de inventario
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            © 2024 Solis Comercial. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
