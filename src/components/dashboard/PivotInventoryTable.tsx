'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Card from '@/components/ui/Card';
import { ChevronRight, ChevronDown, ChevronUp, Loader2, Eye, EyeOff, Package, RefreshCw, Search, Palette, ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import WarehouseColorModal from '@/components/modals/WarehouseColorModal';


/* ───── types ───── */
interface WarehouseCol {
    code: string;
    name: string;
}

interface WarehouseColor {
    warehouse_code: string;
    warehouse_name: string;
    color: string;
    text_color: string;
}

export interface PivotItem {
    id: string;
    sku: string;
    name: string;
    color: string | null;
    color_hex?: string | null;
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
    cartMode?: boolean;
    onAddToCart?: (item: PivotItem) => void;
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
    const stateGroups = groupBy(items, (i) => {
        if (!i.state) return 'SIN ESTADO';
        return i.state.toUpperCase();
    });
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
export default function PivotInventoryTable({ filters, cartMode, onAddToCart }: PivotInventoryTableProps) {
    const [data, setData] = useState<PivotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const [copiedSku, setCopiedSku] = useState<string | null>(null);
    const [hideZeroStock, setHideZeroStock] = useState(true);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [warehouseColors, setWarehouseColors] = useState<Map<string, WarehouseColor>>(new Map());
    const requestIdRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const hasLoadedOnceRef = useRef(false);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pivotCacheRef = useRef<Map<string, { data: PivotData; ts: number }>>(new Map());
    const [isMobile, setIsMobile] = useState(false);
    const [colorModalOpen, setColorModalOpen] = useState(false);
    const [cartAddedId, setCartAddedId] = useState<string | null>(null);
    const [productColWidth, setProductColWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);
    const { role } = useUserRole();
    const canEditWarehouseColors = role === 'admin';

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const handleCopySku = (sku: string) => {
        if (!sku) return;
        navigator.clipboard.writeText(sku);
        setCopiedSku(sku);
        setTimeout(() => setCopiedSku(null), 2000);
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
        void fetchWarehouseColors();
    }, [fetchPivotData]);

    async function fetchWarehouseColors() {
        try {
            const res = await fetch('/api/warehouse-colors');
            if (res.ok) {
                const colors: WarehouseColor[] = await res.json();
                const colorMap = new Map<string, WarehouseColor>();
                colors.forEach(c => colorMap.set(c.warehouse_code, c));
                setWarehouseColors(colorMap);
            }
        } catch (error) {
            console.error('Error loading warehouse colors:', error);
        }
    }

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

        // Level 0 (State) is expanded by default. Level 1 (Brand) is collapsed by default.
        if (node.level === 1) {
            return !collapsedGroups.has(path);
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
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Cargando Tabla Pivot...</span>
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

    const stickyColWidth = productColWidth;
    const skuColWidth = 150;
    const marcaColWidth = 110;
    const colorColWidth = 95;
    // const remanenteColWidth = 110; // Eliminada - columna remanente
    const cellWidth = 100;
    const totalColWidth = 105;
    const totalColumns = 5 + warehouseCodes.length; // Reducido de 6 a 5
    // All frozen columns widths (sticky)
    const frozenWidth = stickyColWidth + skuColWidth + marcaColWidth + colorColWidth + totalColWidth;
    const extraColsWidth = skuColWidth + marcaColWidth + colorColWidth + totalColWidth;

    /* ─── Grand totals row ─── */
    const grandTotals: Record<string, number> = {};
    let grandGrandTotal = 0;
    for (const code of warehouseCodes) grandTotals[code] = 0;
    for (const root of tree) {
        for (const code of warehouseCodes) grandTotals[code] += root.totals[code] || 0;
        grandGrandTotal += root.grandTotal;
    }

    return (
        <>
            <Card padding={0} style={{ overflow: 'hidden', maxWidth: '100%' }}>
                {/* ─── Toolbar ─── */}
                <div className="pivot-toolbar" style={{
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
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
                    <div className="pivot-toolbar-btns" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {canEditWarehouseColors && (
                            <button
                                onClick={() => setColorModalOpen(true)}
                                className="pivot-btn"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 12px',
                                    background: 'rgba(168,85,247,0.15)',
                                    color: '#c084fc',
                                    border: '1px solid rgba(168,85,247,0.3)',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                <Palette size={14} />
                                <span className="pivot-btn-text">Colores</span>
                            </button>
                        )}

                        <button
                            onClick={() => setHideZeroStock(!hideZeroStock)}
                            className="pivot-btn"
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
                            <span className="pivot-btn-text">{hideZeroStock ? 'Sin stock oculto' : 'Mostrar todo'}</span>
                        </button>
                    </div>
                </div>

                {isMobile ? (
                    /* ─── Mobile Card View ─── */
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {hasSearchTerm ? (
                            /* Flat list for search results */
                            flatRows.filter(r => r.node.level === 2 && r.node.children.length > 0).map((row) => {
                                const productNode = row.node;
                                return (
                                    <MobileProductCard
                                        key={row.path}
                                        node={productNode}
                                        warehouseCodes={warehouseCodes}
                                        data={data!}
                                    />
                                );
                            })
                        ) : (
                            /* Hierarchical View for navigation */
                            tree.map((stateNode) => (
                                <MobileGroupNode
                                    key={stateNode.label}
                                    node={stateNode}
                                    level={0}
                                    warehouseCodes={warehouseCodes}
                                    data={data!}
                                    cartMode={cartMode}
                                    onAddToCart={onAddToCart}
                                />
                            ))
                        )}
                    </div>
                ) : (
                    /* ─── Desktop Table View ─── */
                    <div style={{ position: 'relative', overflow: 'hidden', width: '100%' }}>
                        <div
                            ref={scrollContainerRef}
                            onScroll={(e) => {
                                const nextTop = e.currentTarget.scrollTop;
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
                                        }}>
                                            Producto
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    right: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 8,
                                                    cursor: 'col-resize',
                                                    background: isResizing ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                                                    transition: 'background 0.2s',
                                                }}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setIsResizing(true);
                                                    const startX = e.clientX;
                                                    const startWidth = productColWidth;

                                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                                        const delta = moveEvent.clientX - startX;
                                                        const newWidth = Math.max(200, Math.min(800, startWidth + delta));
                                                        setProductColWidth(newWidth);
                                                    };

                                                    const handleMouseUp = () => {
                                                        setIsResizing(false);
                                                        document.removeEventListener('mousemove', handleMouseMove);
                                                        document.removeEventListener('mouseup', handleMouseUp);
                                                    };

                                                    document.addEventListener('mousemove', handleMouseMove);
                                                    document.addEventListener('mouseup', handleMouseUp);
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isResizing) {
                                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isResizing) {
                                                        e.currentTarget.style.background = 'transparent';
                                                    }
                                                }}
                                            />
                                        </th>
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
                                        {/* Marca, Color - Sin columna remanente */}
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
                                        {warehouseCodes.map((code) => {
                                            const whColor = warehouseColors.get(code);
                                            return (
                                                <th key={code} style={{
                                                    position: 'sticky', top: 0, zIndex: 2,
                                                    background: whColor ? whColor.color : '#080f1d',
                                                    padding: '11px 12px',
                                                    textAlign: 'right',
                                                    fontSize: 10, fontWeight: 700,
                                                    color: whColor ? whColor.text_color : '#64748b',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    minWidth: cellWidth,
                                                    whiteSpace: 'nowrap',
                                                    borderBottom: '2px solid rgba(255,255,255,0.12)',
                                                    borderLeft: '1px solid rgba(255,255,255,0.08)',
                                                    borderRight: '1px solid rgba(255,255,255,0.08)',
                                                }}>
                                                    {code}
                                                </th>
                                            );
                                        })}
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

                                        const isCartTarget = cartMode && isVariantRow && rowItem && !isZeroStock;
                                        const isCartFlash = cartAddedId === rowItem?.id;

                                        return (
                                            <tr
                                                key={path}
                                                style={{
                                                    position: 'relative' as const,
                                                    background: isCartFlash
                                                        ? 'rgba(16,185,129,0.28)'
                                                        : style.bg,
                                                    transition: 'background 0.3s ease',
                                                    opacity: isZeroStock && isItemRow ? 0.5 : 1,
                                                    cursor: isCartTarget ? 'pointer' : undefined,
                                                    outline: isCartTarget ? '1px dashed rgba(16,185,129,0.4)' : 'none',
                                                    outlineOffset: '-1px',
                                                    boxShadow: isCartFlash ? 'inset 0 0 30px rgba(16,185,129,0.15)' : 'none',
                                                }}
                                                onClick={() => {
                                                    if (isCartTarget && onAddToCart && rowItem) {
                                                        onAddToCart(rowItem);
                                                        setCartAddedId(rowItem.id);
                                                        setTimeout(() => setCartAddedId(null), 1200);
                                                    }
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (isCartTarget) {
                                                        e.currentTarget.style.background = 'rgba(16,185,129,0.12)';
                                                    } else if (node.level >= 2) {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = isCartFlash ? 'rgba(16,185,129,0.28)' : style.bg;
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
                                                            isCartTarget
                                                                ? <span style={{
                                                                    width: 14,
                                                                    height: 14,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                    borderRadius: 3,
                                                                    background: isCartFlash ? 'rgba(16,185,129,0.5)' : 'rgba(16,185,129,0.2)',
                                                                    color: '#34d399',
                                                                    fontSize: 10,
                                                                    fontWeight: 900,
                                                                    transition: 'all 0.3s',
                                                                }}>
                                                                    {isCartFlash ? '✓' : '+'}
                                                                </span>
                                                                : <span style={{ width: 14, display: 'inline-block', flexShrink: 0, opacity: 0.6 }}>-</span>
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
                                                    {node.level >= 2 && nameVal.length > 30 && (
                                                        <span className="pivot-tooltip">{nameVal}</span>
                                                    )}
                                                </td>

                                                {/* SKU */}
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

                                                {/* Marca, Color - Sin columna remanente */}
                                                <td style={{
                                                    position: 'sticky', left: stickyColWidth + skuColWidth, zIndex: 2,
                                                    padding: '7px 8px',
                                                    fontSize: 12,
                                                    color: 'var(--text)',
                                                    borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                                    background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                                    minWidth: marcaColWidth, maxWidth: marcaColWidth,
                                                }}>
                                                    {!isItemRow ? '' : (rowItem?.brand || '—')}
                                                </td>

                                                <td style={{
                                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth, zIndex: 2,
                                                    padding: '7px 8px',
                                                    fontSize: 12,
                                                    color: 'var(--text)',
                                                    borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                    borderRight: '1px solid rgba(255,255,255,0.06)',
                                                    background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                                    minWidth: colorColWidth, maxWidth: colorColWidth,
                                                }}>
                                                    {!isItemRow ? '' : (rowItem?.color || '—')}
                                                </td>

                                                {/* Grand Total */}
                                                <td style={{
                                                    position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth, zIndex: 2,
                                                    padding: '7px 12px',
                                                    textAlign: 'right',
                                                    fontSize: node.level <= 1 ? 14 : 12,
                                                    fontWeight: 700,
                                                    color: node.grandTotal === 0 ? 'rgba(251,191,36,0.3)' : '#fbbf24',
                                                    background: style.bg === 'transparent' || style.bg.startsWith('rgba') ? 'var(--card)' : style.bg,
                                                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                                                    borderRight: '2px solid rgba(255,255,255,0.12)',
                                                    borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        {node.grandTotal !== 0 ? node.grandTotal.toLocaleString() : '0'}
                                                        {isItemRow && rowItem && rowItem.hasSnapshots === false && node.grandTotal > 0 && (
                                                            <span title="Stock total de Zoho" style={{
                                                                fontSize: 9, color: '#f97316', background: 'rgba(249,115,22,0.15)',
                                                                padding: '1px 4px', borderRadius: 3, fontWeight: 600, cursor: 'help',
                                                            }}>Z</span>
                                                        )}
                                                    </span>
                                                </td>

                                                {/* Warehouse Columns with Colors */}
                                                {warehouseCodes.map((code) => {
                                                    const qty = node.totals[code] || 0;
                                                    const highlight = getCellColor(qty);
                                                    const noBreakdown = isItemRow && rowItem && rowItem.hasSnapshots === false;
                                                    const whColor = warehouseColors.get(code);
                                                    const bgColor = whColor
                                                        ? (highlight && !noBreakdown ? `${whColor.color}40` : `${whColor.color}15`)
                                                        : (highlight && !noBreakdown ? `${highlight}15` : undefined);

                                                    return (
                                                        <td key={code} style={{
                                                            padding: '7px 12px',
                                                            textAlign: 'right',
                                                            fontSize: node.level <= 1 ? 13 : 12,
                                                            fontWeight: isGroup ? 700 : 400,
                                                            color: noBreakdown
                                                                ? 'rgba(100,116,139,0.25)'
                                                                : (whColor && qty !== 0 ? whColor.text_color : (highlight || (qty !== 0 ? '#e2e8f0' : 'rgba(100,116,139,0.3)'))),
                                                            background: bgColor,
                                                            fontVariantNumeric: 'tabular-nums',
                                                            borderBottom: `1px solid rgba(255,255,255,${node.level <= 1 ? '0.12' : '0.05'})`,
                                                            borderLeft: '1px solid rgba(255,255,255,0.04)',
                                                            borderRight: '1px solid rgba(255,255,255,0.04)',
                                                            transition: 'background 0.15s',
                                                            fontStyle: noBreakdown ? 'italic' : undefined,
                                                        }}>
                                                            {noBreakdown ? '·' : (qty !== 0 ? qty.toLocaleString() : (isItemRow ? '—' : ''))}
                                                        </td>
                                                    );
                                                })}
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
                                        <td style={{ position: 'sticky', left: stickyColWidth, zIndex: 2, background: '#060c18', borderTop: '2px solid rgba(251,191,36,0.3)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
                                        <td style={{ position: 'sticky', left: stickyColWidth + skuColWidth, zIndex: 2, background: '#060c18', borderTop: '2px solid rgba(251,191,36,0.3)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
                                        <td style={{ position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth, zIndex: 2, background: '#060c18', borderTop: '2px solid rgba(251,191,36,0.3)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />

                                        <td style={{
                                            position: 'sticky', left: stickyColWidth + skuColWidth + marcaColWidth + colorColWidth, zIndex: 2,
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
                )}




                {/* Footer info */}
                <div className="pivot-footer" style={{
                    padding: '10px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 11,
                    color: '#64748b',
                    background: 'rgba(8,15,29,0.5)',
                }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>{data.items.length.toLocaleString()} productos</span>
                        <span>•</span>
                        <span>{warehouseCodes.length} bodegas</span>
                    </div>
                    <div className="pivot-legend" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

            <WarehouseColorModal
                isOpen={colorModalOpen}
                onClose={() => setColorModalOpen(false)}
                onSave={() => {
                    void fetchWarehouseColors();
                }}
            />
            <style jsx>{`
                @media (max-width: 640px) {
                    .pivot-toolbar {
                        flex-direction: column;
                        align-items: flex-start !important;
                        padding: 8px 10px !important;
                        gap: 6px !important;
                    }
                    .pivot-toolbar-btns {
                        width: 100%;
                        justify-content: flex-start;
                    }
                    .pivot-btn {
                        padding: 5px 8px !important;
                        font-size: 11px !important;
                        gap: 4px !important;
                    }
                    .pivot-btn-text {
                        display: none;
                    }
                    .pivot-footer {
                        flex-direction: column;
                        align-items: flex-start !important;
                        padding: 6px 10px !important;
                        gap: 4px !important;
                    }
                    .pivot-legend {
                        gap: 6px !important;
                        font-size: 10px;
                    }
                }
                @media (min-width: 641px) and (max-width: 768px) {
                    .pivot-btn-text {
                        display: inline;
                    }
                }
            `}</style>
        </>
    );
}

/* ─── Mobile Sub-components ─── */

function MobileGroupNode({ node, level, warehouseCodes, data, cartMode, onAddToCart }: { node: TreeNode; level: number; warehouseCodes: string[]; data: PivotData; cartMode?: boolean; onAddToCart?: (item: PivotItem) => void; }) {
    const [expanded, setExpanded] = useState(false);
    const isBrand = level === 1;

    return (
        <div style={{
            background: level === 0 ? 'var(--card-bg)' : 'rgba(255,255,255,0.03)',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            marginBottom: level === 0 ? 8 : 4
        }}>
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: level === 0 ? 'rgba(15,27,45,0.4)' : 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    cursor: 'pointer'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span style={{
                        fontSize: level === 0 ? 15 : 14,
                        fontWeight: 600,
                        color: level === 0 ? '#fbbf24' : '#60a5fa'
                    }}>
                        {node.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                        ({node.children.length})
                    </span>
                </div>
                <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: node.grandTotal > 0 ? '#e2e8f0' : '#64748b'
                }}>
                    {node.grandTotal} un.
                </div>
            </button>

            {expanded && (
                <div style={{ padding: '8px 8px 8px 16px' }}>
                    {node.children.map(child => (
                        isBrand ? (
                            <MobileProductCard key={child.label} node={child} warehouseCodes={warehouseCodes} data={data} cartMode={cartMode} onAddToCart={onAddToCart} />
                        ) : (
                            <MobileGroupNode key={child.label} node={child} level={level + 1} warehouseCodes={warehouseCodes} data={data} cartMode={cartMode} onAddToCart={onAddToCart} />
                        )
                    ))}
                </div>
            )}
        </div>
    );
}

function MobileProductCard({ node, warehouseCodes, data, cartMode, onAddToCart }: { node: TreeNode; warehouseCodes: string[]; data: PivotData; cartMode?: boolean; onAddToCart?: (item: PivotItem) => void; }) {
    const [expanded, setExpanded] = useState(false);
    // Node level 2 is Product. Included all variants totals.
    const total = node.grandTotal;

    return (
        <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 8,
            overflow: 'hidden'
        }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{ padding: 12, cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
                            {node.label}
                        </div>
                        {/* Only show first variant SKU if available or generic info */}
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {node.children.length} variantes
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: total > 0 ? '#22c55e' : '#64748b'
                        }}>
                            {total}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Total</div>
                    </div>
                </div>
            </div>

            {expanded && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderTop: '1px solid var(--border)' }}>
                    {/* Breakdown by warehouse */}
                    {warehouseCodes.map(code => {
                        const qty = node.totals[code];
                        if (!qty) return null;
                        const whName = data.warehouses.find(w => w.code === code)?.name || code;
                        return (
                            <div key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: 13, color: '#ecf0f1' }}>{whName}</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{qty}</div>
                            </div>
                        );
                    })}
                    {node.children.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Variantes</div>
                            {node.children.map(variant => {
                                const rowItem = variant.items?.[0];
                                return (
                                    <div key={variant.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {rowItem?.color && (
                                                <div style={{
                                                    width: 12, height: 12, borderRadius: '50%',
                                                    backgroundColor: rowItem.color_hex || rowItem.color,
                                                    border: '1px solid rgba(255,255,255,0.2)',
                                                    flexShrink: 0
                                                }} />
                                            )}
                                            <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{variant.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{variant.grandTotal}</span>
                                            {cartMode && onAddToCart && rowItem && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onAddToCart(rowItem); }}
                                                    style={{
                                                        background: 'rgba(16,185,129,0.2)',
                                                        border: '1px solid rgba(16,185,129,0.4)',
                                                        borderRadius: 6,
                                                        width: 32, height: 32,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#10b981',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <ShoppingCart size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
