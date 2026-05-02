import { NextRequest, NextResponse } from 'next/server';

// Endpoint para análisis de imágenes con DeepSeek Vision
export async function POST(request: NextRequest) {
  try {
    const { image, question } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Imagen requerida' },
        { status: 400 }
      );
    }

    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    if (!deepseekKey) {
      return NextResponse.json(
        { error: 'DeepSeek API Key no configurada' },
        { status: 500 }
      );
    }

    // NOTA: DeepSeek actualmente no soporta análisis de imágenes en su API pública
    // Retornar mensaje indicando que la funcionalidad no está disponible
    console.log('⚠️ DeepSeek Vision no disponible - imagen recibida pero no procesada');
    
    return NextResponse.json({
      success: false,
      analysis: 'Lo siento, el análisis de imágenes aún no está disponible. Por favor describe lo que necesitas o usa texto para tu consulta.',
      error: 'Análisis de imágenes no disponible actualmente'
    });

  } catch (error) {
    console.error('Error en vision API:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
