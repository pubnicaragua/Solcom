
'use client';

import { useState } from 'react';
import { ArrowLeftRight, History, PackagePlus, Inbox } from 'lucide-react';
import TransferForm from '@/components/dashboard/TransferForm';
import TransferList from '@/components/dashboard/TransferList';

export default function TransfersPage() {
    const [activeTab, setActiveTab] = useState<'new' | 'receiving' | 'history'>('new');

    return (
        <div className="transfers-module-view" data-tour="transfers-header">
            <div className="transfers-page-heading" data-tour="module-header">
                <div className="system-title-mark" aria-hidden="true">
                    <ArrowLeftRight size={21} />
                </div>
                <div>
                    <h1 className="h-title">Transferencias entre Bodegas</h1>
                    <p className="h-subtitle">Gestiona el movimiento de inventario entre sucursales</p>
                </div>
            </div>

            <div className="transfers-tabs" data-tour="transfers-actions">
                <button
                    onClick={() => setActiveTab('new')}
                    className={`transfers-tab ${activeTab === 'new' ? 'is-active' : ''}`}
                >
                    <PackagePlus size={18} />
                    Nueva Transferencia
                </button>
                <div className="transfers-tabs-divider" />
                <button
                    onClick={() => setActiveTab('receiving')}
                    className={`transfers-tab ${activeTab === 'receiving' ? 'is-active' : ''}`}
                >
                    <Inbox size={18} />
                    Por Recibir
                </button>
                <div className="transfers-tabs-divider" />
                <button
                    onClick={() => setActiveTab('history')}
                    className={`transfers-tab ${activeTab === 'history' ? 'is-active' : ''}`}
                >
                    <History size={18} />
                    Historial
                </button>
            </div>

            <div className="transfers-tab-panel animate-fade-in" data-tour="transfers-list">
                {activeTab === 'new' && (
                    <TransferForm onSuccess={() => setActiveTab('receiving')} />
                )}

                {activeTab === 'receiving' && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-white mb-4">Transferencias en Tránsito</h3>
                        <TransferList status="in_transit" showReceiveAction={true} />
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-white mb-4">Historial Completo</h3>
                        <TransferList />
                    </div>
                )}
            </div>
        </div>
    );
}
