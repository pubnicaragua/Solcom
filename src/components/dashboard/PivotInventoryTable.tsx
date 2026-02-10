'use client';

import { useState, useEffect, useMemo } from 'react';
import Card from '@/components/ui/Card';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

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
}

interface PivotData {
    warehouses: WarehouseCol[];
    items: PivotItem[];
}

interface PivotInventoryTableProps {
    filters?: any;
}

/* ───── hierarchy builder ───── */

interface TreeNode {
    label: string;
    level: number; // 0=state, 1=brand, 2=product, 3=color, 4=leaf(sku)
    items?: PivotItem[]; // only on leaf nodes
    children: TreeNode[];
    totals: Record<string, number>; // warehouse code → subtotal
    grandTotal: number;
}

function buildTree(items: PivotItem[], warehouseCodes: string[]): TreeNode[] {
    // Group: state → brand → name → color → sku
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
                const colorGroups = groupBy(productItems, (i) => (i.color || 'SIN COLOR').toUpperCase());

                for (const [colorName, colorItems] of sortedEntries(colorGroups)) {
                    const colorNode = makeGroupNode(colorName, 3, warehouseCodes);

                    for (const item of colorItems) {
                        // Filter out items with 0 stock
                        if (item.total === 0) continue;

                        // Leaf node = SKU row
                        const leafNode: TreeNode = {
                            label: item.sku,
                            level: 4,
                            items: [item],
                            children: [],
                            totals: { ...item.warehouseQty },
                            grandTotal: item.total,
                        };
                        colorNode.children.push(leafNode);
                        accumulateTotals(colorNode, item, warehouseCodes);
                    }
                    if (colorNode.children.length > 0) {
                        productNode.children.push(colorNode);
                        accumulateFromChild(productNode, colorNode, warehouseCodes);
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
    0: { bg: '#1a365d', text: '#fbbf24', fontWeight: 700 },   // Estado — dark blue, gold text
    1: { bg: '#1e3a5f', text: '#60a5fa', fontWeight: 700 },   // Marca — blue-ish
    2: { bg: 'transparent', text: '#e2e8f0', fontWeight: 500 },// Producto
    3: { bg: 'transparent', text: '#94a3b8', fontWeight: 600 },// Color
    4: { bg: 'transparent', text: '#64748b', fontWeight: 400 },// SKU (leaf)
};

function getCellColor(qty: number): string | undefined {
    if (qty >= 100) return '#7c3aed'; // purple for very high
    if (qty >= 50) return '#eab308';  // yellow for high
    if (qty >= 20) return '#22c55e';  // green for medium
    return undefined;
}

/* ───── component ───── */
export default function PivotInventoryTable({ filters }: PivotInventoryTableProps) {
    const [data, setData] = useState<PivotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchPivotData();
    }, [filters]);

    async function fetchPivotData() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters && typeof filters === 'object') {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value != null && value !== '' && key !== 'sortBy') {
                        params.set(key, String(value));
                    }
                });
            }
            const res = await fetch(`/api/inventory/pivot?${params.toString()}`);
            console.log('Pivot fetch status:', res.status);
            if (res.ok) {
                const result = await res.json();
                console.log('Pivot data received:', result?.warehouses?.length, 'warehouses,', result?.items?.length, 'items');
                setData(result);
            } else {
                const errText = await res.text();
                console.error('Pivot API error:', res.status, errText);
            }
        } catch (error) {
            console.error('Error fetching pivot data:', error);
        } finally {
            setLoading(false);
        }
    }

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
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    Cargando tabla pivot...
                </div>
            </Card>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <Card>
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
                    No hay datos de inventario disponibles
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

    const stickyColWidth = 250;
    const cellWidth = 75;
    const totalColWidth = 90;

    return (
        <Card padding={0}>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
                {/* Scrollable wrapper */}
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '75vh' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: stickyColWidth + warehouseCodes.length * cellWidth + totalColWidth }}>
                        {/* ─── Header ─── */}
                        <thead>
                            <tr>
                                <th style={{
                                    position: 'sticky', left: 0, top: 0, zIndex: 4,
                                    background: '#0f1b2d',
                                    padding: '10px 14px',
                                    textAlign: 'left',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    minWidth: stickyColWidth,
                                    maxWidth: stickyColWidth,
                                    width: stickyColWidth,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    borderRight: '2px solid white',
                                    borderBottom: '2px solid white',
                                }}>
                                    Cuenta de product_name
                                </th>
                                {warehouseCodes.map((code) => (
                                    <th key={code} style={{
                                        position: 'sticky', top: 0, zIndex: 2,
                                        background: '#0f1b2d',
                                        padding: '10px 6px',
                                        textAlign: 'right',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: 'var(--muted)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.3px',
                                        minWidth: cellWidth,
                                        whiteSpace: 'nowrap',
                                        borderBottom: '2px solid white',
                                    }}>
                                        {code}
                                    </th>
                                ))}
                                <th style={{
                                    position: 'sticky', top: 0, zIndex: 2,
                                    background: '#0f1b2d',
                                    padding: '10px 10px',
                                    textAlign: 'right',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                    minWidth: totalColWidth,
                                    borderLeft: '2px solid white',
                                    borderBottom: '2px solid white',
                                }}>
                                    Total
                                </th>
                            </tr>
                        </thead>
                        {/* ─── Body ─── */}
                        <tbody>
                            {flatRows.map(({ node, path, indent }) => {
                                const isGroup = node.level < 4;
                                const isCollapsed = collapsed.has(path);
                                const style = LEVEL_COLORS[node.level] || LEVEL_COLORS[4];
                                const hasChildren = node.children.length > 0;

                                return (
                                    <tr
                                        key={path}
                                        style={{
                                            background: style.bg,
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (node.level >= 2) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = style.bg;
                                        }}
                                    >
                                        {/* Label (sticky) */}
                                        <td style={{
                                            position: 'sticky', left: 0, zIndex: 1,
                                            background: style.bg === 'transparent' ? 'var(--card)' : style.bg,
                                            padding: '6px 10px',
                                            paddingLeft: 14 + indent * 20,
                                            fontWeight: style.fontWeight,
                                            fontSize: node.level <= 1 ? 13 : node.level === 4 ? 11 : 12,
                                            color: style.text,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: stickyColWidth,
                                            width: stickyColWidth,
                                            borderRight: '2px solid white',
                                            borderBottom: '1px solid rgba(255, 255, 255, 1)',
                                            cursor: hasChildren ? 'pointer' : 'default',
                                            userSelect: 'none',
                                        }}
                                            onClick={() => hasChildren && toggleCollapse(path)}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {hasChildren && (
                                                    isCollapsed
                                                        ? <ChevronRight size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
                                                        : <ChevronDown size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
                                                )}
                                                {node.level <= 1 && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: style.text, marginRight: 2, flexShrink: 0 }} />}
                                                {node.label}
                                            </span>
                                        </td>

                                        {/* Warehouse qty cells */}
                                        {warehouseCodes.map((code) => {
                                            const qty = node.totals[code] || 0;
                                            const highlight = isGroup ? getCellColor(qty) : getCellColor(qty);
                                            return (
                                                <td key={code} style={{
                                                    padding: '6px 6px',
                                                    textAlign: 'right',
                                                    fontSize: node.level <= 1 ? 13 : 12,
                                                    fontWeight: isGroup ? 700 : 400,
                                                    color: highlight || (qty !== 0 ? '#e2e8f0' : 'rgba(100,116,139,0.4)'),
                                                    background: highlight ? `${highlight}22` : undefined,
                                                    fontVariantNumeric: 'tabular-nums',
                                                    borderBottom: '1px solid rgba(255, 255, 255, 1)',
                                                }}>
                                                    {qty !== 0 ? qty.toLocaleString() : ''}
                                                </td>
                                            );
                                        })}

                                        {/* Grand total */}
                                        <td style={{
                                            padding: '6px 10px',
                                            textAlign: 'right',
                                            fontSize: node.level <= 1 ? 14 : 12,
                                            fontWeight: 700,
                                            color: '#fbbf24',
                                            borderLeft: '2px solid white',
                                            borderBottom: '1px solid rgba(255, 255, 255, 1)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {node.grandTotal !== 0 ? node.grandTotal.toLocaleString() : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer info */}
            <div style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 12,
                color: 'var(--muted)',
            }}>
                <span>{data.items.length.toLocaleString()} productos  •  {warehouseCodes.length} bodegas</span>
                <span>Click en un grupo para expandir/colapsar</span>
            </div>
        </Card>
    );
}
