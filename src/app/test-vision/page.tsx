'use client';

import { useState } from 'react';

interface TestResult {
  success: boolean;
  content?: string;
  error?: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export default function TestVisionPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [testType, setTestType] = useState<'url' | 'multiple' | 'extract-text' | 'product'>('url');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');

  const runTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const body: any = { type: testType };

      if (testType === 'multiple') {
        body.imageUrls = imageUrls.split('\n').filter(url => url.trim());
      } else {
        body.imageUrl = imageUrl;
      }

      if (customPrompt && (testType === 'url' || testType === 'multiple')) {
        body.prompt = customPrompt;
      }

      const response = await fetch('/api/test-vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        model: 'gpt-4o',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pruebas OpenAI GPT-4o Vision
          </h1>
          <p className="text-gray-600 mb-6">
            Módulo de pruebas para procesar imágenes y URLs con GPT-4o
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Prueba
              </label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="url">Analizar imagen desde URL</option>
                <option value="multiple">Analizar múltiples imágenes</option>
                <option value="extract-text">Extraer texto de imagen</option>
                <option value="product">Analizar imagen de producto</option>
              </select>
            </div>

            {testType === 'multiple' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URLs de Imágenes (una por línea)
                </label>
                <textarea
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder="https://ejemplo.com/imagen1.jpg&#10;https://ejemplo.com/imagen2.jpg"
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL de la Imagen
                </label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://ejemplo.com/imagen.jpg"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {(testType === 'url' || testType === 'multiple') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prompt Personalizado (opcional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Deja vacío para usar el prompt predeterminado"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              onClick={runTest}
              disabled={loading || (!imageUrl && !imageUrls)}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Procesando...' : 'Ejecutar Prueba'}
            </button>

            {result && (
              <div className="mt-6 space-y-4">
                <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <h3 className="font-semibold text-lg mb-2">
                    {result.success ? '✅ Éxito' : '❌ Error'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Modelo: <span className="font-mono">{result.model}</span>
                  </p>
                  
                  {result.success && result.content && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Respuesta:</h4>
                      <div className="bg-white p-4 rounded border border-gray-200 whitespace-pre-wrap">
                        {result.content}
                      </div>
                    </div>
                  )}

                  {result.error && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-red-700">Error:</h4>
                      <div className="bg-white p-4 rounded border border-red-300 text-red-700">
                        {result.error}
                      </div>
                    </div>
                  )}

                  {result.usage && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Tokens Prompt</p>
                        <p className="text-lg font-semibold">{result.usage.prompt_tokens}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Tokens Respuesta</p>
                        <p className="text-lg font-semibold">{result.usage.completion_tokens}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Total Tokens</p>
                        <p className="text-lg font-semibold">{result.usage.total_tokens}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">💡 Ejemplos de URLs para probar:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Productos: Imágenes de inventario, empaques, etiquetas</li>
                <li>• Documentos: Facturas, recibos, formularios escaneados</li>
                <li>• Capturas: Screenshots de sistemas, reportes, dashboards</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
