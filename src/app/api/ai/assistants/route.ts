import { NextRequest, NextResponse } from 'next/server';

// Mock database - en producción usar Supabase
let assistants: any[] = [
  {
    id: 'asst_1',
    name: 'Mía - Asistente de Ventas',
    model: 'solcom-ai-v1',
    capabilities: {
      text: true,
      images: true,
      audio: true,
      web_search: false,
      file_search: true
    },
    created: '2026-01-15'
  }
];

export async function GET() {
  return NextResponse.json({ assistants });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, capabilities } = body;

  const newAssistant = {
    id: `asst_${Date.now()}`,
    name: name || 'New Assistant',
    model: 'solcom-ai-v1',
    capabilities: capabilities || {
      text: true,
      images: false,
      audio: false,
      web_search: false,
      file_search: false
    },
    created: new Date().toISOString().split('T')[0]
  };

  assistants.push(newAssistant);
  return NextResponse.json({ assistant: newAssistant });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, capabilities } = body;

  const index = assistants.findIndex(a => a.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Assistant not found' }, { status: 404 });
  }

  if (name) assistants[index].name = name;
  if (capabilities) assistants[index].capabilities = capabilities;

  return NextResponse.json({ assistant: assistants[index] });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  assistants = assistants.filter(a => a.id !== id);
  return NextResponse.json({ success: true });
}
