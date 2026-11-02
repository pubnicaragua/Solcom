-- The pivot reads inventory_balance and subscribes to its changes.
-- Without publication membership, a channel can connect but receive no events.
-- Preserve the existing grants, RLS configuration and publication tables.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'inventory_balance'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_balance;
    END IF;
END;
$$;
