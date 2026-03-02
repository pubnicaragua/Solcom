import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';


export const dynamic = 'force-dynamic';import { z } from 'zod';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

const roleSchema = z.enum(['admin', 'manager', 'operator', 'auditor']);

const payloadSchema = z.object({
  role: roleSchema,
  permission_code: z
    .string()
    .trim()
    .min(1, 'permission_code es requerido')
    .max(120, 'permission_code demasiado largo'),
});

function isMissingTable(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

async function ensureAdminRolesModuleAccess(
  supabase: ReturnType<typeof createRouteHandlerClient>
) {
  const adminCheck = await requireAdminProfile(supabase);
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const moduleAccess = await getEffectiveModuleAccess(supabase, adminCheck.userId, adminCheck.role);
  if (!hasModuleAccess(moduleAccess, 'roles')) {
    return NextResponse.json({ error: 'No autorizado para este módulo' }, { status: 403 });
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const deniedResponse = await ensureAdminRolesModuleAccess(supabase);
    if (deniedResponse) return deniedResponse;

    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get('role');
    const parsedRole = roleParam ? roleSchema.safeParse(roleParam) : null;
    if (parsedRole && !parsedRole.success) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }
    const role = parsedRole?.success ? parsedRole.data : null;

    let query = supabase
      .from('role_permissions')
      .select('*, permissions(*)');

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const deniedResponse = await ensureAdminRolesModuleAccess(supabase);
    if (deniedResponse) return deniedResponse;

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }
    const { role, permission_code } = parsed.data;

    const { error } = await supabase
      .from('role_permissions')
      .insert({ role, permission_code });

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const deniedResponse = await ensureAdminRolesModuleAccess(supabase);
    if (deniedResponse) return deniedResponse;

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }
    const { role, permission_code } = parsed.data;

    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission_code', permission_code);

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
