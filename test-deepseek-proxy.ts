// Test script para verificar el endpoint oficial de IA
// Ejecutar con: npx tsx test-deepseek-proxy.ts

async function testDeepseekProxy() {
  console.log('🧪 Testing /api/ai/chat...\n');

  try {
    console.log('� Test 1: Hacer request al backend oficial');
    const response = await fetch('http://localhost:3000/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Hola, ¿cuál es el stock de producto X?',
        agentId: 'customer-service',
        context: 'Consulta de prueba enviada desde script técnico.'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      return;
    }

    const data = await response.json();
    console.log('✅ Success!\n');
    console.log(' Response:', data.answer);

    console.log('\n� Test 2: Confirmar forma de la respuesta');
    console.log('✅ Campo answer presente:', typeof data.answer === 'string');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Ejecutar test
testDeepseekProxy();
