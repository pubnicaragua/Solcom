import { NextRequest, NextResponse } from 'next/server';

// Endpoint deprecado - usar Web Speech API en el frontend
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Este endpoint está deprecado. Usa Web Speech API directamente en el navegador para transcripción de voz.',
      recommendation: 'El componente AIAssistant ya usa startVoiceRecognition() con Web Speech API'
    },
    { status: 410 }
  );
}
