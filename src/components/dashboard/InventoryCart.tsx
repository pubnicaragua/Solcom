'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, Plus, Minus, ShoppingCart, FileText, Package, Loader2, Search, ChevronDown, ChevronUp, Calendar, MapPin, User } from 'lucide-react';
import Link from 'next/link';

/* ───── Types ───── */
export interface CartItem {
    itemId: string;
    sku: string;
    name: string;
    color: string | null;
    brand: string | null;
    quantity: number;
}

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    ruc: string;
    zoho_contact_id: string | null;
    source: 'zoho' | 'supabase';
}

interface Warehouse {
    id: string;
    code: string;
    name: string;
}

interface InventoryCartProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    onUpdateQuantity: (itemId: string, qty: number) => void;
    onRemoveItem: (itemId: string) => void;
    onClearCart: () => void;
    onQuoteCreated: () => void;
}

/* ───── Helpers ───── */
function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function todayPlusDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/* ───── Styles ───── */
const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text, #e2e8f0)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--muted, #94a3b8)',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
};

const fieldGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
};

const validationErrorStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#f87171',
    marginTop: 2,
};

/* ───── Component ───── */
export default function InventoryCart({
    isOpen,
    onClose,
    items,
    onUpdateQuantity,
    onRemoveItem,
    onClearCart,
    onQuoteCreated,
}: InventoryCartProps) {
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [createdQuoteNumber, setCreatedQuoteNumber] = useState('');

    // Quote data fields
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [selectedCustomerName, setSelectedCustomerName] = useState('');
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [warehouseId, setWarehouseId] = useState('');

    const [quoteDate, setQuoteDate] = useState(todayStr);
    const [validUntil, setValidUntil] = useState(() => todayPlusDays(7));

    const [formExpanded, setFormExpanded] = useState(true);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    const customerDropdownRef = useRef<HTMLDivElement>(null);
    const customerInputRef = useRef<HTMLInputElement>(null);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const totalItems = items.length;
    const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

    // Fetch customers
    const fetchCustomers = useCallback(async (search: string) => {
        setLoadingCustomers(true);
        try {
            const res = await fetch(`/api/ventas/customers?search=${encodeURIComponent(search)}`);
            const data = await res.json();
            setCustomers(data?.customers || []);
        } catch {
            setCustomers([]);
        } finally {
            setLoadingCustomers(false);
        }
    }, []);

    // Fetch warehouses
    const fetchWarehouses = useCallback(async () => {
        try {
            const res = await fetch('/api/warehouses');
            const data = await res.json();
            setWarehouses(Array.isArray(data) ? data : data?.warehouses || []);
        } catch {
            setWarehouses([]);
        }
    }, []);

    // Load data when cart opens
    useEffect(() => {
        if (isOpen) {
            fetchCustomers('');
            fetchWarehouses();
        }
    }, [isOpen, fetchCustomers, fetchWarehouses]);

    // Cleanup blur timeout
    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        };
    }, []);

    function selectCustomer(customer: Customer) {
        setSelectedCustomerId(customer.id);
        setSelectedCustomerName(customer.name);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
        setValidationErrors((prev) => {
            const next = { ...prev };
            delete next.customer;
            return next;
        });
    }

    function handleCustomerSearchChange(text: string) {
        setCustomerSearch(text);
        if (selectedCustomerId && text !== selectedCustomerName) {
            setSelectedCustomerId('');
            setSelectedCustomerName('');
        }
        fetchCustomers(text);
        setShowCustomerDropdown(true);
    }

    function handleCustomerFocus() {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        setShowCustomerDropdown(true);
        if (!customerSearch) fetchCustomers('');
    }

    function handleCustomerBlur() {
        blurTimeoutRef.current = setTimeout(() => {
            setShowCustomerDropdown(false);
        }, 140);
    }

    function validate(): boolean {
        const errors: Record<string, string> = {};
        if (!selectedCustomerId) errors.customer = 'Selecciona un cliente';
        if (!warehouseId) errors.warehouse = 'Selecciona una bodega';
        if (!quoteDate) errors.date = 'Selecciona la fecha';
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }

    async function handleCreateQuote() {
        if (items.length === 0) return;
        if (!validate()) return;

        setCreating(true);
        setError('');
        setSuccess(false);

        try {
            const quoteItems = items.map((item) => ({
                item_id: item.itemId,
                description: `${item.name}${item.color ? ` — ${item.color}` : ''}${item.brand ? ` (${item.brand})` : ''}`,
                quantity: item.quantity,
                unit_price: 0,
                discount_percent: 0,
            }));

            const payload = {
                customer_id: selectedCustomerId,
                warehouse_id: warehouseId,
                date: quoteDate,
                valid_until: validUntil || null,
                status: 'borrador',
                tax_rate: 15,
                discount_amount: 0,
                notes: 'Cotización generada desde inventario — precios pendientes de asignación.',
                template_key: null,
                source: 'inventory_cart',
                items: quoteItems,
                sync_to_zoho: true,
            };

            const response = await fetch('/api/ventas/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || 'No se pudo crear la cotización.');
            }

            setCreatedQuoteNumber(data?.quote?.quote_number || '');
            setSuccess(true);
            onClearCart();
            onQuoteCreated();
            // Reset form
            setSelectedCustomerId('');
            setSelectedCustomerName('');
            setCustomerSearch('');
            setWarehouseId('');
            setQuoteDate(todayStr());
            setValidUntil(todayPlusDays(7));
            setValidationErrors({});
        } catch (err: any) {
            setError(err?.message || 'Error al crear cotización.');
        } finally {
            setCreating(false);
        }
    }

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1999,
                    background: 'rgba(0, 0, 0, 0.45)',
                    transition: 'opacity 0.25s',
                }}
            />

            {/* Drawer */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 'min(420px, 92vw)',
                    zIndex: 2000,
                    background: 'var(--card, #0f172a)',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideInRight 0.25s ease-out',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 18px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        background: 'linear-gradient(135deg, rgba(15,27,45,0.9) 0%, rgba(17,31,54,0.7) 100%)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: 'rgba(16,185,129,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <ShoppingCart size={18} style={{ color: '#34d399' }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e2e8f0)' }}>
                                Carrito de Cotización
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
                                {totalItems} producto{totalItems !== 1 ? 's' : ''} · {totalUnits} unidad{totalUnits !== 1 ? 'es' : ''}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8,
                            width: 34,
                            height: 34,
                            color: 'var(--muted, #94a3b8)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Success State */}
                {success && (
                    <div
                        style={{
                            margin: 16,
                            padding: 18,
                            borderRadius: 12,
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.3)',
                            textAlign: 'center',
                        }}
                    >
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'rgba(16,185,129,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 12px',
                            }}
                        >
                            <FileText size={24} style={{ color: '#34d399' }} />
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399', marginBottom: 4 }}>
                            ¡Cotización creada!
                        </div>
                        {createdQuoteNumber && (
                            <div style={{ fontSize: 13, color: '#6ee7b7', marginBottom: 4 }}>
                                {createdQuoteNumber}
                            </div>
                        )}
                        <div style={{ fontSize: 12, color: '#6ee7b7', marginBottom: 12 }}>
                            Sincronizada con Zoho Books
                        </div>
                        <Link
                            href="/ventas/cotizaciones"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '10px 20px',
                                background: 'rgba(16,185,129,0.2)',
                                color: '#34d399',
                                border: '1px solid rgba(16,185,129,0.4)',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 700,
                                textDecoration: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            <FileText size={15} />
                            Ver Cotizaciones
                        </Link>
                        <div style={{ marginTop: 12 }}>
                            <button
                                onClick={() => setSuccess(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--muted, #64748b)',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                }}
                            >
                                Seguir agregando productos
                            </button>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div
                        style={{
                            margin: '12px 16px 0',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(239,68,68,0.4)',
                            background: 'rgba(127,29,29,0.3)',
                            color: '#FCA5A5',
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Quote Data Form + Items List */}
                {!success && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                        {/* Quote Data Section */}
                        {items.length > 0 && (
                            <div
                                style={{
                                    marginBottom: 12,
                                    borderRadius: 10,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.02)',
                                    overflow: 'hidden',
                                }}
                            >
                                {/* Section Header */}
                                <button
                                    onClick={() => setFormExpanded(!formExpanded)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: 'none',
                                        borderBottom: formExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                        color: 'var(--text, #e2e8f0)',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 700,
                                    }}
                                >
                                    <span>Datos de cotización</span>
                                    {formExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {/* Form Fields */}
                                {formExpanded && (
                                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {/* Customer */}
                                        <div style={fieldGroupStyle}>
                                            <label style={labelStyle}>
                                                <User size={11} />
                                                Cliente *
                                            </label>
                                            <div style={{ position: 'relative' }} ref={customerDropdownRef}>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        ref={customerInputRef}
                                                        type="text"
                                                        value={customerSearch}
                                                        onChange={(e) => handleCustomerSearchChange(e.target.value)}
                                                        onFocus={handleCustomerFocus}
                                                        onBlur={handleCustomerBlur}
                                                        placeholder="Buscar cliente..."
                                                        style={{
                                                            ...inputStyle,
                                                            paddingRight: 30,
                                                            borderColor: validationErrors.customer ? 'rgba(239,68,68,0.6)' : undefined,
                                                        }}
                                                    />
                                                    <Search
                                                        size={13}
                                                        style={{
                                                            position: 'absolute',
                                                            right: 10,
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            color: 'var(--muted, #64748b)',
                                                            pointerEvents: 'none',
                                                        }}
                                                    />
                                                </div>
                                                {validationErrors.customer && (
                                                    <div style={validationErrorStyle}>{validationErrors.customer}</div>
                                                )}

                                                {/* Customer Dropdown */}
                                                {showCustomerDropdown && (
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            top: 'calc(100% + 4px)',
                                                            left: 0,
                                                            right: 0,
                                                            maxHeight: 200,
                                                            overflowY: 'auto',
                                                            background: 'var(--card, #1e293b)',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            borderRadius: 8,
                                                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                                            zIndex: 50,
                                                        }}
                                                    >
                                                        {loadingCustomers && customers.length === 0 ? (
                                                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                                                Buscando...
                                                            </div>
                                                        ) : customers.length === 0 ? (
                                                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                                                Sin resultados
                                                            </div>
                                                        ) : (
                                                            customers.map((c) => (
                                                                <button
                                                                    key={c.id}
                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                    onClick={() => selectCustomer(c)}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '8px 12px',
                                                                        border: 'none',
                                                                        background: selectedCustomerId === c.id
                                                                            ? 'rgba(59,130,246,0.15)'
                                                                            : 'transparent',
                                                                        color: 'var(--text, #e2e8f0)',
                                                                        cursor: 'pointer',
                                                                        textAlign: 'left',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 1,
                                                                        transition: 'background 0.1s',
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (selectedCustomerId !== c.id) {
                                                                            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                                                                        }
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        if (selectedCustomerId !== c.id) {
                                                                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                                                                        }
                                                                    }}
                                                                >
                                                                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                                                                    <span style={{ fontSize: 11, color: 'var(--muted, #64748b)' }}>
                                                                        {c.ruc || c.email || c.phone || ''}
                                                                        {c.source === 'zoho' && (
                                                                            <span style={{
                                                                                marginLeft: 6,
                                                                                fontSize: 10,
                                                                                padding: '1px 5px',
                                                                                borderRadius: 4,
                                                                                background: 'rgba(16,185,129,0.15)',
                                                                                color: '#34d399',
                                                                            }}>
                                                                                Zoho
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Warehouse */}
                                        <div style={fieldGroupStyle}>
                                            <label style={labelStyle}>
                                                <MapPin size={11} />
                                                Bodega *
                                            </label>
                                            <select
                                                value={warehouseId}
                                                onChange={(e) => {
                                                    setWarehouseId(e.target.value);
                                                    setValidationErrors((prev) => {
                                                        const next = { ...prev };
                                                        delete next.warehouse;
                                                        return next;
                                                    });
                                                }}
                                                style={{
                                                    ...inputStyle,
                                                    borderColor: validationErrors.warehouse ? 'rgba(239,68,68,0.6)' : undefined,
                                                }}
                                            >
                                                <option value="">Seleccionar bodega...</option>
                                                {warehouses.map((w) => (
                                                    <option key={w.id} value={w.id}>
                                                        {w.code} — {w.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {validationErrors.warehouse && (
                                                <div style={validationErrorStyle}>{validationErrors.warehouse}</div>
                                            )}
                                        </div>

                                        {/* Dates Row */}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                <label style={labelStyle}>
                                                    <Calendar size={11} />
                                                    Fecha estimación *
                                                </label>
                                                <input
                                                    type="date"
                                                    value={quoteDate}
                                                    onChange={(e) => {
                                                        setQuoteDate(e.target.value);
                                                        setValidationErrors((prev) => {
                                                            const next = { ...prev };
                                                            delete next.date;
                                                            return next;
                                                        });
                                                    }}
                                                    style={{
                                                        ...inputStyle,
                                                        borderColor: validationErrors.date ? 'rgba(239,68,68,0.6)' : undefined,
                                                    }}
                                                />
                                                {validationErrors.date && (
                                                    <div style={validationErrorStyle}>{validationErrors.date}</div>
                                                )}
                                            </div>
                                            <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                <label style={labelStyle}>
                                                    <Calendar size={11} />
                                                    Vencimiento
                                                </label>
                                                <input
                                                    type="date"
                                                    value={validUntil}
                                                    onChange={(e) => setValidUntil(e.target.value)}
                                                    style={inputStyle}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Items List */}
                        {items.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: '48px 20px',
                                    color: 'var(--muted, #64748b)',
                                }}
                            >
                                <Package size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                                    Carrito vacío
                                </div>
                                <div style={{ fontSize: 13 }}>
                                    Activa el modo carrito y haz click en las variantes de la tabla pivot para agregar productos.
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {items.map((item) => (
                                    <div
                                        key={item.itemId}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: 10,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            background: 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                marginBottom: 8,
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        color: 'var(--text, #e2e8f0)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {item.name}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--muted, #64748b)',
                                                        marginTop: 2,
                                                        display: 'flex',
                                                        gap: 8,
                                                        flexWrap: 'wrap',
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontFamily: 'monospace',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            padding: '1px 6px',
                                                            borderRadius: 4,
                                                        }}
                                                    >
                                                        {item.sku}
                                                    </span>
                                                    {item.color && <span> {item.color}</span>}
                                                    {item.brand && <span> {item.brand}</span>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onRemoveItem(item.itemId)}
                                                style={{
                                                    background: 'rgba(239,68,68,0.1)',
                                                    border: '1px solid rgba(239,68,68,0.25)',
                                                    color: '#f87171',
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 7,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    marginLeft: 8,
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>

                                        {/* Quantity Controls */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 11, color: 'var(--muted, #64748b)', fontWeight: 600 }}>
                                                Cant:
                                            </span>
                                            <div
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <button
                                                    onClick={() => onUpdateQuantity(item.itemId, Math.max(1, item.quantity - 1))}
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        border: 'none',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        color: 'var(--muted, #94a3b8)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    <Minus size={13} />
                                                </button>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value, 10);
                                                        if (val > 0) onUpdateQuantity(item.itemId, val);
                                                    }}
                                                    style={{
                                                        width: 50,
                                                        height: 30,
                                                        border: 'none',
                                                        borderLeft: '1px solid rgba(255,255,255,0.1)',
                                                        borderRight: '1px solid rgba(255,255,255,0.1)',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        color: 'var(--text, #e2e8f0)',
                                                        textAlign: 'center',
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                    }}
                                                />
                                                <button
                                                    onClick={() => onUpdateQuantity(item.itemId, item.quantity + 1)}
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        border: 'none',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        color: 'var(--muted, #94a3b8)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    <Plus size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                {!success && items.length > 0 && (
                    <div
                        style={{
                            padding: '14px 16px',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            background: 'linear-gradient(180deg, rgba(15,27,45,0.5) 0%, rgba(15,27,45,0.9) 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                        }}
                    >
                        {/* Summary */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 13,
                                color: 'var(--muted, #94a3b8)',
                                fontWeight: 600,
                            }}
                        >
                            <span>{totalItems} producto{totalItems !== 1 ? 's' : ''}</span>
                            <span>{totalUnits} unidad{totalUnits !== 1 ? 'es' : ''} total</span>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={onClearCart}
                                style={{
                                    flex: '0 0 auto',
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    background: 'rgba(239,68,68,0.1)',
                                    color: '#f87171',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Trash2 size={14} />
                                Vaciar
                            </button>

                            <button
                                onClick={handleCreateQuote}
                                disabled={creating}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: creating
                                        ? 'rgba(16,185,129,0.3)'
                                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: 'white',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    cursor: creating ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    boxShadow: creating ? 'none' : '0 4px 16px rgba(16,185,129,0.3)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {creating ? (
                                    <>
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        Creando...
                                    </>
                                ) : (
                                    <>
                                        <FileText size={16} />
                                        Crear Cotización
                                    </>
                                )}
                            </button>
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--muted, #64748b)', textAlign: 'center', lineHeight: 1.4 }}>
                            Se creará en Supabase y se sincronizará con Zoho Books.
                        </div>
                    </div>
                )}
            </div>

            {/* Animation keyframes */}
            <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0.5;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
        </>
    );
}
