import { NextRequest, NextResponse } from 'next/server';

const replacementEndpoint = '/api/ai/chat';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return NextResponse.json(
    {
      error: 'Endpoint obsoleto',
      message: 'Usa /api/ai/chat para las consultas de inteligencia artificial.',
      replacement: replacementEndpoint,
      received: body
    },
    { status: 410 }
  );
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    error: 'Endpoint obsoleto',
    message: 'Este endpoint fue retirado. Usa /api/ai/chat.',
    replacement: replacementEndpoint,
    path: new URL(req.url).pathname
  }, { status: 410 });
}
