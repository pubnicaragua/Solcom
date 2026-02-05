import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.json({ error: `Zoho OAuth Error: ${error}` }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: 'No se recibió el código de autorización' }, { status: 400 });
    }

    try {
        const clientId = process.env.ZOHO_BOOKS_CLIENT_ID;
        const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET;
        const redirectUri = `${request.nextUrl.origin}/api/auth/zoho/callback`;

        if (!clientId || !clientSecret) {
            return NextResponse.json({
                error: 'Faltan variables de entorno ZOHO_BOOKS_CLIENT_ID o ZOHO_BOOKS_CLIENT_SECRET'
            }, { status: 500 });
        }

        const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({
                error: 'Error al intercambiar el código por tokens',
                details: data
            }, { status: response.status });
        }

        // Devolvemos una pequeña página HTML para que el usuario pueda copiar el refresh token fácilmente
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Zoho Auth Exitosa</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #071826; color: white; margin: 0; }
            .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); max-width: 500px; width: 100%; text-align: center; }
            h1 { color: #10B981; margin-top: 0; }
            p { color: #9CA3AF; line-height: 1.5; }
            .token-box { background: #000; padding: 1rem; border-radius: 6px; margin: 1.5rem 0; word-break: break-all; font-family: monospace; border: 1px solid #ff4e00; color: #ff4e00; }
            button { background: #ff4e00; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-weight: bold; }
            button:hover { background: #e64600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>¡Conexión Exitosa!</h1>
            <p>Se ha generado tu <strong>Refresh Token</strong> para Zoho Books. Cópialo y añádelo a tus variables de entorno en Vercel.</p>
            <div class="token-box" id="token">${data.refresh_token}</div>
            <button onclick="copyToken()">Copiar Token</button>
            <p style="font-size: 0.8rem; margin-top: 1.5rem;">Cierra esta pestaña después de copiarlo.</p>
          </div>
          <script>
            function copyToken() {
              const token = document.getElementById('token').innerText;
              navigator.clipboard.writeText(token).then(() => {
                alert('Token copiado al portapapeles');
              });
            }
          </script>
        </body>
      </html>
    `;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html' },
        });

    } catch (error) {
        console.error('Callback error:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
