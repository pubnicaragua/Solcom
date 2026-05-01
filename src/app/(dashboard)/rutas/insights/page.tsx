'use client';

import { BarChart3, TrendingUp, TrendingDown, Clock, MoveUpRight, MoveDownRight, Activity } from 'lucide-react';

export default function InsightsPage() {
    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Histórico de Operaciones (Insights)</h1>
                <p className="text-sm text-gray-500">Métricas clave, eficiencia de flota y rendimiento de entregas en los últimos 30 días.</p>
            </div>

            {/* Top Value Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">On-Time Delivery (OTD)</h3>
                    <div className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        94.2% <MoveUpRight className="h-5 w-5 text-emerald-500" />
                    </div>
                    <p className="text-xs text-emerald-600 mt-2 font-medium">+2.1% vs mes pasado</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Entregas Fallidas</h3>
                    <div className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        2.8% <MoveDownRight className="h-5 w-5 text-emerald-500" />
                    </div>
                    <p className="text-xs text-emerald-600 mt-2 font-medium">-1.4% vs mes pasado</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Tiempo Prom. Servicio</h3>
                    <div className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        12m
                    </div>
                    <p className="text-xs text-orange-500 mt-2 font-medium">Ligeramente alto en Managua Norte</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Desviación de Ruta</h3>
                    <div className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        4.1%
                    </div>
                    <p className="text-xs text-gray-500 mt-2 font-medium">Extra KM recorridos (Promedio)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Chart Placeholder 1 */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-gray-400" /> Entregas por Día</h3>
                        <select className="text-xs border-gray-200 rounded-lg p-1">
                            <option>Últimos 7 días</option>
                            <option>Últimos 30 días</option>
                        </select>
                    </div>

                    <div className="h-64 flex items-end gap-2 justify-between">
                        {/* Mock bars */}
                        {[40, 70, 45, 90, 65, 30, 80].map((h, i) => (
                            <div key={i} className="w-full bg-gray-100 rounded-t-sm relative group cursor-pointer hover:bg-gray-200" style={{ height: '100%' }}>
                                <div className="absolute bottom-0 w-full bg-red-500 rounded-t-sm transition-all duration-300 group-hover:bg-red-600" style={{ height: `${h}%` }}></div>
                                <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded-md transition-opacity">{h}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between mt-4 text-xs font-medium text-gray-400 border-t pt-4">
                        <span>Lunes</span><span>Martes</span><span>Miércoles</span><span>Jueves</span><span>Viernes</span><span>Sábado</span><span>Domingo</span>
                    </div>
                </div>

                {/* Eficiencia de conductores */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Activity className="h-4 w-4 text-gray-400" /> Top Conductores (Score Eficiencia)</h3>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs">JP</div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">Juan Perez</p>
                                    <p className="text-xs text-gray-500">M1234 • Zona Sur</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-emerald-600">98.5</p>
                                <p className="text-xs text-gray-500">Pts</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs">CR</div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">Carlos Ruiz</p>
                                    <p className="text-xs text-gray-500">M4321 • Zona Norte</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-emerald-600">92.1</p>
                                <p className="text-xs text-gray-500">Pts</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs">PM</div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">Pedro Martinez</p>
                                    <p className="text-xs text-gray-500">M8877 • Masaya</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-orange-500">84.0</p>
                                <p className="text-xs text-gray-500">Pts</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
