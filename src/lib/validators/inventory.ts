import { z } from 'zod';

export const warehouseSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  zoho_warehouse_id: z.string().nullable().optional(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().min(1),
  name: z.string().min(1),
  color: z.string().nullable(),
  state: z.string().nullable(),
  zoho_item_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const stockSnapshotSchema = z.object({
  id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  item_id: z.string().uuid(),
  qty: z.number().int(),
  source_ts: z.string(),
  synced_at: z.string(),
  created_at: z.string(),
});

export const inventoryFilterSchema = z.object({
  warehouse_code: z.string().optional(),
  search: z.string().optional(),
  state: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export const syncRequestSchema = z.object({
  warehouse_codes: z.array(z.string()).optional(),
  force: z.boolean().default(false),
  onlyNew: z.boolean().optional(),
});

export type Warehouse = z.infer<typeof warehouseSchema>;
export type Item = z.infer<typeof itemSchema>;
export type StockSnapshot = z.infer<typeof stockSnapshotSchema>;
export type InventoryFilter = z.infer<typeof inventoryFilterSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
