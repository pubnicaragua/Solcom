// Test script para verificar la API de Deepseek
// Ejecutar con: npx tsx test-deepseek-api.ts

const DEEPSEEK_API_KEY = 'sk-c0c86466239346329c672768b1812428';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

async function testDeepseekAPI() {
  console.log('🧪 Testing Deepseek API...\n');

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Hola, ¿puedes decirme qué eres y responder en español?'
          }
        ],
        model: 'deepseek-v4-flash',
        stream: false
      })
    });

    console.log('📡 Response Status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      return;
    }

    const data = await response.json();

    console.log('✅ Success!\n');
    console.log('📊 Usage:', data.usage);
    console.log('💬 Response:', data.choices[0].message.content);
    console.log('🔢 Total Tokens:', data.usage.total_tokens);
    console.log('💰 Estimated Cost:', `$${(data.usage.total_tokens / 1000 * 0.0001).toFixed(6)}`);

    // Test con contexto de inventario
    console.log('\n🧪 Testing with inventory context...\n');

    const inventoryResponse = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente de inventario para Solis Comercial. Responde preguntas sobre stock, productos y bodegas.'
          },
          {
            role: 'user',
            content: '¿Cuál es el proceso para verificar el stock de un producto?'
          }
        ],
        model: 'deepseek-v4-flash',
        stream: false
      })
    });

    const inventoryData = await inventoryResponse.json();
    console.log('💬 Inventory Response:', inventoryData.choices[0].message.content);
    console.log('🔢 Tokens:', inventoryData.usage.total_tokens);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Ejecutar test
testDeepseekAPI();
