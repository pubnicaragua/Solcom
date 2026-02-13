'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Card from '@/components/ui/Card';
import { ChevronRight, ChevronDown, Loader2, Eye, EyeOff, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';


/* ───── types ───── */
interface WarehouseCol {
    code: string;
    name: string;
}

interface PivotItem {
    id: string;
    sku: string;
    name: string;
    color: string | null;
    state: string | null;
    brand: string | null;
    category: string | null;
    warehouseQty: Record<string, number>;
    total: number;
    daysInStock?: number | null;
    hasSnapshots?: boolean;
}

interface PivotData {
    warehouses: WarehouseCol[];
    items: PivotItem[];
    totalBeforeFilter?: number;
}

interface PivotInventoryTableProps {
    filters?: any;
}

/* ───── hierarchy builder ───── */

interface TreeNode {
    label: string;
    level: number; // 0=state, 1=brand, 2=product, 3=leaf(sku)
    items?: PivotItem[]; // only on leaf nodes
    children: TreeNode[];
    totals: Record<string, number>; // warehouse code → subtotal
    grandTotal: number;
}

function buildTree(items: PivotItem[], warehouseCodes: string[]): TreeNode[] {
    // Group: state → brand → name → sku (no color grouping)
    const stateGroups = groupBy(items, (i) => (i.state || 'SIN ESTADO').toUpperCase());
    const roots: TreeNode[] = [];

    for (const [stateName, stateItems] of sortedEntries(stateGroups)) {
        const stateNode = makeGroupNode(stateName, 0, warehouseCodes);
        const brandGroups = groupBy(stateItems, (i) => (i.brand || 'SIN MARCA').toUpperCase());

        for (const [brandName, brandItems] of sortedEntries(brandGroups)) {
            const brandNode = makeGroupNode(brandName, 1, warehouseCodes);
            const productGroups = groupBy(brandItems, (i) => i.name);

            for (const [productName, productItems] of sortedEntries(productGroups)) {
                const productNode = makeGroupNode(productName, 2, warehouseCodes);

                // All items shown — no zero-stock filtering here
                for (const item of productItems) {
                    const leafNode: TreeNode = {
                        label: item.sku,
                        level: 3,
                        items: [item],
                        children: [],
                        totals: { ...item.warehouseQty },
                        grandTotal: item.total,
                    };
                    productNode.children.push(leafNode);
                    // If item has snapshots, accumulate normally
                    // If not (fallback), add the fallback total to productNode
                    if (item.hasSnapshots !== false) {
                        accumulateTotals(productNode, item, warehouseCodes);
                    } else {
                        productNode.grandTotal += item.total;
                    }
                }

                if (productNode.children.length > 0) {
                    brandNode.children.push(productNode);
                    accumulateFromChild(brandNode, productNode, warehouseCodes);
                }
            }
            if (brandNode.children.length > 0) {
                stateNode.children.push(brandNode);
                accumulateFromChild(stateNode, brandNode, warehouseCodes);
            }
        }
        if (stateNode.children.length > 0) {
            roots.push(stateNode);
        }
    }
    return roots;
}

function makeGroupNode(label: string, level: number, whCodes: string[]): TreeNode {
    const totals: Record<string, number> = {};
    for (const c of whCodes) totals[c] = 0;
    return { label, level, children: [], totals, grandTotal: 0 };
}

function accumulateTotals(node: TreeNode, item: PivotItem, whCodes: string[]) {
    for (const c of whCodes) node.totals[c] += item.warehouseQty[c] || 0;
    node.grandTotal += item.total;
}

function accumulateFromChild(parent: TreeNode, child: TreeNode, whCodes: string[]) {
    for (const c of whCodes) parent.totals[c] += child.totals[c] || 0;
    parent.grandTotal += child.grandTotal;
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of arr) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
    }
    return map;
}

function sortedEntries<T>(map: Map<string, T[]>): [string, T[]][] {
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* ───── styling ───── */
const LEVEL_COLORS: Record<number, { bg: string; text: string; fontWeight: number }> = {
    0: { bg: '#0c1929', text: '#fbbf24', fontWeight: 700 },   // Estado — deep navy
    1: { bg: '#111f36', text: '#60a5fa', fontWeight: 700 },   // Marca — slightly lighter
    2: { bg: 'transparent', text: '#e2e8f0', fontWeight: 500 },// Producto
    3: { bg: 'rgba(255,255,255,0.015)', text: '#94a3b8', fontWeight: 400 },// SKU (leaf)
};

function getCellColor(qty: number): string | undefined {
    if (qty >= 100) return '#7c3aed';
    if (qty >= 50) return '#eab308';
    if (qty >= 20) return '#22c55e';
    if (qty >= 1) return '#38bdf8';
    return undefined;
}

/* ───── component ───── */
export default function PivotInventoryTable({ filters }: PivotInventoryTableProps) {
    const [data, setData] = useState<PivotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [copiedSku, setCopiedSku] = useState<string | null>(null);
    const [hideZeroStock, setHideZeroStock] = useState(false);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const hasLoadedOnceRef = useRef(false);

    const handleCopySku = (sku: string) => {
        if (!sku) return;
        navigator.clipboard.writeText(sku);
        setCopiedSku(sku);
        setTimeout(() => setCopiedSku(null), 2000);
    };

    const fetchPivotData = useCallback(async () => {
        const requestId = ++requestIdRef.current;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!hasLoadedOnceRef.current) setLoading(true);

        try {
            const params = new URLSearchParams();
            if (filters && typeof filters === 'object') {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value != null && value !== '' && key !== 'sortBy') {
                        params.set(key, String(value));
                    }
                });
            }
            if (hideZeroStock) {
                params.set('showZeroStock', 'false');
            }

            const res = await fetch(`/api/inventory/pivot?${params.toString()}`, {
                signal: controller.signal,
                cache: 'no-store',
            });

            if (requestId !== requestIdRef.current) return;

            if (res.ok) {
                const result = await res.json();
                setData(result);
                hasLoadedOnceRef.current = true;
            } else {
                console.error('Pivot API error:', res.status);
            }
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                console.error('Error fetching pivot data:', error);
            }
        } finally {
            if (requestId === requestIdRef.current && !controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [filters, hideZeroStock]);

    useEffect(() => {
        void fetchPivotData();
    }, [fetchPivotData]);

    useEffect(() => {
        const channel = supabase
            .channel('inventory-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'stock_snapshots' },
                () => {
                    void fetchPivotData();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory_balance' },
                () => {
                    void fetchPivotData();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'items' },
                () => {
                    void fetchPivotData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchPivotData]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const warehouseCodes = useMemo(() => data?.warehouses.map(w => w.code) || [], [data]);
    const tree = useMemo(() => {
        if (!data) return [];
        return buildTree(data.items, warehouseCodes);
    }, [data, warehouseCodes]);

    function toggleCollapse(path: string) {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    if (loading) {
        return (
            <Card>
                <div style={{
                    padding: 60,
                    textAlign: 'center',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    background: 'linear-gradient(180deg, rgba(15,27,45,0.5) 0%, transparent 100%)',
                    borderRadius: 12,
                }}>
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#60a5fa' }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Cargando tabla pivot...</span>
                </div>
            </Card>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <Card>
                <div style={{
                    padding: 60,
                    textAlign: 'center',
                    color: 'var(--muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <Package size={32} style={{ opacity: 0.4 }} />
                    <span style={{ fontSize: 14 }}>No hay datos de inventario disponibles</span>
                    {hideZeroStock && (
                        <button
                            onClick={() => setHideZeroStock(false)}
                            style={{
                                marginTop: 8,
                                padding: '6px 16px',
                                background: 'rgba(96,165,250,0.15)',
                                color: '#60a5fa',
                                border: '1px solid rgba(96,165,250,0.3)',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 500,
                                transition: 'all 0.2s',
                            }}
                        >
                            Mostrar productos sin stock
                        </button>
                    )}
                </div>
            </Card>
        );
    }

    /* ─── Flatten tree into visible rows ─── */
    type FlatRow = { node: TreeNode; path: string; indent: number };
    const flatRows: FlatRow[] = [];

    function flatten(nodes: TreeNode[], parentPath: string, indent: number) {
        for (const node of nodes) {
            const path = parentPath ? `${parentPath}/${node.label}` : node.label;
            flatRows.push({ node, path, indent });
            if (node.children.length > 0 && !collapsed.has(path)) {
                flatten(node.children, path, indent + 1);
            }
        }
    }
    flatten(tree, '', 0);

    const stickyColWidth = 260;
    const skuColWidth = 130;
    const marcaColWidth = 110;
    const colorColWidth = 95;
    const remanenteColWidth = 110;
    const cellWidth = 100;
    const totalColWidth = 105;
    const extraColsWidth = skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth;

    /* ─── Grand totals row ─── */
    const grandTotals: Record<string, number> = {};
    let grandGrandTotal = 0;
    for (const code of warehouseCodes) grandTotals[code] = 0;
    for (const root of tree) {
        for (const code of warehouseCodes) grandTotals[code] += root.totals[code] || 0;
        grandGrandTotal += root.grandTotal;
    }

    return (
        <Card padding={0}>
            {/* ─── Toolbar ─── */}
            <div style={{
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(135deg, rgba(15,27,45,0.8) 0%, rgba(17,31,54,0.6) 100%)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 8px rgba(34,197,94,0.5)',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                        Inventario Pivot
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: '#64748b',
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 6,
                    }}>
                        {data.items.length.toLocaleString()} productos
                        {data.totalBeforeFilter && data.totalBeforeFilter !== data.items.length && (
                            <> de {data.totalBeforeFilter.toLocaleString()}</>
                        )}
                    </span>
                </div>
                <button
                    onClick={() => setHideZeroStock(!hideZeroStock)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        background: hideZeroStock
                            ? 'rgba(251,191,36,0.15)'
                            : 'rgba(255,255,255,0.05)',
                        color: hideZeroStock ? '#fbbf24' : '#94a3b8',
                        border: `1px solid ${hideZeroStock ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                    }}
                >
                    {hideZeroStock ? <EyeOff size={14} /> : <Eye size={14} />}
                    {hideZeroStock ? 'Sin stock oculto' : 'Mostrar todo'}
                </button>
            </div>

            <div style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
                    <table style={{
                        borderCollapse: 'separate',
                        borderSpacing: 0,
                        tableLayout: 'fixed',
                        width: stickyColWidth + extraColsWidth + warehouseCodes.length * cellWidth + totalColWidth,
                    }}>
                        {/* ─── Header ─── */}
                        <thead>
                            <tr>
                                <th style={{
                                    position: 'sticky', left: 0, top: 0, zIndex: 4,
                                    background: '#080f1d',
                                    padding: '11px 14px',
                                    textAlign: 'left',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: stickyColWidth, maxWidth: stickyColWidth, width: stickyColWidth,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                }}>Producto</th>
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 3,
                                    background: '#080f1d',
                                    padding: '11px 8px',
                                    textAlign: 'left',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: skuColWidth, width: skuColWidth,
                                    whiteSpace: 'nowrap',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }}>SKU</th>
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 3,
                                    background: '#080f1d',
                                    padding: '11px 8px',
                                    textAlign: 'left',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: marcaColWidth, width: marcaColWidth,
                                    whiteSpace: 'nowrap',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }}>Marca</th>
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 3,
                                    background: '#080f1d',
                                    padding: '11px 8px',
                                    textAlign: 'left',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: colorColWidth, width: colorColWidth,
                                    whiteSpace: 'nowrap',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                }}>Color</th>
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 3,
                                    background: '#080f1d',
                                    padding: '11px 8px',
                                    textAlign: 'right',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: remanenteColWidth, width: remanenteColWidth,
                                    whiteSpace: 'nowrap',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                }}>Remanente (d)</th>
                                {warehouseCodes.map((code) => (
                                    <th key={code} style={{
                                        position: 'sticky', top: 0, zIndex: 2,
                                        background: '#080f1d',
                                        padding: '11px 12px',
                                        textAlign: 'right',
                                        fontSize: 10, fontWeight: 700,
                                        color: '#64748b',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        minWidth: cellWidth,
                                        whiteSpace: 'nowrap',
                                        borderBottom: '2px solid rgba(255,255,255,0.12)',
                                    }}>
                                        {code}
                                    </th>
                                ))}
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 2,
                                    background: '#080f1d',
                                    padding: '11px 12px',
                                    textAlign: 'right',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: totalColWidth,
                                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                }}>
                                    Total
                                </th>
                            </tr>
                        </thead>
                        {/* ─── Body ─── */}
                        <tbody>
                            {flatRows.map(({ node, path, indent }) => {
                                const isLeaf = node.level === 3;
                                const isGroup = !isLeaf;
                                const style = LEVEL_COLORS[node.level] || LEVEL_COLORS[3];
                                const hasChildren = node.children.length > 0;
                                const isCollapsed = collapsed.has(path);
                                const isZeroStock = node.grandTotal === 0;

                                // For leaf rows, get the item data
                                const leafItem = isLeaf && node.items?.[0] ? node.items[0] : null;
                                const skuVal = leafItem ? leafItem.sku : '';
                                const marcaVal = node.level === 1 ? node.label : (leafItem ? (leafItem.brand || '') : '');
                                const colorVal = leafItem ? (leafItem.color || '') : '';
                                const daysInStockVal = leafItem?.daysInStock ?? null;

                                return (
                                    <tr
                                        key={path}
                                        style={{
                                            background: style.bg,
                                            transition: 'background 0.15s',
                                            opacity: isZeroStock && isLeaf ? 0.5 : 1,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (node.level >= 2) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = style.bg;
                                        }}
                                    >
                                        {/* Producto (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: 0, zIndex: 1,
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                            padding: '7px 10px',
                                            paddingLeft: 14 + indent * 20,
                                            fontWeight: style.fontWeight,
                                            fontSize: node.level <= 1 ? 13 : 12,
                                            color: style.text,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: stickyColWidth, width: stickyColWidth,
                                            borderRight: '2px solid rgba(255,255,255,0.12)',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            cursor: hasChildren ? 'pointer' : 'default',
                                            userSelect: 'none',
                                        }}
                                            onClick={() => hasChildren && toggleCollapse(path)}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {hasChildren && (
                                                    isCollapsed
                                                        ? <ChevronRight size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                        : <ChevronDown size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                )}
                                                {node.level <= 1 && <span style={{
                                                    display: 'inline-block',
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: 3,
                                                    background: node.level === 0
                                                        ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                                                        : 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                                                    marginRight: 2,
                                                    flexShrink: 0,
                                                }} />}
                                                {isLeaf ? node.label : node.label}
                                            </span>
                                        </td>

                                        {/* SKU — click to copy */}
                                        <td
                                            style={{
                                                padding: '7px 8px',
                                                fontSize: 11,
                                                color: copiedSku === skuVal && skuVal ? '#4ade80' : '#94a3b8',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                borderRight: '1px solid rgba(255,255,255,0.06)',
                                                background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? undefined : style.bg,
                                                minWidth: skuColWidth, maxWidth: skuColWidth,
                                                cursor: skuVal ? 'pointer' : 'default',
                                                transition: 'color 0.2s',
                                                fontFamily: skuVal ? 'monospace' : 'inherit',
                                                letterSpacing: skuVal ? '0.3px' : undefined,
                                            }}
                                            onClick={() => handleCopySku(skuVal)}
                                            title={skuVal ? 'Click para copiar' : ''}
                                        >
                                            {copiedSku === skuVal && skuVal ? '✓ Copiado' : skuVal}
                                        </td>

                                        {/* Marca */}
                                        <td style={{
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            color: '#94a3b8',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '1px solid rgba(255,255,255,0.06)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? undefined : style.bg,
                                            minWidth: marcaColWidth, maxWidth: marcaColWidth,
                                        }}>{marcaVal}</td>

                                        {/* Color */}
                                        <td style={{
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            color: '#94a3b8',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '2px solid rgba(255,255,255,0.12)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? undefined : style.bg,
                                            minWidth: colorColWidth, maxWidth: colorColWidth,
                                        }}>{colorVal}</td>

                                        {/* Remanente (dias) */}
                                        <td style={{
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            textAlign: 'right',
                                            color: !isLeaf ? '#64748b' : (daysInStockVal == null ? 'rgba(100,116,139,0.5)' : '#fbbf24'),
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '2px solid rgba(255,255,255,0.12)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? undefined : style.bg,
                                            minWidth: remanenteColWidth, maxWidth: remanenteColWidth,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {!isLeaf ? '' : (daysInStockVal == null ? '—' : `${daysInStockVal}d`)}
                                        </td>

                                        {/* Warehouse qty cells */}
                                        {/* Warehouse qty cells — show "-" if no snapshot breakdown */}
                                        {warehouseCodes.map((code) => {
                                            const qty = node.totals[code] || 0;
                                            const highlight = getCellColor(qty);
                                            const noBreakdown = isLeaf && leafItem && leafItem.hasSnapshots === false;
                                            return (
                                                <td key={code} style={{
                                                    padding: '7px 12px',
                                                    textAlign: 'right',
                                                    fontSize: node.level <= 1 ? 13 : 12,
                                                    fontWeight: isGroup ? 700 : 400,
                                                    color: noBreakdown
                                                        ? 'rgba(100,116,139,0.25)'
                                                        : highlight || (qty !== 0 ? '#e2e8f0' : 'rgba(100,116,139,0.3)'),
                                                    background: highlight && !noBreakdown ? `${highlight}15` : undefined,
                                                    fontVariantNumeric: 'tabular-nums',
                                                    borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                    transition: 'background 0.15s',
                                                    fontStyle: noBreakdown ? 'italic' : undefined,
                                                }}>
                                                    {noBreakdown ? '·' : (qty !== 0 ? qty.toLocaleString() : (isLeaf ? '—' : ''))}
                                                </td>
                                            );
                                        })}

                                        {/* Grand total */}
                                        <td style={{
                                            padding: '7px 12px',
                                            textAlign: 'right',
                                            fontSize: node.level <= 1 ? 14 : 12,
                                            fontWeight: 700,
                                            color: node.grandTotal === 0
                                                ? 'rgba(251,191,36,0.3)'
                                                : '#fbbf24',
                                            borderLeft: '2px solid rgba(255,255,255,0.12)',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                {node.grandTotal !== 0 ? node.grandTotal.toLocaleString() : '0'}
                                                {isLeaf && leafItem && leafItem.hasSnapshots === false && node.grandTotal > 0 && (
                                                    <span title="Stock total de Zoho (sin desglose por bodega)" style={{
                                                        fontSize: 9,
                                                        color: '#f97316',
                                                        background: 'rgba(249,115,22,0.15)',
                                                        padding: '1px 4px',
                                                        borderRadius: 3,
                                                        fontWeight: 600,
                                                        cursor: 'help',
                                                    }}>Z</span>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* ─── Grand Total Footer Row ─── */}
                            <tr>
                                <td style={{
                                    position: 'sticky', left: 0, zIndex: 1,
                                    background: '#060c18',
                                    padding: '10px 14px',
                                    fontWeight: 800,
                                    fontSize: 13,
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                }}>
                                    Gran Total
                                </td>
                                <td style={{
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                <td style={{
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                <td style={{
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                }} />
                                <td style={{
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                }} />
                                {warehouseCodes.map((code) => (
                                    <td key={code} style={{
                                        background: '#060c18',
                                        padding: '10px 12px',
                                        textAlign: 'right',
                                        fontSize: 13,
                                        fontWeight: 800,
                                        color: '#fbbf24',
                                        fontVariantNumeric: 'tabular-nums',
                                        borderTop: '2px solid rgba(251,191,36,0.3)',
                                    }}>
                                        {grandTotals[code] !== 0 ? grandTotals[code].toLocaleString() : ''}
                                    </td>
                                ))}
                                <td style={{
                                    background: '#060c18',
                                    padding: '10px 12px',
                                    textAlign: 'right',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    color: '#fbbf24',
                                    fontVariantNumeric: 'tabular-nums',
                                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    textShadow: '0 0 12px rgba(251,191,36,0.4)',
                                }}>
                                    {grandGrandTotal.toLocaleString()}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer info */}
            <div style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                color: '#64748b',
                background: 'rgba(8,15,29,0.5)',
            }}>
                <div style={{ display: 'flex', gap: 16 }}>
                    <span>{data.items.length.toLocaleString()} productos</span>
                    <span>•</span>
                    <span>{warehouseCodes.length} bodegas</span>
                    <span>•</span>
                    <span>{flatRows.length.toLocaleString()} filas visibles</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38bdf8', display: 'inline-block' }} /> 1-19
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} /> 20-49
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#eab308', display: 'inline-block' }} /> 50-99
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#7c3aed', display: 'inline-block' }} /> 100+
                    </span>
                </div>
            </div>
        </Card>
    );
}
