'use client';

import { ArrowLeft, Clock, MapPin, Search, ChevronRight, Activity, Map as MapIcon, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function RouteDetailPage() {
    const params = useParams();
    const routeId = params.id as string || 'RT-001';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-4">
                <Link href="/rutas/live-tower" className="p-2 bg-white rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Ruta: {routeId}</h1>
                    <p className="text-sm text-gray-500">Detalle operativo y auditoría de la ruta ejecutada vs planificada.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Resumen KPIs */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-4 border-b pb-2">Resumen General</h3>

                        <div className="space-y-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Estado</span>
                                <span className="font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">En Progreso</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Vehículo</span>
                                <span className="font-medium text-gray-900">M1234 (KIA)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Conductor</span>
                                <span className="font-medium text-gray-900">Juan Perez</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Distancia Estimada</span>
                                <span className="font-medium text-gray-900">45.2 km</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Paradas Realizadas</span>
                                <span className="font-medium text-gray-900">4 / 15</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                        <h3 className="font-semibold text-gray-900 mb-4 border-b pb-2">Timeline Operativo</h3>

                        <div className="relative pl-4 border-l-2 border-gray-100 space-y-6 pb-2">
                            <div className="relative">
                                <div className="absolute -left-[22px] bg-white p-0.5"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
                                <p className="text-sm font-semibold text-gray-900">Ruta Iniciada (Bodega)</p>
                                <p className="text-xs text-gray-500">08:00 AM</p>
                            </div>
                            <div className="relative">
                                <div className="absolute -left-[22px] bg-white p-0.5"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
                                <p className="text-sm font-medium text-gray-900">Entrega 1 completada</p>
                                <p className="text-xs text-gray-500">08:45 AM (A tiempo)</p>
                            </div>
                            <div className="relative">
                                <div className="absolute -left-[21px] bg-white w-3 h-3 border-2 border-red-500 bg-white rounded-full"></div>
                                <p className="text-sm font-medium text-red-600">En tránsito a Entrega 2</p>
                                <p className="text-xs text-gray-500">ETA recalculado: 09:30 AM <span className="text-red-500 font-bold">(+12m)</span></p>
                            </div>
                            <div className="relative opacity-40">
                                <div className="absolute -left-[21px] bg-white w-3 h-3 bg-gray-200 rounded-full"></div>
                                <p className="text-sm font-medium text-gray-600">Fin de Ruta Estimado</p>
                                <p className="text-xs text-gray-500">14:45 PM</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mapa Comparativo */}
                <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <MapIcon className="h-4 w-4 text-gray-400" /> Plan vs Real
                        </h3>

                        <div className="flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-1"><span className="w-3 h-1 bg-blue-500 rounded-full"></span> Ruta Planeada</div>
                            <div className="flex items-center gap-1"><span className="w-3 h-1 bg-red-500 rounded-full"></span> Trazo Real (GPS)</div>
                        </div>
                    </div>

                    <div className="flex-1 bg-gray-100 min-h-[400px] flex items-center justify-center">
                        <p className="text-gray-400 font-medium">Componente de Mapa (Polyline Overlay)</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
