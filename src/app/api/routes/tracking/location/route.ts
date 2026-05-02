import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      trackingToken, 
      lat, 
      lng, 
      accuracy, 
      heading, 
      speed, 
      batteryLevel, 
      recordedAt 
    } = body;

    // Validaciones
    if (!trackingToken) {
      return NextResponse.json(
        { error: 'Token de tracking requerido' },
        { status: 400 }
      );
    }

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Coordenadas requeridas' },
        { status: 400 }
      );
    }

    // Crear cliente de Supabase con service role para bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuración de Supabase no disponible' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar que el token existe y está habilitado
    const { data: route, error: routeError } = await supabase
      .from('routes')
      .select('id, driver_name, tracking_enabled')
      .eq('tracking_token', trackingToken)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { error: 'Token inválido o ruta no encontrada' },
        { status: 404 }
      );
    }

    if (!route.tracking_enabled) {
      return NextResponse.json(
        { error: 'Tracking no habilitado para esta ruta' },
        { status: 403 }
      );
    }

    // Guardar ubicación
    const { error: insertError } = await supabase
      .from('route_tracking_locations')
      .insert({
        route_id: route.id,
        tracking_token: trackingToken,
        driver_name: route.driver_name,
        lat,
        lng,
        accuracy: accuracy || null,
        heading: heading || null,
        speed: speed || null,
        battery_level: batteryLevel || null,
        recorded_at: recordedAt || new Date().toISOString()
      });

    if (insertError) {
      console.error('Error insertando ubicación:', insertError);
      return NextResponse.json(
        { error: 'Error guardando ubicación' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Ubicación guardada correctamente'
    });

  } catch (error) {
    console.error('Error en tracking endpoint:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Permitir OPTIONS para CORS
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    }
  );
}
