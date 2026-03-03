'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { X, Loader2, Save, Plus, Trash2 } from 'lucide-react';

interface CustomerOption {
    id: string;
    name: string;
    email?: string | null;
    ruc?: string | null;
}

interface WarehouseOption {
    id: string;
    code: string;
    name: string;
}

interface OrderLine {
    id?: string;
    item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
}

interface SalesOrderFormProps {
    isOpen: boolean;
    orderId: string | null;
    onClose: () => void;
    onSaved: () => void;
}

const PAYMENT_TERMS_OPTIONS = [
    { value: '', label: 'Sin definir' },
    { value: 'contado', label: 'Contado' },
    { value: '1_dia', label: '1 día' },
    { value: '7_dias', label: '7 días' },
    { value: '15_dias', label: '15 días' },
    { value: '30_dias', label: '30 días' },
    { value: '45_dias', label: '45 días' },
    { value: '60_dias', label: '60 días' },
    { value: '90_dias', label: '90 días' },
];

function normalizeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SalesOrderForm({ isOpen, orderId, onClose, onSaved }: SalesOrderFormProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

    const [orderNumber, setOrderNumber] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [warehouseId, setWarehouseId] = useState('');
    const [date, setDate] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('');
    const [shippingZone, setShippingZone] = useState('');
    const [salespersonName, setSalespersonName] = useState('');
    const [salespersonId, setSalespersonId] = useState('');
    const [taxRate, setTaxRate] = useState(15);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<OrderLine[]>([]);

    useEffect(() => {
        if (!isOpen || !orderId) return;
        void loadInitialData(orderId);
    }, [isOpen, orderId]);

    async function loadInitialData(id: string) {
        setLoading(true);
        setError('');
        try {
            const [orderRes, customersRes, warehousesRes] = await Promise.all([
                fetch(`/api/ventas/sales-orders/${id}`, { cache: 'no-store' }),
                fetch('/api/ventas/customers?search=', { cache: 'no-store' }),
                fetch('/api/warehouses?type=empresarial', { cache: 'no-store' }),
            ]);

            const [orderData, customersData, warehousesData] = await Promise.all([
                orderRes.json(),
                customersRes.json().catch(() => ({})),
                warehousesRes.json().catch(() => ([])),
            ]);

            if (!orderRes.ok) {
                throw new Error(orderData?.error || 'No se pudo cargar la orden de venta');
            }

            const order = orderData?.order;
            if (!order) throw new Error('Orden no encontrada');

            const customerOptions = Array.isArray(customersData?.customers) ? customersData.customers : [];
            let nextCustomers: CustomerOption[] = customerOptions;
            if (order.customer?.id && !customerOptions.some((c: any) => c.id === order.customer.id)) {
                nextCustomers = [
                    { id: order.customer.id, name: order.customer.name, email: order.customer.email, ruc: order.customer.ruc },
                    ...customerOptions,
                ];
            }
            setCustomers(nextCustomers);
            setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);

            setOrderNumber(order.order_number || '');
            setCustomerId(order.customer_id || '');
            setWarehouseId(order.warehouse_id || '');
            setDate(order.date || '');
            setExpectedDeliveryDate(order.expected_delivery_date || '');
            setReferenceNumber(order.reference_number || '');
            setPaymentTerms(order.payment_terms || '');
            setDeliveryMethod(order.delivery_method || '');
            setShippingZone(order.shipping_zone || '');
            setSalespersonName(order.salesperson_name || '');
            setSalespersonId(order.salesperson_id || '');
            setTaxRate(normalizeNumber(order.tax_rate, 15));
            setDiscountAmount(normalizeNumber(order.discount_amount, 0));
            setNotes(order.notes || '');
            setItems(
                Array.isArray(order.items) && order.items.length > 0
                    ? order.items.map((line: any) => ({
                        id: line.id,
                        item_id: line.item_id || null,
                        description: line.description || '',
                        quantity: normalizeNumber(line.quantity, 1),
                        unit_price: normalizeNumber(line.unit_price, 0),
                        discount_percent: normalizeNumber(line.discount_percent, 0),
                    }))
                    : [{
                        item_id: null,
                        description: '',
                        quantity: 1,
                        unit_price: 0,
                        discount_percent: 0,
                    }]
            );
        } catch (err: any) {
            setError(err?.message || 'No se pudo cargar la orden');
        } finally {
            setLoading(false);
        }
    }

    function updateLine(index: number, patch: Partial<OrderLine>) {
        setItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    }

    function addLine() {
        setItems((prev) => [
            ...prev,
            { item_id: null, description: '', quantity: 1, unit_price: 0, discount_percent: 0 },
        ]);
    }

    function removeLine(index: number) {
        setItems((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, i) => i !== index);
        });
    }

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, line) => {
            const qty = Math.max(0, normalizeNumber(line.quantity, 0));
            const unit = Math.max(0, normalizeNumber(line.unit_price, 0));
            const discount = Math.max(0, Math.min(100, normalizeNumber(line.discount_percent, 0)));
            return sum + qty * unit * (1 - discount / 100);
        }, 0);
        const taxAmount = subtotal * (Math.max(0, taxRate) / 100);
        const total = subtotal + taxAmount - Math.max(0, discountAmount);
        return {
            subtotal,
            taxAmount,
            total,
        };
    }, [items, taxRate, discountAmount]);

    async function handleSave() {
        if (!orderId) return;
        if (!customerId) {
            setError('Selecciona un cliente.');
            return;
        }
        if (!warehouseId) {
            setError('Selecciona una bodega empresarial.');
            return;
        }
        if (!date) {
            setError('Selecciona la fecha de la orden.');
            return;
        }
        if (!Array.isArray(items) || items.length === 0) {
            setError('Agrega al menos una línea.');
            return;
        }

        const normalizedItems = items
            .map((line) => ({
                id: line.id,
                item_id: line.item_id || null,
                description: String(line.description || '').trim(),
                quantity: Math.max(0, normalizeNumber(line.quantity, 0)),
                unit_price: Math.max(0, normalizeNumber(line.unit_price, 0)),
                discount_percent: Math.max(0, Math.min(100, normalizeNumber(line.discount_percent, 0))),
            }))
            .filter((line) => line.description.length > 0 && line.quantity > 0);

        if (normalizedItems.length === 0) {
            setError('Cada línea debe tener descripción y cantidad mayor a 0.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const payload = {
                customer_id: customerId,
                warehouse_id: warehouseId,
                date,
                expected_delivery_date: expectedDeliveryDate || null,
                reference_number: referenceNumber || null,
                payment_terms: paymentTerms || null,
                delivery_method: deliveryMethod || null,
                shipping_zone: shippingZone || null,
                salesperson_id: salespersonId || null,
                salesperson_name: salespersonName || null,
                tax_rate: Math.max(0, normalizeNumber(taxRate, 15)),
                discount_amount: Math.max(0, normalizeNumber(discountAmount, 0)),
                notes: notes || null,
                items: normalizedItems,
            };

            const res = await fetch(`/api/ventas/sales-orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo guardar la orden');
            }

            onSaved();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar la orden');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2200,
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(3px)',
            padding: '22px 14px',
            overflowY: 'auto',
        }}>
            <div style={{
                maxWidth: 1080,
                margin: '0 auto',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                overflow: 'hidden',
                boxShadow: '0 26px 48px rgba(0,0,0,0.5)',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--border)',
                }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                            Editar Orden de Venta
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {orderNumber || 'Cargando...'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} />
                        Cargando datos de la orden...
                    </div>
                ) : (
                    <div style={{ padding: 16, display: 'grid', gap: 14 }}>
                        {error && (
                            <div style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid rgba(239,68,68,0.45)',
                                background: 'rgba(127,29,29,0.3)',
                                color: '#FCA5A5',
                                fontSize: 12,
                                fontWeight: 700,
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 10,
                        }}>
                            <Field label="Cliente *">
                                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
                                    <option value="">Seleccionar cliente...</option>
                                    {customers.map((customer) => (
                                        <option key={customer.id} value={customer.id}>
                                            {customer.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Bodega empresarial *">
                                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={inputStyle}>
                                    <option value="">Seleccionar bodega...</option>
                                    {warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.code} — {warehouse.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Fecha *">
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
                            </Field>
                            <Field label="Fecha envío esperada">
                                <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} style={inputStyle} />
                            </Field>
                            <Field label="N.° referencia">
                                <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Referencia cliente/externa" style={inputStyle} />
                            </Field>
                            <Field label="Términos de pago">
                                <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} style={inputStyle}>
                                    {PAYMENT_TERMS_OPTIONS.map((term) => (
                                        <option key={term.value} value={term.value}>{term.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Método de entrega">
                                <input type="text" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="Retiro, envío, etc." style={inputStyle} />
                            </Field>
                            <Field label="Zona de envío">
                                <input type="text" value={shippingZone} onChange={(e) => setShippingZone(e.target.value)} placeholder="Managua, León, etc." style={inputStyle} />
                            </Field>
                            <Field label="Vendedor (nombre)">
                                <input type="text" value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} placeholder="Nombre vendedor" style={inputStyle} />
                            </Field>
                            <Field label="Vendedor (id opcional)">
                                <input type="text" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} placeholder="UUID vendedor" style={inputStyle} />
                            </Field>
                            <Field label="IVA %">
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={taxRate}
                                    onChange={(e) => setTaxRate(normalizeNumber(e.target.value, 0))}
                                    style={inputStyle}
                                />
                            </Field>
                            <Field label="Descuento global">
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={discountAmount}
                                    onChange={(e) => setDiscountAmount(normalizeNumber(e.target.value, 0))}
                                    style={inputStyle}
                                />
                            </Field>
                        </div>

                        <Field label="Notas">
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                                placeholder="Notas internas/comerciales..."
                            />
                        </Field>

                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1.8fr 100px 120px 100px 130px 38px',
                                padding: '10px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--muted)',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid var(--border)',
                                background: 'rgba(255,255,255,0.03)',
                            }}>
                                <div>Descripción</div>
                                <div style={{ textAlign: 'right' }}>Cant.</div>
                                <div style={{ textAlign: 'right' }}>P. Unitario</div>
                                <div style={{ textAlign: 'right' }}>Desc. %</div>
                                <div style={{ textAlign: 'right' }}>Subtotal</div>
                                <div />
                            </div>

                            {items.map((line, index) => {
                                const lineSubtotal = Math.max(0, normalizeNumber(line.quantity, 0))
                                    * Math.max(0, normalizeNumber(line.unit_price, 0))
                                    * (1 - Math.max(0, Math.min(100, normalizeNumber(line.discount_percent, 0))) / 100);
                                return (
                                    <div
                                        key={`${line.id || 'new'}-${index}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1.8fr 100px 120px 100px 130px 38px',
                                            gap: 8,
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            borderBottom: '1px solid var(--border)',
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={line.description}
                                            onChange={(e) => updateLine(index, { description: e.target.value })}
                                            placeholder="Descripción del artículo"
                                            style={inputStyle}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={line.quantity}
                                            onChange={(e) => updateLine(index, { quantity: normalizeNumber(e.target.value, 0) })}
                                            style={{ ...inputStyle, textAlign: 'right' }}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={line.unit_price}
                                            onChange={(e) => updateLine(index, { unit_price: normalizeNumber(e.target.value, 0) })}
                                            style={{ ...inputStyle, textAlign: 'right' }}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.01}
                                            value={line.discount_percent}
                                            onChange={(e) => updateLine(index, { discount_percent: normalizeNumber(e.target.value, 0) })}
                                            style={{ ...inputStyle, textAlign: 'right' }}
                                        />
                                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textAlign: 'right' }}>
                                            {lineSubtotal.toFixed(2)}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeLine(index)}
                                            style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: 8,
                                                border: '1px solid rgba(239,68,68,0.4)',
                                                background: 'rgba(239,68,68,0.12)',
                                                color: '#F87171',
                                                cursor: items.length <= 1 ? 'default' : 'pointer',
                                                opacity: items.length <= 1 ? 0.5 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                            disabled={items.length <= 1}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={addLine}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(59,130,246,0.35)',
                                    background: 'rgba(59,130,246,0.12)',
                                    color: '#60A5FA',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                <Plus size={14} />
                                Agregar línea
                            </button>

                            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', minWidth: 240 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Subtotal</span>
                                    <span>{totals.subtotal.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>IVA ({taxRate.toFixed(2)}%)</span>
                                    <span>{totals.taxAmount.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Descuento</span>
                                    <span>-{discountAmount.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                                    <span>Total</span>
                                    <span>{totals.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--muted)',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={saving}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: saving ? 'rgba(16,185,129,0.18)' : 'linear-gradient(135deg, #10B981, #059669)',
                                    color: 'white',
                                    fontSize: 13,
                                    fontWeight: 800,
                                    cursor: saving ? 'default' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
                                Guardar OV
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}</label>
            {children}
        </div>
    );
}

const inputStyle: CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
};
