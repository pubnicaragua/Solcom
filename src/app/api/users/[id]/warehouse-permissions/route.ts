import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type AppRole,
  getWarehouseAccessScope,
  requireAdminProfile,
} from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

const userIdSchema = z.string().uuid('ID de usuario inválido');

const updateSchema = z
  .object({
    all_warehouses: z.boolean().default(false),
    can_view_stock: z.boolean().default(true),
    warehouse_ids: z.array(z.string().uuid('ID de bodega inválido')).max(500).default([]),
  })
  .strict();

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').toLowerCase().trim();
  if (role === 'admin' || role === 'manager' || role === 'operator' || role === 'auditor') {
    return role;
  }
  return 'operator';
}

async function getTargetUserRole(supabase: ReturnType<typeof createRouteHandlerClient>, userId: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getWarehouses(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, code, name, active')
    .order('code', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userIdParse = userIdSchema.safeParse(params.id);
    if (!userIdParse.success) {
      return NextResponse.json({ error: userIdParse.error.issues[0]?.message || 'ID inválido' }, { status: 400 });
    }
    const targetUserId = userIdParse.data;

    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const targetProfile = await getTargetUserRole(supabase, targetUserId);
    if (!targetProfile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const scope = await getWarehouseAccessScope(
      supabase,
      targetUserId,
      normalizeRole((targetProfile as { role?: string }).role)
    );

    const warehouses = await getWarehouses(supabase);
    const selectedWarehouseSet = new Set(scope.warehouseIds);

    return NextResponse.json({
      user_id: targetUserId,
      role: targetProfile.role,
      all_warehouses: scope.allWarehouses,
      can_view_stock: scope.canViewStock,
      warehouse_ids: scope.warehouseIds,
      warehouses: warehouses.map((warehouse: any) => ({
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        active: Boolean(warehouse.active),
        selected: scope.allWarehouses ? true : selectedWarehouseSet.has(warehouse.id),
      })),
    });
  } catch (error: any) {
    if (String(error?.code || '') === '42P01') {
      return NextResponse.json(
        { error: 'Falta migración de permisos por bodega. Ejecuta warehouse-permissions-schema.sql' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userIdParse = userIdSchema.safeParse(params.id);
    if (!userIdParse.success) {
      return NextResponse.json({ error: userIdParse.error.issues[0]?.message || 'ID inválido' }, { status: 400 });
    }
    const targetUserId = userIdParse.data;

    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const normalizedWarehouseIds = Array.from(new Set(payload.warehouse_ids));

    const targetProfile = await getTargetUserRole(supabase, targetUserId);
    if (!targetProfile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (!payload.all_warehouses && normalizedWarehouseIds.length > 0) {
      const { data: existingWarehouses, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id')
        .in('id', normalizedWarehouseIds);

      if (warehouseError) {
        throw warehouseError;
      }

      const existingSet = new Set((existingWarehouses || []).map((row: any) => String(row.id)));
      const missing = normalizedWarehouseIds.filter((id) => !existingSet.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'Una o más bodegas no existen', warehouse_ids: missing },
          { status: 400 }
        );
      }
    }

    const { error: settingsError } = await supabase
      .from('user_warehouse_settings')
      .upsert(
        {
          user_id: targetUserId,
          all_warehouses: payload.all_warehouses,
          can_view_stock: payload.can_view_stock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (settingsError) {
      throw settingsError;
    }

    const targetSelection = payload.all_warehouses ? [] : normalizedWarehouseIds;
    const targetSet = new Set(targetSelection);

    const { data: currentPermissions, error: currentError } = await supabase
      .from('user_warehouse_permissions')
      .select('warehouse_id')
      .eq('user_id', targetUserId);

    if (currentError) {
      throw currentError;
    }

    const currentIds = (currentPermissions || [])
      .map((row: any) => String(row.warehouse_id || '').trim())
      .filter(Boolean);

    const toDelete = currentIds.filter((id) => !targetSet.has(id));
    const toUpsert = targetSelection;

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_warehouse_permissions')
        .delete()
        .eq('user_id', targetUserId)
        .in('warehouse_id', toDelete);

      if (deleteError) {
        throw deleteError;
      }
    }

    if (toUpsert.length > 0) {
      const rows = toUpsert.map((warehouseId) => ({
        user_id: targetUserId,
        warehouse_id: warehouseId,
        can_view_stock: payload.can_view_stock,
      }));

      const { error: upsertError } = await supabase
        .from('user_warehouse_permissions')
        .upsert(rows, { onConflict: 'user_id,warehouse_id' });

      if (upsertError) {
        throw upsertError;
      }
    } else {
      const { error: clearError } = await supabase
        .from('user_warehouse_permissions')
        .delete()
        .eq('user_id', targetUserId);
      if (clearError) {
        throw clearError;
      }
    }

    return NextResponse.json({
      success: true,
      user_id: targetUserId,
      all_warehouses: payload.all_warehouses,
      can_view_stock: payload.can_view_stock,
      warehouse_ids: targetSelection,
    });
  } catch (error: any) {
    if (String(error?.code || '') === '42P01') {
      return NextResponse.json(
        { error: 'Falta migración de permisos por bodega. Ejecuta warehouse-permissions-schema.sql' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
