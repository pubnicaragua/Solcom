import { NextRequest, NextResponse } from 'next/server';

// Mock database - en producción usar Supabase
let apiKeys: any[] = [
  {
    id: 'sk-1234567890',
    name: 'Solcom_ERP',
    key: 'sk-...cYoA',
    created: '2026-04-15',
    last_used: '2026-05-01',
    status: 'active',
    permissions: 'All',
    tokens_used: 6807
  },
  {
    id: 'sk-0987654321',
    name: 'Zoho_SalesIQ',
    key: 'sk-...0k8A',
    created: '2025-05-30',
    last_used: '2026-05-01',
    status: 'active',
    permissions: 'All',
    tokens_used: 157000
  }
];

export async function GET() {
  return NextResponse.json({ api_keys: apiKeys });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name } = body;

  const newKey = {
    id: `sk-${Date.now()}`,
    name: name || 'New API Key',
    key: `sk-...${Math.random().toString(36).substring(2, 6)}`,
    created: new Date().toISOString().split('T')[0],
    last_used: new Date().toISOString().split('T')[0],
    status: 'active',
    permissions: 'All',
    tokens_used: 0
  };

  apiKeys.push(newKey);
  return NextResponse.json({ api_key: newKey });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  apiKeys = apiKeys.filter(key => key.id !== id);
  return NextResponse.json({ success: true });
}
