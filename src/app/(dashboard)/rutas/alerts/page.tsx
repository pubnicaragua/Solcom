'use client';

import { AlertOctagon, CheckCircle2, Clock, Filter, AlertTriangle, MessageSquare } from 'lucide-react';

const MOCK_ALERTS = [
    { id: 1, route: 'RT-002', driver: 'Carlos Ruiz', type: 'Delay Crítico', message: 'El vehículo está proyectado a llegar 45 mins tarde a Supermercado La Unión, rompiendo la ventana horaria.', status: 'open', time: 'Hace 10 min', severity: 'critical' },
    { id: 2, route: 'RT-005', driver: 'Pedro Martinez', type: 'Desvío de Ruta', message: 'El vehículo ha salido de su geocerca (Ruta Sur) por más de 3KM.', status: 'open', time: 'Hace 25 min', severity: 'warning' },
    { id: 3, route: 'RT-001', driver: 'Juan Perez', type: 'Excepción de Entrega', message: 'El cliente "Ferretería Mundial" no se encuentra en el local. Intento fallido.', status: 'resolved', time: 'Ayer 14:20', severity: 'info' },
];

export default function AlertsPage() {
    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Alertas Operativas</h1>
                    <p className="text-sm text-gray-500">Notificaciones automáticas del Motor Inteligente de Rutas</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 bg-white">
                        <Filter className="h-4 w-4" />
                        <span>Activas (2)</span>
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {MOCK_ALERTS.map(alert => (
                    <div key={alert.id} className={`flex bg-white rounded-xl shadow-sm border overflow-hidden ${alert.status === 'open' ? 'border-l-4' : 'border border-gray-100 opacity-60'} ${alert.severity === 'critical' && alert.status === 'open' ? 'border-l-red-500' : alert.severity === 'warning' && alert.status === 'open' ? 'border-l-orange-500' : 'border-l-gray-300'}`}>
                        <div className="p-5 flex-1 flex flex-col sm:flex-row gap-4 sm:items-center">

                            {/* Icon */}
                            <div className={`p-3 rounded-full shrink-0 h-fit ${alert.status !== 'open' ? 'bg-gray-100 text-gray-400' : alert.severity === 'critical' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
                                {alert.status !== 'open' ? <CheckCircle2 className="h-6 w-6" /> : alert.severity === 'critical' ? <AlertOctagon className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-gray-900">{alert.type}</span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{alert.route}</span>
                                    <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> {alert.time}</span>
                                </div>
                                <p className="text-sm text-gray-700">{alert.message}</p>
                                <p className="text-xs text-gray-500 mt-2 font-medium">Conductor: {alert.driver}</p>
                            </div>

                            {/* Actions */}
                            {alert.status === 'open' && (
                                <div className="flex sm:flex-col gap-2 shrink-0">
                                    <button className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition">Atender</button>
                                    <button className="flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition"><MessageSquare className="h-3 w-3" /> Contactar</button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
