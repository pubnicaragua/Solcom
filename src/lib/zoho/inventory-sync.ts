import { createZohoBooksClient } from './books-client';
import { createServerClient } from '@/lib/supabase/server';

interface TransferData {
  item_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  quantity: number;
  reason: string;
}

interface ZohoWarehouse {
  warehouse_id: string;
  warehouse_name: string;
}

export class InventorySyncService {
  private zohoClient = createZohoBooksClient();
  private supabase = createServerClient();

  /**
   * Sincroniza transferencia entre bodegas con Zoho Books
   */
  async syncTransferToZoho(transfer: TransferData): Promise<{ success: boolean; zoho_adjustment_id?: string; error?: string }> {
    try {
      // 1. Obtener precios reales del producto
      const itemPrice = await this.getItemPrice(transfer.item_id);
      if (!itemPrice) {
        throw new Error('No se pudo obtener el precio del producto');
      }

      // 2. Obtener IDs de warehouses en Zoho
      const [fromZohoWarehouse, toZohoWarehouse] = await Promise.all([
        this.getZohoWarehouse(transfer.from_warehouse_id),
        this.getZohoWarehouse(transfer.to_warehouse_id)
      ]);

      if (!fromZohoWarehouse || !toZohoWarehouse) {
        throw new Error('Warehouses no encontrados en Zoho');
      }

      // 3. Crear Inventory Adjustment en Zoho
      const adjustmentPayload = {
        adjustment_type: 'itemwise',
        date: new Date().toISOString().split('T')[0],
        reason: transfer.reason || 'Transferencia entre bodegas',
        line_items: [
          {
            item_id: transfer.item_id,
            warehouse_id: fromZohoWarehouse.warehouse_id,
            quantity_adjusted: -transfer.quantity,
            rate: itemPrice,
            item_total: -(transfer.quantity * itemPrice)
          },
          {
            item_id: transfer.item_id,
            warehouse_id: toZohoWarehouse.warehouse_id,
            quantity_adjusted: transfer.quantity,
            rate: itemPrice,
            item_total: transfer.quantity * itemPrice
          }
        ]
      };

      const response = await this.zohoClient.request('POST', '/books/v3/inventoryadjustments', adjustmentPayload);
      
      if (response.data?.inventoryadjustment?.inventoryadjustment_id) {
        // 4. Guardar auditoría
        await this.logSyncSuccess(transfer, response.data.inventoryadjustment.inventoryadjustment_id);
        
        return {
          success: true,
          zoho_adjustment_id: response.data.inventoryadjustment.inventoryadjustment_id
        };
      }

      throw new Error('Respuesta inválida de Zoho API');

    } catch (error: any) {
      await this.logSyncError(transfer, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtiene precio real del producto desde Zoho
   */
  private async getItemPrice(itemId: string): Promise<number | null> {
    try {
      const response = await this.zohoClient.request('GET', `/books/v3/items/${itemId}`);
      return response.data?.item?.rate || null;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene warehouse de Zoho por código local
   */
  private async getZohoWarehouse(localWarehouseId: string): Promise<ZohoWarehouse | null> {
    try {
      // Obtener warehouse local
      const { data: localWarehouse } = await this.supabase
        .from('warehouses')
        .select('code')
        .eq('id', localWarehouseId)
        .single();

      if (!localWarehouse) return null;

      // Buscar en Zoho por nombre/código
      const response = await this.zohoClient.request('GET', '/books/v3/warehouses');
      const zohoWarehouse = response.data?.warehouses?.find(
        (w: any) => w.warehouse_name === localWarehouse.code || w.warehouse_name === `Bodega ${localWarehouse.code}`
      );

      return zohoWarehouse || null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda log de sincronización exitosa
   */
  private async logSyncSuccess(transfer: TransferData, zohoId: string): Promise<void> {
    await this.supabase
      .from('sync_audit_log')
      .insert({
        entity_type: 'inventory_transfer',
        entity_id: transfer.item_id,
        action: 'sync_to_zoho',
        status: 'success',
        zoho_reference_id: zohoId,
        details: {
          from_warehouse: transfer.from_warehouse_id,
          to_warehouse: transfer.to_warehouse_id,
          quantity: transfer.quantity,
          synced_at: new Date().toISOString()
        }
      });
  }

  /**
   * Guarda log de error de sincronización
   */
  private async logSyncError(transfer: TransferData, error: any): Promise<void> {
    await this.supabase
      .from('sync_audit_log')
      .insert({
        entity_type: 'inventory_transfer',
        entity_id: transfer.item_id,
        action: 'sync_to_zoho',
        status: 'error',
        error_message: error.message,
        details: {
          from_warehouse: transfer.from_warehouse_id,
          to_warehouse: transfer.to_warehouse_id,
          quantity: transfer.quantity,
          failed_at: new Date().toISOString()
        }
      });
  }

  /**
   * Verifica estado de sincronización
   */
  async getSyncStatus(itemId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('sync_audit_log')
      .select('*')
      .eq('entity_id', itemId)
      .eq('entity_type', 'inventory_transfer')
      .order('created_at', { ascending: false })
      .limit(10);

    return data || [];
  }
}
