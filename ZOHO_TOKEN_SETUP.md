# Configuración de Refresh Token de Zoho para Vercel

## Pasos para obtener el Refresh Token

### 1. Crear Connected App en Zoho

1. Ve a [Zoho Developer Console](https://developer.zoho.com/)
2. Crea una nueva Connected App
3. Configura los siguientes parámetros:
   - **Client ID**: Se generará automáticamente
   - **Client Secret**: Se generará automáticamente
   - **Redirect URI**: `https://tu-app.vercel.app/api/auth/zoho/callback`
   - **Scope**: `ZohoBooks.fullaccess.all`

### 2. Obtener Grant Token

Haz una solicitud GET a:
```
https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.fullaccess.all&client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://tu-app.vercel.app/api/auth/zoho/callback&access_type=offline
```

### 3. Intercambiar Grant Token por Refresh Token

Haz una solicitud POST a:
```
https://accounts.zoho.com/oauth/v2/token
```

Con los siguientes parámetros (form-data):
- `grant_type`: `authorization_code`
- `client_id`: `YOUR_CLIENT_ID`
- `client_secret`: `YOUR_CLIENT_SECRET`
- `redirect_uri`: `https://tu-app.vercel.app/api/auth/zoho/callback`
- `code`: `CODE_RECEIVED_FROM_STEP_2`

### 4. Respuesta Esperada

```json
{
  "access_token": "1000.xxxx...",
  "refresh_token": "1000.xxxx...",
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Configuración en Vercel

### Variables de Entorno

Agrega estas variables en tu proyecto Vercel:

```bash
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
ZOHO_DOMAIN=https://www.zohoapis.com
```

### Notas Importantes

1. **Dominio específico**: Usa la URL correcta según tu región:
   - US: `https://accounts.zoho.com`
   - EU: `https://accounts.zoho.eu`
   - AU: `https://accounts.zoho.com.au`
   - IN: `https://accounts.zoho.in`

2. **Access Type**: Incluye `access_type=offline` en la URL de autorización para obtener refresh token

3. **Seguridad**: Nunca expongas el client_secret en el frontend

4. **Organización**: Los tokens son específicos de la organización

## Ejemplo de Implementación

```javascript
// api/zoho/refresh-token.js
export default async function handler(req, res) {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    }),
  });
  
  const tokens = await response.json();
  res.json(tokens);
}
```

## Prueba Local

Para probar localmente, usa ngrok o similar:
```
ngrok http 3000
```

Y usa la URL de ngrok como redirect_uri en el paso 1.
