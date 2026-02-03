# Módulo de Pruebas OpenAI GPT-4o Vision

Este módulo permite probar las capacidades de visión del modelo GPT-4o de OpenAI para procesar imágenes y URLs en Solis Comercial.

## 🚀 Configuración Inicial

### 1. Instalar Dependencias

```bash
npm install
```

Esto instalará el paquete `openai` versión 4.28.0 que ya está agregado en `package.json`.

### 2. Configurar API Key

Agrega tu API Key de OpenAI en el archivo `.env.local`:

```env
OPENAI_API_KEY=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
```

**⚠️ IMPORTANTE:** Nunca subas el archivo `.env.local` a Git. Ya está incluido en `.gitignore`.

### 3. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

## 📁 Archivos Creados

### 1. **`src/lib/openai-vision-test.ts`**
Módulo principal con funciones para analizar imágenes:

- `analyzeImageFromUrl()` - Analiza una imagen desde URL
- `analyzeImageFromBase64()` - Analiza una imagen en formato base64
- `analyzeMultipleImages()` - Analiza múltiples imágenes simultáneamente
- `extractTextFromImage()` - Extrae texto de una imagen (OCR)
- `analyzeProductImage()` - Analiza imágenes de productos para inventario

### 2. **`src/app/api/test-vision/route.ts`**
API endpoint para procesar solicitudes de análisis de imágenes.

**Endpoint:** `POST /api/test-vision`

### 3. **`src/app/test-vision/page.tsx`**
Interfaz web interactiva para realizar pruebas.

**URL:** `http://localhost:3000/test-vision`

## 🎯 Casos de Uso

### 1. Analizar Imagen desde URL

```typescript
import { analyzeImageFromUrl } from '@/lib/openai-vision-test';

const result = await analyzeImageFromUrl(
  'https://ejemplo.com/producto.jpg',
  '¿Qué producto es este?'
);

console.log(result.content);
```

### 2. Extraer Texto de Documentos

```typescript
import { extractTextFromImage } from '@/lib/openai-vision-test';

const result = await extractTextFromImage(
  'https://ejemplo.com/factura.jpg'
);

console.log(result.content); // Texto extraído
```

### 3. Analizar Productos para Inventario

```typescript
import { analyzeProductImage } from '@/lib/openai-vision-test';

const result = await analyzeProductImage(
  'https://ejemplo.com/producto.jpg'
);

// Retorna: nombre, marca, características, estado del empaque
console.log(result.content);
```

### 4. Analizar Múltiples Imágenes

```typescript
import { analyzeMultipleImages } from '@/lib/openai-vision-test';

const result = await analyzeMultipleImages(
  [
    'https://ejemplo.com/img1.jpg',
    'https://ejemplo.com/img2.jpg'
  ],
  'Compara estos productos'
);

console.log(result.content);
```

## 🌐 Uso desde la API

### Ejemplo con cURL

```bash
curl -X POST http://localhost:3000/api/test-vision \
  -H "Content-Type: application/json" \
  -d '{
    "type": "url",
    "imageUrl": "https://ejemplo.com/imagen.jpg",
    "prompt": "Describe esta imagen"
  }'
```

### Tipos de Análisis Disponibles

#### 1. `url` - Analizar desde URL
```json
{
  "type": "url",
  "imageUrl": "https://ejemplo.com/imagen.jpg",
  "prompt": "¿Qué hay en esta imagen?"
}
```

#### 2. `base64` - Analizar desde Base64
```json
{
  "type": "base64",
  "base64Image": "iVBORw0KGgoAAAANS...",
  "mimeType": "image/png",
  "prompt": "Describe esta imagen"
}
```

#### 3. `multiple` - Analizar Múltiples Imágenes
```json
{
  "type": "multiple",
  "imageUrls": [
    "https://ejemplo.com/img1.jpg",
    "https://ejemplo.com/img2.jpg"
  ],
  "prompt": "Compara estas imágenes"
}
```

#### 4. `extract-text` - Extraer Texto (OCR)
```json
{
  "type": "extract-text",
  "imageUrl": "https://ejemplo.com/documento.jpg"
}
```

#### 5. `product` - Analizar Producto
```json
{
  "type": "product",
  "imageUrl": "https://ejemplo.com/producto.jpg"
}
```

## 📊 Respuesta de la API

```typescript
{
  "success": true,
  "content": "Descripción generada por GPT-4o...",
  "model": "gpt-4o",
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801
  }
}
```

## 🎨 Interfaz Web

Accede a `http://localhost:3000/test-vision` para usar la interfaz interactiva:

1. Selecciona el tipo de prueba
2. Ingresa la URL de la imagen
3. Opcionalmente personaliza el prompt
4. Haz clic en "Ejecutar Prueba"
5. Visualiza los resultados y el uso de tokens

## 💡 Casos de Uso para Solis Comercial

### 1. **Gestión de Inventario**
- Analizar fotos de productos recibidos
- Verificar estado de empaques
- Identificar marcas y modelos

### 2. **Procesamiento de Documentos**
- Extraer datos de facturas
- Digitalizar recibos
- Procesar órdenes de compra escaneadas

### 3. **Control de Calidad**
- Verificar productos antes de envío
- Detectar daños en mercancía
- Validar etiquetado correcto

### 4. **Análisis de Competencia**
- Analizar catálogos de competidores
- Comparar presentaciones de productos
- Extraer información de precios

## 🔒 Seguridad

- La API Key se almacena en variables de entorno
- Nunca expongas la API Key en el código cliente
- El archivo `.env.local` está en `.gitignore`
- Usa el archivo `.env.example` como referencia

## 📈 Costos y Límites

**Modelo:** GPT-4o (gpt-4o)

- **Entrada:** ~$5.00 por 1M tokens
- **Salida:** ~$15.00 por 1M tokens
- **Imágenes:** El costo varía según resolución

**Límites configurados:**
- Max tokens por respuesta: 1000 (análisis simple)
- Max tokens por respuesta: 2000 (múltiples imágenes)

## 🛠️ Troubleshooting

### Error: "Cannot find module 'openai'"
```bash
npm install
```

### Error: "OPENAI_API_KEY no está configurada"
Verifica que el archivo `.env.local` existe y contiene la API Key.

### Error: "Invalid API Key"
Verifica que la API Key sea correcta y esté activa en tu cuenta de OpenAI.

## 📚 Recursos

- [Documentación OpenAI Vision](https://platform.openai.com/docs/guides/vision)
- [Pricing OpenAI](https://openai.com/pricing)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## 🎯 Próximos Pasos

1. Probar con imágenes reales de productos de Solis Comercial
2. Integrar con el sistema de inventario
3. Crear flujos automatizados para procesamiento de documentos
4. Implementar análisis batch para múltiples productos
5. Agregar caché para reducir costos en imágenes repetidas
