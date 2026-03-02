import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';


export const dynamic = 'force-dynamic';
type WarehouseColorRow = {
  warehouse_code: string;
  warehouse_name: string;
  color: string;
  text_color: string;
};

const DEFAULT_COLOR = '#3B82F6';
const DEFAULT_TEXT_COLOR = '#FFFFFF';
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return HEX_COLOR_REGEX.test(text) ? text.toUpperCase() : fallback;
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const [{ data: colors, error: colorsError }, { data: warehouses, error: warehousesError }] = await Promise.all([
      supabase
        .from('warehouse_colors')
        .select('warehouse_code, warehouse_name, color, text_color')
        .order('warehouse_code', { ascending: true }),
      supabase
        .from('warehouses')
        .select('code, name, active')
        .eq('active', true)
        .order('code', { ascending: true }),
    ]);

    if (colorsError) throw colorsError;
    if (warehousesError) throw warehousesError;

    const colorMap = new Map<string, WarehouseColorRow>();
    for (const color of colors || []) {
      colorMap.set(color.warehouse_code, {
        warehouse_code: color.warehouse_code,
        warehouse_name: color.warehouse_name,
        color: normalizeHexColor(color.color, DEFAULT_COLOR),
        text_color: normalizeHexColor(color.text_color, DEFAULT_TEXT_COLOR),
      });
    }

    const merged: WarehouseColorRow[] = [];
    for (const warehouse of warehouses || []) {
      const existing = colorMap.get(warehouse.code);
      merged.push({
        warehouse_code: warehouse.code,
        warehouse_name: existing?.warehouse_name || warehouse.name || warehouse.code,
        color: existing?.color || DEFAULT_COLOR,
        text_color: existing?.text_color || DEFAULT_TEXT_COLOR,
      });
    }

    // Keep custom rows that are not currently active warehouses (for historical data).
    for (const row of colorMap.values()) {
      if (!(warehouses || []).some((w: any) => w.code === row.warehouse_code)) {
        merged.push(row);
      }
    }

    merged.sort((a, b) => a.warehouse_code.localeCompare(b.warehouse_code));

    return NextResponse.json(merged);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function requireAdminRole(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { ok: false as const, status: 401, error: 'No autenticado' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  if (profileError) {
    return { ok: false as const, status: 403, error: 'No se pudo validar el rol del usuario' };
  }

  if (profile?.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Solo administradores pueden cambiar colores' };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminRole(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json();
    const warehouse_code = String(body?.warehouse_code ?? '').trim();
    const warehouse_name = String(body?.warehouse_name ?? '').trim() || warehouse_code;
    const color = normalizeHexColor(body?.color, DEFAULT_COLOR);
    const text_color = normalizeHexColor(body?.text_color, DEFAULT_TEXT_COLOR);

    if (!warehouse_code) {
      return NextResponse.json({ error: 'warehouse_code es requerido' }, { status: 400 });
    }

    const { error } = await supabase
      .from('warehouse_colors')
      .upsert(
        {
          warehouse_code,
          warehouse_name,
          color,
          text_color,
        },
        {
          onConflict: 'warehouse_code',
        }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
