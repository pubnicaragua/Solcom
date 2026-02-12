
'use client';

import { useState } from 'react';
import { ArrowLeftRight, History, PackagePlus, Inbox } from 'lucide-react';
import TransferForm from '@/components/dashboard/TransferForm';
import TransferList from '@/components/dashboard/TransferList';

export default function TransfersPage() {
    const [activeTab, setActiveTab] = useState<'new' | 'receiving' | 'history'>('new');

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-red-600/20 rounded-lg text-red-500">
                    <ArrowLeftRight size={24} />
                </div>
                <div>
                    <h1 className="h-title text-white">Transferencias entre Bodegas</h1>
                    <p className="h-subtitle text-gray-400">Gestiona el movimiento de inventario entre sucursales</p>
                </div>
            </div>

            <div className="flex gap-2 mb-8 bg-slate-800/50 p-1.5 rounded-xl w-fit border border-slate-700/50 backdrop-blur-sm">
                <button
                    onClick={() => setActiveTab('new')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2.5 ${activeTab === 'new'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20 translate-y-[-1px]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                >
                    <PackagePlus size={18} />
                    Nueva Transferencia
                </button>
                <div className="w-px bg-slate-700/50 my-2" />
                <button
                    onClick={() => setActiveTab('receiving')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2.5 ${activeTab === 'receiving'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20 translate-y-[-1px]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                >
                    <Inbox size={18} />
                    Por Recibir
                </button>
                <div className="w-px bg-slate-700/50 my-2" />
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2.5 ${activeTab === 'history'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20 translate-y-[-1px]'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                >
                    <History size={18} />
                    Historial
                </button>
            </div>

            <div className="animate-fade-in">
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
