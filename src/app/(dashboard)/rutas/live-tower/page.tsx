'use client';

import { Map as MapIcon, Navigation, AlertTriangle, Clock, MoreVertical, Truck } from 'lucide-react';

const ACTIVE_ROUTES = [
    { id: 'RT-001', expectedEnd: '14:30 PM', vehicle: 'KIA M1234', driver: 'Juan Perez', stopsTotal: 15, stopsCompleted: 4, status: 'on_time', delay: '0m' },
    { id: 'RT-002', expectedEnd: '17:00 PM', vehicle: 'Hilux M4321', driver: 'Carlos Ruiz', stopsTotal: 8, stopsCompleted: 2, status: 'delayed', delay: '+15m' },
];

export default function LiveTowerPage() {
    return (
        <div className="flex h-[calc(100vh-170px)] -m-6"> {/* Negative margin to break out of layout padding for full screen */}
            {/* Sidebar: Rutas Activas */}
            <div className="w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Torre de Control
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Monitoreo GPS en tiempo real</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {ACTIVE_ROUTES.map(route => (
                        <div key={route.id} className={`p-4 rounded-xl border-2 transition-colors cursor-pointer ${route.status === 'delayed' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 hover:border-gray-300 shadow-sm'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold text-gray-900">{route.id}</h3>
                                    <p className="text-xs text-gray-500">{route.vehicle}</p>
                                </div>
                                {route.status === 'delayed' ? (
                                    <span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-md">
                                        <AlertTriangle className="h-3 w-3" /> {route.delay}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                                        <Clock className="h-3 w-3" /> A tiempo
                                    </span>
                                )}
                            </div>

                            {/* Progress bar */}
                            <div className="mt-3">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>Progreso ({route.stopsCompleted}/{route.stopsTotal})</span>
                                    <span>ETA: {route.expectedEnd}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 flex overflow-hidden">
                                    <div className={`h-full rounded-full ${route.status === 'delayed' ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${(route.stopsCompleted / route.stopsTotal) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Map Area */}
            <div className="flex-1 bg-gray-900 relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                    <MapIcon className="h-16 w-16 mb-4 text-gray-700 opacity-50" />
                    <p className="font-medium text-lg text-gray-400">Dark Mode Map Placeholder</p>
                    <p className="text-sm mt-2 text-gray-600 max-w-md text-center">Aquí se integrará el componente avanzado de Google Maps interactivo, mostrando la ubicación en vivo de todos los vehículos conectados mediante Supabase Realtime.</p>
                </div>

                {/* Floating Actions on Map */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                    <button className="bg-white p-2 rounded-lg shadow-md text-gray-700 hover:text-gray-900"><Navigation className="h-5 w-5" /></button>
                    <button className="bg-white p-2 rounded-lg shadow-md text-gray-700 hover:text-gray-900"><Truck className="h-5 w-5" /></button>
                </div>
            </div>
        </div>
    );
}
