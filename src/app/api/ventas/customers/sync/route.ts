import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '@/lib/zoho/inventory-utils';
import type { Database } from '@/lib/supabase/types';

const DEFAULT_PER_PAGE = 200;
const MAX_PER_PAGE = 200;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGES = 500;

function createServiceRoleClient() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuración incompleta: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isAuthorizedSyncRequest(req: NextRequest): boolean {
  const expectedSecret = (process.env.CUSTOMERS_SYNC_SECRET || process.env.CRON_SECRET || '').trim();
  if (!expectedSecret) return true; // Local/dev fallback when no secret configured.

  const url = new URL(req.url);
  const querySecret = (url.searchParams.get('sync_secret') || '').trim();
  const headerSecret = (req.headers.get('x-sync-secret') || '').trim();

  return querySecret === expectedSecret || headerSecret === expectedSecret;
}

function toNullableText(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toCleanText(value: any): string | null {
  const text = toNullableText(value);
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeAddress(contact: any): string | null {
  const directBilling = typeof contact?.billing_address === 'string'
    ? toNullableText(contact.billing_address)
    : null;
  const directShipping = typeof contact?.shipping_address === 'string'
    ? toNullableText(contact.shipping_address)
    : null;
  const direct = directBilling || directShipping;
  if (direct) return direct;

  const addressObject =
    (contact?.billing_address && typeof contact.billing_address === 'object' ? contact.billing_address : null) ||
    (contact?.shipping_address && typeof contact.shipping_address === 'object' ? contact.shipping_address : null);
  if (!addressObject || typeof addressObject !== 'object') return null;

  const parts = [
    addressObject.address,
    addressObject.street2,
    addressObject.city,
    addressObject.state,
    addressObject.zip,
    addressObject.country,
  ]
    .map((v) => toNullableText(v))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

function buildCustomerPayload(contact: any, includeLastModified: boolean) {
  const zohoContactId = toNullableText(contact?.contact_id);
  if (!zohoContactId) return null;

  const preferredName =
    toCleanText(contact?.contact_name) ||
    toCleanText(contact?.company_name) ||
    toCleanText(contact?.first_name) ||
    toCleanText(contact?.email) ||
    toCleanText(contact?.phone) ||
    toCleanText(contact?.mobile) ||
    toCleanText(contact?.contact_number) ||
    `Cliente ${zohoContactId}`;

  const payload: any = {
    zoho_contact_id: zohoContactId,
    name: preferredName,
    email: toNullableText(contact?.email),
    phone: toNullableText(contact?.phone) || toNullableText(contact?.mobile),
    ruc: toNullableText(contact?.contact_number),
    address: normalizeAddress(contact),
    updated_at: new Date().toISOString(),
  };

  if (includeLastModified) {
    payload.zoho_last_modified_at = toNullableText(contact?.last_modified_time);
  }

  return payload;
}

function normalizeSyncError(message: string) {
  const text = message.toLowerCase();
  if (text.includes('zoho_contact_id')) {
    return 'Falta migración de customers para Zoho (columna/índice zoho_contact_id). Ejecuta el script de migración de clientes Zoho.';
  }
  if (text.includes('no unique or exclusion constraint matching the on conflict specification')) {
    return 'El índice único de zoho_contact_id no está correcto. Ejecuta la migración de clientes Zoho actualizada para recrear el índice único.';
  }
  return message;
}

async function fetchZohoContactsPage(
  accessToken: string,
  apiDomain: string,
  organizationId: string,
  page: number,
  perPage: number
) {
  const url = new URL(`${apiDomain}/inventory/v1/contacts`);
  url.searchParams.set('organization_id', organizationId);
  url.searchParams.set('contact_type', 'customer');
  url.searchParams.set('status', 'active');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    cache: 'no-store',
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Zoho contacts error: ${response.status} - ${rawText.substring(0, 200)}`);
  }

  let result: any;
  try {
    result = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Zoho contacts error: JSON inválido (${rawText.substring(0, 120)})`);
  }

  if (result?.code !== 0) {
    throw new Error(`Zoho contacts error: ${result?.message || 'Unknown error'}`);
  }

  const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
  const hasMore = Boolean(result?.page_context?.has_more_page ?? contacts.length === perPage);

  return { contacts, hasMore };
}

async function upsertCustomersPage(supabase: any, contacts: any[]) {
  const withModified = contacts
    .map((contact) => buildCustomerPayload(contact, true))
    .filter(Boolean) as any[];

  if (withModified.length === 0) {
    return { upserted: 0 };
  }

  let upsert = await supabase
    .from('customers')
    .upsert(withModified, { onConflict: 'zoho_contact_id' })
    .select('id');

  if (upsert.error) {
    const missingLastModifiedColumn = String(upsert.error.message || '').includes('zoho_last_modified_at');
    if (missingLastModifiedColumn) {
      const fallbackPayload = contacts
        .map((contact) => buildCustomerPayload(contact, false))
        .filter(Boolean) as any[];

      upsert = await supabase
        .from('customers')
        .upsert(fallbackPayload, { onConflict: 'zoho_contact_id' })
        .select('id');
    }
  }

  if (upsert.error) {
    throw new Error(normalizeSyncError(upsert.error.message || 'Error haciendo upsert de customers'));
  }

  return { upserted: upsert.data?.length || withModified.length };
}

// POST /api/ventas/customers/sync — Sincroniza clientes de Zoho a Supabase
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedSyncRequest(req)) {
      return NextResponse.json({ error: 'Unauthorized sync request' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const perPage = Math.min(Math.max(Number(body?.per_page) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
    const maxPages = Math.min(Math.max(Number(body?.max_pages) || DEFAULT_MAX_PAGES, 1), MAX_PAGES);

    const organizationId = (process.env.ZOHO_BOOKS_ORGANIZATION_ID || '').trim();
    if (!organizationId) {
      return NextResponse.json({ error: 'Configuración incompleta: falta ZOHO_BOOKS_ORGANIZATION_ID' }, { status: 500 });
    }

    const auth: any = await getZohoAccessToken();
    if (!auth || auth.error || !auth.accessToken || !auth.apiDomain) {
      return NextResponse.json(
        { error: auth?.error || 'No se pudo autenticar con Zoho' },
        { status: 500 }
      );
    }

    const supabase = createServiceRoleClient();

    let currentPage = 1;
    let pagesProcessed = 0;
    let fetched = 0;
    let upserted = 0;

    while (currentPage <= maxPages) {
      const { contacts, hasMore } = await fetchZohoContactsPage(
        auth.accessToken,
        auth.apiDomain,
        organizationId,
        currentPage,
        perPage
      );

      if (contacts.length === 0) break;

      fetched += contacts.length;
      const pageResult = await upsertCustomersPage(supabase, contacts);
      upserted += pageResult.upserted;
      pagesProcessed += 1;

      if (!hasMore) break;
      currentPage += 1;
    }

    return NextResponse.json({
      success: true,
      fetched,
      upserted,
      pagesProcessed,
      message: 'Sincronización de clientes completada',
    });
  } catch (error: any) {
    console.error('Customers sync error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
