'use client';

import { useState, useEffect, useRef } from 'react';
import {
    X, Plus, Trash2, Search, UserPlus, FileText,
    MapPin, User, Truck, ChevronDown,
} from 'lucide-react';
import CustomerModal from './CustomerModal';
import DeliverySelector from './DeliverySelector';
import CancellationReasonSelector from './CancellationReasonSelector';

interface InvoiceFormItem {
    item_id: string | null;
    zoho_item_id: string | null;
    description: string;
    quantity: number;
    max_available_qty: number | null;
    unit_price: number;
    discount_percent: number;
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    warranty: string;
    serial_number_value: string;
    available_serials: Array<{ serial_id: string; serial_code: string }>;
    loading_serials: boolean;
}

interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    ruc: string | null;
    source?: 'supabase' | 'zoho';
}

interface Product {
    id: string;
    item_id: string;
    zoho_item_id?: string | null;
    name: string;
    sku: string;
    unit_price: number;
    quantity: number;
    warehouse_id: string;
    warehouse_name: string;
}

interface Warehouse {
    id: string;
    code: string;
    name: string;
    zoho_warehouse_id?: string | null;
}

interface Salesperson {
    id: string;
    zoho_user_id?: string;
    zoho_salesperson_id?: string;
    name: string;
    email: string;
    role: string;
    photo_url?: string | null;
}

interface TaxOption {
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    active: boolean;
    is_editable: boolean;
}

interface InvoicePrefillItem {
    item_id: string;
    zoho_item_id?: string | null;
    description: string;
    quantity?: number;
    available_qty?: number | null;
    unit_price?: number;
    discount_percent?: number;
    serial_number_value?: string | null;
}

interface InvoicePrefillData {
    source_sales_order_id?: string | null;
    source_order_number?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    salesperson_id?: string | null;
    salesperson_name?: string | null;
    warehouse_id?: string | null;
    items?: InvoicePrefillItem[];
}

interface InvoiceFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    editInvoice?: any;
    prefillData?: InvoicePrefillData | null;
}

const TERMS_OPTIONS = [
    { value: '', label: 'Sin términos' },
    { value: '1_dia', label: '1 Día' },
    { value: '7_dias', label: '7 Días' },
    { value: '15_dias', label: '15 Días' },
    { value: '30_dias', label: '30 Días' },
    { value: '45_dias', label: '45 Días' },
    { value: '60_dias', label: '60 Días' },
    { value: '90_dias', label: '90 Días' },
    { value: 'contado', label: 'Contado' },
];

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

export default function InvoiceForm({ isOpen, onClose, onSaved, editInvoice, prefillData = null }: InvoiceFormProps) {
    // Customer
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showCustomerModal, setShowCustomerModal] = useState(false);

    // Core fields
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
    const [dueDate, setDueDate] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [sourceSalesOrderId, setSourceSalesOrderId] = useState<string | null>(null);
    const [terms, setTerms] = useState('');
    const [notes, setNotes] = useState('');
    const [creditDetail, setCreditDetail] = useState('');

    // Warehouse (Ubicación)
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [warehouseId, setWarehouseId] = useState('');

    // Salesperson (Vendedor)
    const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
    const [salespersonId, setSalespersonId] = useState('');
    const [taxOptions, setTaxOptions] = useState<TaxOption[]>([]);

    // Delivery
    const [deliveryRequested, setDeliveryRequested] = useState(false);
    const [deliveryId, setDeliveryId] = useState<string | null>(null);

    // Cancellation (only visible if status changes)
    const [cancellationReasonId, setCancellationReasonId] = useState<string | null>(null);
    const [cancellationComments, setCancellationComments] = useState('');
    const [showCancellation, setShowCancellation] = useState(false);

    // Financials
    const [shippingCharge, setShippingCharge] = useState(0);

    // Line items
    const [lineItems, setLineItems] = useState<InvoiceFormItem[]>([
        {
            item_id: null,
            zoho_item_id: null,
            description: '',
            quantity: 1,
            max_available_qty: null,
            unit_price: 0,
            discount_percent: 0,
            tax_id: '',
            tax_name: '',
            tax_percentage: 0,
            warranty: '',
            serial_number_value: '',
            available_serials: [],
            loading_serials: false,
        },
    ]);

    // Products for autocomplete
    const [products, setProducts] = useState<Product[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [activeProductRow, setActiveProductRow] = useState<number | null>(null);
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const customerRef = useRef<HTMLDivElement>(null);
    const productRef = useRef<HTMLDivElement>(null);
    const lineSerialSourceKey = lineItems
        .map((line, idx) => `${idx}:${String(line.item_id || '')}:${String(line.zoho_item_id || '')}`)
        .join('|');

    useEffect(() => {
        if (isOpen) {
            fetchCustomers();
            fetchWarehouses();
            fetchSalespeople();
            fetchTaxes();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || editInvoice || !prefillData) return;

        const normalizedItems = Array.isArray(prefillData.items)
            ? prefillData.items
                .map((item) => {
                    const maxAvailable = (() => {
                        const parsed = Number(item?.available_qty ?? 0);
                        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
                    })();
                    const requestedQty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
                    const normalizedQty = maxAvailable ? Math.min(requestedQty, maxAvailable) : requestedQty;

                    return {
                        item_id: String(item?.item_id || '').trim() || null,
                        zoho_item_id: String(item?.zoho_item_id || '').trim() || null,
                        description: String(item?.description || '').trim(),
                        quantity: normalizedQty,
                        max_available_qty: maxAvailable,
                        unit_price: Math.max(0, Number(item?.unit_price ?? 0) || 0),
                        discount_percent: Math.max(0, Math.min(100, Number(item?.discount_percent ?? 0) || 0)),
                        tax_id: String((item as any)?.tax_id || '').trim(),
                        tax_name: String((item as any)?.tax_name || '').trim(),
                        tax_percentage: Math.max(0, Number((item as any)?.tax_percentage ?? 0) || 0),
                        warranty: String((item as any)?.warranty || ''),
                        serial_number_value: normalizeSerialInput(item?.serial_number_value || ''),
                        available_serials: [],
                        loading_serials: false,
                    };
                })
                .filter((item) => item.item_id && item.description)
            : [];

        if (prefillData.warehouse_id) {
            setWarehouseId(prefillData.warehouse_id);
        }
        if (prefillData.source_order_number) {
            setOrderNumber(prefillData.source_order_number);
        }
        setSourceSalesOrderId(
            String(prefillData.source_sales_order_id || '').trim() || null
        );
        const prefilledCustomerId = String(prefillData.customer_id || '').trim();
        const prefilledCustomerName = String(prefillData.customer_name || '').trim();
        if (prefilledCustomerId || prefilledCustomerName) {
            const selected: Customer = {
                id: prefilledCustomerId || '',
                name: prefilledCustomerName || 'Cliente seleccionado',
                email: null,
                phone: null,
                ruc: null,
                source: 'supabase',
            };
            setSelectedCustomer(selected);
            setCustomerSearch(selected.name);
        }

        const prefilledSalespersonId = String(prefillData.salesperson_id || '').trim();
        if (prefilledSalespersonId) {
            setSalespersonId(prefilledSalespersonId);
        }

        setLineItems(
            normalizedItems.length > 0
                ? normalizedItems
                : [{
                    item_id: null,
                    zoho_item_id: null,
                    description: '',
                    quantity: 1,
                    max_available_qty: null,
                    unit_price: 0,
                    discount_percent: 0,
                    tax_id: '',
                    tax_name: '',
                    tax_percentage: 0,
                    warranty: '',
                    serial_number_value: '',
                    available_serials: [],
                    loading_serials: false,
                }]
        );
        setError('');
    }, [isOpen, editInvoice, prefillData]);

    useEffect(() => {
        if (!isOpen || editInvoice || !prefillData) return;
        if (salespersonId) return;
        const prefilledSalespersonName = String(prefillData.salesperson_name || '').trim();
        if (!prefilledSalespersonName) return;

        const match = salespeople.find((seller) =>
            equalsIgnoreCase(String(seller.name || '').trim(), prefilledSalespersonName)
        );
        if (match) {
            setSalespersonId(match.id);
        }
    }, [isOpen, editInvoice, prefillData, salespeople, salespersonId]);

    // Auto-calc due date from terms
    useEffect(() => {
        if (terms && invoiceDate) {
            const daysMap: Record<string, number> = {
                '1_dia': 1, '7_dias': 7, '15_dias': 15, '30_dias': 30,
                '45_dias': 45, '60_dias': 60, '90_dias': 90, 'contado': 0,
            };
            const days = daysMap[terms];
            if (days !== undefined) {
                const d = new Date(invoiceDate);
                d.setDate(d.getDate() + days);
                setDueDate(d.toISOString().slice(0, 10));
            }
        }
    }, [terms, invoiceDate]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (customerRef.current && !customerRef.current.contains(e.target as Node)) setShowCustomerDropdown(false);
            if (productRef.current && !productRef.current.contains(e.target as Node)) {
                setShowProductDropdown(false);
                setActiveProductRow(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const fetchCustomers = async (searchText: string = '') => {
        const customerFetchError = 'No se pudieron cargar clientes. Verifica sesión/permisos e intenta de nuevo.';
        try {
            const res = await fetch(`/api/ventas/customers${searchText ? `?search=${encodeURIComponent(searchText)}` : ''}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudieron cargar clientes');
            }
            setCustomers(data.customers || []);
            if (error === customerFetchError) {
                setError('');
            }
        } catch (err) {
            console.error('Error fetching customers:', err);
            setCustomers([]);
            setError(customerFetchError);
        }
    };

    // Debounced customer search
    const customerSearchTimeout = useRef<NodeJS.Timeout | null>(null);
    const handleCustomerSearch = (text: string) => {
        setCustomerSearch(text);
        setShowCustomerDropdown(true);
        if (!text) { setSelectedCustomer(null); fetchCustomers(); return; }
        if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
        customerSearchTimeout.current = setTimeout(() => fetchCustomers(text), 300);
    };

    const fetchProducts = async (searchText: string = '', selectedWarehouseId: string = warehouseId) => {
        if (!selectedWarehouseId) {
            setProducts([]);
            return;
        }

        try {
            const params = new URLSearchParams();
            params.set('warehouseId', selectedWarehouseId);
            if (searchText.trim()) {
                params.set('search', searchText.trim());
            }

            const res = await fetch(`/api/transfers/items?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo cargar inventario');
            }

            const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
            const normalizedProducts: Product[] = (data || [])
                .map((row: any) => {
                    const itemId = String(row?.id || '').trim();
                    if (!itemId) return null;

                    const quantity = Number(row?.current_stock ?? 0);
                    if (!Number.isFinite(quantity)) return null;

                    return {
                        id: itemId,
                        item_id: itemId,
                        zoho_item_id: String(row?.zoho_item_id || '').trim() || null,
                        name: String(row?.name || row?.sku || '').trim() || `Producto ${itemId}`,
                        sku: String(row?.sku || '').trim() || `NO-SKU-${itemId}`,
                        unit_price: Number(row?.unit_price ?? 0) || 0,
                        quantity,
                        warehouse_id: selectedWarehouseId,
                        warehouse_name: selectedWarehouse?.name || selectedWarehouse?.code || 'Bodega',
                    } as Product;
                })
                .filter(Boolean) as Product[];

            setProducts(normalizedProducts);
            setLineItems((current) => current.map((line) => {
                if (!line.item_id) return line;
                const matched = normalizedProducts.find((product) => product.item_id === line.item_id);
                if (!matched) return line;

                const maxAvailable = Math.max(0, Math.floor(Number(matched.quantity) || 0));
                const nextQty = maxAvailable > 0
                    ? Math.min(Math.max(1, Math.floor(Number(line.quantity) || 1)), maxAvailable)
                    : Math.max(1, Math.floor(Number(line.quantity) || 1));

                return {
                    ...line,
                    max_available_qty: maxAvailable > 0 ? maxAvailable : null,
                    quantity: nextQty,
                };
            }));
        } catch (err) {
            console.error('Error fetching products:', err);
            setProducts([]);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        if (!warehouseId) {
            setProducts([]);
            setLineItems((current) => current.map((line) => ({
                ...line,
                max_available_qty: null,
                available_serials: [],
                loading_serials: false,
            })));
            return;
        }

        fetchProducts(productSearch, warehouseId);
        setLineItems((current) => current.map((line) => ({
            ...line,
            available_serials: [],
            loading_serials: false,
        })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseId, isOpen]);

    useEffect(() => {
        if (!isOpen || !warehouseId) return;
        lineItems.forEach((line, idx) => {
            if (line.zoho_item_id) {
                fetchLineSerials(idx, line.zoho_item_id, line.item_id);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, warehouseId, lineSerialSourceKey]);

    const fetchWarehouses = async () => {
        try {
            const res = await fetch('/api/warehouses');
            const data = await res.json();
            setWarehouses(data || []);
        } catch (err) {
            console.error('Error fetching warehouses:', err);
        }
    };

    const fetchSalespeople = async () => {
        try {
            const res = await fetch('/api/ventas/salespeople', { cache: 'no-store' });
            const data = await res.json();
            setSalespeople(data.salespeople || []);
        } catch (err) {
            console.error('Error fetching salespeople:', err);
        }
    };

    const fetchTaxes = async () => {
        try {
            const res = await fetch('/api/zoho/taxes', { cache: 'no-store' });
            const data = await res.json();
            const list: TaxOption[] = Array.isArray(data)
                ? data
                : (Array.isArray(data?.taxes) ? data.taxes : []);
            setTaxOptions(list);
            return list;
        } catch (err) {
            console.error('Error fetching taxes:', err);
            setTaxOptions([]);
            return [];
        }
    };

    const filteredCustomers = customers;

    const serialArray = (value?: string): string[] => {
        if (!value) return [];
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    };

    const getEffectiveMaxQty = (line: InvoiceFormItem): number | null => {
        const stockMax = line.max_available_qty && line.max_available_qty > 0
            ? Math.floor(line.max_available_qty)
            : Number.POSITIVE_INFINITY;
        const serialMax = line.available_serials.length > 0
            ? line.available_serials.length
            : Number.POSITIVE_INFINITY;

        const effective = Math.min(stockMax, serialMax);
        return Number.isFinite(effective) && effective > 0 ? effective : null;
    };

    const normalizeSerialInput = (value: unknown): string => {
        if (Array.isArray(value)) {
            return value
                .map((entry) => String(entry ?? '').trim())
                .filter(Boolean)
                .join(',');
        }
        return String(value ?? '')
            .replace(/[\n;]/g, ',')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .join(',');
    };

    const normalizedProductSearch = productSearch.toLowerCase().trim();
    const filteredProducts = products
        .filter((p) => p.quantity > 0)
        .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
        .filter((p) => {
            if (!normalizedProductSearch) return true;
            return (
                p.name.toLowerCase().includes(normalizedProductSearch) ||
                p.sku.toLowerCase().includes(normalizedProductSearch)
            );
        });

    const selectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
    };

    const fetchLineSerials = async (
        rowIndex: number,
        zohoItemId: string | null,
        localItemId: string | null = null
    ) => {
        if (!zohoItemId || !warehouseId) {
            setLineItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
            return;
        }

        const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
        const zohoWarehouseId = String(selectedWarehouse?.zoho_warehouse_id || '').trim();
        if (!zohoWarehouseId) {
            setLineItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
            return;
        }

        setLineItems((current) => current.map((line, idx) => (
            idx === rowIndex
                ? { ...line, loading_serials: true, available_serials: [] }
                : line
        )));

        try {
            const params = new URLSearchParams();
            params.set('item_id', zohoItemId);
            params.set('warehouse_id', zohoWarehouseId);
            if (localItemId) {
                params.set('local_item_id', String(localItemId));
            }
            if (sourceSalesOrderId) {
                params.set('sales_order_id', String(sourceSalesOrderId));
            }

            const res = await fetch(`/api/zoho/item-serials?${params.toString()}`);
            const data = await res.json();
            const serials = (data?.success && Array.isArray(data?.serials))
                ? data.serials
                    .map((row: any) => ({
                        serial_id: String(row?.serial_id || ''),
                        serial_code: String(row?.serial_code || '').trim(),
                    }))
                    .filter((row: any) => row.serial_code.length > 0)
                : [];

            setLineItems((current) => current.map((line, idx) => {
                if (idx !== rowIndex) return line;
                const selected = serialArray(line.serial_number_value);
                const allowed = new Set(serials.map((s: any) => s.serial_code));
                const normalizedSelected = serials.length > 0
                    ? selected.filter((code) => allowed.has(code))
                    : selected;
                const serialMax = serials.length > 0 ? serials.length : null;
                const stockMax = line.max_available_qty && line.max_available_qty > 0 ? line.max_available_qty : null;
                const effectiveMax = (() => {
                    if (serialMax && stockMax) return Math.min(serialMax, stockMax);
                    if (serialMax) return serialMax;
                    if (stockMax) return stockMax;
                    return null;
                })();
                const nextQty = effectiveMax ? Math.min(Math.max(1, line.quantity), effectiveMax) : Math.max(1, line.quantity);
                const limitedSelected = normalizedSelected.slice(0, nextQty);

                return {
                    ...line,
                    loading_serials: false,
                    available_serials: serials,
                    quantity: nextQty,
                    serial_number_value: limitedSelected.join(','),
                };
            }));
        } catch (serialError) {
            console.error('Error fetching line serials:', serialError);
            setLineItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
        }
    };

    const selectProduct = (product: Product, rowIndex: number) => {
        const zohoItemId = String(product.zoho_item_id || '').trim() || null;
        const maxAvailable = Math.max(0, Math.floor(Number(product.quantity) || 0));

        setLineItems((current) => current.map((line, idx) => {
            if (idx !== rowIndex) return line;
            return {
                ...line,
                item_id: product.item_id,
                zoho_item_id: zohoItemId,
                description: product.name,
                quantity: 1,
                max_available_qty: maxAvailable > 0 ? maxAvailable : null,
                unit_price: product.unit_price || 0,
                tax_id: line.tax_id || '',
                tax_name: line.tax_name || '',
                tax_percentage: line.tax_id ? line.tax_percentage : 0,
                serial_number_value: '',
                available_serials: [],
                loading_serials: false,
            };
        }));

        setShowProductDropdown(false);
        setActiveProductRow(null);
        setProductSearch('');
        setProducts([]);
        fetchLineSerials(rowIndex, zohoItemId, product.item_id);
    };

    const updateLineItem = (index: number, field: keyof InvoiceFormItem, value: any) => {
        const updated = [...lineItems];
        if (!updated[index]) return;

        if (field === 'quantity') {
            const parsedQty = Math.max(1, Math.floor(Number(value) || 1));
            const effectiveMax = getEffectiveMaxQty(updated[index]);
            const qty = effectiveMax ? Math.min(parsedQty, effectiveMax) : parsedQty;
            updated[index] = { ...updated[index], quantity: qty };
            const selected = serialArray(updated[index].serial_number_value);
            if (selected.length > qty) {
                updated[index].serial_number_value = selected.slice(0, qty).join(',');
            }
        } else {
            updated[index] = { ...updated[index], [field]: value };
        }

        setLineItems(updated);
    };

    const toggleLineSerial = (rowIndex: number, serialCode: string) => {
        setLineItems((current) => current.map((line, idx) => {
            if (idx !== rowIndex) return line;

            const selected = serialArray(line.serial_number_value);
            let nextSelected = [...selected];
            if (nextSelected.includes(serialCode)) {
                nextSelected = nextSelected.filter((code) => code !== serialCode);
            } else if (nextSelected.length < line.quantity) {
                nextSelected.push(serialCode);
            }

            return { ...line, serial_number_value: nextSelected.join(',') };
        }));
    };

    const addLineItem = () => {
        setLineItems([
            ...lineItems,
            {
                item_id: null,
                zoho_item_id: null,
                description: '',
                quantity: 1,
                max_available_qty: null,
                unit_price: 0,
                discount_percent: 0,
                tax_id: '',
                tax_name: '',
                tax_percentage: 0,
                warranty: '',
                serial_number_value: '',
                available_serials: [],
                loading_serials: false,
            },
        ]);
    };

    const removeLineItem = (index: number) => {
        if (lineItems.length <= 1) return;
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const productSearchTimeout = useRef<NodeJS.Timeout | null>(null);
    const triggerProductSearch = (text: string) => {
        setProductSearch(text);
        if (productSearchTimeout.current) clearTimeout(productSearchTimeout.current);
        productSearchTimeout.current = setTimeout(() => {
            fetchProducts(text);
        }, 250);
    };

    // Calculations
    const getLineSubtotal = (item: InvoiceFormItem) => item.quantity * item.unit_price * (1 - item.discount_percent / 100);
    const subtotal = lineItems.reduce((sum, item) => sum + getLineSubtotal(item), 0);
    const taxAmount = lineItems.reduce((sum, item) => {
        const taxable = getLineSubtotal(item);
        return sum + taxable * ((Number(item.tax_percentage) || 0) / 100);
    }, 0);
    const total = subtotal + taxAmount + shippingCharge;
    const effectiveTaxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;
    const discountTotal = lineItems.reduce((sum, item) => {
        const base = item.quantity * item.unit_price;
        return sum + (base * ((Number(item.discount_percent) || 0) / 100));
    }, 0);

    const handleSave = async (status: string = 'borrador') => {
        // Validations
        if (!warehouseId) { setError('Selecciona una ubicación (bodega)'); return; }
        if (!salespersonId) { setError('Selecciona un vendedor'); return; }
        if (lineItems.every(item => !item.description.trim())) { setError('Agrega al menos un artículo'); return; }
        if (status === 'cancelada' && !cancellationReasonId) { setError('Selecciona un motivo de anulación'); return; }

        for (const line of lineItems.filter((item) => item.description.trim())) {
            const effectiveMax = getEffectiveMaxQty(line);
            if (effectiveMax && line.quantity > effectiveMax) {
                setError(`El artículo "${line.description}" solo permite ${effectiveMax} unidades según stock/seriales disponibles.`);
                return;
            }
            const selectedSerials = serialArray(line.serial_number_value);
            if (line.available_serials.length > 0 && selectedSerials.length !== line.quantity) {
                setError(`El artículo "${line.description}" requiere exactamente ${line.quantity} serial(es).`);
                return;
            }
            if (selectedSerials.length > 0 && selectedSerials.length !== line.quantity) {
                setError(`Seriales inválidos para "${line.description}": cantidad ${line.quantity}, seriales ${selectedSerials.length}.`);
                return;
            }
        }

        setSaving(true);
        setError('');

        try {
            const selectedSalesperson = salespeople.find((s) => s.id === salespersonId) || null;
            const payload = {
                customer_id: selectedCustomer?.id || null,
                date: invoiceDate,
                due_date: dueDate || null,
                status,
                tax_rate: effectiveTaxRate,
                discount_amount: 0,
                shipping_charge: shippingCharge,
                notes: notes || null,
                warehouse_id: warehouseId || null,
                order_number: orderNumber || null,
                terms: terms || null,
                salesperson_id: salespersonId || null,
                salesperson_zoho_id: selectedSalesperson?.zoho_salesperson_id || selectedSalesperson?.zoho_user_id || null,
                salesperson_name: selectedSalesperson?.name || null,
                delivery_requested: deliveryRequested,
                delivery_id: deliveryId || null,
                credit_detail: creditDetail || null,
                cancellation_reason_id: cancellationReasonId || null,
                cancellation_comments: cancellationComments || null,
                source_sales_order_id: sourceSalesOrderId || null,
                items: lineItems.filter(item => item.description.trim()).map(item => ({
                    item_id: item.item_id,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    discount_percent: item.discount_percent,
                    tax_id: item.tax_id,
                    tax_name: item.tax_name,
                    tax_percentage: item.tax_percentage,
                    warranty: item.warranty || null,
                    serial_number_value: normalizeSerialInput(item.serial_number_value) || null,
                    serial_numbers: serialArray(item.serial_number_value),
                })),
            };

            const res = await fetch('/api/ventas/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
                if (res.status === 409 && data?.code === 'SERIAL_NOT_RESERVED') {
                    throw new Error(data?.error || 'Serial reservado por otra OV o vendido fuera del sistema. Re-selecciona seriales.');
                }
                if (res.status === 409 && data?.code === 'SERIAL_RESERVATION_EXPIRED') {
                    throw new Error(data?.error || 'Reserva vencida, vuelve a seleccionar seriales.');
                }
                if (res.status === 409 && data?.code === 'SERIAL_ALREADY_RESERVED') {
                    const serial = String(data?.details?.serial || '').trim();
                    const ovNumber = String(data?.details?.conflict_order_number || '').trim();
                    if (serial && ovNumber) {
                        throw new Error(`Serial ${serial} reservado por OV ${ovNumber}.`);
                    }
                }
                throw new Error(data?.error || 'No se pudo crear la factura');
            }

            onSaved();
            onClose();
            resetForm();
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setSelectedCustomer(null);
        setCustomerSearch('');
        setInvoiceDate(new Date().toISOString().slice(0, 10));
        setDueDate('');
        setOrderNumber('');
        setSourceSalesOrderId(null);
        setTerms('');
        setNotes('');
        setCreditDetail('');
        setWarehouseId('');
        setSalespersonId('');
        setDeliveryRequested(false);
        setDeliveryId(null);
        setCancellationReasonId(null);
        setCancellationComments('');
        setShowCancellation(false);
        setShippingCharge(0);
        setLineItems([{
            item_id: null,
            zoho_item_id: null,
            description: '',
            quantity: 1,
            max_available_qty: null,
            unit_price: 0,
            discount_percent: 0,
            tax_id: '',
            tax_name: '',
            tax_percentage: 0,
            warranty: '',
            serial_number_value: '',
            available_serials: [],
            loading_serials: false,
        }]);
        setProducts([]);
        setProductSearch('');
        setError('');
    };

    if (!isOpen) return null;

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', background: 'var(--background)',
        color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px',
        fontSize: '13px', transition: 'border-color 0.2s',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: '13px', fontWeight: 600,
        color: 'var(--muted)', marginBottom: '6px',
    };

    const requiredStar = <span style={{ color: 'var(--brand-primary)', marginLeft: '2px' }}>*</span>;

    return (
        <>
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
                justifyContent: 'center', zIndex: 2000, padding: '20px',
                overflowY: 'auto', backdropFilter: 'blur(4px)',
            }}>
                <div style={{
                    background: 'var(--card)', borderRadius: '16px', maxWidth: '960px',
                    width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                    border: '1px solid var(--border)',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '18px 24px', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FileText size={22} style={{ color: 'var(--brand-primary)' }} />
                            Nueva Factura
                        </h2>
                        <button
                            onClick={() => {
                                resetForm();
                                onClose();
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}
                        >
                            <X size={22} />
                        </button>
                    </div>

                    <div style={{ padding: '24px', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                        {error && (
                            <div style={{
                                padding: '10px 14px', background: 'rgba(239,68,68,0.1)', color: '#EF4444',
                                borderRadius: '8px', fontSize: '13px', marginBottom: '20px',
                                border: '1px solid rgba(239,68,68,0.2)',
                            }}>
                                {error}
                            </div>
                        )}

                        {/* ===== ROW 1: Cliente + Ubicación ===== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            {/* Customer */}
                            <div ref={customerRef} style={{ position: 'relative' }}>
                                <label style={labelStyle}>Cliente</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
                                        <input
                                            type="text" value={customerSearch}
                                            onChange={(e) => handleCustomerSearch(e.target.value)}
                                            onFocus={() => setShowCustomerDropdown(true)}
                                            placeholder="Buscar cliente..."
                                            style={{ ...inputStyle, paddingLeft: '32px' }}
                                        />
                                        {showCustomerDropdown && (
                                            <div style={{
                                                position: 'absolute', top: '100%', left: 0, right: 0,
                                                background: 'var(--card)', border: '1px solid var(--border)',
                                                borderRadius: '8px', marginTop: '4px', maxHeight: '200px',
                                                overflowY: 'auto', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                            }}>
                                                {filteredCustomers.length === 0 ? (
                                                    <div style={{ padding: '12px', fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>Sin resultados</div>
                                                ) : (
                                                    filteredCustomers.map(c => (
                                                        <div key={c.id} onClick={() => selectCustomer(c)}
                                                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontWeight: 600 }}>{c.name}</div>
                                                                {c.source === 'zoho' && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(59,130,246,0.15)', color: '#60A5FA', borderRadius: '4px' }}>Zoho</span>}
                                                            </div>
                                                            {c.email && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{c.email}</div>}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setShowCustomerModal(true)} title="Nuevo Cliente"
                                        style={{ padding: '9px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <UserPlus size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Ubicación (Warehouse) */}
                            <div>
                                <label style={labelStyle}>Ubicación (Bodega){requiredStar}</label>
                                <div style={{ position: 'relative' }}>
                                    <MapPin size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
                                    <select
                                        value={warehouseId}
                                        onChange={(e) => setWarehouseId(e.target.value)}
                                        style={{ ...inputStyle, paddingLeft: '32px', appearance: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="">Seleccionar bodega...</option>
                                        {warehouses.map(w => (
                                            <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '12px', color: 'var(--muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>
                        </div>

                        {/* ===== ROW 2: Orden, Fecha, Términos, Vencimiento ===== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <label style={labelStyle}>Número de Orden</label>
                                <input type="text" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
                                    placeholder="Ej: ORD-001" style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Fecha{requiredStar}</label>
                                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Términos</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={terms} onChange={(e) => setTerms(e.target.value)}
                                        style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                                        {TERMS_OPTIONS.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '12px', color: 'var(--muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Vencimiento</label>
                                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
                            </div>
                        </div>

                        {/* ===== ROW 3: Vendedor + Solicitud Delivery ===== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            {/* Vendedor */}
                            <div>
                                <label style={labelStyle}>Vendedor{requiredStar}</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--muted)' }} />
                                    <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}
                                        style={{ ...inputStyle, paddingLeft: '32px', appearance: 'none', cursor: 'pointer' }}>
                                        <option value="">Seleccionar vendedor...</option>
                                        {salespeople.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '12px', color: 'var(--muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Solicitud de Delivery */}
                            <div>
                                <label style={labelStyle}>Solicitud de Delivery{requiredStar}</label>
                                <div style={{
                                    display: 'flex', gap: '8px', padding: '4px',
                                    background: 'var(--background)', borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                }}>
                                    {[{ val: false, label: 'No' }, { val: true, label: 'Sí' }].map(opt => (
                                        <button
                                            key={String(opt.val)}
                                            onClick={() => setDeliveryRequested(opt.val)}
                                            style={{
                                                flex: 1, padding: '7px 16px', border: 'none', borderRadius: '6px',
                                                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                background: deliveryRequested === opt.val ? (opt.val ? '#059669' : '#374151') : 'transparent',
                                                color: deliveryRequested === opt.val ? 'white' : 'var(--muted)',
                                            }}
                                        >
                                            {opt.val && <Truck size={13} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />}
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ===== ROW 4: Asignación Delivery + Detalle de crédito ===== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                            <DeliverySelector
                                value={deliveryId}
                                onChange={(id) => setDeliveryId(id)}
                            />
                            <div>
                                <label style={labelStyle}>Detalle de Crédito</label>
                                <textarea
                                    value={creditDetail}
                                    onChange={(e) => setCreditDetail(e.target.value)}
                                    placeholder="Detalles de crédito..."
                                    rows={2}
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
                                />
                            </div>
                        </div>

                        {/* ===== LINE ITEMS TABLE ===== */}
                        <div style={{
                            border: '1px solid var(--border)', borderRadius: '12px',
                            overflow: 'visible', marginBottom: '20px',
                            position: 'relative',
                            zIndex: 5,
                        }}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: '2fr 80px 120px 80px 120px 40px',
                                gap: '1px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px',
                                borderBottom: '1px solid var(--border)',
                            }}>
                                {['Artículo', 'Cant.', 'Precio Unit.', 'Desc. %', 'Subtotal', ''].map((h, i) => (
                                    <div key={i} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                                ))}
                            </div>

                            {lineItems.map((item, index) => (
                                <div key={index} style={{
                                    display: 'grid', gridTemplateColumns: '2fr 80px 120px 80px 120px 40px',
                                    gap: '8px', padding: '12px 16px',
                                    borderBottom: index < lineItems.length - 1 ? '1px solid var(--border)' : 'none',
                                    alignItems: 'center',
                                    position: 'relative',
                                    zIndex: activeProductRow === index && showProductDropdown ? 20 : 1,
                                }}>
                                    <div ref={activeProductRow === index ? productRef : null} style={{ position: 'relative' }}>
                                        <input type="text" value={item.description}
                                            onChange={(e) => {
                                                const text = e.target.value;
                                                updateLineItem(index, 'description', text);
                                                setActiveProductRow(index);
                                                setShowProductDropdown(true);
                                                triggerProductSearch(text);
                                            }}
                                            onFocus={() => {
                                                setActiveProductRow(index);
                                                setShowProductDropdown(true);
                                                triggerProductSearch(item.description || '');
                                            }}
                                            placeholder="Buscar producto..." style={{ ...inputStyle, fontSize: '13px' }}
                                        />
                                        {showProductDropdown && activeProductRow === index && (
                                            <div style={{
                                                position: 'absolute', top: '100%', left: 0, right: 0,
                                                background: 'var(--card)', border: '1px solid var(--border)',
                                                borderRadius: '8px', marginTop: '4px', maxHeight: '180px',
                                                overflowY: 'auto', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                            }}>
                                                {filteredProducts.slice(0, 10).map(p => (
                                                    <div key={`${p.item_id}-${p.warehouse_name}`} onClick={() => selectProduct(p, index)}
                                                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '8px' }}>
                                                            <span>SKU: {p.sku}</span><span>•</span><span>${p.unit_price?.toFixed(2)}</span><span>•</span><span>Stock: {p.quantity}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {filteredProducts.length === 0 && (
                                                    <div style={{ padding: '12px', fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>Sin resultados</div>
                                                )}
                                            </div>
                                        )}

                                        {item.loading_serials && (
                                            <div style={{
                                                marginTop: '6px',
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'rgba(255,255,255,0.03)',
                                                fontSize: '11px',
                                                color: 'var(--muted)',
                                            }}>
                                                Buscando seriales...
                                            </div>
                                        )}

                                        {!item.loading_serials && item.available_serials.length > 0 && (
                                            <div style={{
                                                marginTop: '6px',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '8px',
                                                background: 'rgba(255,255,255,0.02)',
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: '11px',
                                                    color: 'var(--muted)',
                                                    marginBottom: '6px',
                                                }}>
                                                    <span>Seriales</span>
                                                    <span>{serialArray(item.serial_number_value).length} / {item.quantity}</span>
                                                </div>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                                    gap: '4px',
                                                    maxHeight: '86px',
                                                    overflowY: 'auto',
                                                    paddingRight: '2px',
                                                }}>
                                                    {item.available_serials.map((serial) => {
                                                        const isSelected = serialArray(item.serial_number_value).includes(serial.serial_code);
                                                        return (
                                                            <button
                                                                key={serial.serial_code}
                                                                type="button"
                                                                onClick={() => toggleLineSerial(index, serial.serial_code)}
                                                                style={{
                                                                    border: `1px solid ${isSelected ? 'rgba(220,38,38,0.65)' : 'var(--border)'}`,
                                                                    borderRadius: '6px',
                                                                    padding: '5px 6px',
                                                                    fontSize: '10px',
                                                                    fontFamily: 'monospace',
                                                                    cursor: 'pointer',
                                                                    background: isSelected ? 'rgba(220,38,38,0.16)' : 'rgba(255,255,255,0.02)',
                                                                    color: isSelected ? '#FCA5A5' : 'var(--muted)',
                                                                }}
                                                            >
                                                                {serial.serial_code}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {!item.loading_serials && item.available_serials.length === 0 && item.item_id && (
                                            <input
                                                type="text"
                                                value={item.serial_number_value}
                                                onChange={(e) => updateLineItem(index, 'serial_number_value', normalizeSerialInput(e.target.value))}
                                                placeholder="Seriales (SN1,SN2,...)"
                                                style={{ ...inputStyle, marginTop: '6px', fontSize: '11px', padding: '6px 8px' }}
                                            />
                                        )}

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                                            <select
                                                value={item.tax_id}
                                                onChange={(e) => {
                                                    const selectedTax = taxOptions.find((tax) => tax.tax_id === e.target.value) || null;
                                                    setLineItems((current) => current.map((line, idx) => (
                                                        idx === index
                                                            ? {
                                                                ...line,
                                                                tax_id: selectedTax?.tax_id || '',
                                                                tax_name: selectedTax?.tax_name || '',
                                                                tax_percentage: Number(selectedTax?.tax_percentage || 0),
                                                            }
                                                            : line
                                                    )));
                                                }}
                                                style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
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
                                                value={item.warranty || ''}
                                                onChange={(e) => updateLineItem(index, 'warranty', e.target.value)}
                                                placeholder="Garantía"
                                                style={{ ...inputStyle, fontSize: '11px', padding: '6px 8px' }}
                                            />
                                        </div>
                                    </div>
                                    {item.item_id ? (
                                        <div
                                            title="Cantidad definida desde el preparador de factura"
                                            style={{
                                                ...inputStyle,
                                                textAlign: 'center',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                opacity: 0.9,
                                                cursor: 'not-allowed',
                                                userSelect: 'none',
                                            }}
                                        >
                                            {Math.max(1, Math.floor(Number(item.quantity) || 1))}
                                        </div>
                                    ) : (
                                        <input
                                            type="number"
                                            min="1"
                                            max={getEffectiveMaxQty(item) || undefined}
                                            step="1"
                                            value={item.quantity}
                                            onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                                            style={{ ...inputStyle, textAlign: 'center' }}
                                        />
                                    )}
                                    <input type="number" min="0" step="0.01" value={item.unit_price}
                                        onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                        style={{ ...inputStyle, textAlign: 'right' }} />
                                    <input type="number" min="0" max="100" step="0.5" value={item.discount_percent}
                                        onChange={(e) => updateLineItem(index, 'discount_percent', Math.min(100, parseFloat(e.target.value) || 0))}
                                        style={{ ...inputStyle, textAlign: 'center' }} />
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', textAlign: 'right', paddingRight: '4px' }}>
                                        ${getLineSubtotal(item).toFixed(2)}
                                    </div>
                                    <button onClick={() => removeLineItem(index)} disabled={lineItems.length <= 1}
                                        style={{ background: 'none', border: 'none', cursor: lineItems.length <= 1 ? 'default' : 'pointer', color: lineItems.length <= 1 ? 'var(--border)' : '#EF4444', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: lineItems.length <= 1 ? 0.3 : 1 }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}

                            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                                <button onClick={addLineItem}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'transparent', color: 'var(--brand-primary)', border: '1px dashed var(--brand-primary)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220,38,38,0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Plus size={16} /> Agregar Línea
                                </button>
                            </div>
                        </div>

                        {/* ===== NOTES + TOTALS ===== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '24px' }}>
                            <div>
                                <label style={labelStyle}>Notas / Observaciones</label>
                                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Notas internas o para el cliente..." rows={4}
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                                />
                            </div>

                            <div style={{ background: 'var(--background)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>${subtotal.toFixed(2)}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ color: 'var(--muted)' }}>Impuestos (por línea)</span>
                                        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>
                                            {effectiveTaxRate.toFixed(2)}%
                                        </span>
                                    </div>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>${taxAmount.toFixed(2)}</span>
                                </div>

                                {/* Shipping Charge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Truck size={14} style={{ color: 'var(--muted)' }} />
                                        <span style={{ color: 'var(--muted)' }}>Envío</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>$</span>
                                        <input type="number" min="0" step="0.01" value={shippingCharge}
                                            onChange={(e) => setShippingCharge(parseFloat(e.target.value) || 0)}
                                            style={{ width: '80px', padding: '4px 8px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--muted)' }}>Descuento aplicado (líneas)</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>-${discountTotal.toFixed(2)}</span>
                                </div>

                                <div style={{ borderTop: '2px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Total</span>
                                    <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand-primary)' }}>${total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* ===== CANCELLATION SECTION (toggle) ===== */}
                        <div style={{ marginBottom: '24px' }}>
                            <button
                                onClick={() => setShowCancellation(!showCancellation)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 14px', background: showCancellation ? 'rgba(251,191,36,0.08)' : 'transparent',
                                    border: '1px solid var(--border)', borderRadius: '8px',
                                    fontSize: '13px', color: showCancellation ? '#FBBF24' : 'var(--muted)',
                                    cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                                }}
                            >
                                <ChevronDown size={14} style={{ transform: showCancellation ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                                Motivo de Anulación
                            </button>

                            {showCancellation && (
                                <div style={{
                                    marginTop: '12px', padding: '20px',
                                    background: 'rgba(251,191,36,0.03)', border: '1px solid rgba(251,191,36,0.15)',
                                    borderRadius: '12px',
                                }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <CancellationReasonSelector
                                            value={cancellationReasonId}
                                            onChange={(id) => setCancellationReasonId(id)}
                                        />
                                        <div>
                                            <label style={labelStyle}>Comentarios de Anulación</label>
                                            <textarea
                                                value={cancellationComments}
                                                onChange={(e) => setCancellationComments(e.target.value)}
                                                placeholder="Solo puede escribir un máximo de 36000 caracteres"
                                                rows={3}
                                                style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                                                maxLength={36000}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ===== ACTION BUTTONS ===== */}
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', gap: '12px',
                            paddingTop: '16px', borderTop: '1px solid var(--border)',
                        }}>
                            <button
                                onClick={() => {
                                    resetForm();
                                    onClose();
                                }}
                                style={{ padding: '12px 24px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={() => handleSave('borrador')} disabled={saving}
                                style={{ padding: '12px 24px', background: '#374151', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                                Guardar Borrador
                            </button>
                            <button onClick={() => handleSave('enviada')} disabled={saving}
                                style={{ padding: '12px 24px', background: saving ? '#6B7280' : 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}>
                                {saving ? 'Guardando...' : 'Guardar y Enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <CustomerModal
                isOpen={showCustomerModal}
                onClose={() => setShowCustomerModal(false)}
                onSave={(customer) => { setShowCustomerModal(false); selectCustomer(customer); fetchCustomers(); }}
            />
        </>
    );
}
