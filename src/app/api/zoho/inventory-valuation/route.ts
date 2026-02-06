import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getZohoAccessToken(): Promise<string> {
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Zoho auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
    
    if (!organizationId) {
      console.error('ZOHO_BOOKS_ORGANIZATION_ID no está configurado');
      return NextResponse.json(
        { error: 'Organization ID no configurado' },
        { status: 500 }
      );
    }

    console.log('Obteniendo access token de Zoho...');
    const accessToken = await getZohoAccessToken();
    console.log('Access token obtenido exitosamente');

    let allItems: any[] = [];
    let page = 1;
    let hasMorePages = true;
    let totalValue = 0;

    while (hasMorePages && page <= 10) { // Limitar a 10 páginas para evitar loops infinitos
      const queryArray = [
        ['organization_id', organizationId],
        ['per_page', '500'],
        ['page', page.toString()],
        ['sort_order', 'A'],
        ['sort_column', 'item_name'],
        ['filter_by', 'TransactionDate.ThisYear'],
        ['select_columns', JSON.stringify([
          { "field": "item_name", "group": "report" },
          { "field": "quantity_available", "group": "report" },
          { "field": "asset_value", "group": "report" },
          { "field": "purchase_rate", "group": "item" },
          { "field": "sku", "group": "item" },
          { "field": "cf_color", "group": "item" },
          { "field": "cf_marca", "group": "item" },
          { "field": "cf_state", "group": "item" }
        ])],
        ['group_by', JSON.stringify([{ "field": "none", "group": "report" }])],
        ['stock_on_hand_filter', 'AvailableStock'],
        ['status_filter', 'All'],
        ['usestate', 'true'],
        ['response_option', '1']
      ];

      const queryParams = new URLSearchParams(queryArray as any);
      const url = `https://www.zohoapis.com/books/v3/reports/inventoryvaluation?${queryParams.toString()}`;

      console.log(`Fetching inventory valuation page ${page}...`);
      console.log(`URL: ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
        },
        cache: 'no-store',
      });

      console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Zoho API error response: ${errorText}`);
        throw new Error(`Zoho API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Result code: ${result.code}, message: ${result.message}`);

      if (result.code !== 0) {
        console.error(`Zoho API error: ${JSON.stringify(result)}`);
        throw new Error(`Zoho API error: ${result.message}`);
      }

      const pageItems = result.data?.report_rows || [];
      allItems = allItems.concat(pageItems);

      // Sumar el asset_value de esta página
      pageItems.forEach((item: any) => {
        const assetValue = parseFloat(item.asset_value || 0);
        totalValue += assetValue;
      });

      // Verificar si hay más páginas
      const pageContext = result.data?.page_context;
      hasMorePages = pageContext?.has_more_page || false;
      
      if (hasMorePages) {
        page++;
      }

      console.log(`Page ${page - 1}: ${pageItems.length} items, Total acumulado: $${totalValue.toFixed(2)}`);
    }

    console.log(`Total final de inventory valuation: $${totalValue.toFixed(2)}`);

    return NextResponse.json({
      success: true,
      totalValue,
      totalItems: allItems.length,
      items: allItems,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error en inventory-valuation:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Error al obtener valoración de inventario',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
