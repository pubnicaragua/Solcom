import { createClient } from '@supabase/supabase-js';

type NotificationRoleEvent = {
  roles: string[];
  type: string;
  title: string;
  message: string;
  link?: string;
};

/**
 * Creates notifications only for users whose role has the event enabled.
 * This helper is server-only: the service key is never exposed to the browser.
 */
export async function notifyRoles(event: NotificationRoleEvent): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const roles = Array.from(new Set(event.roles.map((role) => String(role).trim()).filter(Boolean)));

  if (!supabaseUrl || !serviceRoleKey || roles.length === 0) return;

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: preferences, error: preferenceError }, { data: profiles, error: profileError }] = await Promise.all([
      supabase
        .from('role_notification_prefs')
        .select('role_name, is_enabled')
        .in('role_name', roles)
        .eq('notification_type_code', event.type)
        .eq('is_enabled', true),
      supabase
        .from('user_profiles')
        .select('id, role')
        .in('role', roles),
    ]);

    if (preferenceError || profileError) {
      console.warn('[notifications] No se pudieron resolver los destinatarios:', preferenceError?.message || profileError?.message);
      return;
    }

    const enabledRoles = new Set((preferences || []).map((preference) => String(preference.role_name)));
    const userIds = Array.from(new Set(
      (profiles || [])
        .filter((profile) => enabledRoles.has(String(profile.role)))
        .map((profile) => String(profile.id))
        .filter(Boolean)
    ));

    if (userIds.length === 0) return;

    const { error } = await supabase.from('notifications').insert(userIds.map((userId) => ({
      user_id: userId,
      title: event.title,
      message: event.message,
      type: event.type,
      link: event.link || null,
      is_read: false,
    })));

    if (error) console.warn('[notifications] No se pudo guardar el evento:', error.message);
  } catch (error) {
    // Las notificaciones no deben romper una operación principal del ERP.
    console.warn('[notifications] Error no bloqueante:', error);
  }
}
