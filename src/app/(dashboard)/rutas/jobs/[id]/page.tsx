'use client';

import { ArrowLeft, Box, CheckCircle2, FileText, Image as ImageIcon, MapPin, Truck, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function JobDetailPage() {
    const params = useParams();
    const jobId = params.id as string || 'SO-10492';

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/rutas/inbox" className="p-2 bg-white rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900">Pedido: {jobId}</h1>
                            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="h-4 w-4" /> Entregado
                            </span>
                        </div>
                        <p className="text-sm text-gray-500">Expediente de entrega logística</p>
                    </div>
                </div>
                <button className="px-4 py-2 border border-gray-200 text-gray-700 bg-white rounded-lg font-medium shadow-sm hover:bg-gray-50 transition flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Ver Orden de Venta
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Datos del Cliente y Pedido */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center gap-2 font-semibold text-gray-900 bg-gray-50/50">
                        <Box className="h-5 w-5 text-gray-400" /> Información Logística
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Cliente</label>
                            <p className="text-sm font-semibold text-gray-900">Ferretería El Creador</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium leading-none">Dirección de Entrega</label>
                            <div className="flex gap-2 items-start mt-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-700">Managua, Semáforos de la Robelo 2c. al Lago, 1c. Arriba. Modulo 4.</p>
                            </div>
                        </div>
                        <div className="flex gap-8">
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Ventana Horaria</label>
                                <p className="text-sm text-gray-900 font-medium">08:00 AM - 12:00 PM</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Volumen/Peso</label>
                                <p className="text-sm text-gray-900 font-medium">120 kg (2 pallets)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Datos de Ruta */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center gap-2 font-semibold text-gray-900 bg-gray-50/50">
                        <Truck className="h-5 w-5 text-gray-400" /> Asignación y Transportista
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Ruta Asignada</label>
                            <Link href="/rutas/RT-001" className="text-sm font-semibold text-blue-600 hover:underline block">RT-001</Link>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Vehículo y Conductor</label>
                            <p className="text-sm font-medium text-gray-900">Camioncito KIA (M1234) • Juan Perez</p>
                        </div>
                        <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 mt-2">
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1">Marcas de Tiempo</p>
                            <ul className="text-sm space-y-1">
                                <li className="flex justify-between"><span>ETA Original:</span> <b>09:15 AM</b></li>
                                <li className="flex justify-between"><span>Hora Llegada Real (Check-In):</span> <b>09:20 AM</b></li>
                                <li className="flex justify-between"><span>Cierre de Entrega:</span> <b>09:35 AM</b></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Evidencias (Full Width) */}
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 flex items-center gap-2 font-semibold text-gray-900 bg-gray-50/50">
                        <ImageIcon className="h-5 w-5 text-gray-400" /> Prueba de Entrega (POD)
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Firma Placeholder */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                                <div className="bg-gray-100 h-32 flex items-center justify-center p-4">
                                    <span className="font-['Stalemate'] text-4xl text-gray-800 rotate-[-5deg]">Carlos M.</span>
                                </div>
                                <div className="p-2 border-t border-gray-100 bg-white text-xs text-center font-medium text-gray-600">
                                    Firma Digital (Recibido conforme)
                                </div>
                            </div>

                            {/* Foto Placeholder */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                                <div className="bg-gray-200 h-32 flex items-center justify-center relative">
                                    <ImageIcon className="h-8 w-8 text-gray-400" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-2">
                                        <span className="text-[10px] text-white">Lat: 12.132, Lng: -86.251</span>
                                    </div>
                                </div>
                                <div className="p-2 border-t border-gray-100 bg-white text-xs text-center font-medium text-gray-600">
                                    Foto de la Mercadería
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
