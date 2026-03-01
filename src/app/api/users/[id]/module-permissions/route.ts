import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminProfile, type AppRole } from '@/lib/auth/warehouse-permissions';
import {
  MODULE_DEFINITIONS,
  getDefaultModuleAccess,
  getEffectiveModuleAccess,
  hasModuleAccess,
  mapOverrides,
  sanitizeModuleKey,
} from '@/lib/auth/module-permissions';

const userIdSchema = z.string().uuid('ID de usuario inválido');

const overrideInputSchema = z.object({
  module: z.string().min(1, 'Módulo requerido'),
  mode: z.enum(['inherit', 'allow', 'deny']),
});

const updateSchema = z.object({
  overrides: z.array(overrideInputSchema).max(200, 'Demasiados overrides'),
});

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'operator' || role === 'auditor') {
    return role;
  }
  return 'operator';
}

async function getTargetUser(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, role, full_name, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function isMissingTable(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const parsedUserId = userIdSchema.safeParse(params.id);
    if (!parsedUserId.success) {
      return NextResponse.json({ error: parsedUserId.error.issues[0]?.message || 'ID inválido' }, { status: 400 });
    }
    const targetUserId = parsedUserId.data;

    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const targetUser = await getTargetUser(supabase, targetUserId);
    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const { data: rows, error: overridesError } = await supabase
      .from('user_module_permissions')
      .select('module, can_access')
      .eq('user_id', targetUserId);

    if (overridesError && !isMissingTable(overridesError)) {
      throw overridesError;
    }

    const role = normalizeRole(targetUser.role);
    const baseAccess = getDefaultModuleAccess(role);
    const overrides = mapOverrides(rows || []);

    const modules = MODULE_DEFINITIONS.map((module) => {
      const key = module.key;
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
      const overrideMode = hasOverride ? (overrides[key] ? 'allow' : 'deny') : 'inherit';
      const effective = hasOverride ? overrides[key] : baseAccess[key];

      return {
        module: key,
        label: module.label,
        allowed_by_role: Boolean(baseAccess[key]),
        override_mode: overrideMode,
        effective_access: Boolean(effective),
      };
    });

    return NextResponse.json({
      user_id: targetUserId,
      role,
      user_name: targetUser.full_name || targetUser.email || targetUserId,
      modules,
    });
  } catch (error: any) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Falta migración de permisos por módulo. Ejecuta user-module-permissions-schema.sql' },
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
    const parsedUserId = userIdSchema.safeParse(params.id);
    if (!parsedUserId.success) {
      return NextResponse.json({ error: parsedUserId.error.issues[0]?.message || 'ID inválido' }, { status: 400 });
    }
    const targetUserId = parsedUserId.data;

    const supabase = createRouteHandlerClient({ cookies });
    const adminCheck = await requireAdminProfile(supabase);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
    if (!hasModuleAccess(moduleAccess, 'roles')) {
      return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
    }

    const targetUser = await getTargetUser(supabase, targetUserId);
    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
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

    const allowedModuleKeys = new Set(MODULE_DEFINITIONS.map((module) => module.key));
    const normalized = parsed.data.overrides.map((item) => ({
      module: sanitizeModuleKey(item.module),
      mode: item.mode,
    }));

    for (const item of normalized) {
      if (!allowedModuleKeys.has(item.module)) {
        return NextResponse.json({ error: `Módulo no permitido: ${item.module}` }, { status: 400 });
      }
    }

    const rows = normalized
      .filter((item) => item.mode !== 'inherit')
      .map((item) => ({
        user_id: targetUserId,
        module: item.module,
        can_access: item.mode === 'allow',
      }));

    const { error: wipeError } = await supabase
      .from('user_module_permissions')
      .delete()
      .eq('user_id', targetUserId);
    if (wipeError) throw wipeError;

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('user_module_permissions')
        .upsert(rows, { onConflict: 'user_id,module' });
      if (upsertError) throw upsertError;
    }

    return NextResponse.json({
      success: true,
      user_id: targetUserId,
      overrides_count: rows.length,
    });
  } catch (error: any) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'Falta migración de permisos por módulo. Ejecuta user-module-permissions-schema.sql' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}
