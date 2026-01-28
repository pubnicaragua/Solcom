'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Search, Filter, Download } from 'lucide-react';

interface FiltersProps {
  onFilterChange?: (filters: any) => void;
  onExport?: () => void;
}

export default function InventoryFilters({ onFilterChange, onExport }: FiltersProps) {
  const [warehouses, setWarehouses] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'Todas las bodegas' },
  ]);
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [stockLevel, setStockLevel] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({ search, warehouse, state, category, stockLevel, sortBy });
    }
  }, [search, warehouse, state, category, stockLevel, sortBy, onFilterChange]);

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const options = [
          { value: '', label: 'Todas las bodegas' },
          ...data.map((w: any) => ({ value: w.code, label: `${w.code} - ${w.name}` })),
        ];
        setWarehouses(options);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  }

  return (
    <Card>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 200px 200px', gap: 12, alignItems: 'end' }}>
          <Input
            placeholder="Buscar por nombre, SKU o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select
            options={warehouses}
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
          />

          <Select
            options={[
              { value: '', label: 'Todas las categorías' },
              { value: 'laptops', label: 'Laptops' },
              { value: 'monitores', label: 'Monitores' },
              { value: 'teclados', label: 'Teclados' },
              { value: 'mouse', label: 'Mouse' },
              { value: 'accesorios', label: 'Accesorios' },
            ]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />

          <Select
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'nuevo', label: 'Nuevo' },
              { value: 'usado', label: 'Usado' },
            ]}
            value={state}
            onChange={(e) => setState(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 200px 1fr auto', gap: 12, alignItems: 'end' }}>
          <Select
            options={[
              { value: '', label: 'Nivel de stock' },
              { value: 'low', label: 'Stock bajo (< 10)' },
              { value: 'medium', label: 'Stock medio (10-50)' },
              { value: 'high', label: 'Stock alto (> 50)' },
              { value: 'out', label: 'Sin stock' },
            ]}
            value={stockLevel}
            onChange={(e) => setStockLevel(e.target.value)}
          />

          <Select
            options={[
              { value: 'name', label: 'Ordenar por nombre' },
              { value: 'stock_asc', label: 'Stock (menor a mayor)' },
              { value: 'stock_desc', label: 'Stock (mayor a menor)' },
              { value: 'price_asc', label: 'Precio (menor a mayor)' },
              { value: 'price_desc', label: 'Precio (mayor a menor)' },
            ]}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSearch('');
                setWarehouse('');
                setState('');
                setCategory('');
                setStockLevel('');
                setSortBy('name');
              }}
            >
              Limpiar filtros
            </Button>
            <Button variant="secondary" size="sm" onClick={onExport}>
              <Download size={16} />
              Exportar CSV
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
