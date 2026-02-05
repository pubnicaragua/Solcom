import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const fileContent = await file.text();
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'Archivo vacío o sin datos' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const dataLines = lines.slice(1);

    const items = dataLines.map(line => {
      const values = line.split(',').map(v => v.trim());
      const item: any = {};
      headers.forEach((header, index) => {
        item[header] = values[index];
      });
      return item;
    });

    const { error: insertError } = await supabase
      .from('items')
      .upsert(items as any, { onConflict: 'sku' });

    if (insertError) {
      console.error('Error al insertar datos:', insertError);
      return NextResponse.json({ error: 'Error al importar datos' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${items.length} productos importados correctamente` 
    });

  } catch (error) {
    console.error('Error en importación:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
