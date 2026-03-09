'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, Plus, Minus, ShoppingCart, FileText, Package, Loader2, Search, ChevronDown, ChevronUp, Calendar, MapPin, User, ClipboardList, Receipt } from 'lucide-react';
import Link from 'next/link';
import type { InvoicePrefillData } from '@/lib/ventas/invoice-prefill';

/* ───── Types ───── */
export interface CartItem {
    itemId: string;
    zohoItemId?: string | null;
    sku: string;
    name: string;
    color: string | null;
    brand: string | null;
    unitPrice?: number;
    quantity: number;
    maxAvailableQty?: number | null;
}

export type CartType = 'cotizacion' | 'factura' | 'orden_venta';

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
    warehouse_type?: string | null;
}

interface Salesperson {
    id: string;
    zoho_user_id?: string;
    zoho_salesperson_id?: string;
    name: string;
    email: string;
    role: string;
}

interface TaxOption {
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    active: boolean;
    is_editable: boolean;
}

interface ItemFiscalInput {
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    warranty: string;
}

interface InventoryCartProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    onUpdateQuantity: (itemId: string, qty: number) => void;
    onRemoveItem: (itemId: string) => void;
    onClearCart: () => void;
    onDocumentCreated: () => void;
    cartType?: CartType;
    onCartTypeChange?: (type: CartType) => void;
    warehouseId?: string;
    onWarehouseIdChange?: (warehouseId: string) => void;
    parentWarehouses?: Warehouse[];
    familyWarehouses?: Warehouse[];
    onParentWarehouseChange?: (warehouseId: string | null) => void;
    onInvoicePrefillRequested?: (prefill: InvoicePrefillData) => void;
    onSalesOrderEditRequested?: (orderId: string) => void;
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

const CART_TYPE_CONFIG: Record<CartType, { label: string; color: string; bg: string; border: string; icon: any; successLabel: string; successLink: string; successLinkLabel: string }> = {
    cotizacion: {
        label: 'Cotización',
        color: '#60A5FA',
        bg: 'rgba(59,130,246,0.15)',
        border: 'rgba(59,130,246,0.4)',
        icon: FileText,
        successLabel: '¡Cotización creada!',
        successLink: '/ventas/cotizaciones',
        successLinkLabel: 'Ver Cotizaciones',
    },
    factura: {
        label: 'Factura',
        color: '#34D399',
        bg: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.4)',
        icon: Receipt,
        successLabel: '¡Factura creada!',
        successLink: '/ventas',
        successLinkLabel: 'Ver Facturas',
    },
    orden_venta: {
        label: 'Orden de Venta',
        color: '#A78BFA',
        bg: 'rgba(139,92,246,0.15)',
        border: 'rgba(139,92,246,0.4)',
        icon: ClipboardList,
        successLabel: '¡Orden de Venta creada!',
        successLink: '/ventas',
        successLinkLabel: 'Ver Órdenes',
    },
};

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
    onDocumentCreated,
    cartType: controlledCartType,
    onCartTypeChange,
    warehouseId: controlledWarehouseId,
    onWarehouseIdChange,
    parentWarehouses: controlledParentWarehouses,
    familyWarehouses: controlledFamilyWarehouses,
    onParentWarehouseChange,
    onInvoicePrefillRequested,
    onSalesOrderEditRequested,
}: InventoryCartProps) {
    const [internalCartType, setInternalCartType] = useState<CartType>('cotizacion');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [createdDocNumber, setCreatedDocNumber] = useState('');

    // Shared fields
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [selectedCustomerName, setSelectedCustomerName] = useState('');
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    const [internalParentWarehouses, setInternalParentWarehouses] = useState<Warehouse[]>([]);
    const [internalFamilyWarehouses, setInternalFamilyWarehouses] = useState<Warehouse[]>([]);
    const [internalWarehouseId, setInternalWarehouseId] = useState('');

    const [docDate, setDocDate] = useState(todayStr);

    // Cotización specific
    const [validUntil, setValidUntil] = useState(() => todayPlusDays(7));

    // Factura specific
    const [dueDate, setDueDate] = useState(() => todayPlusDays(30));
    const [paymentTerms, setPaymentTerms] = useState('30_dias');
    const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
    const [syncingSalespeople, setSyncingSalespeople] = useState(false);
    const [selectedSalespersonId, setSelectedSalespersonId] = useState('');
    const [taxOptions, setTaxOptions] = useState<TaxOption[]>([]);
    const [itemFiscalByItemId, setItemFiscalByItemId] = useState<Record<string, ItemFiscalInput>>({});

    // Orden de Venta specific
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() => todayPlusDays(7));
    const [ovNotes, setOvNotes] = useState('');

    const [formExpanded, setFormExpanded] = useState(true);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    const customerDropdownRef = useRef<HTMLDivElement>(null);
    const customerInputRef = useRef<HTMLInputElement>(null);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cartType = controlledCartType ?? internalCartType;
    const parentWarehouses = controlledParentWarehouses ?? internalParentWarehouses;
    const familyWarehouses = controlledFamilyWarehouses ?? internalFamilyWarehouses;
    const warehouseId = controlledWarehouseId ?? internalWarehouseId;

    const totalItems = items.length;
    const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
    const config = CART_TYPE_CONFIG[cartType];

    function getItemFiscal(itemId: string): ItemFiscalInput {
        return itemFiscalByItemId[itemId] || {
            tax_id: '',
            tax_name: '',
            tax_percentage: 0,
            warranty: '',
        };
    }

    function updateItemFiscal(itemId: string, patch: Partial<ItemFiscalInput>) {
        setItemFiscalByItemId((prev) => {
            const current = prev[itemId] || {
                tax_id: '',
                tax_name: '',
                tax_percentage: 0,
                warranty: '',
            };
            return {
                ...prev,
                [itemId]: {
                    ...current,
                    ...patch,
                },
            };
        });
    }

    function setCartType(nextType: CartType) {
        if (controlledCartType == null) {
            setInternalCartType(nextType);
        }
        onCartTypeChange?.(nextType);
    }

    function setWarehouseId(nextId: string) {
        if (controlledWarehouseId == null) {
            setInternalWarehouseId(nextId);
        }
        onWarehouseIdChange?.(nextId);
    }

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

    const fetchSalespeople = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
        try {
            const query = options.forceRefresh ? '?sync=1' : '';
            const res = await fetch(`/api/ventas/salespeople${query}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar vendedores');
            const parsedSalespeople = Array.isArray(data?.salespeople) ? data.salespeople : [];
            setSalespeople(parsedSalespeople);
        } catch {
            setSalespeople([]);
        }
    }, []);

    const syncSalespeople = useCallback(async () => {
        if (syncingSalespeople) return;
        setSyncingSalespeople(true);
        try {
            await fetchSalespeople({ forceRefresh: true });
        } finally {
            setSyncingSalespeople(false);
        }
    }, [fetchSalespeople, syncingSalespeople]);

    const fetchTaxes = useCallback(async () => {
        try {
            const res = await fetch('/api/zoho/taxes', { cache: 'no-store' });
            const data = await res.json().catch(() => ([]));
            if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar impuestos');
            const parsedTaxes: TaxOption[] = Array.isArray(data)
                ? data
                : (Array.isArray(data?.taxes) ? data.taxes : []);
            setTaxOptions(parsedTaxes);
        } catch {
            setTaxOptions([]);
        }
    }, []);

    // Fetch parent (empresarial) warehouses
    const fetchParentWarehouses = useCallback(async () => {
        if (controlledParentWarehouses) return;
        try {
            const res = await fetch('/api/warehouses?type=empresarial');
            const data = await res.json();
            setInternalParentWarehouses(Array.isArray(data) ? data : data?.warehouses || []);
        } catch {
            setInternalParentWarehouses([]);
        }
    }, [controlledParentWarehouses]);

    const fetchFamilyWarehouses = useCallback(async (parentWarehouseId: string) => {
        if (controlledFamilyWarehouses) return;
        if (!parentWarehouseId) {
            setInternalFamilyWarehouses([]);
            return;
        }
        try {
            const res = await fetch(`/api/warehouses?family_of=${encodeURIComponent(parentWarehouseId)}`, {
                cache: 'no-store',
            });
            const data = await res.json().catch(() => []);
            setInternalFamilyWarehouses(Array.isArray(data) ? data : data?.warehouses || []);
        } catch {
            setInternalFamilyWarehouses([]);
        }
    }, [controlledFamilyWarehouses]);

    // Load data when cart opens
    useEffect(() => {
        if (isOpen) {
            fetchCustomers('');
            fetchParentWarehouses();
            fetchSalespeople();
            fetchTaxes();
        }
    }, [isOpen, fetchCustomers, fetchParentWarehouses, fetchSalespeople, fetchTaxes]);

    useEffect(() => {
        setItemFiscalByItemId((prev) => {
            const next: Record<string, ItemFiscalInput> = {};
            for (const item of items) {
                next[item.itemId] = prev[item.itemId] || {
                    tax_id: '',
                    tax_name: '',
                    tax_percentage: 0,
                    warranty: '',
                };
            }
            return next;
        });
    }, [items]);

    useEffect(() => {
        if (!isOpen) return;
        if (!warehouseId) {
            if (!controlledFamilyWarehouses) {
                setInternalFamilyWarehouses([]);
            }
            return;
        }
        void fetchFamilyWarehouses(warehouseId);
    }, [isOpen, warehouseId, fetchFamilyWarehouses, controlledFamilyWarehouses]);

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

    function handleWarehouseChange(id: string) {
        setWarehouseId(id);
        if (!controlledFamilyWarehouses) {
            if (!id) {
                setInternalFamilyWarehouses([]);
            } else {
                void fetchFamilyWarehouses(id);
            }
        }
        setValidationErrors((prev) => {
            const next = { ...prev };
            delete next.warehouse;
            return next;
        });
        onParentWarehouseChange?.(id || null);
    }

    function getItemMaxQty(item: CartItem): number | null {
        const parsed = Number(item.maxAvailableQty);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.floor(parsed));
    }

    function clampItemQuantity(item: CartItem, rawQty: number): number {
        const normalized = Number.isFinite(rawQty) ? Math.floor(rawQty) : 1;
        const atLeastOne = Math.max(1, normalized);
        const maxQty = getItemMaxQty(item);
        if (maxQty == null) return atLeastOne;
        if (maxQty <= 0) return 1;
        return Math.min(atLeastOne, maxQty);
    }

    function applyItemQuantityChange(item: CartItem, rawQty: number) {
        const nextQty = clampItemQuantity(item, rawQty);
        const maxQty = getItemMaxQty(item);
        if (maxQty != null && Math.floor(rawQty) > maxQty) {
            setValidationErrors((prev) => ({
                ...prev,
                items: `Cantidad ajustada para "${item.sku || item.name}". Máximo disponible: ${maxQty}.`,
            }));
        } else {
            setValidationErrors((prev) => {
                if (!prev.items) return prev;
                const next = { ...prev };
                delete next.items;
                return next;
            });
        }
        onUpdateQuantity(item.itemId, nextQty);
    }

    function validate(): boolean {
        const errors: Record<string, string> = {};
        if (!selectedCustomerId) errors.customer = 'Selecciona un cliente';
        if (!warehouseId) errors.warehouse = 'Selecciona una ubicación';
        if (!docDate) errors.date = 'Selecciona la fecha';
        if (items.length === 0) {
            errors.items = 'Agrega al menos un producto.';
        } else {
            for (const item of items) {
                const quantity = Number(item.quantity);
                if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
                    errors.items = `Cantidad inválida para "${item.sku || item.name}".`;
                    break;
                }
                const maxQty = getItemMaxQty(item);
                if (maxQty != null && quantity > maxQty) {
                    errors.items = `La cantidad de "${item.sku || item.name}" supera el disponible (${maxQty}).`;
                    break;
                }
            }
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }

    async function handleSubmit() {
        if (items.length === 0) return;
        if (!validate()) return;
        const selectedSalesperson = salespeople.find((seller) => seller.id === selectedSalespersonId) || null;
        const docItems = items.map((item) => {
            const fiscal = getItemFiscal(item.itemId);
            return {
                item_id: item.itemId,
                zoho_item_id: String(item.zohoItemId || '').trim() || null,
                description: `${item.name}${item.color ? ` — ${item.color}` : ''}${item.brand ? ` (${item.brand})` : ''}`,
                quantity: item.quantity,
                unit_price: Math.max(0, Number(item.unitPrice ?? 0) || 0),
                discount_percent: 0,
                tax_id: String(fiscal.tax_id || '').trim(),
                tax_name: String(fiscal.tax_name || '').trim(),
                tax_percentage: Math.max(0, Number(fiscal.tax_percentage || 0)),
                warranty: String(fiscal.warranty || '').trim() || null,
            };
        });

        if (cartType === 'factura') {
            if (!onInvoicePrefillRequested) {
                setError('No se pudo abrir Facturación para completar la factura.');
                return;
            }
            onInvoicePrefillRequested({
                customer_id: selectedCustomerId,
                customer_name: selectedCustomerName || customerSearch || null,
                salesperson_id: selectedSalesperson?.id || null,
                salesperson_name: selectedSalesperson?.name || null,
                warehouse_id: warehouseId || null,
                items: docItems.map((line, idx) => ({
                    item_id: line.item_id,
                    zoho_item_id: line.zoho_item_id,
                    description: line.description,
                    quantity: line.quantity,
                    available_qty: getItemMaxQty(items[idx]),
                    unit_price: line.unit_price,
                    discount_percent: line.discount_percent,
                    tax_id: line.tax_id || null,
                    tax_name: line.tax_name || null,
                    tax_percentage: line.tax_percentage,
                    warranty: line.warranty || null,
                })),
            });
            return;
        }

        setCreating(true);
        setError('');
        setSuccess(false);

        try {

            let response: Response;
            let docNumber = '';

            if (cartType === 'cotizacion') {
                const payload = {
                    customer_id: selectedCustomerId,
                    warehouse_id: warehouseId,
                    date: docDate,
                    valid_until: validUntil || null,
                    status: 'borrador',
                    discount_amount: 0,
                    notes: 'Cotización generada desde inventario — precios pendientes de asignación.',
                    template_key: null,
                    source: 'inventory_cart',
                    items: docItems,
                    sync_to_zoho: true,
                };
                response = await fetch('/api/ventas/quotes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data?.error || 'No se pudo crear la cotización.');
                docNumber = data?.quote?.quote_number || '';
            } else {
                // orden_venta
                const payload = {
                    customer_id: selectedCustomerId,
                    warehouse_id: warehouseId,
                    date: docDate,
                    expected_delivery_date: expectedDeliveryDate || null,
                    salesperson_id: selectedSalesperson?.id || null,
                    salesperson_name: selectedSalesperson?.name || null,
                    status: 'borrador',
                    discount_amount: 0,
                    notes: ovNotes || 'Orden de venta generada desde inventario — precios pendientes de asignación.',
                    source: 'inventory_cart',
                    items: docItems,
                    sync_to_zoho: true,
                };
                response = await fetch('/api/ventas/sales-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data?.error || 'No se pudo crear la orden de venta.');
                docNumber = data?.order?.order_number || '';
                const createdOrderId = String(data?.order?.id || '').trim();
                const isSyncPending =
                    response.status === 202
                    || data?.code === 'SYNC_PENDING'
                    || String(data?.order?.sync_status || '').toLowerCase() === 'pending_sync';

                if (isSyncPending && createdOrderId) {
                    try {
                        await fetch(`/api/ventas/sync/retry/${encodeURIComponent(createdOrderId)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                document_type: 'sales_order',
                                action: 'sync_create',
                                immediate: true,
                            }),
                        });
                    } catch {
                        // no-op: si falla el retry inmediato, quedará en cola para retry manual/worker
                    }
                }

                if (isSyncPending && data?.warning) {
                    alert(`OV creada localmente. Zoho pendiente: ${String(data.warning)}`);
                }

                if (createdOrderId && onSalesOrderEditRequested) {
                    onClearCart();
                    onDocumentCreated();
                    onSalesOrderEditRequested(createdOrderId);
                    return;
                }
            }

            setCreatedDocNumber(docNumber);
            setSuccess(true);
            onClearCart();
            onDocumentCreated();
            // Reset form
            setSelectedCustomerId('');
            setSelectedCustomerName('');
            setCustomerSearch('');
            if (controlledWarehouseId == null) {
                setWarehouseId('');
            }
            setDocDate(todayStr());
            setValidUntil(todayPlusDays(7));
            setDueDate(todayPlusDays(30));
            setExpectedDeliveryDate(todayPlusDays(7));
            setSelectedSalespersonId('');
            setOvNotes('');
            setValidationErrors({});
        } catch (err: any) {
            setError(err?.message || 'Error al crear documento.');
        } finally {
            setCreating(false);
        }
    }

    if (!isOpen) return null;

    const CartTypeIcon = config.icon;

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
                                background: config.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <ShoppingCart size={18} style={{ color: config.color }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e2e8f0)' }}>
                                Carrito
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

                {/* Cart Type Toggle */}
                <div style={{
                    padding: '10px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    gap: 6,
                }}>
                    {(['cotizacion', 'factura', 'orden_venta'] as CartType[]).map((type) => {
                        const tc = CART_TYPE_CONFIG[type];
                        const isActive = cartType === type;
                        const disabled = !warehouseId;
                        const Icon = tc.icon;
                        return (
                            <button
                                key={type}
                                disabled={disabled}
                                onClick={() => {
                                    if (!warehouseId) {
                                        setValidationErrors((prev) => ({
                                            ...prev,
                                            warehouse: prev.warehouse || 'Selecciona una bodega empresarial',
                                        }));
                                        return;
                                    }
                                    setCartType(type);
                                    setError('');
                                    setSuccess(false);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '7px 8px',
                                    borderRadius: 8,
                                    border: `1px solid ${isActive ? tc.border : 'rgba(255,255,255,0.08)'}`,
                                    background: isActive ? tc.bg : 'transparent',
                                    color: isActive ? tc.color : 'var(--muted, #64748b)',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.6 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Icon size={13} />
                                {tc.label}
                            </button>
                        );
                    })}
                </div>

                {/* Success State */}
                {success && (
                    <div
                        style={{
                            margin: 16,
                            padding: 18,
                            borderRadius: 12,
                            background: config.bg,
                            border: `1px solid ${config.border}`,
                            textAlign: 'center',
                        }}
                    >
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: config.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 12px',
                            }}
                        >
                            <CartTypeIcon size={24} style={{ color: config.color }} />
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: config.color, marginBottom: 4 }}>
                            {config.successLabel}
                        </div>
                        {createdDocNumber && (
                            <div style={{ fontSize: 13, color: config.color, marginBottom: 4, opacity: 0.8 }}>
                                {createdDocNumber}
                            </div>
                        )}
                        <div style={{ fontSize: 12, color: config.color, marginBottom: 12, opacity: 0.7 }}>
                            Sincronizada con Zoho Books
                        </div>
                        <Link
                            href={config.successLink}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '10px 20px',
                                background: config.bg,
                                color: config.color,
                                border: `1px solid ${config.border}`,
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 700,
                                textDecoration: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            <CartTypeIcon size={15} />
                            {config.successLinkLabel}
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

                {/* Form + Items List */}
                {!success && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                        {/* Form Section */}
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
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <CartTypeIcon size={13} style={{ color: config.color }} />
                                        Datos de {config.label}
                                    </span>
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

                                        {/* Parent Warehouse (Empresarial) */}
                                        <div style={fieldGroupStyle}>
                                            <label style={labelStyle}>
                                                <MapPin size={11} />
                                                Bodega empresarial *
                                            </label>
                                            <select
                                                value={warehouseId}
                                                onChange={(e) => handleWarehouseChange(e.target.value)}
                                                style={{
                                                    ...inputStyle,
                                                    borderColor: validationErrors.warehouse ? 'rgba(239,68,68,0.6)' : undefined,
                                                }}
                                            >
                                                <option value="">Seleccionar bodega empresarial...</option>
                                                {parentWarehouses.map((w) => (
                                                    <option key={w.id} value={w.id}>
                                                        {w.code} — {w.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {validationErrors.warehouse && (
                                                <div style={validationErrorStyle}>{validationErrors.warehouse}</div>
                                            )}
                                            {warehouseId && (
                                                <div
                                                    style={{
                                                        marginTop: 7,
                                                        padding: '7px 8px',
                                                        borderRadius: 8,
                                                        border: '1px solid rgba(16,185,129,0.2)',
                                                        background: 'rgba(16,185,129,0.05)',
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        gap: 5,
                                                    }}
                                                >
                                                    {familyWarehouses.length > 0 ? (
                                                        familyWarehouses.map((w) => {
                                                            const isParent = w.id === warehouseId;
                                                            return (
                                                                <span
                                                                    key={w.id}
                                                                    style={{
                                                                        fontSize: 10,
                                                                        fontWeight: 800,
                                                                        padding: '2px 6px',
                                                                        borderRadius: 999,
                                                                        border: isParent
                                                                            ? '1px solid rgba(16,185,129,0.45)'
                                                                            : '1px solid rgba(96,165,250,0.35)',
                                                                        background: isParent
                                                                            ? 'rgba(16,185,129,0.15)'
                                                                            : 'rgba(59,130,246,0.12)',
                                                                        color: isParent ? '#34d399' : '#93C5FD',
                                                                    }}
                                                                >
                                                                    {w.code} {isParent ? '(Padre)' : '(Hijo)'}
                                                                </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                            No hay almacenes hijos vinculados para esta bodega padre.
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Dynamic fields based on cart type */}
                                        {cartType === 'cotizacion' && (
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                    <label style={labelStyle}>
                                                        <Calendar size={11} />
                                                        Fecha *
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={docDate}
                                                        onChange={(e) => {
                                                            setDocDate(e.target.value);
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
                                                        Válido hasta
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={validUntil}
                                                        onChange={(e) => setValidUntil(e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {cartType === 'factura' && (
                                            <>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>
                                                            <Calendar size={11} />
                                                            Fecha *
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={docDate}
                                                            onChange={(e) => {
                                                                setDocDate(e.target.value);
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
                                                    </div>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>
                                                            <Calendar size={11} />
                                                            Vencimiento
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={dueDate}
                                                            onChange={(e) => setDueDate(e.target.value)}
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>Términos de pago</label>
                                                        <select
                                                            value={paymentTerms}
                                                            onChange={(e) => setPaymentTerms(e.target.value)}
                                                            style={inputStyle}
                                                        >
                                                            <option value="contado">Contado</option>
                                                            <option value="7_dias">7 días</option>
                                                            <option value="15_dias">15 días</option>
                                                            <option value="30_dias">30 días</option>
                                                            <option value="45_dias">45 días</option>
                                                            <option value="60_dias">60 días</option>
                                                            <option value="90_dias">90 días</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                            <label style={{ ...labelStyle, marginBottom: 0 }}>
                                                                <User size={11} />
                                                                Vendedor
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={syncSalespeople}
                                                                disabled={syncingSalespeople}
                                                                style={{
                                                                    border: '1px solid var(--border, rgba(148,163,184,0.25))',
                                                                    background: 'transparent',
                                                                    color: 'var(--muted, #9ca3af)',
                                                                    borderRadius: 6,
                                                                    padding: '3px 7px',
                                                                    fontSize: 10,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 5,
                                                                    cursor: syncingSalespeople ? 'wait' : 'pointer',
                                                                    opacity: syncingSalespeople ? 0.7 : 1,
                                                                }}
                                                            >
                                                                {syncingSalespeople ? <Loader2 size={11} className="animate-spin" /> : null}
                                                                {syncingSalespeople ? 'Sync...' : 'Actualizar'}
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={selectedSalespersonId}
                                                            onChange={(e) => setSelectedSalespersonId(e.target.value)}
                                                            style={inputStyle}
                                                        >
                                                            <option value="">Seleccionar vendedor...</option>
                                                            {salespeople.length === 0 && (
                                                                <option value="" disabled>
                                                                    Sin vendedores disponibles
                                                                </option>
                                                            )}
                                                            {salespeople.map((seller) => (
                                                                <option key={seller.id} value={seller.id}>
                                                                    {seller.name} — {seller.role}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {cartType === 'orden_venta' && (
                                            <>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>
                                                            <Calendar size={11} />
                                                            Fecha *
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={docDate}
                                                            onChange={(e) => {
                                                                setDocDate(e.target.value);
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
                                                    </div>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>
                                                            <Calendar size={11} />
                                                            Entrega esperada
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={expectedDeliveryDate}
                                                            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                            <label style={{ ...labelStyle, marginBottom: 0 }}>
                                                                <User size={11} />
                                                                Vendedor
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={syncSalespeople}
                                                                disabled={syncingSalespeople}
                                                                style={{
                                                                    border: '1px solid var(--border, rgba(148,163,184,0.25))',
                                                                    background: 'transparent',
                                                                    color: 'var(--muted, #9ca3af)',
                                                                    borderRadius: 6,
                                                                    padding: '3px 7px',
                                                                    fontSize: 10,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 5,
                                                                    cursor: syncingSalespeople ? 'wait' : 'pointer',
                                                                    opacity: syncingSalespeople ? 0.7 : 1,
                                                                }}
                                                            >
                                                                {syncingSalespeople ? <Loader2 size={11} className="animate-spin" /> : null}
                                                                {syncingSalespeople ? 'Sync...' : 'Actualizar'}
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={selectedSalespersonId}
                                                            onChange={(e) => setSelectedSalespersonId(e.target.value)}
                                                            style={inputStyle}
                                                        >
                                                            <option value="">Seleccionar vendedor...</option>
                                                            {salespeople.length === 0 && (
                                                                <option value="" disabled>
                                                                    Sin vendedores disponibles
                                                                </option>
                                                            )}
                                                            {salespeople.map((seller) => (
                                                                <option key={seller.id} value={seller.id}>
                                                                    {seller.name} — {seller.role}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ ...fieldGroupStyle, flex: 1 }}>
                                                        <label style={labelStyle}>Notas</label>
                                                        <input
                                                            type="text"
                                                            value={ovNotes}
                                                            onChange={(e) => setOvNotes(e.target.value)}
                                                            placeholder="Notas adicionales"
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
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
                                {items.map((item) => {
                                    const maxQty = getItemMaxQty(item);
                                    const atMaxQty = maxQty != null && item.quantity >= maxQty;
                                    return (
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
                                                    onClick={() => applyItemQuantityChange(item, item.quantity - 1)}
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
                                                    max={maxQty != null ? maxQty : undefined}
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value, 10);
                                                        if (!Number.isFinite(val)) return;
                                                        if (val > 0) applyItemQuantityChange(item, val);
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
                                                    onClick={() => applyItemQuantityChange(item, item.quantity + 1)}
                                                    disabled={atMaxQty}
                                                    style={{
                                                        width: 30,
                                                        height: 30,
                                                        border: 'none',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        color: 'var(--muted, #94a3b8)',
                                                        cursor: atMaxQty ? 'not-allowed' : 'pointer',
                                                        opacity: atMaxQty ? 0.5 : 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    <Plus size={13} />
                                                </button>
                                            </div>
                                            {maxQty != null && (
                                                <span style={{ fontSize: 10, color: atMaxQty ? '#fbbf24' : 'var(--muted, #64748b)' }}>
                                                    Máx: {maxQty}
                                                </span>
                                            )}
                                        </div>

                                        {/* Fiscal Controls */}
                                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                            <select
                                                value={getItemFiscal(item.itemId).tax_id}
                                                onChange={(e) => {
                                                    const selectedTax = taxOptions.find((tax) => tax.tax_id === e.target.value) || null;
                                                    updateItemFiscal(item.itemId, {
                                                        tax_id: selectedTax?.tax_id || '',
                                                        tax_name: selectedTax?.tax_name || '',
                                                        tax_percentage: Math.max(0, Number(selectedTax?.tax_percentage || 0)),
                                                    });
                                                    setValidationErrors((prev) => {
                                                        if (!prev.items) return prev;
                                                        const next = { ...prev };
                                                        delete next.items;
                                                        return next;
                                                    });
                                                }}
                                                style={{
                                                    ...inputStyle,
                                                    fontSize: 12,
                                                }}
                                            >
                                                <option value="">Impuesto (opcional)</option>
                                                {taxOptions.map((tax) => (
                                                    <option key={tax.tax_id} value={tax.tax_id}>
                                                        {tax.tax_name} ({Number(tax.tax_percentage || 0).toFixed(2)}%)
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                value={getItemFiscal(item.itemId).warranty}
                                                onChange={(e) => updateItemFiscal(item.itemId, { warranty: e.target.value })}
                                                placeholder="Garantía (opcional)"
                                                style={{ ...inputStyle, fontSize: 12 }}
                                            />
                                        </div>
                                        </div>
                                    );
                                })}
                                {validationErrors.items && (
                                    <div style={{ ...validationErrorStyle, marginTop: 2 }}>
                                        {validationErrors.items}
                                    </div>
                                )}
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
                                onClick={handleSubmit}
                                disabled={creating}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: creating
                                        ? config.bg
                                        : `linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%)`,
                                    color: 'white',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    cursor: creating ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    boxShadow: creating ? 'none' : `0 4px 16px ${config.color}44`,
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
                                        <CartTypeIcon size={16} />
                                        {cartType === 'factura'
                                            ? 'Continuar a Factura'
                                            : `Crear ${config.label}`}
                                    </>
                                )}
                            </button>
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--muted, #64748b)', textAlign: 'center', lineHeight: 1.4 }}>
                            {cartType === 'factura'
                                ? 'Se abrirá Facturación con estos datos para completar seriales y campos finales.'
                                : 'Se creará en Supabase y se sincronizará con Zoho Books.'}
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
