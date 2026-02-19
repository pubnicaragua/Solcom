import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

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

async function readRecords(): Promise<any[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function writeRecords(records: any[]) {
  await ensureStore();
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = params.id;

    const records = await readRecords();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
    }

    records[index] = {
      ...records[index],
      ...body,
      updated_at: new Date().toISOString(),
    };

    await writeRecords(records);
    return NextResponse.json(records[index]);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al actualizar registro' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const records = await readRecords();
    const next = records.filter((r) => r.id !== id);

    if (next.length === records.length) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 });
    }

    await writeRecords(next);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error al eliminar registro' }, { status: 500 });
  }
}
