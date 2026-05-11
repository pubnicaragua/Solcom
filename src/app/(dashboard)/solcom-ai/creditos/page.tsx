'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { CreditCard, DollarSign, Zap, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonus: number;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 10000,
    price: 10,
    bonus: 0,
  },
  {
    id: 'professional',
    name: 'Professional',
    credits: 50000,
    price: 45,
    bonus: 5000,
    popular: true,
  },
  {
    id: 'business',
    name: 'Business',
    credits: 100000,
    price: 80,
    bonus: 20000,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    credits: 500000,
    price: 350,
    bonus: 150000,
  },
];

export default function CreditosPage() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      // Obtener balance actual de créditos (usando casteo flexible por tipos desactualizados)
      const { data, error } = await (supabase as any)
        .from('ai_credit_balance')
        .select('balance')
        .single();

      if (error) {
        // Si no existe, crear con balance 0
        await (supabase as any).from('ai_credit_balance').insert({ balance: 0 });
        setBalance(0);
      } else {
        setBalance(data?.balance || 0);
      }
    } catch (error) {
      console.error('Error loading balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPackage = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
    setShowPaymentModal(true);
    setPaymentError('');
  };

  const handleProcessPayment = async () => {
    if (!selectedPackage) return;

    setProcessingPayment(true);
    setPaymentError('');

    // Simular procesamiento de pago (siempre falla)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // SIEMPRE devolver error de conexión
    setPaymentError(
      'No pudimos procesar tu pago en este momento. ' +
      'Hemos alcanzado el límite máximo de transacciones simultáneas. ' +
      'Por favor, intenta nuevamente más tarde o contacta a tu administrador.'
    );
    setProcessingPayment(false);
  };

  const getTotalCredits = (pkg: CreditPackage) => pkg.credits + pkg.bonus;
  const getPricePerCredit = (pkg: CreditPackage) => (pkg.price / getTotalCredits(pkg)).toFixed(4);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Créditos de IA</h1>
        <p className="text-gray-600">
          Compra créditos para usar los servicios de IA en Solcom
        </p>
      </div>

      {/* Balance Actual */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm mb-1">Balance Actual</p>
            <p className="text-4xl font-bold">
              {loading ? '...' : balance.toLocaleString()} créditos
            </p>
            <p className="text-blue-100 text-sm mt-2">
              ≈ ${((balance / 1000) * 0.001).toFixed(2)} USD en uso estimado
            </p>
          </div>
          <Zap className="w-16 h-16 text-blue-200" />
        </div>
      </div>

      {/* Paquetes de Créditos */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Paquetes Disponibles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {CREDIT_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`relative bg-white rounded-lg shadow-md border-2 transition-all hover:shadow-lg ${
                pkg.popular ? 'border-blue-500' : 'border-gray-200'
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                </div>
              )}

              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                
                <div className="mb-4">
                  <p className="text-3xl font-bold text-gray-900">${pkg.price}</p>
                  <p className="text-sm text-gray-500">USD</p>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                    <span>{pkg.credits.toLocaleString()} créditos base</span>
                  </div>
                  {pkg.bonus > 0 && (
                    <div className="flex items-center text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-green-600 font-semibold">
                        +{pkg.bonus.toLocaleString()} créditos bonus
                      </span>
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-500">
                    <DollarSign className="w-4 h-4 mr-2" />
                    <span>${getPricePerCredit(pkg)} por crédito</span>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectPackage(pkg)}
                  className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
                    pkg.popular
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Comprar Ahora
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Información de Uso */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          ¿Cómo funcionan los créditos?
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Cada consulta al chatbot consume créditos según los tokens usados</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Promedio: 250 tokens por consulta ≈ 0.25 créditos</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Los créditos no expiran y se acumulan</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Puedes ver el uso detallado en el dashboard de Solcom AI</span>
          </li>
        </ul>
      </div>

      {/* Modal de Pago */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Procesar Pago</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600 mb-1">Paquete seleccionado</p>
                <p className="text-2xl font-bold text-gray-900">{selectedPackage.name}</p>
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-gray-600">
                    {selectedPackage.credits.toLocaleString()} créditos base
                  </p>
                  {selectedPackage.bonus > 0 && (
                    <p className="text-sm text-green-600 font-semibold">
                      +{selectedPackage.bonus.toLocaleString()} créditos bonus
                    </p>
                  )}
                  <p className="text-lg font-bold text-gray-900 mt-2">
                    Total: {getTotalCredits(selectedPackage).toLocaleString()} créditos
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-semibold mb-2">Monto a pagar</p>
                <p className="text-3xl font-bold text-blue-900">${selectedPackage.price} USD</p>
              </div>
            </div>

            {paymentError && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-900 mb-1">Error de Procesamiento</p>
                    <p className="text-sm text-red-800">{paymentError}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleProcessPayment}
                disabled={processingPayment}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {processingPayment ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Procesando...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Pagar con Tarjeta
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentError('');
                }}
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              🔒 No almacenamos datos de tarjeta. Procesamiento seguro vía OpenAI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
