'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Card from '@/components/ui/Card';
import { ChevronRight, ChevronDown, Loader2, Eye, EyeOff, Package, RefreshCw } from 'lucide-react';
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
    level: number; // 0=state, 1=brand, 2=product, 3=variant
    items?: PivotItem[]; // present on variant rows
    children: TreeNode[];
    totals: Record<string, number>; // warehouse code → subtotal
    grandTotal: number;
}

function buildTree(items: PivotItem[], warehouseCodes: string[]): TreeNode[] {
    // Group: state -> brand -> product -> variants
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
                const sortedVariants = [...productItems].sort((a, b) =>
                    a.sku.localeCompare(b.sku) || (a.color || '').localeCompare(b.color || '')
                );

                for (const item of sortedVariants) {
                    const variantTotals: Record<string, number> = {};
                    for (const code of warehouseCodes) {
                        variantTotals[code] = item.warehouseQty[code] || 0;
                    }

                    const variantNode: TreeNode = {
                        label: item.sku,
                        level: 3,
                        items: [item],
                        children: [],
                        totals: variantTotals,
                        grandTotal: item.total,
                    };

                    productNode.children.push(variantNode);
                    accumulateFromChild(productNode, variantNode, warehouseCodes);
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

/* ───── instant tooltip CSS (injected once) ───── */
const TOOLTIP_CSS_ID = 'pivot-tooltip-css';
const VIRTUAL_ROW_HEIGHT = 34;
const VIRTUAL_OVERSCAN = 24;

function ensureTooltipCSS() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(TOOLTIP_CSS_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLTIP_CSS_ID;
    style.textContent = `
        .pivot-name-cell { position: relative; }
        .pivot-name-cell .pivot-tooltip {
            visibility: hidden;
            opacity: 0;
            position: absolute;
            left: 14px;
            top: 100%;
            z-index: 100;
            background: #1e293b;
            color: #e2e8f0;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            white-space: normal;
            max-width: 400px;
            min-width: 200px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
            pointer-events: none;
            transition: opacity 0.08s, visibility 0.08s;
            line-height: 1.4;
        }
        .pivot-name-cell:hover .pivot-tooltip {
            visibility: visible;
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}

/* ───── component ───── */
export default function PivotInventoryTable({ filters }: PivotInventoryTableProps) {
    const [data, setData] = useState<PivotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const [copiedSku, setCopiedSku] = useState<string | null>(null);
    const [hideZeroStock, setHideZeroStock] = useState(false);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const hasLoadedOnceRef = useRef(false);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pivotCacheRef = useRef<Map<string, { data: PivotData; ts: number }>>(new Map());

    const handleCopySku = (sku: string) => {
        if (!sku) return;
        navigator.clipboard.writeText(sku);
        setCopiedSku(sku);
        setTimeout(() => setCopiedSku(null), 2000);
    };

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            const res = await fetch('/api/inventory/sync-recent?hours=2');
            const result = await res.json();
            if (res.ok) {
                await fetchPivotData({ force: true });
                alert(`Sincronización completada: ${result.itemsProcessed} ítems actualizados.`);
            } else {
                const detail = result.details || result.error || 'Desconocido';
                const log = result.log ? '\n\nLog: ' + result.log.join('\n') : '';
                alert('Error al sincronizar: ' + detail + log);
            }
        } catch (error: any) {
            console.error('Sync failed', error);
            alert('Error de conexión al sincronizar: ' + (error?.message || ''));
        } finally {
            setSyncing(false);
        }
    };

    const fetchPivotData = useCallback(async (options?: { force?: boolean }) => {
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
            const queryKey = params.toString();
            const now = Date.now();
            const cachedEntry = pivotCacheRef.current.get(queryKey);

            if (!options?.force && cachedEntry) {
                setData(cachedEntry.data);
                hasLoadedOnceRef.current = true;
                setLoading(false);

                const cacheAgeMs = now - cachedEntry.ts;
                // Fresh cache: avoid heavy refetch (improves "clear search" responsiveness).
                if (cacheAgeMs < 12_000) {
                    return;
                }
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

                // Tiny LRU cache by query string.
                const existing = pivotCacheRef.current.get(queryKey);
                if (existing) pivotCacheRef.current.delete(queryKey);
                pivotCacheRef.current.set(queryKey, { data: result, ts: Date.now() });
                while (pivotCacheRef.current.size > 10) {
                    const first = pivotCacheRef.current.keys().next();
                    if (first.done) break;
                    pivotCacheRef.current.delete(first.value);
                }
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

    const scheduleRealtimeRefresh = useCallback(() => {
        if (realtimeRefreshTimerRef.current) {
            clearTimeout(realtimeRefreshTimerRef.current);
        }
        realtimeRefreshTimerRef.current = setTimeout(() => {
            void fetchPivotData({ force: true });
            realtimeRefreshTimerRef.current = null;
        }, 220);
    }, [fetchPivotData]);

    // Inject tooltip CSS once
    useEffect(() => { ensureTooltipCSS(); }, []);

    useEffect(() => {
        const channel = supabase
            .channel('inventory-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'stock_snapshots' },
                () => {
                    scheduleRealtimeRefresh();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory_balance' },
                () => {
                    scheduleRealtimeRefresh();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'items' },
                () => {
                    scheduleRealtimeRefresh();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (realtimeRefreshTimerRef.current) {
                clearTimeout(realtimeRefreshTimerRef.current);
                realtimeRefreshTimerRef.current = null;
            }
        };
    }, [scheduleRealtimeRefresh]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const updateViewport = () => setViewportHeight(container.clientHeight);
        updateViewport();

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => updateViewport());
            resizeObserver.observe(container);
            return () => resizeObserver.disconnect();
        }

        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, [data]);

    const warehouseCodes = useMemo(() => data?.warehouses.map(w => w.code) || [], [data]);
    const tree = useMemo(() => {
        if (!data) return [];
        return buildTree(data.items, warehouseCodes);
    }, [data, warehouseCodes]);

    const searchValue = typeof filters?.search === 'string' ? filters.search : '';
    const hasSearchTerm = searchValue.trim().length > 0;

    function isNodeCollapsed(node: TreeNode, path: string): boolean {
        if (hasSearchTerm) {
            // While searching, always expand to show product + matching variants.
            return false;
        }

        const isProductNode = node.level === 2 && node.children.length > 0;
        if (isProductNode) {
            // Default behavior: variants hidden unless user expands that product.
            return !expandedProducts.has(path);
        }

        return collapsedGroups.has(path);
    }

    function toggleCollapse(path: string, node: TreeNode) {
        if (hasSearchTerm) return;

        const isProductNode = node.level === 2 && node.children.length > 0;
        if (isProductNode) {
            setExpandedProducts((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
            });
            return;
        }

        setCollapsedGroups((prev) => {
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
            if (node.children.length > 0 && !isNodeCollapsed(node, path)) {
                flatten(node.children, path, indent + 1);
            }
        }
    }
    flatten(tree, '', 0);

    const totalFlatRows = flatRows.length;
    const shouldVirtualize = totalFlatRows > 180;
    const estimatedVisibleRows = viewportHeight > 0
        ? Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT)
        : 40;
    const rawStartIndex = shouldVirtualize
        ? Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
        : 0;
    const startIndex = shouldVirtualize
        ? Math.min(rawStartIndex, Math.max(0, totalFlatRows - 1))
        : 0;
    const endIndex = shouldVirtualize
        ? Math.min(totalFlatRows, startIndex + estimatedVisibleRows + VIRTUAL_OVERSCAN * 2)
        : totalFlatRows;
    const visibleRows = shouldVirtualize ? flatRows.slice(startIndex, endIndex) : flatRows;
    const topSpacerHeight = shouldVirtualize ? startIndex * VIRTUAL_ROW_HEIGHT : 0;
    const bottomSpacerHeight = shouldVirtualize ? (totalFlatRows - endIndex) * VIRTUAL_ROW_HEIGHT : 0;

    const stickyColWidth = 420;
    const skuColWidth = 150;
    const marcaColWidth = 110;
    const colorColWidth = 95;
    const remanenteColWidth = 110;
    const cellWidth = 100;
    const totalColWidth = 105;
    const totalColumns = 6 + warehouseCodes.length;
    // All frozen columns widths (sticky)
    const frozenWidth = stickyColWidth + skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth + totalColWidth;
    const extraColsWidth = skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth + totalColWidth;

    /* ─── Grand totals row ─── */
    const grandTotals: Record<string, number> = {};
    let grandGrandTotal = 0;
    for (const code of warehouseCodes) grandTotals[code] = 0;
    for (const root of tree) {
        for (const code of warehouseCodes) grandTotals[code] += root.totals[code] || 0;
        grandGrandTotal += root.grandTotal;
    }

    return (
        <Card padding={0} style={{ overflow: 'hidden', maxWidth: '100%' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 12px',
                            background: 'rgba(59,130,246,0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: 8,
                            cursor: syncing ? 'wait' : 'pointer',
                            fontSize: 12,
                            fontWeight: 500,
                            transition: 'all 0.2s ease',
                            opacity: syncing ? 0.7 : 1,
                        }}
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Sincronizando...' : 'Sincro Reciente'}
                    </button>

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
            </div>

            <div style={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
                <div
                    ref={scrollContainerRef}
                    onScroll={(e) => {
                        const nextTop = e.currentTarget.scrollTop;
                        // Keep updates cheap while scrolling.
                        if (Math.abs(nextTop - scrollTop) > 2) {
                            setScrollTop(nextTop);
                        }
                    }}
                    style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh', width: '100%' }}
                >
                    <table style={{
                        borderCollapse: 'separate',
                        borderSpacing: 0,
                        tableLayout: 'fixed',
                        width: stickyColWidth + extraColsWidth + warehouseCodes.length * cellWidth,
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
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                }}>Producto</th>
                                <th style={{
                                    position: 'sticky', left: stickyColWidth, top: 0, zIndex: 4,
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
                                    position: 'sticky', left: stickyColWidth + skuColWidth, top: 0, zIndex: 4,
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
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth, top: 0, zIndex: 4,
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
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }}>Color</th>
                                <th style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth, top: 0, zIndex: 4,
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
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }}>Remanente (d)</th>
                                {/* Total column — before warehouses (also sticky) */}
                                <th style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth, top: 0, zIndex: 4,
                                    background: '#080f1d',
                                    padding: '11px 12px',
                                    textAlign: 'right',
                                    fontSize: 10, fontWeight: 700,
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                    minWidth: totalColWidth,
                                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                }}>
                                    Total
                                </th>
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
                            </tr>
                        </thead>
                        {/* ─── Body ─── */}
                        <tbody>
                            {topSpacerHeight > 0 && (
                                <tr aria-hidden="true">
                                    <td
                                        colSpan={totalColumns}
                                        style={{
                                            height: topSpacerHeight,
                                            padding: 0,
                                            border: 'none',
                                            background: 'transparent',
                                        }}
                                    />
                                </tr>
                            )}

                            {visibleRows.map(({ node, path, indent }) => {
                                const rowItem = node.items?.[0] || null;
                                const isItemRow = !!rowItem;
                                const isVariantRow = isItemRow && node.level === 3;
                                const isGroup = !isItemRow;
                                const style = LEVEL_COLORS[node.level] || LEVEL_COLORS[3];
                                const hasChildren = node.children.length > 0;
                                const isCollapsed = isNodeCollapsed(node, path);
                                const isZeroStock = node.grandTotal === 0;
                                // Keep variant text aligned with product text for readability.
                                const nameIndent = isVariantRow ? Math.max(indent - 1, 0) : indent;

                                const skuVal = rowItem?.sku || '';
                                const variantLabel = rowItem
                                    ? (
                                        (rowItem.color && rowItem.color.trim().length > 0)
                                            ? `Variante ${rowItem.color}`
                                            : `Variante ${rowItem.sku}`
                                    )
                                    : '';
                                const nameVal = isVariantRow ? variantLabel : node.label;
                                const marcaVal = node.level === 1 ? node.label : (rowItem ? (rowItem.brand || '') : '');
                                const colorVal = rowItem ? (rowItem.color || '') : '';
                                const daysInStockVal = rowItem?.daysInStock ?? null;

                                return (
                                    <tr
                                        key={path}
                                        style={{
                                            background: style.bg,
                                            transition: 'background 0.15s',
                                            opacity: isZeroStock && isItemRow ? 0.5 : 1,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (node.level >= 2) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = style.bg;
                                        }}
                                    >
                                        {/* Producto (sticky) */}
                                        <td
                                            className="pivot-name-cell"
                                            style={{
                                                position: 'sticky', left: 0, zIndex: 2,
                                                background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                                padding: '7px 10px',
                                                paddingLeft: 14 + nameIndent * 20,
                                                fontWeight: style.fontWeight,
                                                fontSize: node.level <= 1 ? 13 : 12,
                                                color: style.text,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: stickyColWidth, width: stickyColWidth,
                                                borderRight: '1px solid rgba(255,255,255,0.06)',
                                                borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                cursor: hasChildren ? 'pointer' : 'default',
                                                userSelect: 'none',
                                            }}
                                            onClick={() => hasChildren && toggleCollapse(path, node)}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {hasChildren && (
                                                    isCollapsed
                                                        ? <ChevronRight size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                        : <ChevronDown size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                                                )}
                                                {!hasChildren && isVariantRow && (
                                                    <span style={{ width: 14, display: 'inline-block', flexShrink: 0, opacity: 0.6 }}>-</span>
                                                )}
                                                {!hasChildren && !isVariantRow && node.level >= 2 && (
                                                    <span style={{ width: 14, display: 'inline-block', flexShrink: 0 }} />
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
                                                {nameVal}
                                            </span>
                                            {/* Instant tooltip for long names */}
                                            {node.level >= 2 && nameVal.length > 30 && (
                                                <span className="pivot-tooltip">{nameVal}</span>
                                            )}
                                        </td>

                                        {/* SKU — click to copy (sticky) */}
                                        <td
                                            style={{
                                                position: 'sticky', left: stickyColWidth, zIndex: 2,
                                                padding: '7px 8px',
                                                fontSize: 11,
                                                color: copiedSku === skuVal && skuVal ? '#4ade80' : '#94a3b8',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                borderRight: '1px solid rgba(255,255,255,0.06)',
                                                background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
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

                                        {/* Marca (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: stickyColWidth + skuColWidth, zIndex: 2,
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            color: '#94a3b8',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '1px solid rgba(255,255,255,0.06)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                            minWidth: marcaColWidth, maxWidth: marcaColWidth,
                                        }}>{marcaVal}</td>

                                        {/* Color (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth, zIndex: 2,
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            color: '#94a3b8',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '1px solid rgba(255,255,255,0.06)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                            minWidth: colorColWidth, maxWidth: colorColWidth,
                                        }}>{colorVal}</td>

                                        {/* Remanente (dias) (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth, zIndex: 2,
                                            padding: '7px 8px',
                                            fontSize: 11,
                                            textAlign: 'right',
                                            color: !isItemRow ? '#64748b' : (daysInStockVal == null ? 'rgba(100,116,139,0.5)' : '#fbbf24'),
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            borderRight: '1px solid rgba(255,255,255,0.06)',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                            minWidth: remanenteColWidth, maxWidth: remanenteColWidth,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {!isItemRow ? '' : (daysInStockVal == null ? '—' : `${daysInStockVal}d`)}
                                        </td>

                                        {/* Grand total — before warehouses (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth, zIndex: 2,
                                            padding: '7px 12px',
                                            textAlign: 'right',
                                            fontSize: node.level <= 1 ? 14 : 12,
                                            fontWeight: 700,
                                            color: node.grandTotal === 0
                                                ? 'rgba(251,191,36,0.3)'
                                                : '#fbbf24',
                                            background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                            borderLeft: '2px solid rgba(255,255,255,0.12)',
                                            borderRight: '2px solid rgba(255,255,255,0.12)',
                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                {node.grandTotal !== 0 ? node.grandTotal.toLocaleString() : '0'}
                                                {isItemRow && rowItem && rowItem.hasSnapshots === false && node.grandTotal > 0 && (
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

                                        {/* Warehouse qty cells — show "-" if no snapshot breakdown */}
                                        {
                                            warehouseCodes.map((code) => {
                                                const qty = node.totals[code] || 0;
                                                const highlight = getCellColor(qty);
                                                const noBreakdown = isItemRow && rowItem && rowItem.hasSnapshots === false;
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
                                                        {noBreakdown ? '·' : (qty !== 0 ? qty.toLocaleString() : (isItemRow ? '—' : ''))}
                                                    </td>
                                                );
                                            })
                                        }
                                    </tr>
                                );
                            })}

                            {bottomSpacerHeight > 0 && (
                                <tr aria-hidden="true">
                                    <td
                                        colSpan={totalColumns}
                                        style={{
                                            height: bottomSpacerHeight,
                                            padding: 0,
                                            border: 'none',
                                            background: 'transparent',
                                        }}
                                    />
                                </tr>
                            )}

                            {/* ─── Grand Total Footer Row ─── */}
                            <tr>
                                <td style={{
                                    position: 'sticky', left: 0, zIndex: 2,
                                    background: '#060c18',
                                    padding: '10px 14px',
                                    fontWeight: 800,
                                    fontSize: 13,
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                }}>
                                    Gran Total
                                </td>
                                <td style={{
                                    position: 'sticky', left: stickyColWidth, zIndex: 2,
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                <td style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth, zIndex: 2,
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                <td style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth, zIndex: 2,
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                <td style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth, zIndex: 2,
                                    background: '#060c18',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                }} />
                                {/* Grand total — before warehouses (sticky) */}
                                <td style={{
                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth + remanenteColWidth, zIndex: 2,
                                    background: '#060c18',
                                    padding: '10px 12px',
                                    textAlign: 'right',
                                    fontSize: 14,
                                    fontWeight: 800,
                                    color: '#fbbf24',
                                    fontVariantNumeric: 'tabular-nums',
                                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                    borderTop: '2px solid rgba(251,191,36,0.3)',
                                    textShadow: '0 0 12px rgba(251,191,36,0.4)',
                                }}>
                                    {grandGrandTotal.toLocaleString()}
                                </td>
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
        </Card >
    );
}
