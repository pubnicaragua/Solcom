export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      warehouses: {
        Row: {
          id: string
          code: string
          name: string
          zoho_warehouse_id: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          zoho_warehouse_id?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          zoho_warehouse_id?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          id: string
          sku: string
          name: string
          category: string | null
          color: string | null
          state: string | null
          zoho_item_id: string | null
          stock_total: number | null
          price: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku: string
          name: string
          category?: string | null
          color?: string | null
          state?: string | null
          zoho_item_id?: string | null
          stock_total?: number | null
          price?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sku?: string
          name?: string
          category?: string | null
          color?: string | null
          state?: string | null
          zoho_item_id?: string | null
          stock_total?: number | null
          price?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_snapshots: {
        Row: {
          id: string
          warehouse_id: string
          item_id: string
          qty: number
          source_ts: string
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          item_id: string
          qty: number
          source_ts: string
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          item_id?: string
          qty?: number
          source_ts?: string
          synced_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_snapshots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_snapshots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          }
        ]
      }
      transfer_orders: {
        Row: {
          id: string
          zoho_transfer_order_id: string
          transfer_order_number: string | null
          date: string | null
          from_warehouse_id: string | null
          to_warehouse_id: string | null
          status: string | null
          line_items: Json | null
          notes: string | null
          received_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          zoho_transfer_order_id: string
          transfer_order_number?: string | null
          date?: string | null
          from_warehouse_id?: string | null
          to_warehouse_id?: string | null
          status?: string | null
          line_items?: Json | null
          notes?: string | null
          received_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          zoho_transfer_order_id?: string
          transfer_order_number?: string | null
          date?: string | null
          from_warehouse_id?: string | null
          to_warehouse_id?: string | null
          status?: string | null
          line_items?: Json | null
          notes?: string | null
          received_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_orders_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_orders_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_movements: {
        Row: {
          id: string
          item_id: string
          from_warehouse_id: string | null
          to_warehouse_id: string | null
          quantity: number | null
          movement_type: string
          status: string | null
          reason: string | null
          document_id: string | null
          zoho_adjustment_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          from_warehouse_id?: string | null
          to_warehouse_id?: string | null
          quantity?: number | null
          movement_type: string
          status?: string | null
          reason?: string | null
          document_id?: string | null
          zoho_adjustment_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          from_warehouse_id?: string | null
          to_warehouse_id?: string | null
          quantity?: number | null
          movement_type?: string
          status?: string | null
          reason?: string | null
          document_id?: string | null
          zoho_adjustment_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          }
          ,
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      detect_duplicate_skus: {
        Args: Record<string, never>
        Returns: Json[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
