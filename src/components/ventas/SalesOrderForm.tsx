'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { X, Loader2, Save, Plus, Trash2, Search, User, ChevronDown } from 'lucide-react';

interface CustomerOption {
    id: string;
    name: string;
    email?: string | null;
    ruc?: string | null;
    source?: 'supabase' | 'zoho';
}

interface WarehouseOption {
    id: string;
    code: string;
    name: string;
    zoho_warehouse_id?: string | null;
    parent_warehouse_id?: string | null;
}

interface SalespersonOption {
    id: string;
    zoho_user_id?: string;
    zoho_salesperson_id?: string;
    name: string;
    email: string;
    role: string;
}

interface OrderLine {
    id?: string;
    item_id: string | null;
    zoho_item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    serial_number_value: string;
    available_serials: Array<{
        serial_id: string;
        serial_code: string;
        warehouse_id: string;
        warehouse_code: string;
        warehouse_name: string;
        zoho_warehouse_id: string;
    }>;
    loading_serials: boolean;
    line_warehouse_id: string | null;
    line_zoho_warehouse_id: string | null;
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

function serialArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry ?? '').trim())
            .filter(Boolean);
    }
    return String(value ?? '')
        .replace(/[\n;]/g, ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeSerialInput(value: unknown): string {
    return serialArray(value).join(',');
}

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;
}

export default function SalesOrderForm({ isOpen, orderId, onClose, onSaved }: SalesOrderFormProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [familyWarehouses, setFamilyWarehouses] = useState<WarehouseOption[]>([]);
    const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

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

    const customerRef = useRef<HTMLDivElement | null>(null);
    const customerSearchTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isOpen || !orderId) return;
        void loadInitialData(orderId);
    }, [isOpen, orderId]);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (customerRef.current && !customerRef.current.contains(event.target as Node)) {
                setShowCustomerDropdown(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [isOpen]);

    useEffect(() => {
        return () => {
            if (customerSearchTimeout.current) {
                clearTimeout(customerSearchTimeout.current);
            }
        };
    }, []);

    async function fetchCustomers(searchText: string = '', selectedCustomer?: CustomerOption | null) {
        try {
            const response = await fetch(`/api/ventas/customers?search=${encodeURIComponent(searchText)}`, {
                cache: 'no-store',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || 'No se pudieron cargar clientes');
            }

            const parsedCustomers: CustomerOption[] = Array.isArray(data?.customers) ? data.customers : [];
            if (selectedCustomer?.id && !parsedCustomers.some((customer) => customer.id === selectedCustomer.id)) {
                setCustomers([selectedCustomer, ...parsedCustomers]);
            } else {
                setCustomers(parsedCustomers);
            }
        } catch {
            setCustomers(selectedCustomer ? [selectedCustomer] : []);
        }
    }

    async function fetchSalespeople() {
        try {
            const response = await fetch('/api/ventas/salespeople', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || 'No se pudieron cargar vendedores');
            }
            const parsedSalespeople: SalespersonOption[] = Array.isArray(data?.salespeople) ? data.salespeople : [];
            setSalespeople(parsedSalespeople);
            return parsedSalespeople;
        } catch {
            setSalespeople([]);
            return [];
        }
    }

    async function fetchFamilyWarehouses(parentWarehouseId: string): Promise<WarehouseOption[]> {
        const parentId = String(parentWarehouseId || '').trim();
        if (!parentId) return [];
        try {
            const response = await fetch(`/api/warehouses?family_of=${encodeURIComponent(parentId)}`, {
                cache: 'no-store',
            });
            const data = await response.json().catch(() => []);
            if (!response.ok) return [];
            const parsed: WarehouseOption[] = Array.isArray(data) ? data : data?.warehouses || [];
            return parsed;
        } catch {
            return [];
        }
    }

    function resolveLineWarehouseFromSerials(
        selectedSerials: string[],
        availableSerials: OrderLine['available_serials']
    ): { lineWarehouseId: string | null; lineZohoWarehouseId: string | null; mixed: boolean } {
        if (!selectedSerials.length || !availableSerials.length) {
            return { lineWarehouseId: null, lineZohoWarehouseId: null, mixed: false };
        }

        const serialMap = new Map<string, OrderLine['available_serials'][number]>();
        for (const serial of availableSerials) {
            serialMap.set(serial.serial_code, serial);
        }

        const warehouseSet = new Set<string>();
        let selectedLocalWarehouseId: string | null = null;
        let selectedZohoWarehouseId: string | null = null;
        for (const serialCode of selectedSerials) {
            const serial = serialMap.get(serialCode);
            if (!serial?.warehouse_id) continue;
            warehouseSet.add(serial.warehouse_id);
            if (!selectedLocalWarehouseId) {
                selectedLocalWarehouseId = serial.warehouse_id;
            }
            if (!selectedZohoWarehouseId) {
                selectedZohoWarehouseId = serial.zoho_warehouse_id || null;
            }
        }

        if (warehouseSet.size > 1) {
            return { lineWarehouseId: null, lineZohoWarehouseId: null, mixed: true };
        }

        return {
            lineWarehouseId: selectedLocalWarehouseId,
            lineZohoWarehouseId: selectedZohoWarehouseId,
            mixed: false,
        };
    }

    async function fetchLineSerials(
        rowIndex: number,
        zohoItemId: string | null,
        family: WarehouseOption[] = familyWarehouses
    ) {
        const normalizedItemId = String(zohoItemId || '').trim();
        if (!normalizedItemId) {
            setItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
            return;
        }

        const usableWarehouses = family
            .map((warehouse) => ({
                ...warehouse,
                zoho_warehouse_id: String(warehouse.zoho_warehouse_id || '').trim(),
            }))
            .filter((warehouse) => warehouse.zoho_warehouse_id);

        if (usableWarehouses.length === 0) {
            setItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
            return;
        }

        setItems((current) => current.map((line, idx) => (
            idx === rowIndex
                ? { ...line, loading_serials: true, available_serials: [] }
                : line
        )));

        try {
            const serialBuckets = await Promise.all(
                usableWarehouses.map(async (warehouse) => {
                    const params = new URLSearchParams();
                    params.set('item_id', normalizedItemId);
                    params.set('warehouse_id', String(warehouse.zoho_warehouse_id || ''));
                    const response = await fetch(`/api/zoho/item-serials?${params.toString()}`, {
                        cache: 'no-store',
                    });
                    if (!response.ok) return [];
                    const data = await response.json().catch(() => ({}));
                    const rows = Array.isArray(data?.serials) ? data.serials : [];
                    return rows
                        .map((row: any) => ({
                            serial_id: String(row?.serial_id || ''),
                            serial_code: String(row?.serial_code || '').trim(),
                            warehouse_id: warehouse.id,
                            warehouse_code: warehouse.code,
                            warehouse_name: warehouse.name,
                            zoho_warehouse_id: String(warehouse.zoho_warehouse_id || ''),
                        }))
                        .filter((row: any) => row.serial_code.length > 0);
                })
            );

            const serialMap = new Map<string, OrderLine['available_serials'][number]>();
            for (const bucket of serialBuckets) {
                for (const serial of bucket) {
                    if (!serialMap.has(serial.serial_code)) {
                        serialMap.set(serial.serial_code, serial);
                    }
                }
            }
            const availableSerials = Array.from(serialMap.values());

            setItems((current) => current.map((line, idx) => {
                if (idx !== rowIndex) return line;

                const normalizedCurrent = normalizeSerialInput(line.serial_number_value);
                const selected = serialArray(normalizedCurrent);
                const validCodes = new Set(availableSerials.map((serial) => serial.serial_code));
                const filteredSelected = availableSerials.length > 0
                    ? selected.filter((serialCode) => validCodes.has(serialCode))
                    : selected;
                const maxByQty = Math.max(0, Math.round(normalizeNumber(line.quantity, 0)));
                const limitedSelected = maxByQty > 0
                    ? filteredSelected.slice(0, maxByQty)
                    : filteredSelected;
                const warehouseResolution = resolveLineWarehouseFromSerials(limitedSelected, availableSerials);

                return {
                    ...line,
                    loading_serials: false,
                    available_serials: availableSerials,
                    serial_number_value: limitedSelected.join(','),
                    line_warehouse_id: warehouseResolution.lineWarehouseId ?? line.line_warehouse_id,
                    line_zoho_warehouse_id: warehouseResolution.lineZohoWarehouseId ?? line.line_zoho_warehouse_id,
                };
            }));
        } catch {
            setItems((current) => current.map((line, idx) => (
                idx === rowIndex
                    ? { ...line, loading_serials: false, available_serials: [] }
                    : line
            )));
        }
    }

    async function handleWarehouseChange(nextWarehouseId: string) {
        setWarehouseId(nextWarehouseId);
        setError('');
        if (!nextWarehouseId) {
            setFamilyWarehouses([]);
            setItems((current) => current.map((line) => ({
                ...line,
                available_serials: [],
                loading_serials: false,
                serial_number_value: '',
                line_warehouse_id: null,
                line_zoho_warehouse_id: null,
            })));
            return;
        }

        const family = await fetchFamilyWarehouses(nextWarehouseId);
        setFamilyWarehouses(family);
        items.forEach((line, index) => {
            if (line.zoho_item_id) {
                void fetchLineSerials(index, line.zoho_item_id, family);
            }
        });
    }

    function handleCustomerSearchChange(value: string) {
        setCustomerSearch(value);
        setShowCustomerDropdown(true);
        const currentSelected = customers.find((customer) => customer.id === customerId);
        if (currentSelected && value.trim() !== currentSelected.name.trim()) {
            setCustomerId('');
        }

        if (!value.trim()) {
            void fetchCustomers('', customerId ? customers.find((c) => c.id === customerId) || null : null);
            return;
        }

        if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
        customerSearchTimeout.current = setTimeout(() => {
            void fetchCustomers(value.trim(), customerId ? customers.find((c) => c.id === customerId) || null : null);
        }, 250);
    }

    function selectCustomer(customer: CustomerOption) {
        setCustomerId(customer.id);
        setCustomerSearch(customer.name);
        setShowCustomerDropdown(false);
    }

    async function loadInitialData(id: string) {
        setLoading(true);
        setError('');
        try {
            const [orderRes, warehousesRes, loadedSalespeople] = await Promise.all([
                fetch(`/api/ventas/sales-orders/${id}`, { cache: 'no-store' }),
                fetch('/api/warehouses?type=empresarial', { cache: 'no-store' }),
                fetchSalespeople(),
            ]);

            const [orderData, warehousesData] = await Promise.all([
                orderRes.json(),
                warehousesRes.json().catch(() => ([])),
            ]);

            if (!orderRes.ok) {
                throw new Error(orderData?.error || 'No se pudo cargar la orden de venta');
            }

            const order = orderData?.order;
            if (!order) throw new Error('Orden no encontrada');
            setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);

            setOrderNumber(order.order_number || '');
            setCustomerId(order.customer_id || '');
            setCustomerSearch(order.customer?.name || '');
            setWarehouseId(order.warehouse_id || '');
            setDate(order.date || '');
            setExpectedDeliveryDate(order.expected_delivery_date || '');
            setReferenceNumber(order.reference_number || '');
            setPaymentTerms(order.payment_terms || '');
            setDeliveryMethod(order.delivery_method || '');
            setShippingZone(order.shipping_zone || '');
            const orderSalespersonId = String(order.salesperson_id || '').trim();
            const orderSalespersonName = String(order.salesperson_name || '').trim();
            const matchedById = loadedSalespeople.find((seller) => seller.id === orderSalespersonId) || null;
            const matchedByName = !matchedById && orderSalespersonName
                ? loadedSalespeople.find((seller) => equalsIgnoreCase(String(seller.name || '').trim(), orderSalespersonName)) || null
                : null;
            const matchedSalesperson = matchedById || matchedByName;
            setSalespersonId(matchedSalesperson?.id || '');
            setSalespersonName(matchedSalesperson?.name || orderSalespersonName || '');
            setTaxRate(normalizeNumber(order.tax_rate, 15));
            setDiscountAmount(normalizeNumber(order.discount_amount, 0));
            setNotes(order.notes || '');
            const normalizedLines: OrderLine[] = Array.isArray(order.items) && order.items.length > 0
                ? order.items.map((line: any) => ({
                    id: line.id,
                    item_id: line.item_id || null,
                    zoho_item_id: String(line?.item?.zoho_item_id || '').trim() || null,
                    description: line.description || '',
                    quantity: normalizeNumber(line.quantity, 1),
                    unit_price: normalizeNumber(line.unit_price, 0),
                    discount_percent: normalizeNumber(line.discount_percent, 0),
                    serial_number_value: normalizeSerialInput(line.serial_number_value || ''),
                    available_serials: [],
                    loading_serials: false,
                    line_warehouse_id: String(line.line_warehouse_id || '').trim() || null,
                    line_zoho_warehouse_id: String(line.line_zoho_warehouse_id || '').trim() || null,
                }))
                : [{
                    item_id: null,
                    zoho_item_id: null,
                    description: '',
                    quantity: 1,
                    unit_price: 0,
                    discount_percent: 0,
                    serial_number_value: '',
                    available_serials: [],
                    loading_serials: false,
                    line_warehouse_id: null,
                    line_zoho_warehouse_id: null,
                }];
            setItems(normalizedLines);

            const family = await fetchFamilyWarehouses(order.warehouse_id || '');
            setFamilyWarehouses(family);
            normalizedLines.forEach((line, index) => {
                if (line.zoho_item_id) {
                    void fetchLineSerials(index, line.zoho_item_id, family);
                }
            });

            await fetchCustomers('', order.customer?.id
                ? {
                    id: order.customer.id,
                    name: order.customer.name || '',
                    email: order.customer.email || null,
                    ruc: order.customer.ruc || null,
                }
                : null
            );
        } catch (err: any) {
            setError(err?.message || 'No se pudo cargar la orden');
        } finally {
            setLoading(false);
        }
    }

    function updateLine(index: number, patch: Partial<OrderLine>) {
        setItems((prev) => prev.map((line, i) => {
            if (i !== index) return line;
            const nextLine = { ...line, ...patch };

            if (patch.serial_number_value !== undefined) {
                nextLine.serial_number_value = normalizeSerialInput(patch.serial_number_value);
                const selected = serialArray(nextLine.serial_number_value);
                const warehouseResolution = resolveLineWarehouseFromSerials(selected, nextLine.available_serials);
                if (!warehouseResolution.mixed) {
                    nextLine.line_warehouse_id = warehouseResolution.lineWarehouseId;
                    nextLine.line_zoho_warehouse_id = warehouseResolution.lineZohoWarehouseId;
                }
            }

            if (patch.quantity !== undefined) {
                const maxByQty = Math.max(0, Math.round(normalizeNumber(nextLine.quantity, 0)));
                const selected = serialArray(nextLine.serial_number_value);
                if (maxByQty > 0 && selected.length > maxByQty) {
                    const trimmed = selected.slice(0, maxByQty);
                    nextLine.serial_number_value = trimmed.join(',');
                    const warehouseResolution = resolveLineWarehouseFromSerials(trimmed, nextLine.available_serials);
                    if (!warehouseResolution.mixed) {
                        nextLine.line_warehouse_id = warehouseResolution.lineWarehouseId;
                        nextLine.line_zoho_warehouse_id = warehouseResolution.lineZohoWarehouseId;
                    }
                }
            }

            return nextLine;
        }));
    }

    function addLine() {
        setItems((prev) => [
            ...prev,
            {
                item_id: null,
                zoho_item_id: null,
                description: '',
                quantity: 1,
                unit_price: 0,
                discount_percent: 0,
                serial_number_value: '',
                available_serials: [],
                loading_serials: false,
                line_warehouse_id: null,
                line_zoho_warehouse_id: null,
            },
        ]);
    }

    function toggleLineSerial(index: number, serialCode: string) {
        setItems((current) => current.map((line, idx) => {
            if (idx !== index) return line;

            const selected = serialArray(line.serial_number_value);
            let nextSelected = [...selected];
            if (nextSelected.includes(serialCode)) {
                nextSelected = nextSelected.filter((code) => code !== serialCode);
            } else {
                const maxByQty = Math.max(0, Math.round(normalizeNumber(line.quantity, 0)));
                if (maxByQty > 0 && nextSelected.length >= maxByQty) {
                    return line;
                }

                const serialRow = line.available_serials.find((serial) => serial.serial_code === serialCode) || null;
                const selectedWarehouses = new Set(
                    nextSelected
                        .map((code) => line.available_serials.find((serial) => serial.serial_code === code)?.warehouse_id || '')
                        .filter(Boolean)
                );

                if (selectedWarehouses.size > 0 && serialRow?.warehouse_id && !selectedWarehouses.has(serialRow.warehouse_id)) {
                    setError('No mezcles seriales de diferentes bodegas en la misma línea. Divide el producto en dos líneas.');
                    return line;
                }

                nextSelected.push(serialCode);
            }

            const warehouseResolution = resolveLineWarehouseFromSerials(nextSelected, line.available_serials);
            if (warehouseResolution.mixed) {
                setError('No mezcles seriales de diferentes bodegas en la misma línea.');
                return line;
            }

            return {
                ...line,
                serial_number_value: nextSelected.join(','),
                line_warehouse_id: warehouseResolution.lineWarehouseId,
                line_zoho_warehouse_id: warehouseResolution.lineZohoWarehouseId,
            };
        }));
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
                zoho_item_id: line.zoho_item_id || null,
                description: String(line.description || '').trim(),
                quantity: Math.max(0, normalizeNumber(line.quantity, 0)),
                unit_price: Math.max(0, normalizeNumber(line.unit_price, 0)),
                discount_percent: Math.max(0, Math.min(100, normalizeNumber(line.discount_percent, 0))),
                serial_number_value: normalizeSerialInput(line.serial_number_value) || null,
                line_warehouse_id: line.line_warehouse_id || null,
                line_zoho_warehouse_id: line.line_zoho_warehouse_id || null,
            }))
            .filter((line) => line.description.length > 0 && line.quantity > 0);

        if (normalizedItems.length === 0) {
            setError('Cada línea debe tener descripción y cantidad mayor a 0.');
            return;
        }

        for (const line of normalizedItems) {
            const selectedSerials = serialArray(line.serial_number_value || '');
            const expectedSerialCount = Math.round(normalizeNumber(line.quantity, 0));

            if (selectedSerials.length > 0 && !Number.isInteger(normalizeNumber(line.quantity, 0))) {
                setError(`El artículo "${line.description}" usa seriales y requiere cantidad entera.`);
                return;
            }

            if (selectedSerials.length > 0 && selectedSerials.length !== expectedSerialCount) {
                setError(`Seriales inválidos para "${line.description}": cantidad ${expectedSerialCount}, seriales ${selectedSerials.length}.`);
                return;
            }
        }

        setSaving(true);
        setError('');
        try {
            const selectedSalesperson = salespeople.find((seller) => seller.id === salespersonId) || null;
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
                salesperson_name: selectedSalesperson?.name || salespersonName || null,
                tax_rate: Math.max(0, normalizeNumber(taxRate, 15)),
                discount_amount: Math.max(0, normalizeNumber(discountAmount, 0)),
                notes: notes || null,
                items: normalizedItems.map((line) => ({
                    ...line,
                    serial_numbers: serialArray(line.serial_number_value || ''),
                })),
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
                                <div ref={customerRef} style={{ position: 'relative' }}>
                                    <Search
                                        size={14}
                                        style={{
                                            position: 'absolute',
                                            left: 10,
                                            top: 10,
                                            color: 'var(--muted)',
                                            pointerEvents: 'none',
                                            zIndex: 2,
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={customerSearch}
                                        onChange={(event) => handleCustomerSearchChange(event.target.value)}
                                        onFocus={() => {
                                            setShowCustomerDropdown(true);
                                            if (customers.length === 0) {
                                                void fetchCustomers('', customerId ? customers.find((c) => c.id === customerId) || null : null);
                                            }
                                        }}
                                        placeholder="Buscar cliente..."
                                        style={{ ...inputStyle, paddingLeft: 32 }}
                                    />
                                    {showCustomerDropdown && (
                                        <div style={customerDropdownStyle}>
                                            {customers.length === 0 ? (
                                                <div style={customerEmptyStyle}>Sin resultados</div>
                                            ) : (
                                                customers.map((customer) => {
                                                    const isActive = customer.id === customerId;
                                                    return (
                                                        <button
                                                            key={customer.id}
                                                            type="button"
                                                            onClick={() => selectCustomer(customer)}
                                                            style={{
                                                                ...customerOptionStyle,
                                                                background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                                                                borderColor: isActive ? 'rgba(59,130,246,0.28)' : 'transparent',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                                                    {customer.name}
                                                                </span>
                                                                {customer.source === 'zoho' && (
                                                                    <span style={customerBadgeStyle}>Zoho</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                                {customer.ruc || customer.email || 'Sin identificación'}
                                                            </div>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Field>
                            <Field label="Bodega empresarial *">
                                <select
                                    value={warehouseId}
                                    onChange={(e) => { void handleWarehouseChange(e.target.value); }}
                                    style={inputStyle}
                                >
                                    <option value="">Seleccionar bodega...</option>
                                    {warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.code} — {warehouse.name}
                                        </option>
                                    ))}
                                </select>
                                {warehouseId && familyWarehouses.length > 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                        Disponible para seriales en: {familyWarehouses.map((warehouse) => warehouse.code).join(', ')}
                                    </div>
                                )}
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
                            <Field label="Vendedor">
                                <div style={{ position: 'relative' }}>
                                    <User
                                        size={14}
                                        style={{
                                            position: 'absolute',
                                            left: 10,
                                            top: 10,
                                            color: 'var(--muted)',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                    <select
                                        value={salespersonId}
                                        onChange={(e) => {
                                            const selectedId = e.target.value;
                                            setSalespersonId(selectedId);
                                            const selectedSeller = salespeople.find((seller) => seller.id === selectedId) || null;
                                            setSalespersonName(selectedSeller?.name || '');
                                        }}
                                        style={{ ...inputStyle, paddingLeft: 32, appearance: 'none', cursor: 'pointer' }}
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
                                    <ChevronDown
                                        size={14}
                                        style={{
                                            position: 'absolute',
                                            right: 10,
                                            top: 12,
                                            color: 'var(--muted)',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                </div>
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
                                const selectedSerials = serialArray(line.serial_number_value);
                                const lineWarehouseCode = familyWarehouses.find((warehouse) => warehouse.id === line.line_warehouse_id)?.code || '';
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
                                        <div style={{ display: 'grid', gap: 6 }}>
                                            <input
                                                type="text"
                                                value={line.description}
                                                onChange={(e) => updateLine(index, { description: e.target.value })}
                                                placeholder="Descripción del artículo"
                                                style={inputStyle}
                                            />

                                            {line.item_id && line.zoho_item_id && (
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    {line.loading_serials ? (
                                                        <div style={serialInfoStyle}>Buscando seriales...</div>
                                                    ) : (
                                                        <>
                                                            {line.available_serials.length > 0 && (
                                                                <div style={serialPanelStyle}>
                                                                    <div style={serialPanelHeaderStyle}>
                                                                        <span>Seriales ({lineWarehouseCode || 'familia'})</span>
                                                                        <span>{selectedSerials.length} / {Math.max(0, Math.round(normalizeNumber(line.quantity, 0)))}</span>
                                                                    </div>
                                                                    <div style={serialGridStyle}>
                                                                        {line.available_serials.map((serial) => {
                                                                            const isSelected = selectedSerials.includes(serial.serial_code);
                                                                            return (
                                                                                <button
                                                                                    key={`${line.id || index}-${serial.serial_code}`}
                                                                                    type="button"
                                                                                    onClick={() => toggleLineSerial(index, serial.serial_code)}
                                                                                    style={{
                                                                                        ...serialChipStyle,
                                                                                        borderColor: isSelected ? 'rgba(220,38,38,0.65)' : 'var(--border)',
                                                                                        background: isSelected ? 'rgba(220,38,38,0.18)' : 'rgba(255,255,255,0.03)',
                                                                                        color: isSelected ? '#FCA5A5' : 'var(--muted)',
                                                                                    }}
                                                                                    title={`${serial.serial_code} · ${serial.warehouse_code}`}
                                                                                >
                                                                                    {serial.serial_code}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <input
                                                                type="text"
                                                                value={line.serial_number_value}
                                                                onChange={(e) => updateLine(index, { serial_number_value: e.target.value })}
                                                                placeholder="Seriales (SN1,SN2,...)"
                                                                style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }}
                                                            />
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
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

const serialInfoStyle: CSSProperties = {
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.03)',
    color: 'var(--muted)',
    fontSize: 11,
};

const serialPanelStyle: CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.02)',
    padding: '6px 8px',
};

const serialPanelHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    color: 'var(--muted)',
    marginBottom: 6,
};

const serialGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 4,
    maxHeight: 90,
    overflowY: 'auto',
};

const serialChipStyle: CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '5px 6px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    textAlign: 'left',
};

const customerDropdownStyle: CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    maxHeight: 220,
    overflowY: 'auto',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'var(--card)',
    zIndex: 20,
    boxShadow: '0 12px 24px rgba(0,0,0,0.35)',
    padding: 4,
};

const customerOptionStyle: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    borderRadius: 8,
    border: '1px solid transparent',
    padding: '8px 10px',
    display: 'grid',
    gap: 2,
    cursor: 'pointer',
};

const customerEmptyStyle: CSSProperties = {
    padding: '12px 10px',
    fontSize: 12,
    color: 'var(--muted)',
    textAlign: 'center',
};

const customerBadgeStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#60A5FA',
    background: 'rgba(59,130,246,0.14)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 999,
    padding: '1px 6px',
};
