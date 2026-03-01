'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';

type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida' | 'convertida';

interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    ruc: string | null;
}

interface Warehouse {
    id: string;
    code: string;
    name: string;
}

interface Product {
    id: string;
    name: string;
    sku: string;
    unit_price: number;
}

interface QuoteLine {
    item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
}

interface EditQuoteData {
    id: string;
    customer_id: string | null;
    customer?: { name?: string | null } | null;
    warehouse_id: string | null;
    date: string;
    valid_until: string | null;
    status: QuoteStatus;
    tax_rate: number;
    discount_amount: number;
    notes: string | null;
    template_key?: string | null;
    items: Array<{
        item_id: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        discount_percent: number;
    }>;
}

interface QuoteFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    editQuote?: EditQuoteData | null;
}

const STATUS_OPTIONS: Array<{ value: Exclude<QuoteStatus, 'convertida'>; label: string }> = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'enviada', label: 'Enviada' },
    { value: 'aceptada', label: 'Aceptada' },
    { value: 'rechazada', label: 'Rechazada' },
    { value: 'vencida', label: 'Vencida' },
];

const TEMPLATE_OPTIONS = [
    { value: '', label: 'Sin plantilla' },
    { value: 'minorista_base', label: 'Minorista base' },
    { value: 'mayoreo_5', label: 'Mayoreo 5% descuento' },
    { value: 'credito_30', label: 'Crédito 30 días' },
];

function formatDateYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function todayPlus(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return formatDateYmd(date);
}

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function QuoteForm({ isOpen, onClose, onSaved, editQuote }: QuoteFormProps) {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [warehouseId, setWarehouseId] = useState('');

    const [products, setProducts] = useState<Product[]>([]);
    const [productSearch, setProductSearch] = useState('');

    const [quoteDate, setQuoteDate] = useState(formatDateYmd(new Date()));
    const [validUntil, setValidUntil] = useState(todayPlus(7));
    const [status, setStatus] = useState<QuoteStatus>('borrador');
    const [templateKey, setTemplateKey] = useState('');

    const [taxRate, setTaxRate] = useState(15);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [notes, setNotes] = useState('');

    const [lineItems, setLineItems] = useState<QuoteLine[]>([
        { item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 },
    ]);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        void fetchCustomers('');
        void fetchWarehouses();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (!warehouseId) {
            setProducts([]);
            return;
        }
        const timeout = setTimeout(() => {
            void fetchProducts(productSearch);
        }, 250);
        return () => clearTimeout(timeout);
    }, [warehouseId, productSearch, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (!editQuote) {
            resetForm();
            return;
        }

        setSelectedCustomerId(editQuote.customer_id || '');
        setCustomerSearch(editQuote.customer?.name || '');
        setWarehouseId(editQuote.warehouse_id || '');
        setQuoteDate(editQuote.date || formatDateYmd(new Date()));
        setValidUntil(editQuote.valid_until || '');
        setStatus(editQuote.status || 'borrador');
        setTemplateKey(editQuote.template_key || '');
        setTaxRate(normalizeNumber(editQuote.tax_rate, 15));
        setDiscountAmount(normalizeNumber(editQuote.discount_amount, 0));
        setNotes(editQuote.notes || '');
        setLineItems(
            Array.isArray(editQuote.items) && editQuote.items.length > 0
                ? editQuote.items.map((item) => ({
                    item_id: item.item_id || null,
                    description: item.description || '',
                    quantity: Math.max(0, normalizeNumber(item.quantity, 1)),
                    unit_price: Math.max(0, normalizeNumber(item.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item.discount_percent, 0))),
                }))
                : [{ item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 }]
        );
    }, [editQuote, isOpen]);

    async function fetchCustomers(searchText: string) {
        try {
            const url = `/api/ventas/customers${searchText ? `?search=${encodeURIComponent(searchText)}` : ''}`;
            const response = await fetch(url, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'No se pudieron cargar clientes');
            setCustomers(Array.isArray(data.customers) ? data.customers : []);
        } catch (err: any) {
            setCustomers([]);
            setError(err?.message || 'No se pudieron cargar clientes.');
        }
    }

    async function fetchWarehouses() {
        try {
            const response = await fetch('/api/warehouses', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'No se pudieron cargar bodegas');
            const normalizedWarehouses = Array.isArray(data)
                ? data
                : Array.isArray(data?.warehouses)
                    ? data.warehouses
                    : [];
            setWarehouses(normalizedWarehouses);
        } catch (err: any) {
            setWarehouses([]);
            setError(err?.message || 'No se pudieron cargar bodegas.');
        }
    }

    async function fetchProducts(searchText: string) {
        if (!warehouseId) return;
        try {
            const params = new URLSearchParams();
            params.set('warehouseId', warehouseId);
            if (searchText.trim()) params.set('search', searchText.trim());

            const response = await fetch(`/api/transfers/items?${params.toString()}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'No se pudieron cargar productos');

            const normalized = (Array.isArray(data) ? data : []).map((row: any) => ({
                id: String(row?.id || ''),
                name: String(row?.name || row?.sku || 'Producto').trim(),
                sku: String(row?.sku || '').trim(),
                unit_price: Math.max(0, normalizeNumber(row?.unit_price, 0)),
            })).filter((row: Product) => !!row.id);

            setProducts(normalized);
        } catch (err: any) {
            setProducts([]);
            setError(err?.message || 'No se pudieron cargar productos.');
        }
    }

    function resetForm() {
        setCustomerSearch('');
        setShowCustomerDropdown(false);
        setSelectedCustomerId('');
        setWarehouseId('');
        setProductSearch('');
        setQuoteDate(formatDateYmd(new Date()));
        setValidUntil(todayPlus(7));
        setStatus('borrador');
        setTemplateKey('');
        setTaxRate(15);
        setDiscountAmount(0);
        setNotes('');
        setLineItems([{ item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 }]);
        setSaving(false);
        setError('');
    }

    function applyTemplate(nextTemplateKey: string) {
        setTemplateKey(nextTemplateKey);
        if (nextTemplateKey === 'minorista_base') {
            setTaxRate(15);
            setDiscountAmount(0);
            setValidUntil(todayPlus(7));
            setNotes((prev) => prev || 'Cotización minorista estándar.');
            return;
        }
        if (nextTemplateKey === 'mayoreo_5') {
            setTaxRate(15);
            setDiscountAmount(0);
            setValidUntil(todayPlus(15));
            setLineItems((prev) => prev.map((item) => ({ ...item, discount_percent: 5 })));
            setNotes((prev) => prev || 'Cotización con descuento de mayoreo 5%.');
            return;
        }
        if (nextTemplateKey === 'credito_30') {
            setTaxRate(15);
            setDiscountAmount(0);
            setValidUntil(todayPlus(30));
            setNotes((prev) => prev || 'Cotización con términos de crédito a 30 días.');
            return;
        }
    }

    function addLine() {
        setLineItems((prev) => [...prev, { item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 }]);
    }

    function removeLine(index: number) {
        setLineItems((prev) => {
            const next = prev.filter((_, i) => i !== index);
            return next.length > 0 ? next : [{ item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 }];
        });
    }

    function updateLine(index: number, patch: Partial<QuoteLine>) {
        setLineItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    }

    function selectProduct(index: number, productId: string) {
        const selected = products.find((p) => p.id === productId);
        if (!selected) {
            updateLine(index, { item_id: null });
            return;
        }

        updateLine(index, {
            item_id: selected.id,
            description: selected.name,
            unit_price: selected.unit_price,
        });
    }

    function selectCustomer(customer: Customer) {
        setSelectedCustomerId(customer.id);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
    }

    const computed = useMemo(() => {
        const subtotal = lineItems.reduce((sum, item) => {
            const quantity = Math.max(0, normalizeNumber(item.quantity, 0));
            const unitPrice = Math.max(0, normalizeNumber(item.unit_price, 0));
            const discount = Math.max(0, Math.min(100, normalizeNumber(item.discount_percent, 0)));
            return sum + quantity * unitPrice * (1 - discount / 100);
        }, 0);

        const taxAmount = subtotal * (Math.max(0, normalizeNumber(taxRate, 0)) / 100);
        const total = subtotal + taxAmount - Math.max(0, normalizeNumber(discountAmount, 0));

        return {
            subtotal,
            taxAmount,
            total,
        };
    }, [lineItems, taxRate, discountAmount]);

    async function handleSave() {
        setSaving(true);
        setError('');

        try {
            const cleanedItems = lineItems
                .map((item) => ({
                    item_id: item.item_id,
                    description: String(item.description || '').trim(),
                    quantity: Math.max(0, normalizeNumber(item.quantity, 0)),
                    unit_price: Math.max(0, normalizeNumber(item.unit_price, 0)),
                    discount_percent: Math.max(0, Math.min(100, normalizeNumber(item.discount_percent, 0))),
                }))
                .filter((item) => item.description && item.quantity > 0);

            if (cleanedItems.length === 0) {
                throw new Error('Agrega al menos una línea válida para guardar la cotización.');
            }

            const payload = {
                customer_id: selectedCustomerId || null,
                warehouse_id: warehouseId || null,
                date: quoteDate,
                valid_until: validUntil || null,
                status,
                tax_rate: Math.max(0, normalizeNumber(taxRate, 15)),
                discount_amount: Math.max(0, normalizeNumber(discountAmount, 0)),
                notes: notes.trim() || null,
                template_key: templateKey || null,
                items: cleanedItems,
            };

            const endpoint = editQuote ? `/api/ventas/quotes/${editQuote.id}` : '/api/ventas/quotes';
            const method = editQuote ? 'PUT' : 'POST';
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || 'No se pudo guardar la cotización.');
            }

            onSaved();
            onClose();
            if (!editQuote) {
                resetForm();
            }
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar la cotización.');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2200,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
        }}>
            <div style={{
                width: 'min(1100px, 98vw)',
                maxHeight: '92vh',
                overflowY: 'auto',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    borderBottom: '1px solid var(--border)',
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 20, fontWeight: 800 }}>
                            {editQuote ? 'Editar Cotización' : 'Nueva Cotización'}
                        </h2>
                        <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
                            Crea cotizaciones personalizadas y conviértelas a factura.
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                        <X size={22} />
                    </button>
                </div>

                <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                    {error && (
                        <div style={{
                            border: '1px solid rgba(239, 68, 68, 0.45)',
                            background: 'rgba(127, 29, 29, 0.3)',
                            color: '#FCA5A5',
                            borderRadius: 10,
                            padding: '10px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                        }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Cliente</label>
                            <div style={{ position: 'relative', marginTop: 6 }}>
                                <input
                                    value={customerSearch}
                                    onFocus={() => setShowCustomerDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 140)}
                                    onChange={(e) => {
                                        const text = e.target.value;
                                        setCustomerSearch(text);
                                        setShowCustomerDropdown(true);
                                        if (!text.trim()) {
                                            setSelectedCustomerId('');
                                        }
                                        void fetchCustomers(text);
                                    }}
                                    placeholder="Buscar cliente..."
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--background)', color: 'var(--text)',
                                    }}
                                />

                                {showCustomerDropdown && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        left: 0,
                                        right: 0,
                                        zIndex: 50,
                                        maxHeight: 230,
                                        overflowY: 'auto',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                        background: 'var(--panel)',
                                        boxShadow: '0 12px 35px rgba(0,0,0,0.35)',
                                    }}>
                                        {customers.length === 0 ? (
                                            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>
                                                Sin resultados
                                            </div>
                                        ) : (
                                            customers.map((customer) => (
                                                <button
                                                    key={customer.id}
                                                    onClick={() => selectCustomer(customer)}
                                                    style={{
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '10px 12px',
                                                        border: 'none',
                                                        borderBottom: '1px solid var(--border)',
                                                        background: selectedCustomerId === customer.id ? 'rgba(59,130,246,0.15)' : 'transparent',
                                                        color: 'var(--text)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{customer.name}</div>
                                                    {(customer.email || customer.ruc) && (
                                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                            {customer.email || customer.ruc}
                                                        </div>
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Ubicación (Bodega)</label>
                            <select
                                value={warehouseId}
                                onChange={(e) => setWarehouseId(e.target.value)}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                }}
                            >
                                <option value="">Seleccionar bodega...</option>
                                {warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Plantilla</label>
                            <select
                                value={templateKey}
                                onChange={(e) => applyTemplate(e.target.value)}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                }}
                            >
                                {TEMPLATE_OPTIONS.map((opt) => (
                                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Fecha</label>
                            <input
                                type="date"
                                value={quoteDate}
                                onChange={(e) => setQuoteDate(e.target.value)}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Válida Hasta</label>
                            <input
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Estado</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                }}
                            >
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                                {status === 'convertida' && <option value="convertida">Convertida</option>}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Buscar Producto</label>
                            <input
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder={warehouseId ? 'Buscar por nombre o SKU...' : 'Selecciona una bodega primero'}
                                disabled={!warehouseId}
                                style={{
                                    width: '100%', marginTop: 6,
                                    padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)', color: 'var(--text)',
                                    opacity: warehouseId ? 1 : 0.7,
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 1.2fr 90px 120px 90px 120px 50px',
                            gap: 8,
                            padding: '10px 12px',
                            background: 'rgba(255,255,255,0.04)',
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                        }}>
                            <div>Producto</div>
                            <div>Descripción</div>
                            <div>Cant.</div>
                            <div>Precio</div>
                            <div>Desc. %</div>
                            <div>Subtotal</div>
                            <div></div>
                        </div>

                        <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                            {lineItems.map((line, index) => {
                                const rowSubtotal = Math.max(0, normalizeNumber(line.quantity, 0))
                                    * Math.max(0, normalizeNumber(line.unit_price, 0))
                                    * (1 - Math.max(0, Math.min(100, normalizeNumber(line.discount_percent, 0))) / 100);

                                return (
                                    <div
                                        key={index}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1.2fr 1.2fr 90px 120px 90px 120px 50px',
                                            gap: 8,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <select
                                            value={line.item_id || ''}
                                            onChange={(e) => selectProduct(index, e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        >
                                            <option value="">Seleccionar producto...</option>
                                            {/* Show current item as fallback if not in loaded products list */}
                                            {line.item_id && !products.find((p) => p.id === line.item_id) && (
                                                <option value={line.item_id}>
                                                    {line.description || 'Producto seleccionado'}
                                                </option>
                                            )}
                                            {products.map((product) => (
                                                <option key={product.id} value={product.id}>
                                                    {product.name}{product.sku ? ` (${product.sku})` : ''}
                                                </option>
                                            ))}
                                        </select>

                                        <input
                                            value={line.description}
                                            onChange={(e) => updateLine(index, { description: e.target.value })}
                                            placeholder="Descripción"
                                            style={{
                                                width: '100%',
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        />

                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.quantity}
                                            onChange={(e) => updateLine(index, { quantity: normalizeNumber(e.target.value, 0) })}
                                            style={{
                                                width: '100%',
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        />

                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.unit_price}
                                            onChange={(e) => updateLine(index, { unit_price: normalizeNumber(e.target.value, 0) })}
                                            style={{
                                                width: '100%',
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        />

                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            value={line.discount_percent}
                                            onChange={(e) => updateLine(index, { discount_percent: normalizeNumber(e.target.value, 0) })}
                                            style={{
                                                width: '100%',
                                                padding: '9px 10px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        />

                                        <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                                            ${rowSubtotal.toFixed(2)}
                                        </div>

                                        <button
                                            onClick={() => removeLine(index)}
                                            style={{
                                                background: 'rgba(239,68,68,0.1)',
                                                border: '1px solid rgba(239,68,68,0.35)',
                                                color: '#F87171',
                                                width: 34,
                                                height: 34,
                                                borderRadius: 8,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}

                            <button
                                onClick={addLine}
                                style={{
                                    marginTop: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px dashed #DC2626',
                                    background: 'transparent',
                                    color: '#F87171',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    width: 'fit-content',
                                }}
                            >
                                <Plus size={14} /> Agregar línea
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Notas</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Condiciones comerciales, alcance, tiempos de entrega..."
                                style={{
                                    width: '100%',
                                    marginTop: 6,
                                    minHeight: 110,
                                    padding: '10px 12px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)',
                                    color: 'var(--text)',
                                    resize: 'vertical',
                                }}
                            />
                        </div>

                        <div style={{
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: 14,
                            background: 'rgba(255,255,255,0.02)',
                        }}>
                            <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}>
                                    <span>Subtotal</span>
                                    <strong style={{ color: 'var(--text)' }}>${computed.subtotal.toFixed(2)}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
                                    <span>IVA</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={taxRate}
                                            onChange={(e) => setTaxRate(normalizeNumber(e.target.value, 0))}
                                            style={{
                                                width: 80,
                                                padding: '7px 8px',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--background)',
                                                color: 'var(--text)',
                                            }}
                                        />
                                        <span>%</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}>
                                    <span>Impuesto</span>
                                    <strong style={{ color: 'var(--text)' }}>${computed.taxAmount.toFixed(2)}</strong>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--muted)', fontSize: 13 }}>
                                    <span>Descuento</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={discountAmount}
                                        onChange={(e) => setDiscountAmount(normalizeNumber(e.target.value, 0))}
                                        style={{
                                            width: 100,
                                            padding: '7px 8px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: 'var(--background)',
                                            color: 'var(--text)',
                                        }}
                                    />
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', color: 'var(--text)' }}>
                                    <span style={{ fontSize: 18, fontWeight: 800 }}>Total</span>
                                    <span style={{ fontSize: 26, fontWeight: 900, color: '#34D399' }}>${computed.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#DC2626',
                            color: 'white',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            opacity: saving ? 0.7 : 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <Save size={16} />
                        {saving ? 'Guardando...' : editQuote ? 'Actualizar Cotización' : 'Guardar Cotización'}
                    </button>
                </div>
            </div>
        </div>
    );
}
