-- Create the new table for tracking Zoho Serial Numbers locally
CREATE TABLE IF NOT EXISTS public.item_serials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zoho_serial_id TEXT NOT NULL UNIQUE,
    zoho_item_id TEXT NOT NULL REFERENCES public.items(zoho_item_id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
    serial_number TEXT NOT NULL,
    status TEXT NOT NULL,
    created_time TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- An item can't have the same serial number twice
    UNIQUE(zoho_item_id, serial_number)
);

-- Index for fast reporting and lookups
CREATE INDEX IF NOT EXISTS idx_serials_zoho_item_id ON public.item_serials(zoho_item_id);
CREATE INDEX IF NOT EXISTS idx_serials_warehouse_id ON public.item_serials(warehouse_id);
