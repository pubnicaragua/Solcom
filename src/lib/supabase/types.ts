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
      customers: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          ruc: string | null
          address: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          ruc?: string | null
          address?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          ruc?: string | null
          address?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_invoices: {
        Row: {
          id: string
          invoice_number: string
          customer_id: string | null
          date: string
          due_date: string | null
          status: string
          subtotal: number
          tax_rate: number
          tax_amount: number
          discount_amount: number
          shipping_charge: number
          total: number
          payment_method: string | null
          notes: string | null
          warehouse_id: string | null
          order_number: string | null
          terms: string | null
          salesperson_id: string | null
          delivery_requested: boolean
          delivery_id: string | null
          credit_detail: string | null
          cancellation_reason_id: string | null
          cancellation_comments: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_number: string
          customer_id?: string | null
          date?: string
          due_date?: string | null
          status?: string
          subtotal?: number
          tax_rate?: number
          tax_amount?: number
          discount_amount?: number
          shipping_charge?: number
          total?: number
          payment_method?: string | null
          notes?: string | null
          warehouse_id?: string | null
          order_number?: string | null
          terms?: string | null
          salesperson_id?: string | null
          delivery_requested?: boolean
          delivery_id?: string | null
          credit_detail?: string | null
          cancellation_reason_id?: string | null
          cancellation_comments?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_number?: string
          customer_id?: string | null
          date?: string
          due_date?: string | null
          status?: string
          subtotal?: number
          tax_rate?: number
          tax_amount?: number
          discount_amount?: number
          shipping_charge?: number
          total?: number
          payment_method?: string | null
          notes?: string | null
          warehouse_id?: string | null
          order_number?: string | null
          terms?: string | null
          salesperson_id?: string | null
          delivery_requested?: boolean
          delivery_id?: string | null
          credit_detail?: string | null
          cancellation_reason_id?: string | null
          cancellation_comments?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_cancellation_reason_id_fkey"
            columns: ["cancellation_reason_id"]
            isOneToOne: false
            referencedRelation: "cancellation_reasons"
            referencedColumns: ["id"]
          }
        ]
      }
      sales_invoice_items: {
        Row: {
          id: string
          invoice_id: string
          item_id: string | null
          description: string
          quantity: number
          unit_price: number
          discount_percent: number
          subtotal: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          item_id?: string | null
          description: string
          quantity?: number
          unit_price?: number
          discount_percent?: number
          subtotal?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          item_id?: string | null
          description?: string
          quantity?: number
          unit_price?: number
          discount_percent?: number
          subtotal?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          }
        ]
      }
      deliveries: {
        Row: {
          id: string
          name: string
          phone: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cancellation_reasons: {
        Row: {
          id: string
          label: string
          active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          label: string
          active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          label?: string
          active?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: []
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
      generate_invoice_number: {
        Args: Record<string, never>
        Returns: string
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
