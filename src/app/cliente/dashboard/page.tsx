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
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png"
            alt="Solis Comercial"
            style={{ height: 40 }}
          />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Portal de Inventario
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              {user?.email}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="ghost" size="sm" onClick={fetchData}>
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
        <Card style={{ marginBottom: 24 }}>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
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
                    color: 'var(--muted)'
                  }}
                />
                <Input
                  placeholder="Buscar por nombre o SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </div>
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: 14,
                  background: 'var(--panel)',
                  color: 'var(--text-primary)',
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
              <Card key={warehouse.id}>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: 'var(--brand-primary)15',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Warehouse size={20} color="var(--brand-primary)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {warehouse.code}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {warehouse.name}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: 'var(--brand-primary)',
                    marginBottom: 4
                  }}>
                    {totalStock.toLocaleString('es-NI')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {warehouseItems.length} productos
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tabla de Inventario */}
        <Card>
          <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
              Inventario Disponible ({filteredItems.length} productos)
            </h2>
            
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                Cargando inventario...
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                No hay productos disponibles con los filtros seleccionados
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 14
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--background)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>
                        SKU
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Producto
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Categoría
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Bodega
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Stock
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 0 ? 'var(--panel)' : 'var(--background)'
                        }}
                      >
                        <td style={{ padding: '12px 16px', color: 'var(--brand-primary)', fontWeight: 600 }}>
                          {item.items?.sku || 'N/A'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                          {item.items?.name || 'Sin nombre'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                          {item.items?.category || 'Sin categoría'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                          {item.warehouses?.code || 'N/A'}
                        </td>
                        <td style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: item.qty > 0 ? 'var(--success)' : 'var(--danger)'
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
