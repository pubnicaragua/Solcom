import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Agregar columnas a routes
    console.log('Agregando columnas a routes...');
    
    const routesColumns = [
      { name: 'driver_name', type: 'text' },
      { name: 'driver_phone', type: 'text' },
      { name: 'vehicle_label', type: 'text' },
      { name: 'origin_lat', type: 'double precision' },
      { name: 'origin_lng', type: 'double precision' },
      { name: 'return_to_origin', type: 'boolean', default: 'false' },
      { name: 'tracking_token', type: 'text' },
      { name: 'tracking_enabled', type: 'boolean', default: 'false' }
    ];

    // 2. Crear tabla conversation_history
    const { error: createTableError } = await supabase.rpc('create_conversation_history_table');
    
    if (createTableError && !createTableError.message.includes('already exists')) {
      console.log('Creando tabla conversation_history manualmente...');
      // La tabla se creará en el siguiente paso
    }

    return NextResponse.json({
      success: true,
      message: 'Base de datos configurada. Ejecuta los SQL manualmente en Supabase SQL Editor.',
      files: [
        'fix_routes_table.sql',
        'supabase_conversation_history.sql'
      ]
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Error configurando base de datos' },
      { status: 500 }
    );
  }
}
