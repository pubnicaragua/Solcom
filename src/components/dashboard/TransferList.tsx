
'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ArrowRight, CheckCircle, Loader2, Calendar, Package } from 'lucide-react';

interface TransferListProps {
    status?: string;
    showReceiveAction?: boolean;
}

export default function TransferList({ status, showReceiveAction }: TransferListProps) {
    const [transfers, setTransfers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    async function fetchTransfers() {
        setLoading(true);
        try {
            let url = '/api/transfers';
            if (status) url += `?status=${status}`;

            const res = await fetch(url);
            const data = await res.json();
            if (Array.isArray(data)) setTransfers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchTransfers();
    }, [status]);

    async function handleReceive(id: string) {
        if (!confirm('¿Confirmar recepción de esta transferencia?')) return;

        setProcessingId(id);
        try {
            const res = await fetch(`/api/transfers/${id}/receive`, { method: 'POST' });
            const result = await res.json();

            if (!res.ok) throw new Error(result.error || 'Error al recibir');

            alert('Transferencia recibida exitosamente');
            fetchTransfers(); // Refresh list
        } catch (e: any) {
            alert(e.message);
        } finally {
            setProcessingId(null);
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto mb-2" /> Cargando transferencias...</div>;
    }

    if (transfers.length === 0) {
        return <div className="p-8 text-center text-gray-500 bg-gray-900/30 rounded border border-gray-800">No hay transferencias {status === 'in_transit' ? 'pendientes' : 'en el historial'}</div>;
    }

    return (
        <div className="flex flex-col gap-4">
            {transfers.map(transfer => (
                <Card key={transfer.id} className="hover:border-gray-600 transition-colors">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">

                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-sm px-2 py-0.5 bg-gray-800 rounded text-gray-300">
                                    {transfer.transfer_order_number || 'SIN-FOLIO'}
                                </span>
                                <Badge variant={transfer.status === 'in_transit' ? 'warning' : 'success'}>
                                    {transfer.status === 'in_transit' ? 'En Tránsito' : 'Recibido'}
                                </Badge>
                                <div className="flex items-center text-xs text-gray-400 gap-1">
                                    <Calendar size={12} />
                                    {new Date(transfer.date).toLocaleDateString()}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-sm">
                                <span className="font-medium text-white">{transfer.from_warehouse?.name || 'Origen Desconocido'}</span>
                                <ArrowRight size={14} className="text-gray-500" />
                                <span className="font-medium text-white">{transfer.to_warehouse?.name || 'Destino Desconocido'}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                            <div className="text-sm text-gray-400 flex items-center gap-2">
                                <Package size={16} />
                                {transfer.line_items?.length || 0} productos
                            </div>

                            {showReceiveAction && transfer.status === 'in_transit' && (
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleReceive(transfer.id)}
                                    disabled={processingId === transfer.id}
                                >
                                    {processingId === transfer.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                                    Recibir
                                </Button>
                            )}
                        </div>

                    </div>

                    {/* Detailed items expander could go here, for now simpler */}
                    <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500">
                        {transfer.line_items?.map((item: any) => (
                            <span key={item.item_id} className="mr-3 inline-block">• {item.name} ({item.quantity})</span>
                        ))}
                    </div>
                </Card>
            ))}
        </div>
    );
}
