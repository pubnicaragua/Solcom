import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/auth/warehouse-permissions';
import { getEffectiveModuleAccess, hasModuleAccess } from '@/lib/auth/module-permissions';

export const dynamic = 'force-dynamic';

const roleSchema = z.string().trim().min(1, 'role es requerido');

const payloadSchema = z.object({
  role: z.string().trim().min(1, 'role es requerido'),
  permission_code: z.string().trim().optional(),
  permission_codes: z.array(z.string().trim()).optional(),
}).refine(data => data.permission_code || data.permission_codes, {
  message: "Debe proporcionar permission_code o permission_codes",
  path: ["permission_code"]
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
    let role: string | null = null;
    if (roleParam != null) {
      const parsedRole = roleSchema.safeParse(roleParam);
      if (!parsedRole.success) {
        return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
      }
      role = parsedRole.data;
    }

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
    const { role, permission_code, permission_codes } = parsed.data;

    let insertData: { role: string; permission_code: string }[] = [];
    if (permission_codes && permission_codes.length > 0) {
      insertData = permission_codes.map(code => ({ role, permission_code: code }));
    } else if (permission_code) {
      insertData = [{ role, permission_code }];
    }

    if (insertData.length === 0) {
      return NextResponse.json({ success: true, message: 'Nada que insertar' });
    }

    const { error } = await supabase
      .from('role_permissions')
      .insert(insertData);

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from('role_audit_logs').insert({
        role_identifier: role,
        actor_id: user.id,
        action: 'PERMISSIONS_MODIFIED',
        details: `Se añadieron permisos al rol`,
        new_state: { added_permissions: insertData.map(d => d.permission_code) }
      });
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
    const { role, permission_code, permission_codes } = parsed.data;

    const query = supabase
      .from('role_permissions')
      .delete()
      .eq('role', role);

    if (permission_codes && permission_codes.length > 0) {
      query.in('permission_code', permission_codes);
    } else if (permission_code) {
      query.eq('permission_code', permission_code);
    } else {
      return NextResponse.json({ error: 'Debe proporcionar permission_code o permission_codes' }, { status: 400 });
    }

    const { error } = await query;

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: 'Falta migración de permisos. Ejecuta permissions-schema.sql' },
          { status: 500 }
        );
      }
      throw error;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const deletedPerms = permission_codes && permission_codes.length > 0 ? permission_codes : [permission_code];
      await supabase.from('role_audit_logs').insert({
        role_identifier: role,
        actor_id: user.id,
        action: 'PERMISSIONS_MODIFIED',
        details: `Se removieron permisos del rol`,
        previous_state: { removed_permissions: deletedPerms }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
