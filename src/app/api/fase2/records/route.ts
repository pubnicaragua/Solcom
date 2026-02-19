import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

type Fase2Record = {
  id: string;
  module: 'ventas' | 'cotizaciones' | 'alistamiento' | 'ordenes-venta' | 'insights' | 'transito';
  title: string;
  description: string;
  status: 'borrador' | 'pendiente' | 'confirmado' | 'en_proceso' | 'completado' | 'cancelado';
  owner_email?: string;
  priority?: 'baja' | 'media' | 'alta';
  created_at: string;
  updated_at: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'fase2-records.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

async function readRecords(): Promise<Fase2Record[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function writeRecords(records: Fase2Record[]) {
  await ensureStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module');
    const status = searchParams.get('status');

    let records = await readRecords();
    if (module) records = records.filter((r) => r.module === module);
    if (status) records = records.filter((r) => r.status === status);

    records.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

    return NextResponse.json(records);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al cargar registros Fase 2' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    if (!body?.module || !body?.title) {
      return NextResponse.json({ error: 'module y title son requeridos' }, { status: 400 });
    }

    const record: Fase2Record = {
      id: crypto.randomUUID(),
      module: body.module,
      title: String(body.title).trim(),
      description: String(body.description || '').trim(),
      status: body.status || 'borrador',
      owner_email: body.owner_email || '',
      priority: body.priority || 'media',
      created_at: now,
      updated_at: now,
    };

    const records = await readRecords();
    records.push(record);
    await writeRecords(records);

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al crear registro Fase 2' }, { status: 500 });
  }
}
