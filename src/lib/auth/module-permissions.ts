import type { AppRole } from './warehouse-permissions';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export interface ModuleDefinition {
  key: string;
  label: string;
  paths: string[];
}

export interface UserModuleOverrideRow {
  module: string | null;
  can_access: boolean | null;
}

type SupabaseRouteClient = ReturnType<typeof createRouteHandlerClient>;

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'inventory', label: 'Inventario', paths: ['/inventory'] },
  { key: 'ventas', label: 'Facturacion', paths: ['/ventas'] },
  { key: 'reports', label: 'Reportes', paths: ['/reports'] },
  { key: 'ai-agents', label: 'Agentes IA', paths: ['/ai-agents'] },
  { key: 'transfers', label: 'Transferencias', paths: ['/transfers'] },
  { key: 'fase2', label: 'Fase 2', paths: ['/fase2'] },
  { key: 'roles', label: 'Roles', paths: ['/roles'] },
  { key: 'settings', label: 'Configuracion', paths: ['/settings'] },
  { key: 'next-steps', label: 'Siguientes Pasos', paths: ['/next-steps'] },
  { key: 'how-it-works', label: 'Como Funciona', paths: ['/how-it-works'] },
  { key: 'entregables', label: 'Entregables', paths: ['/entregables'] },
  { key: 'cliente', label: 'Cliente', paths: ['/cliente'] },
];

export const MODULE_KEYS = MODULE_DEFINITIONS.map((module) => module.key);

const ROLE_BASE_MODULES: Record<AppRole, string[]> = {
  admin: MODULE_KEYS,
  manager: ['inventory', 'ventas', 'reports', 'ai-agents', 'transfers', 'how-it-works', 'cliente', 'entregables'],
  operator: ['inventory', 'ventas', 'how-it-works', 'cliente', 'entregables'],
  auditor: ['reports', 'how-it-works', 'cliente', 'entregables'],
};

const MATCHABLE_MODULES = MODULE_DEFINITIONS
  .flatMap((module) => module.paths.map((path) => ({ module: module.key, path })))
  .sort((a, b) => b.path.length - a.path.length);

export function sanitizeModuleKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

export function getDefaultModuleAccess(role: AppRole): Record<string, boolean> {
  const access: Record<string, boolean> = {};
  const allowedModules = new Set(ROLE_BASE_MODULES[role] || []);

  for (const key of MODULE_KEYS) {
    access[key] = allowedModules.has(key);
  }

  return access;
}

export function mergeModuleOverrides(
  baseAccess: Record<string, boolean>,
  overrides: Record<string, boolean>
): Record<string, boolean> {
  return { ...baseAccess, ...overrides };
}

export function mapOverrides(rows: UserModuleOverrideRow[] | null | undefined): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const row of rows || []) {
    const key = sanitizeModuleKey(row?.module);
    if (!key) continue;
    map[key] = Boolean(row?.can_access);
  }
  return map;
}

export function resolvePathModule(pathname: string): string | null {
  const path = String(pathname || '').trim();
  if (!path) return null;

  for (const entry of MATCHABLE_MODULES) {
    if (path.startsWith(entry.path)) {
      return entry.module;
    }
  }
  return null;
}

export function canAccessPath(pathname: string, moduleAccess: Record<string, boolean>): boolean {
  const module = resolvePathModule(pathname);
  if (!module) return true;
  return Boolean(moduleAccess[module]);
}

export function getFallbackPath(moduleAccess: Record<string, boolean>): string {
  const orderedModules = [
    { key: 'inventory', path: '/inventory' },
    { key: 'ventas', path: '/ventas' },
    { key: 'reports', path: '/reports' },
    { key: 'transfers', path: '/transfers' },
    { key: 'how-it-works', path: '/how-it-works' },
    { key: 'entregables', path: '/entregables' },
    { key: 'cliente', path: '/cliente' },
  ];

  for (const entry of orderedModules) {
    if (moduleAccess[entry.key]) return entry.path;
  }

  return '/reuniones';
}

function isMissingTable(error: any): boolean {
  return String(error?.code || '') === '42P01';
}

export async function getUserModuleOverrides(
  supabase: SupabaseRouteClient,
  userId: string
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('user_module_permissions')
    .select('module, can_access')
    .eq('user_id', userId);

  if (error) {
    if (isMissingTable(error)) return {};
    throw error;
  }

  return mapOverrides((data || []) as UserModuleOverrideRow[]);
}

export async function getEffectiveModuleAccess(
  supabase: SupabaseRouteClient,
  userId: string,
  role: AppRole
): Promise<Record<string, boolean>> {
  const base = getDefaultModuleAccess(role);
  const overrides = await getUserModuleOverrides(supabase, userId);
  return mergeModuleOverrides(base, overrides);
}

export function hasModuleAccess(
  moduleAccess: Record<string, boolean>,
  module: string
): boolean {
  const key = sanitizeModuleKey(module);
  if (!key) return false;
  return Boolean(moduleAccess[key]);
}
