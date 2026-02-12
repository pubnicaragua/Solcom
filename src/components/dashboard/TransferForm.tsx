
'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { ArrowRight, Search, Trash2, CheckCircle, Loader2, Package, PackageSearch, Calendar } from 'lucide-react';

export default function TransferForm({ onSuccess }: { onSuccess: () => void }) {
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        from_warehouse_id: '',
        to_warehouse_id: '',
        notes: ''
    });

    const [lineItems, setLineItems] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // Supabase client for fetching warehouses
    const [supabase] = useState(() => {
        const { createClientComponentClient } = require('@supabase/auth-helpers-nextjs');
        return createClientComponentClient();
    });

    useEffect(() => {
        async function loadWarehouses() {
            const { data } = await supabase.from('warehouses').select('id, name').eq('active', true).order('name');
            if (data) setWarehouses(data);
        }
        loadWarehouses();
    }, [supabase]);

    // Search items logic
    useEffect(() => {
        const delay = setTimeout(async () => {
            if (searchTerm.length < 3) {
                setSearchResults([]);
                return;
            }
            if (!formData.from_warehouse_id) return;

            setSearching(true);
            try {
                const res = await fetch(`/api/transfers/items?search=${searchTerm}&warehouseId=${formData.from_warehouse_id}`);
                const data = await res.json();
                if (Array.isArray(data)) setSearchResults(data);
            } catch (e) {
                console.error(e);
            } finally {
                setSearching(false);
            }
        }, 500);
        return () => clearTimeout(delay);
    }, [searchTerm, formData.from_warehouse_id]);

    function addItem(item: any) {
        if (lineItems.find(i => i.id === item.id)) return;
        setLineItems([...lineItems, { ...item, quantity: 1 }]);
        setSearchTerm('');
        setSearchResults([]);
    }

    function updateQuantity(index: number, qty: number) {
        const newItems = [...lineItems];
        newItems[index].quantity = qty;
        setLineItems(newItems);
    }

    function removeItem(index: number) {
        setLineItems(lineItems.filter((_, i) => i !== index));
    }

    async function handleSubmit() {
        if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
            alert('Por favor selecciona las bodegas de origen y destino');
            return;
        }
        if (formData.from_warehouse_id === formData.to_warehouse_id) {
            alert('La bodega de origen debe ser diferente a la de destino');
            return;
        }
        if (lineItems.length === 0) {
            alert('Debes agregar al menos un producto a la transferencia');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                line_items: lineItems
            };

            const res = await fetch('/api/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Error al crear la transferencia');

            alert('Transferencia creada exitosamente');
            onSuccess();

            // Reset state
            setLineItems([]);
            setFormData(prev => ({ ...prev, notes: '' }));
            setSearchTerm('');

        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Card className="max-w-5xl mx-auto border-slate-700/50 bg-slate-800/40 backdrop-blur-sm shadow-xl p-8">
            <div className="space-y-8">

                {/* Header Section: Warehouses & Date */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-6 items-start">

                    {/* Origin */}
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-colors group">
                        <span className="text-xs uppercase tracking-wider text-red-400 font-bold mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Desde (Origen)
                        </span>
                        <Select
                            value={formData.from_warehouse_id}
                            onChange={(e) => setFormData(prev => ({ ...prev, from_warehouse_id: e.target.value }))}
                            options={[{ value: '', label: 'Seleccionar Bodega...' }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]}
                            disabled={loading}
                            className="w-full bg-slate-800 border-slate-600 focus:border-red-500"
                        />
                        {formData.from_warehouse_id && (
                            <div className="mt-2 text-xs text-slate-500">
                                Los productos se descontarán de este inventario inmediatamente.
                            </div>
                        )}
                    </div>

                    {/* Connector */}
                    <div className="flex flex-col items-center justify-center pt-8 text-slate-600">
                        <div className="p-2 rounded-full bg-slate-800/80 border border-slate-700">
                            <ArrowRight className="hidden lg:block text-slate-400" size={24} />
                            <ArrowRight className="lg:hidden rotate-90 text-slate-400" size={24} />
                        </div>
                    </div>

                    {/* Destination */}
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-colors group">
                        <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            Hacia (Destino)
                        </span>
                        <Select
                            value={formData.to_warehouse_id}
                            onChange={(e) => setFormData(prev => ({ ...prev, to_warehouse_id: e.target.value }))}
                            options={[{ value: '', label: 'Seleccionar Bodega...' }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]}
                            disabled={loading}
                            className="w-full bg-slate-800 border-slate-600 focus:border-emerald-500"
                        />
                        {formData.to_warehouse_id && (
                            <div className="mt-2 text-xs text-slate-500">
                                Se sumará al inventario una vez recibida la transferencia.
                            </div>
                        )}
                    </div>
                </div>

                {/* Date & Search Bar */}
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-48">
                        <label className="text-sm font-medium text-slate-400 mb-2 block flex items-center gap-2">
                            <Calendar size={14} /> Fecha
                        </label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all outline-none"
                        />
                    </div>

                    <div className="flex-1 relative z-20">
                        <label className="text-sm font-medium text-slate-300 mb-2 block flex items-center gap-2">
                            <Search size={14} /> Buscar Productos {formData.from_warehouse_id ? '' : '(Selecciona Origen primero)'}
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-500 group-focus-within:text-red-400 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder={formData.from_warehouse_id ? "Escribe nombre o SKU..." : "Selecciona una bodega de origen para buscar..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                disabled={!formData.from_warehouse_id}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600 border-dashed focus:border-solid"
                            />
                            {searching && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 className="animate-spin text-red-500" size={18} />
                                </div>
                            )}
                        </div>

                        {/* Search Results Dropdown */}
                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-700/50 animate-in fade-in zoom-in-95 duration-200">
                                {searchResults.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => addItem(item)}
                                        className="p-3 hover:bg-slate-700/50 cursor-pointer transition-colors flex justify-between items-center group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-900 rounded-lg text-slate-400 group-hover:bg-slate-800 group-hover:text-red-400 transition-colors">
                                                <Package size={20} />
                                            </div>
                                            <div>
                                                <div className="font-medium text-slate-200 group-hover:text-white transition-colors">{item.name}</div>
                                                <div className="text-xs text-slate-500 font-mono bg-slate-900/50 px-1.5 py-0.5 rounded w-fit">{item.sku}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-sm font-bold ${item.current_stock > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {item.current_stock} un.
                                            </div>
                                            <div className="text-[10px] uppercase text-slate-600 font-bold tracking-wider">Disponible</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Selected Items Table */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-slate-700/50 pb-2">
                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                            <PackageSearch size={20} className="text-indigo-400" />
                            Lista de Empaque
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-slate-400 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                            <span>Items: <strong className="text-white">{lineItems.length}</strong></span>
                            <span className="w-px h-3 bg-slate-700"></span>
                            <span>Unidades: <strong className="text-white">{lineItems.reduce((acc, i) => acc + i.quantity, 0)}</strong></span>
                        </div>
                    </div>

                    <div className="bg-slate-900/30 rounded-xl border border-slate-700/50 overflow-hidden min-h-[200px] relative">
                        {lineItems.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-4">
                                <div className="p-4 bg-slate-900/50 rounded-full border border-slate-800/50">
                                    <PackageSearch size={48} className="opacity-30" />
                                </div>
                                <p className="text-sm font-medium">No has seleccionado productos aún.</p>
                                <p className="text-xs max-w-xs text-center text-slate-500">Busca productos en la barra superior para agregarlos a esta transferencia.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-900/80 text-slate-400 font-medium text-xs uppercase tracking-wider backdrop-blur-sm sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 pl-6 font-semibold">Producto</th>
                                        <th className="p-4 font-semibold">SKU</th>
                                        <th className="p-4 font-semibold w-32 text-center">Cantidad</th>
                                        <th className="p-4 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {lineItems.map((item, index) => (
                                        <tr key={item.item_id || index} className="hover:bg-slate-800/30 transition-colors group">
                                            <td className="p-4 pl-6 font-medium text-slate-200 group-hover:text-white transition-colors">
                                                {item.name}
                                            </td>
                                            <td className="p-4 text-slate-500 font-mono text-xs">{item.sku}</td>
                                            <td className="p-4 text-center">
                                                <div className="relative inline-block">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max={item.current_stock}
                                                        value={item.quantity}
                                                        onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                                                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-center focus:ring-2 focus:ring-indigo-500/50 outline-none text-white font-bold"
                                                    />
                                                    <span className="absolute -bottom-5 left-0 right-0 text-[10px] text-slate-600 text-center">Max: {item.current_stock}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => removeItem(index)}
                                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-8 mt-4 border-t border-slate-700/50 flex flex-col md:flex-row justify-end gap-4 items-center">
                    <div className="text-xs text-slate-500 mr-auto max-w-md hidden md:block">
                        Al confirmar, se creará una orden de transferencia en estado <strong>En Tránsito</strong>.
                        El stock se descontará de <em>{warehouses.find(w => w.id === formData.from_warehouse_id)?.name || 'Origen'}</em> inmediatamente.
                    </div>

                    <Button
                        variant="ghost"
                        onClick={() => setLineItems([])}
                        className="text-slate-400 hover:text-white"
                        disabled={lineItems.length === 0}
                    >
                        Limpiar Todo
                    </Button>

                    <Button
                        size="lg"
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-900/40 w-full md:w-auto px-10 py-3 h-auto rounded-xl font-bold flex items-center gap-2 group transition-all transform hover:scale-[1.02]"
                        onClick={handleSubmit}
                        disabled={loading || lineItems.length === 0}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={20} className="group-hover:text-emerald-300 transition-colors" />
                                Confirmar Transferencia
                            </>
                        )}
                    </Button>
                </div>

            </div>
        </Card>
    );
}
