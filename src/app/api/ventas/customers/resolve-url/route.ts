import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createRouteHandlerClient({ cookies });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const urlParam = searchParams.get('url');
        if (!urlParam) {
            return NextResponse.json({ error: 'Falta el parámetro url' }, { status: 400 });
        }

        const url = urlParam.trim();
        const isGoogleMapsShort = url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps') || url.includes('maps.google.com') || url.includes('google.com/maps');
        
        if (!isGoogleMapsShort) {
            return NextResponse.json({ error: 'URL no válida' }, { status: 400 });
        }

        // Realizamos una petición HEAD para seguir los redireccionamientos eficientemente
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const finalUrl = response.url;
        
        // Intentar extraer con regex estándar de coordenadas
        const match = finalUrl.match(/([+-]?\d+\.\d+)\s*,\s*([+-]?\d+\.\d+)/);
        if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return NextResponse.json({ lat, lng, finalUrl });
            }
        }

        // Intentar extraer con formato @lat,lng
        const atMatch = finalUrl.match(/@([+-]?\d+\.\d+),([+-]?\d+\.\d+)/);
        if (atMatch) {
            const lat = parseFloat(atMatch[1]);
            const lng = parseFloat(atMatch[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return NextResponse.json({ lat, lng, finalUrl });
            }
        }

        return NextResponse.json({ error: 'No se pudieron extraer coordenadas del enlace' }, { status: 404 });
    } catch (error: any) {
        console.error('Error resolving URL:', error);
        return NextResponse.json({ error: 'Error al procesar el enlace' }, { status: 500 });
    }
}
