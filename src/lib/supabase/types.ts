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
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
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
      stock_movements: {
        Row: {
          id: string
          warehouse_id: string
          item_id: string
          qty_change: number
          movement_type: string
          document_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          item_id: string
          qty_change: number
          movement_type: string
          document_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          item_id?: string
          qty_change?: number
          movement_type?: string
          document_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
