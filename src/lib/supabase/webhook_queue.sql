-- 1) Create Table
CREATE TABLE IF NOT EXISTS public.sync_queue (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    zoho_item_id text NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    attempts integer NOT NULL DEFAULT 0,
    error text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2) Indexes for fast fetching
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON public.sync_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sync_queue_zoho_item ON public.sync_queue(zoho_item_id);

-- 3) Auto updated_at
DROP TRIGGER IF EXISTS trg_sync_queue_set_updated_at ON public.sync_queue;
CREATE TRIGGER trg_sync_queue_set_updated_at
BEFORE UPDATE ON public.sync_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) RLS (Row Level Security) - Webhooks use Service Role, so we just enable it and allow Service Role by default
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Allow read/write for service role (implicit, but good practice to explicitly state if needed, usually service_role bypasses RLS)
-- We add a policy for authenticated users just in case an admin dashboard needs to read it
CREATE POLICY "Allow authenticated users to read sync_queue" 
ON public.sync_queue FOR SELECT 
TO authenticated 
USING (true);
